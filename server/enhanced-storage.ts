import { files, type File, type InsertFile, users, type User, type InsertUser } from "@shared/schema";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { nanoid } from "nanoid";
import { createClient, WebDAVClient } from "webdav";
import { Readable } from "stream";

// Interface defining storage operations
export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updateData: Partial<User>): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;
  getAllUsers(): Promise<User[]>;
  getPendingUsers(): Promise<User[]>;
  
  // File operations
  getFiles(): Promise<File[]>;
  getFile(id: number): Promise<File | undefined>;
  getFileByFilename(filename: string): Promise<File | undefined>;
  createFile(file: InsertFile): Promise<File>;
  deleteFile(id: number): Promise<boolean>;
  
  // Stream operations for file handling
  createReadStream(filePath: string): Promise<fs.ReadStream | Readable>;
  saveFileFromPath(localPath: string, filename: string): Promise<string>;
}

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (error) {
  console.error("Failed to create uploads directory:", error);
}

// Local memory storage implementation
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private files: Map<number, File>;
  private userCurrentId: number;
  private fileCurrentId: number;

  constructor() {
    this.users = new Map();
    this.files = new Map();
    this.userCurrentId = 1;
    this.fileCurrentId = 1;
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userCurrentId++;
    const user: User = { 
      ...insertUser, 
      id,
      role: insertUser.role || 'user',
      isApproved: insertUser.isApproved !== undefined ? insertUser.isApproved : false,
      status: insertUser.status || 'pending'
    };
    this.users.set(id, user);
    return user;
  }
  
  async updateUser(id: number, updateData: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, ...updateData };
    this.users.set(id, updatedUser);
    return updatedUser;
  }
  
  async deleteUser(id: number): Promise<boolean> {
    return this.users.delete(id);
  }
  
  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }
  
  async getPendingUsers(): Promise<User[]> {
    return Array.from(this.users.values()).filter(user => user.status === 'pending');
  }

  // File methods
  async getFiles(): Promise<File[]> {
    return Array.from(this.files.values())
      .filter(file => !file.isDeleted)
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }

  async getFile(id: number): Promise<File | undefined> {
    const file = this.files.get(id);
    return file && !file.isDeleted ? file : undefined;
  }

  async getFileByFilename(filename: string): Promise<File | undefined> {
    return Array.from(this.files.values()).find(
      (file) => file.filename === filename && !file.isDeleted,
    );
  }

  async createFile(insertFile: InsertFile): Promise<File> {
    const id = this.fileCurrentId++;
    const uploadedAt = new Date();
    const file: File = { 
      ...insertFile, 
      id, 
      uploadedAt, 
      isDeleted: false 
    };
    this.files.set(id, file);
    return file;
  }

  async deleteFile(id: number): Promise<boolean> {
    const file = this.files.get(id);
    if (!file) return false;

    // Mark as deleted
    const updatedFile = { ...file, isDeleted: true };
    this.files.set(id, updatedFile);

    // Optional: actually delete the file from the filesystem
    try {
      const filePath = file.path;
      if (fs.existsSync(filePath)) {
        await promisify(fs.unlink)(filePath);
      }
      return true;
    } catch (error) {
      console.error(`Error deleting file ${id}:`, error);
      return false;
    }
  }
  
  // Stream operations
  async createReadStream(filePath: string): Promise<fs.ReadStream> {
    return fs.createReadStream(filePath);
  }
  
  async saveFileFromPath(localPath: string, filename: string): Promise<string> {
    // For local storage, we simply return the local path since it's already saved
    return localPath;
  }
}

// Enhanced NextCloud storage implementation that synchronizes with NextCloud
export class NextCloudStorage implements IStorage {
  private users: Map<number, User>;
  private files: Map<number, File>;
  private userCurrentId: number;
  private fileCurrentId: number;
  private client: WebDAVClient;
  private baseFolder: string;
  
