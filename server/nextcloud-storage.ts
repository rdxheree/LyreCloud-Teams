import { files, type File, type InsertFile, users, type User, type InsertUser } from "@shared/schema";
import fs from "fs";
import path from "path";
import { createClient, WebDAVClient } from "webdav";
import { Readable } from "stream";
import { IStorage } from "./storage";

export class NextCloudStorage implements IStorage {
  private users: Map<number, User>;
  private files: Map<number, File>;
  private userCurrentId: number;
  private fileCurrentId: number;
  public client: WebDAVClient;
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
    this.baseFolder = process.env.NEXTCLOUD_FOLDER || 'LyreTeams';
    
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
    this.initializeStorage();
  }
  
  // Test connection to the NextCloud server
  private async testConnection(): Promise<void> {
    try {
      // Try to get server capabilities by making a simple request
      await this.client.getDirectoryContents('/');
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
      
      // Load users from NextCloud
      await this.loadUsersFromNextCloud();
      
      // Then scan for files in the cdns folder
      await this.scanFilesFromNextCloud();
      
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

  // Scan and load files from NextCloud
  private async scanFilesFromNextCloud(): Promise<void> {
    try {
      const cdnsFolder = `${this.baseFolder}/cdns`;
      const cdnsContent = await this.client.getDirectoryContents(cdnsFolder);
      console.log(`Scanning NextCloud directory: ${cdnsFolder}`);
      
      // Convert to array if it's not already
      const contentArray = Array.isArray(cdnsContent) ? cdnsContent : 'data' in cdnsContent ? cdnsContent.data : [];
      
      console.log(`Found ${contentArray.length} items in NextCloud cdns folder`);
      
      this.files.clear();
      this.fileCurrentId = 1;
      
      // Add files to our in-memory storage
      for (const item of contentArray) {
        // Skip directories
        if (item.type === 'directory') continue;
        
        const filename = path.basename(item.basename);
        console.log(`Adding new file from NextCloud: ${filename}`);
        
        const now = new Date();
        const mimeType = item.mime || this.getMimeTypeFromFilename(filename);
        
        // Create a file record
        const newFile: File = {
          id: this.fileCurrentId++,
          filename: filename,
          originalFilename: filename,
          path: `${cdnsFolder}/${filename}`,
          size: item.size || 0,
          mimeType: mimeType,
          uploadedAt: now,
          isDeleted: false
        };
        
        this.files.set(newFile.id, newFile);
      }
    } catch (error) {
      console.error('Error scanning NextCloud files:', error);
    }
  }
  
  // Helper method to guess MIME type from filename
  private getMimeTypeFromFilename(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.gif':
        return 'image/gif';
      case '.pdf':
        return 'application/pdf';
      case '.txt':
        return 'text/plain';
      case '.doc':
      case '.docx':
        return 'application/msword';
      case '.xls':
      case '.xlsx':
        return 'application/vnd.ms-excel';
      case '.ppt':
      case '.pptx':
        return 'application/vnd.ms-powerpoint';
      case '.mp3':
        return 'audio/mpeg';
      case '.mp4':
        return 'video/mp4';
      default:
        return 'application/octet-stream';
    }
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
    
    // Create a complete user object with required fields
    const user: User = { 
      ...insertUser, 
      id,
      role: insertUser.role || 'user',
      isApproved: insertUser.isApproved !== undefined ? insertUser.isApproved : false,
      status: insertUser.status || 'pending'
    };
    
    console.log(`Creating new user: ${user.username} with role ${user.role} and status ${user.status}`);
    
    // Add user to the map
    this.users.set(id, user);
    
    // Log all users before saving
    const allUsers = Array.from(this.users.values());
    console.log(`Current users (${allUsers.length}) before saving:`, allUsers.map(u => `${u.username} (${u.role})`));
    
    // Save to NextCloud with retry logic
    try {
      await this.saveUsersToNextCloud();
      console.log(`Successfully saved user ${user.username} to NextCloud`);
    } catch (error: any) {
      console.error(`Error saving new user ${user.username} to NextCloud:`, error);
      throw new Error(`Failed to persist user to NextCloud: ${error.message || 'Unknown error'}`);
    }
    
    return user;
  }
  
  async updateUser(id: number, updateData: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, ...updateData };
    this.users.set(id, updatedUser);
    
    // Save changes to NextCloud
    await this.saveUsersToNextCloud();
    
    return updatedUser;
  }
  
  async deleteUser(id: number): Promise<boolean> {
    const result = this.users.delete(id);
    
    // Save changes to NextCloud
    if (result) {
      await this.saveUsersToNextCloud();
    }
    
    return result;
  }
  
  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }
  
  async getPendingUsers(): Promise<User[]> {
    return Array.from(this.users.values()).filter(user => user.status === 'pending');
  }
  
  // Save users to a users.json file in NextCloud
  private async saveUsersToNextCloud(retryCount = 0): Promise<void> {
    const maxRetries = 3;
    
    try {
      // Check if the client is initialized
      if (!this.client) {
        throw new Error('WebDAV client not initialized');
      }
      
      // Convert users Map to array - use a predictable sort order for consistency
      const usersArray = Array.from(this.users.values())
        .sort((a, b) => a.id - b.id); // Sort by ID for consistent ordering
      
      // Log the number of users being saved
      console.log(`Saving ${usersArray.length} users to NextCloud: ${usersArray.map(u => `${u.username} (${u.role})`).join(', ')}`);
      
      // Convert to JSON string
      const usersJson = JSON.stringify(usersArray, null, 2);
      
      // Path for users file in NextCloud
      const usersFilePath = `${this.baseFolder}/users.json`;
      
      // Ensure the base folder exists before saving
      await this.ensureBaseFolder();
      
      // Create a backup file first (to avoid data loss if write fails)
      try {
        const exists = await this.client.exists(usersFilePath);
        if (exists) {
          const backupPath = `${this.baseFolder}/users.backup.json`;
          await this.client.copyFile(usersFilePath, backupPath);
          console.log('Created backup of users.json before saving');
        }
      } catch (backupError) {
        console.warn('Could not create backup of users.json:', backupError);
        // Continue with save even if backup fails
      }
      
      // Save the file to NextCloud
      await this.client.putFileContents(usersFilePath, usersJson, {
        overwrite: true
      });
      
      console.log('Users saved to NextCloud successfully');
      
      // Verify the save by immediately reading back the file
      try {
        // Force a small delay to ensure file write is complete on server
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const content = await this.client.getFileContents(usersFilePath, { format: 'text' });
        
        if (typeof content === 'string') {
          const savedUsers = JSON.parse(content);
          console.log(`Verified saved users: found ${savedUsers.length} users in NextCloud storage:`);
          
          // Log each saved user for verification
          savedUsers.forEach((user: User) => {
            console.log(`- User ${user.id}: ${user.username} (${user.role}), status: ${user.status}`);
          });
          
          // Double check the admin user is present with correct role
          const adminUser = savedUsers.find((u: User) => u.username === 'rdxhere.exe');
          if (!adminUser) {
            console.warn('WARNING: Admin user not found in saved file!');
          } else if (adminUser.role !== 'admin') {
            console.warn(`WARNING: Admin user has incorrect role: ${adminUser.role}`);
          }
        }
      } catch (verifyError) {
        console.warn('Could not verify saved users file:', verifyError);
      }
    } catch (error: any) {
      console.error(`Error saving users to NextCloud (attempt ${retryCount + 1}/${maxRetries + 1}):`, error);
      
      // Retry if we haven't exceeded max retries
      if (retryCount < maxRetries) {
        console.log(`Retrying saving users to NextCloud (attempt ${retryCount + 2}/${maxRetries + 1})...`);
        
        // Wait a bit before retrying (exponential backoff)
        const delay = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Retry the save operation
        return this.saveUsersToNextCloud(retryCount + 1);
      } else {
        console.error(`Failed to save users to NextCloud after ${maxRetries + 1} attempts`);
        throw new Error(`Failed to save users to NextCloud: ${error.message || 'Unknown error'}`);
      }
    }
  }
  
  // Load users from the users.json file in NextCloud
  private async loadUsersFromNextCloud(): Promise<void> {
    try {
      // Path for users file in NextCloud
      const usersFilePath = `${this.baseFolder}/users.json`;
      
      console.log(`Attempting to load users from ${usersFilePath}`);
      
      // Check if file exists with better error handling
      let exists = false;
      try {
        exists = await this.client.exists(usersFilePath);
        console.log(`Users file exists in NextCloud: ${exists}`);
      } catch (existsError) {
        console.warn('Error checking if users.json exists:', existsError);
        // Continue with assumption that file doesn't exist
      }
      
      if (!exists) {
        console.log('Users file does not exist in NextCloud yet. Creating default admin...');
        
        // Create default admin user with hashed password
        // Note: We're not hashing this password here because it should be hashed by auth.ts setupDefaultAdmin
        const adminUser: User = {
          id: this.userCurrentId++,
          username: 'rdxhere.exe',
          password: 'rdxpass', // Will be properly hashed by auth.ts
          role: 'admin',
          status: 'approved',
          isApproved: true
        };
        
        this.users.set(adminUser.id, adminUser);
        
        // Save to NextCloud
        await this.saveUsersToNextCloud();
        console.log('Created default admin user with username rdxhere.exe');
        return;
      }
      
      // Read file content with better error handling
      let fileContent;
      try {
        console.log('Reading users.json content from NextCloud...');
        fileContent = await this.client.getFileContents(usersFilePath, { format: 'text' });
        console.log('Successfully read users.json file');
      } catch (readError) {
        console.error('Error reading users.json from NextCloud:', readError);
        throw new Error('Failed to read users file from NextCloud');
      }
      
      if (typeof fileContent !== 'string') {
        console.error('Unexpected file content format:', typeof fileContent);
        throw new Error('Unexpected file content format');
      }
      
      // Log the raw content for debugging
      console.log('Raw users.json content:', fileContent);
      
      try {
        // Parse JSON with validation
        if (!fileContent.trim()) {
          console.error('Empty users.json file');
          throw new Error('Empty users file');
        }
        
        // Parse JSON
        const usersArray = JSON.parse(fileContent) as User[];
        console.log(`Parsed users from JSON, found ${usersArray.length} users:`, 
          usersArray.map(u => `${u.username} (${u.role})`).join(', '));
        
        // Find max ID to determine next ID
        let maxId = 0;
        
        // Clear current users and rebuild from file
        this.users.clear();
        
        // Add users to Map
        for (const user of usersArray) {
          // Make sure user has required fields
          if (!user.id || !user.username || !user.password) {
            console.warn(`Skipping invalid user record:`, user);
            continue;
          }
          
          this.users.set(user.id, user);
          maxId = Math.max(maxId, user.id);
          console.log(`Added user from NextCloud: ${user.username} (${user.role})`);
        }
        
        // Update current ID
        this.userCurrentId = maxId + 1;
        
        console.log(`Loaded ${this.users.size} users from NextCloud`);
        
        // Check if admin exists, create one if not
        const adminUser = Array.from(this.users.values()).find(u => u.username === 'rdxhere.exe');
        const adminExists = adminUser && adminUser.role === 'admin';
        if (!adminExists) {
          console.log('No admin user found or admin privileges missing. Restoring default admin...');
          
          // Create default admin user
          // Note: We're not hashing this password here because it should be hashed by auth.ts setupDefaultAdmin
          const newAdminUser: User = {
            id: this.userCurrentId++,
            username: 'rdxhere.exe',
            password: 'rdxpass', // Will be properly hashed by auth.ts
            role: 'admin',
            status: 'approved',
            isApproved: true
          };
          
          this.users.set(newAdminUser.id, newAdminUser);
          
          // Save updated users to NextCloud
          await this.saveUsersToNextCloud();
          console.log('Restored default admin user: rdxhere.exe');
        } else if (adminUser && adminUser.role !== 'admin') {
          // Fix role if it's wrong
          adminUser.role = 'admin';
          console.log(`Fixed admin role for ${adminUser.username}`);
          await this.saveUsersToNextCloud();
        }
      } catch (parseError: any) {
        console.error('Error parsing users JSON from NextCloud:', parseError);
        throw new Error(`Invalid users file format in NextCloud: ${parseError.message || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('Error loading users from NextCloud:', error);
      console.log('Initializing with empty users collection and default admin');
      
      // Clear current users
      this.users.clear();
      
      // Create default admin user
      // Note: We're not hashing this password here because it should be hashed by auth.ts setupDefaultAdmin
      const adminUser: User = {
        id: this.userCurrentId++,
        username: 'rdxhere.exe',
        password: 'rdxpass', // Will be properly hashed by auth.ts
        role: 'admin',
        status: 'approved',
        isApproved: true
      };
      
      this.users.set(adminUser.id, adminUser);
      
      // Try to save to NextCloud
      try {
        await this.saveUsersToNextCloud();
        console.log('Created default admin user as fallback');
      } catch (saveError) {
        console.error('Failed to save initial users to NextCloud:', saveError);
      }
    }
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