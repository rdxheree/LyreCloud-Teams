export enum LogType {
  USER_REGISTER = 'USER_REGISTER',
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  USER_DELETE = 'USER_DELETE',
  USER_ADMIN = 'USER_ADMIN',
  USER_ADMIN_REMOVE = 'USER_ADMIN_REMOVE',
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