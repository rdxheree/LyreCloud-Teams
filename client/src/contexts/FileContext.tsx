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
  selectedFileIds: number[];
  setSelectedFileIds: (ids: number[]) => void;
  toggleFileSelection: (id: number) => void;
  clearSelectedFiles: () => void;
  isMultiSelectMode: boolean;
  setMultiSelectMode: (isActive: boolean) => void;
  isDeleteModalOpen: boolean;
  setIsDeleteModalOpen: (isOpen: boolean) => void;
  isRenameModalOpen: boolean;
  setIsRenameModalOpen: (isOpen: boolean) => void;
  fileToRename: number | null;
  setFileToRename: (id: number | null) => void;
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
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [fileToRename, setFileToRename] = useState<number | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<number[]>([]);
  const [isMultiSelectMode, setMultiSelectMode] = useState(false);

  const toggleFileSelection = (id: number) => {
    if (selectedFileIds.includes(id)) {
      // Remove from selection
      setSelectedFileIds(selectedFileIds.filter(fileId => fileId !== id));
    } else {
      // Add to selection
      setSelectedFileIds([...selectedFileIds, id]);
    }
  };

  const clearSelectedFiles = () => {
    setSelectedFileIds([]);
  };

  return (
    <FileContext.Provider
      value={{
        currentProgress,
        setCurrentProgress,
        selectedFileId,
        setSelectedFileId,
        selectedFileIds,
        setSelectedFileIds,
        toggleFileSelection,
        clearSelectedFiles,
        isMultiSelectMode,
        setMultiSelectMode,
        isDeleteModalOpen,
        setIsDeleteModalOpen,
        isRenameModalOpen,
        setIsRenameModalOpen,
        fileToRename,
        setFileToRename
      }}
    >
      {children}
    </FileContext.Provider>
  );
};
