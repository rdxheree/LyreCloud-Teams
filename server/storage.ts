import { files, type File, type InsertFile, users, type User, type InsertUser } from "@shared/schema";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { nanoid } from "nanoid";
import { createClient, WebDAVClient } from "webdav";
import { Readable } from "stream";
import { NextCloudStorage } from "./nextcloud-storage";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
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
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
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
    this.baseFolder = process.env.NEXTCLOUD_FOLDER || '/lyrecloud';
    
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
    
    // This will be initialized asynchronously
    
    // We'll initialize the folder later in async operations
    // No need to await here in constructor
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
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
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
