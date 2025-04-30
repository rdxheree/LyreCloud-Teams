import { NextCloudStorage } from "./nextcloud-storage";
import { storage } from "./storage";
import { createLog, LogType } from "./logger";

// Interval in milliseconds (default: 5 minutes)
const KEEP_ALIVE_INTERVAL = 5 * 60 * 1000;

/**
 * KeepAlive service to ensure file links remain accessible
 * This periodically checks all file links to keep the connections warm
 */
export class KeepAliveService {
  private static instance: KeepAliveService;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastRunTime: Date | null = null;
  private storage: NextCloudStorage | null = null;

  private constructor() {
    // Check if storage is NextCloud
    if (storage instanceof NextCloudStorage) {
      this.storage = storage;
      console.log('KeepAlive service initialized with NextCloud storage');
    } else {
      console.log('KeepAlive service not needed for memory storage');
    }
  }

  public static getInstance(): KeepAliveService {
    if (!KeepAliveService.instance) {
      KeepAliveService.instance = new KeepAliveService();
    }
    return KeepAliveService.instance;
  }

  /**
   * Start the keep-alive service
   */
  public start(): void {
    if (this.isRunning || !this.storage) {
      return;
    }

    console.log(`Starting KeepAlive service with interval of ${KEEP_ALIVE_INTERVAL}ms`);
    
    // Run immediately on start
    this.performKeepAlive().catch(console.error);
    
    // Set up interval
    this.intervalId = setInterval(() => {
      this.performKeepAlive().catch(console.error);
    }, KEEP_ALIVE_INTERVAL);
    
    this.isRunning = true;
  }

  /**
   * Stop the keep-alive service
   */
  public stop(): void {
    if (!this.isRunning || !this.intervalId) {
      return;
    }

    clearInterval(this.intervalId);
    this.intervalId = null;
    this.isRunning = false;
    console.log('KeepAlive service stopped');
  }

  /**
   * Get the status of the keep-alive service
   */
  public getStatus(): { isRunning: boolean; lastRunTime: Date | null; nextRunTime: Date | null } {
    let nextRunTime = null;
    if (this.isRunning && this.lastRunTime) {
      nextRunTime = new Date(this.lastRunTime.getTime() + KEEP_ALIVE_INTERVAL);
    }
    
    return {
      isRunning: this.isRunning,
      lastRunTime: this.lastRunTime,
      nextRunTime
    };
  }

  /**
   * Manually trigger the keep-alive process
   */
  public async manualTrigger(): Promise<{
    success: boolean;
    message: string;
    fileCount: number;
    elapsedTime?: number;
  }> {
    if (!this.storage) {
      return {
        success: false,
        message: 'KeepAlive service is not configured with NextCloud storage',
        fileCount: 0
      };
    }

    try {
      const startTime = Date.now();
      const result = await this.performKeepAlive();
      const elapsedTime = Date.now() - startTime;
      
      return {
        success: true,
        message: `Successfully warmed up ${result.fileCount} files`,
        fileCount: result.fileCount,
        elapsedTime
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to warm up files: ${error.message}`,
        fileCount: 0
      };
    }
  }

  /**
   * Perform the keep-alive operations
   * This is the core function that verifies all file links are accessible
   */
  private async performKeepAlive(): Promise<{ fileCount: number }> {
    if (!this.storage) {
      return { fileCount: 0 };
    }

    try {
      this.lastRunTime = new Date();
      console.log(`Running KeepAlive service at ${this.lastRunTime.toISOString()}`);
      
      // Get all files from storage
      const files = await this.storage.getFiles();
      console.log(`KeepAlive service checking ${files.length} files`);
      
      // For each file, verify the file exists in NextCloud
      let successCount = 0;
      const failedFiles: string[] = [];
      
      for (const file of files) {
        try {
          // Verify the file exists in the NextCloud storage
          if (this.storage.client) {
            const exists = await this.storage.client.exists(file.path);
            if (exists) {
              successCount++;
            } else {
              failedFiles.push(file.filename);
            }
          }
        } catch (fileError) {
          console.error(`Error verifying file ${file.filename}:`, fileError);
          failedFiles.push(file.filename);
        }
      }
      
      console.log(`KeepAlive service verified ${successCount}/${files.length} files`);
      
      // Log any failures
      if (failedFiles.length > 0) {
        console.warn(`KeepAlive service couldn't verify ${failedFiles.length} files:`, failedFiles);
        
        // Create a system log about the failed files
        await createLog(
          LogType.SYSTEM,
          `KeepAlive service detected ${failedFiles.length} inaccessible files`,
          'system',
          { failedFiles }
        );
      }
      
      return { fileCount: files.length };
    } catch (error) {
      console.error('Error in KeepAlive service:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const keepAliveService = KeepAliveService.getInstance();