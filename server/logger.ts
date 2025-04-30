import { nanoid } from "nanoid";
import { storage } from "./storage";
import { WebhookService } from "./webhook";
import { NextCloudStorage } from "./nextcloud-storage";

// Initialize webhook service if it's a NextCloud storage
let webhookService: WebhookService | null = null;
if (storage instanceof NextCloudStorage) {
  webhookService = WebhookService.getInstance(storage);
  webhookService.initialize().catch(console.error);
}

/**
 * Enum for different log types
 * This helps categorize logs for filtering and display
 */
export enum LogType {
  USER_REGISTER = 'USER_REGISTER',
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  USER_DELETE = 'USER_DELETE',
  USER_ADMIN = 'USER_ADMIN', // When a user is given admin rights
  USER_ADMIN_REMOVE = 'USER_ADMIN_REMOVE', // When admin rights are removed
  USER_APPROVE = 'USER_APPROVE',
  USER_REJECT = 'USER_REJECT',
  
  FILE_UPLOAD = 'FILE_UPLOAD',
  FILE_DELETE = 'FILE_DELETE',
  FILE_RENAME = 'FILE_RENAME',
  FILE_DOWNLOAD = 'FILE_DOWNLOAD',
  
  SYSTEM = 'SYSTEM',
}

/**
 * Interface for log entries
 */
export interface LogEntry {
  id: string;
  type: LogType;
  timestamp: string;
  message: string;
  username: string;
  details?: Record<string, any>;
}

/**
 * Creates a log entry and saves it to the storage
 */
export async function createLog(
  type: LogType,
  message: string,
  username: string = "system",
  details?: Record<string, any>
): Promise<LogEntry> {
  try {
    const logEntry: LogEntry = {
      id: generateId(),
      type,
      timestamp: new Date().toISOString(),
      message,
      username,
      details
    };
    
    // Save to storage
    await storage.saveLogs([logEntry]);
    
    // Send to webhook if available
    if (webhookService) {
      webhookService.sendLog(logEntry).catch(err => {
        console.error('Failed to send log to webhook:', err);
      });
    }
    
    console.log(`Log created: [${type}] ${message} by ${username}`);
    
    return logEntry;
  } catch (error) {
    console.error('Error creating log entry:', error);
    throw error;
  }
}

/**
 * Generate a simple ID for log entries
 */
function generateId(): string {
  return nanoid(8);
}

export const logger = {
  createLog,
};