import { FileIcon, ImageIcon, FileTextIcon, FileSpreadsheetIcon, FileCodeIcon, FileArchiveIcon, FileAudioIcon, FileVideoIcon } from "lucide-react";

interface FileTypeInfo {
  icon: React.ElementType;
  bgColor: string;
  iconColor: string;
}

export const getFileTypeInfo = (mimeType: string): FileTypeInfo => {
  // Image files
  if (mimeType.startsWith('image/')) {
    return {
      icon: ImageIcon,
      bgColor: 'bg-purple-100',
      iconColor: 'text-purple-500'
    };
  }
  
  // PDF files
  if (mimeType === 'application/pdf') {
    return {
      icon: FileTextIcon,
      bgColor: 'bg-primary-100',
      iconColor: 'text-primary-500'
    };
  }
  
  // Spreadsheet files
  if (
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'text/csv'
  ) {
    return {
      icon: FileSpreadsheetIcon,
      bgColor: 'bg-green-100',
      iconColor: 'text-green-500'
    };
  }
  
  // Code files
  if (
    mimeType === 'text/html' ||
    mimeType === 'application/json' ||
    mimeType === 'text/javascript' ||
    mimeType === 'application/xml' ||
    mimeType === 'text/css'
  ) {
    return {
      icon: FileCodeIcon,
      bgColor: 'bg-blue-100',
      iconColor: 'text-blue-500'
    };
  }
  
  // Archive files
  if (
    mimeType === 'application/zip' ||
    mimeType === 'application/x-7z-compressed' ||
    mimeType === 'application/x-rar-compressed' ||
    mimeType === 'application/gzip'
  ) {
    return {
      icon: FileArchiveIcon,
      bgColor: 'bg-yellow-100',
      iconColor: 'text-yellow-600'
    };
  }
  
  // Audio files
  if (mimeType.startsWith('audio/')) {
    return {
      icon: FileAudioIcon,
      bgColor: 'bg-pink-100',
      iconColor: 'text-pink-500'
    };
  }
  
  // Video files
  if (mimeType.startsWith('video/')) {
    return {
      icon: FileVideoIcon,
      bgColor: 'bg-red-100',
      iconColor: 'text-red-500'
    };
  }
  
  // Default for all other types
  return {
    icon: FileIcon,
    bgColor: 'bg-gray-100',
    iconColor: 'text-gray-500'
  };
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const formatUploadDate = (date: string | Date): string => {
  const uploadDate = new Date(date);
  
  // Format date in IST (UTC+5:30)
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata'
  };
  
  return new Intl.DateTimeFormat('en-IN', options).format(uploadDate);
};
