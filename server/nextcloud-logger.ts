import { LogEntry } from './logger';
import { WebDAVClient } from 'webdav';

/**
 * NextCloud logging implementation
 * Saves logs to a logs.json file in the NextCloud storage
 */
export class NextCloudLogger {
  private client: WebDAVClient;
  private baseFolder: string;
  private logs: LogEntry[] = [];
  private isInitialized = false;
  
  constructor(client: WebDAVClient, baseFolder: string) {
    this.client = client;
    this.baseFolder = baseFolder;
  }
  
  /**
   * Initialize the logger by loading existing logs from NextCloud
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing NextCloud logger...');
      
      // Ensure the logs directory exists
      const logsDir = `${this.baseFolder}/logs`;
      const dirExists = await this.client.exists(logsDir);
      
      if (!dirExists) {
        console.log(`Creating logs directory: ${logsDir}`);
        await this.client.createDirectory(logsDir);
      }
      
      // Check if logs.json exists and load it
      const logsFile = `${logsDir}/logs.json`;
      const fileExists = await this.client.exists(logsFile);
      
      if (fileExists) {
        console.log('Loading existing logs from NextCloud...');
        try {
          const logsContent = await this.client.getFileContents(logsFile, { format: 'text' });
          
          if (logsContent && typeof logsContent === 'string' && logsContent.trim()) {
            try {
              this.logs = JSON.parse(logsContent);
              console.log(`Loaded ${this.logs.length} log entries from NextCloud`);
            } catch (error) {
              console.error('Failed to parse logs.json file:', error);
              // Initialize with empty logs
              this.logs = [];
              // Create a backup of the corrupted file
              const timestamp = Date.now();
              await this.client.moveFile(
                logsFile,
                `${logsDir}/logs_backup_${timestamp}.json`
              );
              console.log(`Created backup of corrupted logs file: logs_backup_${timestamp}.json`);
              
              // Create a new empty logs file
              await this.client.putFileContents(
                logsFile,
                JSON.stringify([]),
                { overwrite: true }
              );
              console.log('Created new empty logs file after backup');
            }
          } else {
            console.log('Logs file exists but is empty, initializing with empty logs');
            this.logs = [];
            
            // Make sure it's properly initialized as valid JSON
            await this.client.putFileContents(
              logsFile,
              JSON.stringify([]),
              { overwrite: true }
            );
            console.log('Reinitialized empty logs file with valid JSON array');
          }
        } catch (getError) {
          console.error('Error retrieving logs file:', getError);
          this.logs = [];
          // Try to recreate the file
          await this.client.putFileContents(
            logsFile,
            JSON.stringify([]),
            { overwrite: true }
          );
          console.log('Created new empty logs file after retrieval error');
        }
      } else {
        console.log('Logs file does not exist, initializing with empty logs');
        this.logs = [];
        // Create an empty logs file with a valid JSON array
        try {
          await this.client.putFileContents(
            logsFile,
            JSON.stringify([]),
            { overwrite: true }
          );
          console.log('Created new logs file with empty array');
        } catch (createError) {
          console.error('Error creating logs file:', createError);
          // Keep operating with in-memory logs anyway
        }
      }
      
      this.isInitialized = true;
      console.log('NextCloud logger initialized successfully');
    } catch (error) {
      console.error('Failed to initialize NextCloud logger:', error);
      // Continue with empty logs
      this.logs = [];
      this.isInitialized = true;
    }
  }
  
  /**
   * Save logs to NextCloud
   */
  async saveToDisk(): Promise<void> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }
      
      const logsDir = `${this.baseFolder}/logs`;
      const logsFile = `${logsDir}/logs.json`;
      
      // Ensure logs directory exists
      try {
        const dirExists = await this.client.exists(logsDir);
        if (!dirExists) {
          console.log(`Creating logs directory during save: ${logsDir}`);
          await this.client.createDirectory(logsDir);
        }
      } catch (dirError) {
        console.error('Error ensuring logs directory exists during save:', dirError);
        
        // Try to create directory with full path
        try {
          await this.client.createDirectory(logsDir, { recursive: true });
          console.log(`Created logs directory with recursive option: ${logsDir}`);
        } catch (recursiveError) {
          console.error('Failed to create logs directory recursively:', recursiveError);
          // Continue and attempt to save anyway
        }
      }
      
      // Create a backup of the current logs file
      try {
        const fileExists = await this.client.exists(logsFile);
        if (fileExists) {
          try {
            const timestamp = Date.now();
            const backupFileName = `logs_backup_${timestamp}.json`;
            await this.client.copyFile(
              logsFile,
              `${logsDir}/${backupFileName}`
            );
            console.log(`Created logs backup: ${backupFileName}`);
            
            // Keep only the most recent 5 backups to avoid filling the storage
            try {
              const dirContents = await this.client.getDirectoryContents(logsDir);
              // Convert dirContents to array if needed
              const contentArray = Array.isArray(dirContents) ? dirContents : 'data' in dirContents ? dirContents.data : [];
              
              const backups = contentArray
                .filter((item: any) => 
                  typeof item.basename === 'string' && 
                  item.basename.startsWith('logs_backup_') && 
                  item.basename.endsWith('.json') &&
                  item.basename !== backupFileName
                )
                .sort((a: any, b: any) => {
                  // Handle cases where lastmod might not be available or valid
                  const lastModA = a.lastmod ? new Date(a.lastmod).getTime() : 0;
                  const lastModB = b.lastmod ? new Date(b.lastmod).getTime() : 0;
                  return lastModB - lastModA;
                });
              
              // Delete oldest backups if there are more than 5
              if (backups.length > 4) {
                const oldestBackups = backups.slice(4);
                for (const backup of oldestBackups) {
                  try {
                    await this.client.deleteFile(`${logsDir}/${backup.basename}`);
                    console.log(`Deleted old logs backup: ${backup.basename}`);
                  } catch (error) {
                    console.error(`Failed to delete old logs backup ${backup.basename}:`, error);
                  }
                }
              }
            } catch (cleanupError) {
              console.error('Error cleaning up old backups:', cleanupError);
              // Continue anyway
            }
          } catch (backupError) {
            console.error('Failed to create logs backup:', backupError);
            // Continue anyway
          }
        }
      } catch (existsError) {
        console.error('Error checking if logs file exists:', existsError);
        // Continue anyway
      }
      
      // Save logs to NextCloud
      try {
        await this.client.putFileContents(
          logsFile,
          JSON.stringify(this.logs, null, 2),
          { overwrite: true }
        );
        
        console.log(`Saved ${this.logs.length} log entries to NextCloud`);
      } catch (saveError) {
        console.error('Error saving logs to file:', saveError);
        
        // Try one more time with a simplified approach
        try {
          await this.client.putFileContents(
            logsFile,
            JSON.stringify(this.logs),
            { overwrite: true }
          );
          console.log(`Saved ${this.logs.length} log entries to NextCloud (retry succeeded)`);
        } catch (retryError) {
          console.error('Final attempt to save logs failed:', retryError);
          throw retryError; // Let the outer catch handle it
        }
      }
    } catch (error) {
      console.error('Failed to save logs to NextCloud:', error);
    }
  }
  
  /**
   * Add new log entries
   */
  async addLogs(newLogs: LogEntry[]): Promise<void> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }
      
      // Add new logs
      this.logs.push(...newLogs);
      
      // Save to disk
      await this.saveToDisk();
    } catch (error) {
      console.error('Failed to add logs:', error);
    }
  }
  
  /**
   * Get filtered logs
   */
  async getLogs(limit?: number, offset?: number, types?: string[]): Promise<LogEntry[]> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }
      
      let filteredLogs = [...this.logs];
      
      // Filter by type if specified
      if (types && types.length > 0) {
        filteredLogs = filteredLogs.filter(log => 
          types.includes(log.type)
        );
      }
      
      // Sort by timestamp (newest first)
      filteredLogs.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      
      // Apply pagination
      if (offset !== undefined) {
        filteredLogs = filteredLogs.slice(offset);
      }
      
      if (limit !== undefined) {
        filteredLogs = filteredLogs.slice(0, limit);
      }
      
      return filteredLogs;
    } catch (error) {
      console.error('Failed to get logs:', error);
      return [];
    }
  }
}