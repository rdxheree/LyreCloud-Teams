import { storage } from './storage';

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
  username: string = 'system',
  details?: Record<string, any>
): Promise<void> {
  try {
    if (!storage.saveLogs) {
      console.warn('Logging attempted but storage doesn\'t support logs');
      return;
    }
    
    const logEntry: LogEntry = {
      id: generateId(),
      type,
      timestamp: new Date().toISOString(),
      message,
      username,
      details
    };
    
    await storage.saveLogs([logEntry]);
    console.log(`Log created: [${type}] ${message} by ${username}`);
  } catch (error) {
    console.error('Failed to create log entry:', error);
  }
}

/**
 * Generate a simple ID for log entries
 */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

// Helper functions for common log types
export const logger = {
  userRegister: (username: string) => 
    createLog(LogType.USER_REGISTER, `User ${username} registered`, username),
  
  userLogin: (username: string) => 
    createLog(LogType.USER_LOGIN, `User ${username} logged in`, username),
  
  userLogout: (username: string) => 
    createLog(LogType.USER_LOGOUT, `User ${username} logged out`, username),
  
  userDelete: (username: string, deletedBy: string) => 
    createLog(LogType.USER_DELETE, `User ${username} was deleted`, deletedBy, { deletedUser: username }),
  
  userAdmin: (username: string, actionBy: string) => 
    createLog(LogType.USER_ADMIN, `User ${username} was given admin rights`, actionBy, { targetUser: username }),
  
  userAdminRemove: (username: string, actionBy: string) => 
    createLog(LogType.USER_ADMIN_REMOVE, `Admin rights were removed from user ${username}`, actionBy, { targetUser: username }),
  
  userApprove: (username: string, actionBy: string) => 
    createLog(LogType.USER_APPROVE, `User ${username} was approved`, actionBy, { targetUser: username }),
  
  userReject: (username: string, actionBy: string) => 
    createLog(LogType.USER_REJECT, `User ${username} was rejected`, actionBy, { targetUser: username }),
  
  fileUpload: (filename: string, username: string) => 
    createLog(LogType.FILE_UPLOAD, `File ${filename} was uploaded`, username, { filename }),
  
  fileDelete: (filename: string, username: string) => 
    createLog(LogType.FILE_DELETE, `File ${filename} was deleted`, username, { filename }),
  
  fileRename: (oldName: string, newName: string, username: string) => 
    createLog(LogType.FILE_RENAME, `File ${oldName} was renamed to ${newName}`, username, { oldName, newName }),
  
  fileDownload: (filename: string, username: string) => 
    createLog(LogType.FILE_DOWNLOAD, `File ${filename} was downloaded`, username, { filename }),
  
  system: (message: string) => 
    createLog(LogType.SYSTEM, message, 'system'),
};