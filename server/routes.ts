import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { nanoid } from "nanoid";
import { insertFileSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { setupAuth } from "./auth";
import { createLog, LogType } from "./logger";

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
  // Setup authentication
  setupAuth(app);
  
  // Function to check if user is admin
  function isAdmin(req: Request, res: Response, next: NextFunction) {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    
    const user = req.user as any;
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    next();
  }
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
  
  // Force refresh files from NextCloud storage
  app.post('/api/files/refresh', async (_req: Request, res: Response) => {
    try {
      // Only do a full refresh if we're using NextCloud
      if ((storage as any).client) {
        try {
          console.log('Performing full storage refresh from NextCloud');
          
          // This is a special case where we need to access internal methods of the NextCloud storage
          // Force rescan all files from the cdns folder and metadata
          await (storage as any).scanFilesFromNextCloud();
          
          // Verify storage consistency
          await (storage as any).verifyStorageConsistency();
          
          // Save updated metadata back to NextCloud
          await (storage as any).saveFileMetadataToNextCloud();
          
          console.log('Full NextCloud storage refresh completed');
          
          // Get the updated files list
          const refreshedFiles = await storage.getFiles();
          return res.json({ 
            message: 'Storage refreshed successfully', 
            files: refreshedFiles,
            success: true
          });
        } catch (refreshError) {
          console.error('Error during full NextCloud refresh:', refreshError);
          throw refreshError; // Re-throw to be caught by the outer try/catch
        }
      } else {
        // For memory storage, simply return the current files
        const files = await storage.getFiles();
        return res.json({ 
          message: 'Files retrieved from storage', 
          files,
          success: true
        });
      }
    } catch (error) {
      console.error('Error refreshing files from storage:', error);
      return res.status(500).json({ 
        message: 'Failed to refresh files from storage',
        success: false
      });
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

      // Get the authenticated user if available
      let uploadedBy = "unknown";
      if (req.isAuthenticated && req.isAuthenticated() && req.user) {
        uploadedBy = (req.user as any).username || "unknown";
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
        uploadedBy: uploadedBy, // Add the authenticated username
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
      
      // Log file upload event
      await createLog(
        LogType.FILE_UPLOAD,
        `File uploaded: ${req.file.originalname}`,
        uploadedBy,
        { 
          fileId: savedFile.id, 
          filename: savedFile.filename,
          originalFilename: savedFile.originalFilename,
          size: savedFile.size,
          mimeType: savedFile.mimeType
        }
      );
      
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
        
        // Log file access/view through CDN
        // Try to get the user if authenticated
        let username = "anonymous";
        if (req.isAuthenticated && req.isAuthenticated() && req.user) {
          username = (req.user as any).username || "anonymous";
        }
        
        await createLog(
          LogType.FILE_DOWNLOAD,
          `File viewed in CDN: ${file.originalFilename}`,
          username,
          { 
            fileId: file.id, 
            filename: file.filename,
            originalFilename: file.originalFilename,
            method: "cdn"
          }
        );
        
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
        
        // Log file download
        let username = "anonymous";
        if (req.isAuthenticated && req.isAuthenticated() && req.user) {
          username = (req.user as any).username || "anonymous";
        }
        
        await createLog(
          LogType.FILE_DOWNLOAD,
          `File downloaded: ${file.originalFilename}`,
          username,
          { 
            fileId: file.id, 
            filename: file.filename,
            originalFilename: file.originalFilename,
            method: "download"
          }
        );
        
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

  // Rename a file
  app.patch('/api/files/:id/rename', async (req: Request, res: Response) => {
    try {
      const fileId = parseInt(req.params.id);
      if (isNaN(fileId)) {
        return res.status(400).json({ message: 'Invalid file ID' });
      }

      const { newName } = req.body;
      if (!newName || typeof newName !== 'string') {
        return res.status(400).json({ message: 'Invalid or missing new name' });
      }

      // Get the existing file
      const file = await storage.getFile(fileId);
      if (!file) {
        return res.status(404).json({ message: 'File not found' });
      }

      try {
        // Update the original filename (display name)
        const updatedFile = await storage.updateFile(fileId, { 
          originalFilename: newName 
        });

        if (!updatedFile) {
          return res.status(500).json({ 
            message: 'Failed to rename file', 
            success: false 
          });
        }

        // Log file rename operation
        let username = "anonymous";
        if (req.isAuthenticated && req.isAuthenticated() && req.user) {
          username = (req.user as any).username || "anonymous";
        }
        
        await createLog(
          LogType.FILE_RENAME,
          `File renamed from "${file.originalFilename}" to "${newName}"`,
          username,
          { 
            fileId: file.id, 
            filename: file.filename,
            oldName: file.originalFilename,
            newName: newName
          }
        );
        
        return res.json({
          ...updatedFile,
          message: 'File renamed successfully',
          success: true
        });
      } catch (updateError: any) {
        console.error('Error in storage.updateFile:', updateError);
        
        // Try one more time with just metadata update
        try {
          console.log('Attempting metadata-only update as fallback');
          const updatedFile = await storage.updateFile(fileId, { 
            originalFilename: newName,
            // Don't update physical filename/path
          });
          
          if (updatedFile) {
            return res.json({
              ...updatedFile,
              message: 'File metadata updated but physical rename failed',
              success: true,
              partialSuccess: true
            });
          } else {
            throw new Error('Both physical and metadata updates failed');
          }
        } catch (fallbackError) {
          console.error('Fallback metadata update also failed:', fallbackError);
          throw updateError; // throw the original error
        }
      }
    } catch (error: any) {
      console.error('Error renaming file:', error);
      return res.status(500).json({ 
        message: 'Failed to rename file: ' + (error.message || 'Unknown error'),
        success: false
      });
    }
  });

  // Delete multiple files
  app.post('/api/files/delete-multiple', async (req: Request, res: Response) => {
    try {
      const { ids } = req.body;
      
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Invalid or missing file IDs' });
      }

      const results = [];
      
      // Get username for logging
      let username = "anonymous";
      if (req.isAuthenticated && req.isAuthenticated() && req.user) {
        username = (req.user as any).username || "anonymous";
      }
      
      // Delete each file
      for (const id of ids) {
        const fileId = parseInt(id);
        if (isNaN(fileId)) {
          results.push({ id: id, success: false, message: 'Invalid file ID' });
          continue;
        }
        
        // Get file data before deleting for the log
        const file = await storage.getFile(fileId);
        if (!file) {
          results.push({ id: fileId, success: false, message: 'File not found' });
          continue;
        }

        const success = await storage.deleteFile(fileId);
        results.push({ id: fileId, success });
        
        if (success) {
          // Log file deletion if successful
          await createLog(
            LogType.FILE_DELETE,
            `File deleted (batch): ${file.originalFilename}`,
            username,
            { 
              fileId: file.id, 
              filename: file.filename,
              originalFilename: file.originalFilename,
              size: file.size,
              mimeType: file.mimeType,
              batchOperation: true
            }
          );
        }
      }

      return res.status(200).json({ 
        message: 'Batch delete operation completed', 
        results 
      });
    } catch (error) {
      console.error('Error deleting multiple files:', error);
      return res.status(500).json({ message: 'Failed to delete files' });
    }
  });
  
  // ADMIN ONLY - Delete all files (for testing purposes)
  // NOTE: This must be defined BEFORE the '/api/files/:id' route to avoid route conflicts
  app.delete('/api/purge-all-files', async (_req: Request, res: Response) => {
    try {
      const files = await storage.getFiles();
      console.log(`Purging all ${files.length} files from system...`);
      
      // Get username for logging
      let username = "system";
      if (_req.isAuthenticated && _req.isAuthenticated() && _req.user) {
        username = (_req.user as any).username || "system";
      }
      
      // Process the deletions
      const results = [];
      for (const file of files) {
        try {
          const success = await storage.deleteFile(file.id);
          results.push({ id: file.id, success, message: success ? 'Deleted' : 'Failed to delete' });
          
          if (success) {
            // Log file deletion if successful
            await createLog(
              LogType.FILE_DELETE,
              `File deleted (purge): ${file.originalFilename}`,
              username,
              { 
                fileId: file.id, 
                filename: file.filename,
                originalFilename: file.originalFilename,
                size: file.size,
                mimeType: file.mimeType,
                batchOperation: true,
                purgeOperation: true
              }
            );
          }
        } catch (err) {
          results.push({ id: file.id, success: false, message: 'Error during deletion' });
        }
      }
      
      // Clear metadata if NextCloud is being used
      if (process.env.NEXTCLOUD_URL) {
        try {
          // Directly access client if storage is NextCloud
          const client = (storage as any).client;
          if (client) {
            // Try to clear the files.json metadata
            try {
              await client.putFileContents('LyreTeams/files.json', JSON.stringify([]));
              console.log('Cleared files.json metadata');
            } catch (err) {
              console.error('Error clearing files.json:', err);
            }
            
            // Try to clear the metadata folder
            try {
              const metadataItems = await client.getDirectoryContents('LyreTeams/metadata');
              for (const item of metadataItems) {
                if (item.type === 'file') {
                  try {
                    await client.deleteFile(item.filename);
                    console.log(`Deleted metadata file: ${item.basename || item.filename}`);
                  } catch (deleteErr) {
                    console.error(`Failed to delete metadata file ${item.filename}:`, deleteErr);
                  }
                }
              }
            } catch (err) {
              console.error('Error clearing metadata folder:', err);
            }
          }
        } catch (err) {
          console.error('Error accessing NextCloud client:', err);
        }
      }
      
      res.status(200).json({ 
        message: 'Purge operation completed', 
        totalFiles: files.length,
        results
      });
    } catch (error) {
      console.error('Error purging all files:', error);
      res.status(500).json({ message: 'Internal server error while purging files' });
    }
  });

  // Delete a file
  app.delete('/api/files/:id', async (req: Request, res: Response) => {
    try {
      const fileId = parseInt(req.params.id);
      if (isNaN(fileId)) {
        return res.status(400).json({ message: 'Invalid file ID' });
      }

      // Get file data before deleting for the log
      const file = await storage.getFile(fileId);
      if (!file) {
        return res.status(404).json({ message: 'File not found' });
      }
      
      const success = await storage.deleteFile(fileId);
      if (!success) {
        return res.status(404).json({ message: 'File not found or could not be deleted' });
      }
      
      // Log file deletion
      let username = "anonymous";
      if (req.isAuthenticated && req.isAuthenticated() && req.user) {
        username = (req.user as any).username || "anonymous";
      }
      
      await createLog(
        LogType.FILE_DELETE,
        `File deleted: ${file.originalFilename}`,
        username,
        { 
          fileId: file.id, 
          filename: file.filename,
          originalFilename: file.originalFilename,
          size: file.size,
          mimeType: file.mimeType
        }
      );

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

  // Get logs (admin only)
  app.get('/api/logs', isAdmin, async (req: Request, res: Response) => {
    try {
      // Parse query parameters
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;
      let types: string[] | undefined = undefined;
      
      if (req.query.types) {
        // Handle both single type and array of types
        if (Array.isArray(req.query.types)) {
          types = req.query.types as string[];
        } else {
          types = [req.query.types as string];
        }
      }
      
      // Get logs from storage
      const logs = await storage.getLogs(limit, offset, types);
      
      return res.json({
        logs,
        meta: {
          limit,
          offset,
          types,
          count: logs.length
        }
      });
    } catch (error) {
      console.error('Error fetching logs:', error);
      return res.status(500).json({ 
        message: 'Failed to fetch logs',
        success: false
      });
    }
  });
  
  // Create logs endpoint for system to use
  app.post('/api/logs', async (req: Request, res: Response) => {
    try {
      // Get username from authenticated user, if available
      let username = "system";
      if (req.isAuthenticated && req.isAuthenticated() && req.user) {
        username = (req.user as any).username || "system";
      }
      
      // Validate log entry data
      const { type, message, details } = req.body;
      
      if (!type || !message) {
        return res.status(400).json({ 
          message: 'Missing required fields: type, message',
          success: false
        });
      }
      
      // Create log entry
      await createLog(type, message, username, details);
      
      return res.status(201).json({
        message: 'Log entry created successfully',
        success: true
      });
    } catch (error) {
      console.error('Error creating log entry:', error);
      return res.status(500).json({ 
        message: 'Failed to create log entry',
        success: false
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