  constructor() {
    // Initialize user and file storage in memory
    this.users = new Map();
    this.files = new Map();
    this.userCurrentId = 1;
    this.fileCurrentId = 1;
    
    // Get NextCloud credentials from environment variables
    const nextcloudUrl = process.env.NEXTCLOUD_URL;
    const username = process.env.NEXTCLOUD_USERNAME;
    const password = process.env.NEXTCLOUD_PASSWORD;
    this.baseFolder = process.env.NEXTCLOUD_FOLDER || '/LyreTeams';
    
    if (!nextcloudUrl || !username || !password) {
      throw new Error('NextCloud credentials not provided. Please set NEXTCLOUD_URL, NEXTCLOUD_USERNAME, and NEXTCLOUD_PASSWORD environment variables.');
    }
    
    // Create WebDAV client
    // Format the WebDAV URL correctly
    // If the URL doesn't end with /remote.php/webdav/ or /remote.php/dav/, add it
    let webdavUrl = nextcloudUrl;
    if (!webdavUrl.endsWith('/')) {
      webdavUrl += '/';
    }
    if (!webdavUrl.endsWith('remote.php/webdav/') && !webdavUrl.endsWith('remote.php/dav/')) {
      webdavUrl += 'remote.php/webdav/';
    }
    
    console.log(`Connecting to NextCloud at: ${nextcloudUrl}`);
    console.log(`WebDAV endpoint: ${webdavUrl}`);
    console.log(`Using username: ${username}`);
    console.log(`Using password: ${password ? '******' : 'not provided'}`);
    console.log(`Target folder: ${this.baseFolder}`);
    
    this.client = createClient(webdavUrl, {
      username,
      password
    });
    
    // Initialize folders, but don't await in constructor
    this.initializeStorage();
  }
  
  // Test connection to the NextCloud server
  private async testConnection(): Promise<void> {
    try {
      // Try to get server capabilities by making a simple request
      const response = await this.client.getDirectoryContents('/');
      console.log('NextCloud connection test successful');
      console.log(`Found items in root directory`);
    } catch (error: any) {
      console.error('NextCloud connection test failed:', error);
      if (error.status === 401) {
        console.error('Authentication failed - check username and password');
      } else if (error.status === 404) {
        console.error('Server not found - check URL');
      } else {
        console.error(`Error code: ${error.status || 'unknown'}`);
      }
    }
  }
  
  // Helper method to initialize storage asynchronously
  private async initializeStorage(): Promise<void> {
    try {
      // First, test the connection
      await this.testConnection();
      
      // Then try to ensure the base folder exists
      await this.ensureBaseFolder();
      console.log('NextCloud storage initialization complete');
    } catch (error) {
      console.error('NextCloud storage initialization error:', error);
    }
  }
  
  private async ensureBaseFolder(): Promise<void> {
    try {
      // First ensure the main folder exists
      try {
        await this.client.getDirectoryContents(this.baseFolder);
        console.log(`Using existing folder: ${this.baseFolder} in NextCloud`);
      } catch (dirError) {
        try {
          await this.client.createDirectory(this.baseFolder);
          console.log(`Created folder: ${this.baseFolder} in NextCloud`);
        } catch (createError: any) {
          if (createError.status === 405) {
            console.warn(`Could not create folder ${this.baseFolder}, but proceeding anyway. The folder might already exist or you may need admin permissions.`);
          } else {
            throw createError;
          }
        }
      }
      
      // Then ensure the cdns subfolder exists
      const cdnsFolder = `${this.baseFolder}/cdns`;
      try {
        await this.client.getDirectoryContents(cdnsFolder);
        console.log(`Using existing folder: ${cdnsFolder} in NextCloud`);
      } catch (dirError) {
        try {
          await this.client.createDirectory(cdnsFolder);
          console.log(`Created folder: ${cdnsFolder} in NextCloud`);
        } catch (createError: any) {
          if (createError.status === 405) {
            console.warn(`Could not create folder ${cdnsFolder}, but proceeding anyway. The folder might already exist or you may need admin permissions.`);
          } else {
            throw createError;
          }
        }
      }
    } catch (error: any) {
      console.error('Error ensuring folders exist:', error);
      // Instead of throwing, log the error and continue
      console.warn('Will attempt to continue using NextCloud storage despite folder check failure.');
    }
  }
  
