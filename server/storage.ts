import { files, type File, type InsertFile, users, type User, type InsertUser } from "@shared/schema";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { nanoid } from "nanoid";
import { Readable } from "stream";

// Import the NextCloudStorage implementation from the separate file
import { NextCloudStorage } from './nextcloud-storage';

// Export the interface for storage implementations
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
  updateFile(id: number, updateData: Partial<File>): Promise<File | undefined>;
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

// In-memory storage implementation
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
      isDeleted: false,
      uploadedBy: insertFile.uploadedBy || "unknown"
    };
    this.files.set(id, file);
    return file;
  }

  async updateFile(id: number, updateData: Partial<File>): Promise<File | undefined> {
    const file = this.files.get(id);
    if (!file || file.isDeleted) return undefined;

    // Prevent changing critical properties
    const safeUpdateData = { ...updateData };
    delete safeUpdateData.id;
    delete safeUpdateData.filename;
    delete safeUpdateData.path;
    delete safeUpdateData.isDeleted;

    // Update the file metadata
    const updatedFile = { ...file, ...safeUpdateData };
    this.files.set(id, updatedFile);
    return updatedFile;
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
