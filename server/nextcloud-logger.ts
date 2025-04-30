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
          }
        } else {
          console.log('Logs file exists but is empty, initializing with empty logs');
          this.logs = [];
        }
      } else {
        console.log('Logs file does not exist, initializing with empty logs');
        this.logs = [];
        // Save empty logs array to create the file
        await this.saveToDisk();
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
      
      // Create a backup of the current logs file
      const fileExists = await this.client.exists(logsFile);
      if (fileExists) {
        try {
          const timestamp = Date.now();
          const backupFileName = `logs_backup_${timestamp}.json`;
          await this.client.copyFile(
            logsFile,
            `${logsDir}/${backupFileName}`
          );
          
          // Keep only the most recent 5 backups to avoid filling the storage
          const dirContents = await this.client.getDirectoryContents(logsDir);
          const backups = dirContents
            .filter((item: any) => 
              typeof item.basename === 'string' && 
              item.basename.startsWith('logs_backup_') && 
              item.basename.endsWith('.json') &&
              item.basename !== backupFileName
            )
            .sort((a: any, b: any) => b.lastmod - a.lastmod);
          
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
        } catch (error) {
          console.error('Failed to create logs backup:', error);
          // Continue anyway
        }
      }
      
      // Save logs to NextCloud
      await this.client.putFileContents(
        logsFile,
        JSON.stringify(this.logs, null, 2),
        { overwrite: true }
      );
      
      console.log(`Saved ${this.logs.length} log entries to NextCloud`);
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