  // Helper method to generate the full path for a file in NextCloud
  private getFullPath(filename: string): string {
    // Store all files in cdns subfolder
    return `${this.baseFolder}/cdns/${filename}`;
  }
  
  // User methods (same as MemStorage since we keep users in memory)
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userCurrentId++;
    const user: User = { 
      ...insertUser, 
      id,
      role: insertUser.role || 'user',
      isApproved: insertUser.isApproved !== undefined ? insertUser.isApproved : false,
      status: insertUser.status || 'pending'
    };
    this.users.set(id, user);
    return user;
  }
  
  async updateUser(id: number, updateData: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, ...updateData };
    this.users.set(id, updatedUser);
    return updatedUser;
  }
  
  async deleteUser(id: number): Promise<boolean> {
    return this.users.delete(id);
  }
  
  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }
  
  async getPendingUsers(): Promise<User[]> {
    return Array.from(this.users.values()).filter(user => user.status === 'pending');
  }
  
  // Enhanced file methods with NextCloud synchronization
  async getFiles(): Promise<File[]> {
    try {
      // Sync with NextCloud directory to find any new files
      const cdnsPath = `${this.baseFolder}/cdns`;
      console.log(`Scanning NextCloud directory: ${cdnsPath}`);
      
      const directoryContents = await this.client.getDirectoryContents(cdnsPath) as any[];
      console.log(`Found ${directoryContents.length} items in NextCloud cdns folder`);
      
      // Create a set of paths that exist in NextCloud to help with cleanup
      const nextCloudPaths = new Set<string>();
      const actualFiles = new Map<number, File>();
      
      // First pass: Find new files to add and track existing files
      for (const item of directoryContents) {
        if (item.type === 'file') {
          // Track this path as existing in NextCloud
          nextCloudPaths.add(item.filename); 
          
          // Check if we already have this file in our memory map by path or filename
          const existingFile = Array.from(this.files.values()).find(
            file => file.path === item.filename || file.filename === item.basename
          );
          
          if (existingFile) {
            // File already exists in memory, keep it
            actualFiles.set(existingFile.id, existingFile);
          } else {
            // This is a new file, add it
            // Parse the original filename from the stored path
            const decodedName = decodeURIComponent(item.basename);
            const fileId = this.fileCurrentId++;
            
            // Try to determine MIME type from file extension
            const extension = decodedName.split('.').pop()?.toLowerCase() || '';
            let mimeType = 'application/octet-stream'; // Default
            
            // Map common extensions to MIME types
            const mimeTypesMap: Record<string, string> = {
              'jpg': 'image/jpeg',
              'jpeg': 'image/jpeg',
              'png': 'image/png',
              'gif': 'image/gif',
              'webp': 'image/webp',
              'pdf': 'application/pdf',
              'mp4': 'video/mp4',
              'mov': 'video/quicktime',
              'mp3': 'audio/mpeg',
              'wav': 'audio/wav',
              'txt': 'text/plain',
              'doc': 'application/msword',
              'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'xls': 'application/vnd.ms-excel',
              'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'ppt': 'application/vnd.ms-powerpoint',
              'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              'zip': 'application/zip',
              'rar': 'application/x-rar-compressed'
            };
            
            if (extension in mimeTypesMap) {
              mimeType = mimeTypesMap[extension];
            }
            
            // Create a new file entry
            const newFile: File = {
              id: fileId,
              filename: item.basename, 
              originalFilename: decodedName,
              path: item.filename,
              size: item.size,
              mimeType: mimeType,
              uploadedAt: item.lastmod ? new Date(item.lastmod) : new Date(),
              isDeleted: false
            };
            
            console.log(`Adding new file from NextCloud: ${decodedName}`);
            actualFiles.set(fileId, newFile);
          }
        }
      }
      
      // Second pass: Find files in memory that no longer exist in NextCloud and mark as deleted
      // Use Array.from to avoid iterator issues with target compatibility
      Array.from(this.files.entries()).forEach(([id, file]) => {
        if (!file.isDeleted && !nextCloudPaths.has(file.path)) {
          console.log(`File no longer exists in NextCloud, marking as deleted: ${file.originalFilename}`);
          const updatedFile = { ...file, isDeleted: true };
          actualFiles.set(id, updatedFile);
        } else if (file.isDeleted) {
          // Keep deleted files in our record
          actualFiles.set(id, file);
        }
      });
      
      // Update our files map with the current state
      this.files = actualFiles;
      
      // Return all valid files, sorted by upload date
      return Array.from(this.files.values())
        .filter(file => !file.isDeleted)
        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    } catch (error) {
      console.error('Error syncing files with NextCloud:', error);
      // If error occurs, fall back to in-memory files
      return Array.from(this.files.values())
        .filter(file => !file.isDeleted)
        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    }
  }

  async getFile(id: number): Promise<File | undefined> {
    const file = this.files.get(id);
    return file && !file.isDeleted ? file : undefined;
  }

  async getFileByFilename(filename: string): Promise<File | undefined> {
    return Array.from(this.files.values()).find(
      (file) => file.filename === filename && !file.isDeleted,
    );
  }

  async createFile(insertFile: InsertFile): Promise<File> {
    const id = this.fileCurrentId++;
    const uploadedAt = new Date();
    
    // For NextCloud, path is a virtual path that references the NextCloud location
    const file: File = { 
      ...insertFile, 
      id, 
      uploadedAt, 
      isDeleted: false,
      // Override path to include the virtual NextCloud path
      path: this.getFullPath(insertFile.filename)
    };
    
    this.files.set(id, file);
    return file;
  }

  async deleteFile(id: number): Promise<boolean> {
    const file = this.files.get(id);
    if (!file) return false;

    // Mark as deleted in local database
    const updatedFile = { ...file, isDeleted: true };
    this.files.set(id, updatedFile);

    // Delete from NextCloud
    try {
      const exists = await this.client.exists(file.path);
      if (exists) {
        await this.client.deleteFile(file.path);
      }
      return true;
    } catch (error: any) {
      console.error(`Error deleting file ${id} from NextCloud:`, error);
      return false;
    }
  }
  
  // Stream operations specific to NextCloud
  async createReadStream(filePath: string): Promise<Readable> {
    try {
      // First check if the file exists to avoid unhandled errors
      const exists = await this.client.exists(filePath);
      if (!exists) {
        console.error(`File does not exist in NextCloud: ${filePath}`);
        throw new Error(`File not found: ${filePath}`);
      }
      
      // Get a readable stream from the file in NextCloud
      return this.client.createReadStream(filePath);
    } catch (error: any) {
      console.error(`Error creating read stream for ${filePath}:`, error);
      throw new Error(`Could not create read stream: ${error.message || 'Unknown error'}`);
    }
  }
  
  async saveFileFromPath(localPath: string, filename: string): Promise<string> {
    try {
      const nextCloudPath = this.getFullPath(filename);
      
      // Create a read stream from the local file
      const readStream = fs.createReadStream(localPath);
      
      // Save the file to NextCloud
      await this.client.putFileContents(nextCloudPath, readStream, {
        overwrite: true
      });
      
      return nextCloudPath;
    } catch (error: any) {
      console.error(`Error saving file to NextCloud: ${error.message || 'Unknown error'}`);
      throw new Error(`Failed to save file to NextCloud: ${error.message || 'Unknown error'}`);
    }
  }
}

// Choose the appropriate storage implementation based on environment
let storage: IStorage;

if (process.env.NEXTCLOUD_URL && process.env.NEXTCLOUD_USERNAME && process.env.NEXTCLOUD_PASSWORD) {
  console.log('Using NextCloud storage');
  try {
    storage = new NextCloudStorage();
  } catch (error) {
    console.error('Failed to initialize NextCloud storage:', error);
    console.log('Falling back to local storage');
    storage = new MemStorage();
  }
} else {
  console.log('Using local storage (NextCloud credentials not provided)');
  storage = new MemStorage();
}

export { storage };
