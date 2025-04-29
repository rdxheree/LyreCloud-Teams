import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./enhanced-storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { nanoid } from "nanoid";
import { insertFileSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (error) {
  console.error("Failed to create uploads directory:", error);
}

// Extended Express multer file type to add our custom cleanname property
interface ExtendedFile extends Express.Multer.File {
  cleanname?: string;
}

// Configure multer for file upload
const storage_config = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    // Only add unique ID if filename already exists
    let finalFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    // Let's store the clean name for saving to NextCloud without the unique ID
    // We'll handle collisions via overwrite in the storage class
    (file as ExtendedFile).cleanname = finalFilename;
    
    // For local temporary files we still need a unique name to avoid collisions
    const uniqueFilename = `${nanoid()}-${finalFilename}`;
    cb(null, uniqueFilename);
  },
});

// 1GB file size limit as per requirements
const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB in bytes

const upload = multer({ 
  storage: storage_config,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    // Allow all file types, but you could add filters here if needed
    cb(null, true);
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Get all files
  app.get('/api/files', async (_req: Request, res: Response) => {
    try {
      const files = await storage.getFiles();
      return res.json(files);
    } catch (error) {
      console.error('Error fetching files:', error);
      return res.status(500).json({ message: 'Failed to fetch files' });
    }
  });

  // Get a single file
  app.get('/api/files/:id', async (req: Request, res: Response) => {
    try {
      const fileId = parseInt(req.params.id);
      if (isNaN(fileId)) {
        return res.status(400).json({ message: 'Invalid file ID' });
      }

      const file = await storage.getFile(fileId);
      if (!file) {
        return res.status(404).json({ message: 'File not found' });
      }

      return res.json(file);
    } catch (error) {
      console.error('Error fetching file:', error);
      return res.status(500).json({ message: 'Failed to fetch file' });
    }
  });

  // Upload a file
  app.post('/api/files/upload', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      // Save to permanent storage (NextCloud if configured, local otherwise)
      // Use cleanname for NextCloud to avoid prefixed IDs, or fall back to filename
      const path = await storage.saveFileFromPath(req.file.path, (req.file as ExtendedFile).cleanname || req.file.filename);
      
      const fileData = {
        filename: req.file.filename,
        originalFilename: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
        path: path, // This is either the local path or NextCloud path
      };

      // Validate with zod schema
      const validationResult = insertFileSchema.safeParse(fileData);
      if (!validationResult.success) {
        // Delete the uploaded file if validation fails
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          console.error('Failed to delete temporary file after validation failure:', unlinkError);
        }
        const validationError = fromZodError(validationResult.error);
        return res.status(400).json({ message: validationError.message });
      }

      const savedFile = await storage.createFile(fileData);
      
      // Delete the temporary local file if we're using NextCloud
      if (process.env.NEXTCLOUD_URL && req.file.path !== path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          console.error('Failed to delete temporary file after successful upload:', unlinkError);
        }
      }
      
      return res.status(201).json(savedFile);
    } catch (error) {
      console.error('Error uploading file:', error);
      return res.status(500).json({ message: 'Failed to upload file' });
    }
  });

  // Download a file
  // Public CDN link handler
  app.get('/cdn/:filename', async (req: Request, res: Response) => {
    try {
      const requestedFilename = req.params.filename;
      if (!requestedFilename) {
        return res.status(400).json({ message: 'Missing filename' });
      }
      
      // Find the file by filename
      const file = await storage.getFileByFilename(requestedFilename);
      if (!file) {
        return res.status(404).json({ message: 'File not found' });
      }
      
      // Verify file exists in storage
      let fileExists = true;
      if (process.env.NEXTCLOUD_URL) {
        try {
          const client = (storage as any).client;
          if (client && typeof client.exists === 'function') {
            fileExists = await client.exists(file.path);
          }
        } catch (existsError) {
          console.error('Error checking if file exists:', existsError);
          // Continue anyway
        }
      }
      
      if (!fileExists) {
        return res.status(404).json({ message: 'File no longer exists in storage' });
      }
      
      // Serve the file directly without attachment disposition
      // This allows the browser to display it inline if it's displayable
      res.setHeader('Content-Type', file.mimeType);
      
      // Try to get a readable stream
      try {
        const fileStream = await storage.createReadStream(file.path);
        fileStream.pipe(res);
      } catch (streamError) {
        console.error('Error streaming file:', streamError);
        return res.status(404).json({ message: 'File not found or could not be accessed' });
      }
    } catch (error) {
      console.error('Error serving CDN file:', error);
      return res.status(500).json({ message: 'Failed to serve file' });
    }
  });

  // Download a file
  app.get('/api/files/:id/download', async (req: Request, res: Response) => {
    try {
      const fileId = parseInt(req.params.id);
      if (isNaN(fileId)) {
        return res.status(400).json({ message: 'Invalid file ID' });
      }

      const file = await storage.getFile(fileId);
      if (!file) {
        return res.status(404).json({ message: 'File not found' });
      }

      try {
        // Try to verify the file exists before streaming
        let fileExists = true;
        
        if (process.env.NEXTCLOUD_URL) {
          // For NextCloud, check if the file exists to prevent crashes
          try {
            // This is an internal implementation detail of the storage class
            // Using client directly is not ideal but works for now
            const client = (storage as any).client;
            if (client && typeof client.exists === 'function') {
              fileExists = await client.exists(file.path);
            }
          } catch (existsError) {
            console.error('Error checking if file exists:', existsError);
            // Continue anyway and let the stream creation fail if needed
          }
        }
        
        if (!fileExists) {
          console.error(`File ${file.id} exists in database but not in storage: ${file.path}`);
          return res.status(404).json({ message: 'File no longer exists in storage' });
        }
        
        // Set content disposition to attachment to force download
        res.setHeader('Content-Disposition', `attachment; filename="${file.originalFilename}"`);
        res.setHeader('Content-Type', file.mimeType);
        
        // Get a readable stream from storage (works for both local and NextCloud)
        const fileStream = await storage.createReadStream(file.path);
        fileStream.pipe(res);
      } catch (streamError) {
        console.error('Error streaming file:', streamError);
        return res.status(404).json({ message: 'File not found or could not be accessed' });
      }
    } catch (error) {
      console.error('Error downloading file:', error);
      return res.status(500).json({ message: 'Failed to download file' });
    }
  });

  // Delete a file
  app.delete('/api/files/:id', async (req: Request, res: Response) => {
    try {
      const fileId = parseInt(req.params.id);
      if (isNaN(fileId)) {
        return res.status(400).json({ message: 'Invalid file ID' });
      }

      const success = await storage.deleteFile(fileId);
      if (!success) {
        return res.status(404).json({ message: 'File not found or could not be deleted' });
      }

      return res.status(200).json({ message: 'File deleted successfully' });
    } catch (error) {
      console.error('Error deleting file:', error);
      return res.status(500).json({ message: 'Failed to delete file' });
    }
  });

  // Serve uploaded files (only for preview, not for download)
  app.use('/uploads', (req, res, next) => {
    // Extract filename from URL
    const filename = path.basename(req.url);
    const filePath = path.join(UPLOADS_DIR, filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File not found');
    }
    
    // Serve the file
    res.sendFile(filePath);
  });

  const httpServer = createServer(app);
  return httpServer;
}
