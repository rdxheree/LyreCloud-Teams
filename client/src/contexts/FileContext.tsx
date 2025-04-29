import { createContext, useContext, useState, ReactNode } from "react";
import { File } from "@shared/schema";

interface UploadProgressInfo {
  file: {
    name: string;
    size: number;
  };
  progress: number;
  uploadedBytes: number;
}

interface FileContextType {
  currentProgress: UploadProgressInfo | null;
  setCurrentProgress: (progress: UploadProgressInfo | null) => void;
  selectedFileId: number | null;
  setSelectedFileId: (id: number | null) => void;
  isDeleteModalOpen: boolean;
  setIsDeleteModalOpen: (isOpen: boolean) => void;
}

const FileContext = createContext<FileContextType | undefined>(undefined);

export const useFileContext = () => {
  const context = useContext(FileContext);
  if (!context) {
    throw new Error("useFileContext must be used within a FileProvider");
  }
  return context;
};

export const FileProvider = ({ children }: { children: ReactNode }) => {
  const [currentProgress, setCurrentProgress] = useState<UploadProgressInfo | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  return (
    <FileContext.Provider
      value={{
        currentProgress,
        setCurrentProgress,
        selectedFileId,
        setSelectedFileId,
        isDeleteModalOpen,
        setIsDeleteModalOpen
      }}
    >
      {children}
    </FileContext.Provider>
  );
};
