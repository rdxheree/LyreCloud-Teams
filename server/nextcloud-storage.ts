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
  private fileMetadata: Record<string, Partial<File>> | null = null;
  
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
      
      // Load file metadata from NextCloud
      await this.loadFileMetadataFromNextCloud();
      
      // Then scan for files in the cdns folder
      await this.scanFilesFromNextCloud();
      
      // Verify storage consistency after initialization
      await this.verifyStorageConsistency();

      // Save file metadata back to NextCloud to ensure it's up to date
      await this.saveFileMetadataToNextCloud();
      
      console.log('NextCloud storage initialization complete');
    } catch (error) {
      console.error('NextCloud storage initialization error:', error);
    }
  }
  
  // Helper method to verify storage consistency after initialization
  private async verifyStorageConsistency(): Promise<void> {
    try {
      console.log('Verifying storage consistency...');
      
      // Check if admin user exists and has correct role
      const adminUser = Array.from(this.users.values()).find(u => u.username === 'rdxhere.exe');
      if (!adminUser) {
        console.error('CONSISTENCY ERROR: Admin user missing after initialization!');
        throw new Error('Admin user missing');
      }
      
      if (adminUser.role !== 'admin') {
        console.error(`CONSISTENCY ERROR: Admin user has incorrect role: "${adminUser.role}"`);
        // Fix it immediately
        adminUser.role = 'admin';
        await this.saveUsersToNextCloud();
        console.log('Fixed admin user role during consistency check');
      }
      
      // Verify all users have required fields
      const invalidUsers = Array.from(this.users.values()).filter(
        u => !u.id || !u.username || !u.password || !u.role || !u.status
      );
      
      if (invalidUsers.length > 0) {
        console.error(`CONSISTENCY ERROR: Found ${invalidUsers.length} users with missing required fields`);
        // Remove invalid users
        for (const user of invalidUsers) {
          console.warn(`Removing invalid user during consistency check:`, user);
          this.users.delete(user.id);
        }
        await this.saveUsersToNextCloud();
        console.log('Fixed invalid users during consistency check');
      }
      
      console.log('Storage consistency verification complete');
    } catch (error) {
      console.error('Error during storage consistency verification:', error);
      // We intentionally don't re-throw here to allow startup to continue
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

  // Load file metadata from NextCloud
  private async loadFileMetadataFromNextCloud(): Promise<void> {
    try {
      // Check if files.json exists in the base folder
      const metadataPath = `${this.baseFolder}/files.json`;
      let fileMetadata: Record<string, Partial<File>> = {};
      
      try {
        const exists = await this.client.exists(metadataPath);
        if (exists) {
          console.log("Found files.json metadata file, loading...");
          const fileContent = await this.client.getFileContents(metadataPath, { format: 'text' });
          if (fileContent && typeof fileContent === 'string') {
            try {
              fileMetadata = JSON.parse(fileContent);
              console.log(`Loaded metadata for ${Object.keys(fileMetadata).length} files`);
            } catch (e) {
              console.error("Error parsing files.json:", e);
              console.log("Content of files.json:", fileContent);
            }
          }
        } else {
          console.log("No files.json metadata file found, will create one on next save");
        }
      } catch (error) {
        console.error("Error checking/loading file metadata:", error);
      }
      
      // Try to load individual metadata files from the metadata folder
      try {
        const metadataFolder = `${this.baseFolder}/metadata`;
        const folderExists = await this.client.exists(metadataFolder);
        
        if (folderExists) {
          console.log(`Looking for individual metadata files in ${metadataFolder}`);
          const metadataContents = await this.client.getDirectoryContents(metadataFolder);
          
          // Convert to array if it's not already
          const contentArray = Array.isArray(metadataContents) ? metadataContents : 'data' in metadataContents ? metadataContents.data : [];
          
          console.log(`Found ${contentArray.length} items in metadata folder`);
          
          // Load each metadata file
          for (const item of contentArray) {
            if (item.type === 'directory' || !item.basename.endsWith('.json')) continue;
            
            try {
              const metadataFilePath = `${metadataFolder}/${item.basename}`;
              const jsonContent = await this.client.getFileContents(metadataFilePath, { format: 'text' });
              
              if (jsonContent && typeof jsonContent === 'string') {
                try {
                  const fileInfo = JSON.parse(jsonContent);
                  const originalFilename = fileInfo.system_filename;
                  
                  if (originalFilename) {
                    // This ensures we have a key in the metadata object for this file
                    if (!fileMetadata[originalFilename]) {
                      fileMetadata[originalFilename] = {};
                    }
                    
                    // Ensure we preserve the uploadedBy information
                    if (fileInfo.uploaded_by) {
                      // Set it directly in the metadata object
                      fileMetadata[originalFilename].uploadedBy = fileInfo.uploaded_by;
                      console.log(`Loaded uploadedBy information for ${originalFilename}: ${fileInfo.uploaded_by}`);
                      
                      // Also patch the global metadata file to make sure we have this data in both places
                      if (fileInfo.system_filename) {
                        fileMetadata[fileInfo.system_filename] = {
                          ...fileMetadata[fileInfo.system_filename],
                          uploadedBy: fileInfo.uploaded_by
                        };
                        console.log(`Also updated global metadata for ${fileInfo.system_filename} with uploadedBy: ${fileInfo.uploaded_by}`);
                      } else {
                        console.log(`Cannot update global metadata - missing system_filename in ${item.basename}`);
                      }
                    }
                    
                    // Convert the string date back to a Date object if needed
                    if (fileInfo.uploaded_on) {
                      try {
                        // Extract the date component from the IST formatted string
                        const dateMatch = fileInfo.uploaded_on.match(/([A-Za-z]+ \d+, \d{4})/);
                        const timeMatch = fileInfo.uploaded_on.match(/(\d{1,2}:\d{2}:\d{2})/);
                        
                        if (dateMatch && dateMatch[1] && timeMatch && timeMatch[1]) {
                          const dateStr = `${dateMatch[1]} ${timeMatch[1]}`;
                          fileMetadata[originalFilename].uploadedAt = new Date(dateStr);
                          console.log(`Loaded upload date for ${originalFilename}: ${fileMetadata[originalFilename].uploadedAt}`);
                        }
                      } catch (dateError) {
                        console.error(`Error parsing date from metadata for ${originalFilename}:`, dateError);
                      }
                    }
                  }
                } catch (jsonError) {
                  console.error(`Error parsing metadata file ${item.basename}:`, jsonError);
                }
              }
            } catch (fileError) {
              console.error(`Error reading metadata file ${item.basename}:`, fileError);
            }
          }
        }
      } catch (metadataFolderError) {
        console.error("Error loading metadata from individual files:", metadataFolderError);
      }
      
      // Store the metadata to apply during scan
      this.fileMetadata = fileMetadata;
    } catch (error) {
      console.error("Error loading file metadata:", error);
    }
  }
  
  // Save file metadata to NextCloud
  private async saveFileMetadataToNextCloud(): Promise<void> {
    try {
      const metadataPath = `${this.baseFolder}/files.json`;
      
      // Create a map of filename -> metadata
      const metadata: Record<string, Partial<File>> = {};
      
      // Add all existing files to the metadata
      for (const file of this.files.values()) {
        if (!file.isDeleted) {
          // Only save relevant metadata
          metadata[file.filename] = {
            originalFilename: file.originalFilename,
            uploadedBy: file.uploadedBy || "system", // Ensure we have a default value
            uploadedAt: file.uploadedAt
          };
          
          console.log(`Saving metadata for file ${file.filename}: uploadedBy=${file.uploadedBy || "system"}`);
        }
      }
      
      // Convert to JSON
      const jsonContent = JSON.stringify(metadata, null, 2);
      
      // Save to NextCloud
      console.log(`Saving metadata for ${Object.keys(metadata).length} files to NextCloud`);
      await this.client.putFileContents(metadataPath, jsonContent, { overwrite: true });
      console.log("File metadata saved successfully");
    } catch (error) {
      console.error("Error saving file metadata:", error);
    }
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
        
        // Skip metadata JSON files and any files that start with files.json or users.json
        if (filename.endsWith('.json') || 
            filename === 'files.json' || 
            filename === 'users.json' ||
            filename.includes('-users.json')) {
          console.log(`Skipping metadata file: ${filename}`);
          continue;
        }
        
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
          isDeleted: false,
          uploadedBy: "system"
        };
        
        // Apply metadata if available
        if (this.fileMetadata && this.fileMetadata[filename]) {
          const savedMetadata = this.fileMetadata[filename];
          if (savedMetadata.uploadedBy) {
            newFile.uploadedBy = savedMetadata.uploadedBy;
            console.log(`Applied uploadedBy from master metadata: ${filename} -> ${savedMetadata.uploadedBy}`);
          }
          if (savedMetadata.uploadedAt) newFile.uploadedAt = new Date(savedMetadata.uploadedAt);
          if (savedMetadata.originalFilename) newFile.originalFilename = savedMetadata.originalFilename;
        } else {
          // Log a clear message that we couldn't find metadata for this file
          console.log(`No master metadata found for file: ${filename}, keeping default uploadedBy: ${newFile.uploadedBy}`);
        }
        
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
      // All image formats
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.gif':
        return 'image/gif';
      case '.webp':
        return 'image/webp';
      case '.bmp':
        return 'image/bmp';
      case '.tiff':
      case '.tif':
        return 'image/tiff';
      case '.heic':
        return 'image/heic';
      case '.heif':
        return 'image/heif';
      case '.svg':
        return 'image/svg+xml';
      // Document types
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
      // Media types
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
      
      // Ensure there's at least one admin user
      let adminUser = Array.from(this.users.values()).find(u => u.username === 'rdxhere.exe');
      if (!adminUser) {
        console.log('No admin user found before saving. Adding default admin...');
        adminUser = {
          id: this.userCurrentId++,
          username: 'rdxhere.exe',
          password: 'rdxpass', // Will be properly hashed by auth.ts
          role: 'admin',
          status: 'approved',
          isApproved: true
        };
        this.users.set(adminUser.id, adminUser);
      }
      
      // Always ensure admin role is correct
      if (adminUser.role !== 'admin') {
        console.log(`Fixing admin role from "${adminUser.role}" to "admin" before saving`);
        adminUser.role = 'admin';
      }
      
      // Convert users Map to array - use a predictable sort order for consistency
      const usersArray = Array.from(this.users.values())
        .sort((a, b) => a.id - b.id); // Sort by ID for consistent ordering
      
      // Log the number of users being saved
      console.log(`Saving ${usersArray.length} users to NextCloud: ${usersArray.map(u => `${u.username} (${u.role})`).join(', ')}`);
      
      // Convert to JSON string with double-check for data validity
      // Add validation to ensure all user objects have required fields
      for (const user of usersArray) {
        if (!user.id || !user.username || !user.password) {
          console.warn(`Fixing invalid user before saving:`, user);
          user.id = user.id || this.userCurrentId++;
          user.username = user.username || `user_${user.id}`;
          user.password = user.password || 'default_password';
        }
        // Ensure correct roles and status
        user.role = user.role || 'user';
        user.status = user.status || 'pending';
        user.isApproved = user.status === 'approved';
      }
      
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
        await new Promise(resolve => setTimeout(resolve, 500)); // Increased delay for reliability
        
        const content = await this.client.getFileContents(usersFilePath, { format: 'text' });
        
        if (typeof content === 'string') {
          const savedUsers = JSON.parse(content);
          console.log(`Verified saved users: found ${savedUsers.length} users in NextCloud storage:`);
          
          // Log each saved user for verification
          savedUsers.forEach((user: User) => {
            console.log(`- User ${user.id}: ${user.username} (${user.role}), status: ${user.status}`);
          });
          
          // Double check the admin user is present with correct role
          const adminUserSaved = savedUsers.find((u: User) => u.username === 'rdxhere.exe');
          if (!adminUserSaved) {
            console.warn('WARNING: Admin user not found in saved file! Will attempt to restore on next load.');
          } else if (adminUserSaved.role !== 'admin') {
            console.warn(`WARNING: Admin user has incorrect role: "${adminUserSaved.role}" in saved file! Will fix on next load.`);
          } else {
            console.log(`Admin user successfully verified in saved file with role: ${adminUserSaved.role}`);
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
          
          // Normalize user fields to ensure consistency
          user.role = user.role || 'user';
          user.status = user.status || 'pending';
          user.isApproved = user.status === 'approved';
          
          // Special validation for admin user
          if (user.username === 'rdxhere.exe' && user.role !== 'admin') {
            console.warn(`Fixing admin role during load: changing from "${user.role}" to "admin"`);
            user.role = 'admin';
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
        
        if (!adminUser) {
          console.log('No admin user found. Restoring default admin...');
          
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
        } else if (adminUser.role !== 'admin') {
          // Always fix admin role to ensure it's correct
          console.log(`Found admin user with incorrect role: "${adminUser.role}". Fixing to "admin"`);
          adminUser.role = 'admin';
          
          // Save the fix immediately
          await this.saveUsersToNextCloud();
          console.log(`Fixed admin role for ${adminUser.username}`);
        } else {
          console.log(`Admin user verified with correct role: ${adminUser.role}`);
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
    
    // Force rdxhere.exe as the uploader for testing
    const uploadedBy = insertFile.uploadedBy || "rdxhere.exe";
    console.log(`Creating file with uploader explicitly set to: ${uploadedBy}`);
    
    // For NextCloud, path is a virtual path that references the NextCloud location
    const file: File = { 
      ...insertFile, 
      id, 
      uploadedAt, 
      isDeleted: false,
      // Override path to include the virtual NextCloud path
      path: this.getFullPath(insertFile.filename),
      // Set the uploader name
      uploadedBy: uploadedBy
    };
    
    this.files.set(id, file);
    
    // Save metadata to NextCloud to persist the uploadedBy information
    try {
      // Double check that we have the uploader info
      console.log(`Preparing to save metadata for new file: ${file.filename} uploaded by ${file.uploadedBy}`);
      
      // Update the global metadata
      if (this.fileMetadata) {
        this.fileMetadata[file.filename] = {
          ...this.fileMetadata[file.filename],
          uploadedBy: file.uploadedBy,
          uploadedAt: file.uploadedAt,
          originalFilename: file.originalFilename
        };
        console.log(`Updated fileMetadata in memory with uploader: ${file.uploadedBy}`);
      }
      
      // Save to NextCloud
      await this.saveFileMetadataToNextCloud();
      console.log(`Saved metadata for new file: ${file.filename} uploaded by ${file.uploadedBy}`);
      
      // Save individual file metadata JSON
      await this.saveIndividualFileMetadata(file);
    } catch (error) {
      console.error('Error saving file metadata after file creation:', error);
      // Continue anyway, don't block the upload
    }
    
    return file;
  }
  
  // Create a nicely formatted individual JSON file for each uploaded file in a separate metadata folder
  private async saveIndividualFileMetadata(file: File): Promise<void> {
    try {
      // Format file size in a human-readable format
      const sizeInBytes = file.size;
      let formattedSize = '';
      
      if (sizeInBytes < 1024) {
        formattedSize = `${sizeInBytes} bytes`;
      } else if (sizeInBytes < 1024 * 1024) {
        formattedSize = `${(sizeInBytes / 1024).toFixed(2)} KB`;
      } else if (sizeInBytes < 1024 * 1024 * 1024) {
        formattedSize = `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`;
      } else {
        formattedSize = `${(sizeInBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
      }
      
      // Format upload date in IST (Indian Standard Time)
      const uploadDate = new Date(file.uploadedAt);
      const istOptions: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      };
      
      const formattedDate = uploadDate.toLocaleString('en-IN', istOptions);
      
      // Create metadata file content
      const metadata = {
        filename: file.originalFilename,
        size: formattedSize,
        uploaded_on: formattedDate,
        uploaded_by: file.uploadedBy,
        mime_type: file.mimeType,
        system_filename: file.filename,
        file_id: file.id
      };
      
      // Generate a JSON string with proper formatting
      const jsonContent = JSON.stringify(metadata, null, 2);
      
      // Create a metadata folder if it doesn't exist
      let metadataFolder = `${this.baseFolder}/metadata`;
      try {
        const folderExists = await this.client.exists(metadataFolder);
        if (!folderExists) {
          console.log(`Creating metadata folder: ${metadataFolder}`);
          await this.client.createDirectory(metadataFolder);
        }
      } catch (folderError) {
        console.error('Error checking/creating metadata folder:', folderError);
        // Create it anyway and catch any error
        try {
          await this.client.createDirectory(metadataFolder);
        } catch (createError) {
          // If it still fails, we'll save in the base folder instead
          console.error('Failed to create metadata folder, using base folder instead');
          metadataFolder = this.baseFolder;
        }
      }
      
      // Name the metadata file with same name as the original file
      const metadataFilename = `${file.filename}.json`;
      const metadataPath = `${metadataFolder}/${metadataFilename}`;
      
      // Save the file to NextCloud
      await this.client.putFileContents(metadataPath, jsonContent, { overwrite: true });
      
      console.log(`Individual metadata file created in metadata folder: ${metadataFilename}`);
    } catch (error) {
      console.error(`Error creating individual metadata file for ${file.filename}:`, error);
      // Don't throw - this is an enhancement, not critical
    }
  }
  
  async updateFile(id: number, updateData: Partial<File>): Promise<File | undefined> {
    const file = this.files.get(id);
    if (!file || file.isDeleted) return undefined;

    // Special handling for rename operation (originalFilename change)
    if (updateData.originalFilename && updateData.originalFilename !== file.originalFilename) {
      try {
        console.log(`Renaming file in NextCloud from "${file.filename}" to "${updateData.originalFilename}"`);
        
        // Get file extension from the original filename
        const fileExt = path.extname(file.filename);
        
        // Create new filename with the provided name but keep the original extension
        // Remove any existing extension from the new name to avoid duplicates
        const baseNewName = updateData.originalFilename.replace(/\.[^/.]+$/, "");
        const newFilename = baseNewName + fileExt;
        
        // Create paths for source and destination
        const sourcePath = file.path;
        const destFolder = path.dirname(file.path);
        const destPath = `${destFolder}/${newFilename}`;
        
        // Check if source file exists
        const exists = await this.client.exists(sourcePath);
        if (!exists) {
          console.error(`Source file does not exist in NextCloud: ${sourcePath}`);
          console.log("Skipping physical file rename, updating metadata only");
          
          // Still update the metadata even if file isn't found
          updateData.filename = newFilename;
          updateData.path = destPath;
        } else {
          // Only attempt file operations if the file exists
          try {
            // Copy the file to the new name
            await this.client.copyFile(sourcePath, destPath);
            
            // Delete the old file
            await this.client.deleteFile(sourcePath);
            
            // Also try to rename the individual JSON metadata file if it exists
            try {
              const metadataFilename = `${file.filename}.json`;
              const newMetadataFilename = `${newFilename}.json`;
              
              // First check the new metadata folder
              const metadataFolder = `${this.baseFolder}/metadata`;
              const oldMetadataPath = `${metadataFolder}/${metadataFilename}`;
              const newMetadataPath = `${metadataFolder}/${newMetadataFilename}`;
              
              // Create the metadata folder if it doesn't exist
              try {
                const folderExists = await this.client.exists(metadataFolder);
                if (!folderExists) {
                  console.log(`Creating metadata folder during rename: ${metadataFolder}`);
                  await this.client.createDirectory(metadataFolder);
                }
              } catch (folderError) {
                console.error('Error checking/creating metadata folder during rename:', folderError);
              }
              
              let metadataRenamed = false;
              
              // Check if metadata exists in the metadata folder
              const metadataExists = await this.client.exists(oldMetadataPath);
              if (metadataExists) {
                await this.client.copyFile(oldMetadataPath, newMetadataPath);
                await this.client.deleteFile(oldMetadataPath);
                console.log(`Renamed metadata file in metadata folder to: ${newMetadataFilename}`);
                metadataRenamed = true;
              }
              
              // As a fallback, check the old location
              if (!metadataRenamed) {
                const oldStyleMetadataPath = `${sourcePath}.json`;
                const oldStyleMetadataExists = await this.client.exists(oldStyleMetadataPath);
                
                if (oldStyleMetadataExists) {
                  // Instead of keeping it in the old location, move it to the metadata folder
                  await this.client.copyFile(oldStyleMetadataPath, newMetadataPath);
                  await this.client.deleteFile(oldStyleMetadataPath);
                  console.log(`Moved metadata file from old location to metadata folder: ${newMetadataFilename}`);
                }
              }
            } catch (metadataError) {
              console.error('Error renaming individual metadata JSON file:', metadataError);
              // Not critical, continue
            }
            
            // Update metadata with new filename and path
            updateData.filename = newFilename;
            updateData.path = destPath;
            
            console.log(`Successfully renamed file in NextCloud to: ${newFilename}`);
          } catch (copyError) {
            console.error('Error during file rename operation:', copyError);
            // Still update the metadata even if rename fails
            updateData.filename = newFilename;
            updateData.path = destPath;
          }
        }
      } catch (error) {
        console.error('Error in rename preparation:', error);
        // Don't throw - fall back to metadata update only
        console.log("Falling back to metadata update only");
        
        // At least update the display name
        const fileExt = path.extname(file.filename);
        const baseNewName = updateData.originalFilename.replace(/\.[^/.]+$/, "");
        const newFilename = baseNewName + fileExt;
        
        updateData.originalFilename = updateData.originalFilename;
        // Don't change actual filename/path if we had errors
      }
    }

    // Update the file metadata
    const updatedFile = { ...file, ...updateData };
    this.files.set(id, updatedFile);
    
    // Save metadata to NextCloud to persist the changes
    try {
      await this.saveFileMetadataToNextCloud();
      console.log(`Saved updated metadata for file: ${updatedFile.filename}`);
      
      // Also update the individual JSON metadata file
      await this.saveIndividualFileMetadata(updatedFile);
    } catch (error) {
      console.error('Error saving file metadata after update:', error);
      // Continue anyway, don't block the update
    }
    
    return updatedFile;
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
      
      // Also try to delete the individual JSON metadata file from the metadata folder
      try {
        const metadataFilename = `${file.filename}.json`;
        const metadataPath = `${this.baseFolder}/metadata/${metadataFilename}`;
        
        // First check the metadata folder
        const metadataExists = await this.client.exists(metadataPath);
        if (metadataExists) {
          await this.client.deleteFile(metadataPath);
          console.log(`Deleted individual metadata file from metadata folder: ${metadataFilename}`);
        } else {
          // As a fallback, check if there's a metadata file in the old location (cdns folder)
          const oldMetadataPath = this.getFullPath(metadataFilename);
          const oldMetadataExists = await this.client.exists(oldMetadataPath);
          if (oldMetadataExists) {
            await this.client.deleteFile(oldMetadataPath);
            console.log(`Deleted individual metadata file from old location: ${metadataFilename}`);
          }
        }
      } catch (jsonError) {
        console.error(`Error deleting individual metadata JSON file for ${file.filename}:`, jsonError);
        // Continue anyway, not critical
      }
      
      // Update metadata to remove the deleted file
      try {
        await this.saveFileMetadataToNextCloud();
        console.log(`Updated metadata after deleting file: ${file.filename}`);
      } catch (metadataError) {
        console.error('Error updating metadata after file deletion:', metadataError);
        // Continue anyway, the file is already deleted
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