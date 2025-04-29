import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFileContext } from "@/contexts/FileContext";
import { useDeleteFile, useGetFiles } from "@/hooks/useFiles";

export default function DeleteConfirmationModal() {
  const { 
    selectedFileId, 
    setSelectedFileId, 
    isDeleteModalOpen, 
    setIsDeleteModalOpen 
  } = useFileContext();
  
  const { data: files } = useGetFiles();
  const { mutate: deleteFile, isPending } = useDeleteFile();
  const [fileName, setFileName] = useState<string>("this file");
  
  // Get the file name for the selected file
  useEffect(() => {
    if (selectedFileId && files) {
      const file = files.find(f => f.id === selectedFileId);
      if (file) {
        setFileName(file.originalFilename);
      }
    }
  }, [selectedFileId, files]);
  
  const handleCancel = () => {
    setIsDeleteModalOpen(false);
    // Slight delay to avoid flicker
    setTimeout(() => setSelectedFileId(null), 200);
  };
  
  const handleDelete = () => {
    if (selectedFileId) {
      deleteFile(selectedFileId, {
        onSuccess: () => {
          setIsDeleteModalOpen(false);
          setTimeout(() => setSelectedFileId(null), 200);
        }
      });
    }
  };
  
  // Close on ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };
    
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);
  
  // Close when clicking outside
  const handleClickOutside = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  };
  
  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-50 bg-black/30 backdrop-blur-sm"
      onClick={handleClickOutside}
    >
      <div className="soft-element bg-background p-6 rounded-xl max-w-md w-full mx-4 z-10">
        <div className="text-center mb-4">
          <div className="p-3 bg-red-100 rounded-full inline-block mb-4">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          
          <h3 className="text-xl font-semibold text-neutral-800 mb-2">
            Delete File?
          </h3>
          
          <p className="text-neutral-600">
            Are you sure you want to delete "{fileName}"? This action cannot be undone.
          </p>
        </div>
        
        <div className="flex space-x-3">
          <Button 
            variant="outline"
            className="soft-button flex-1 py-3 rounded-xl font-medium text-neutral-700"
            onClick={handleCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
          
          <Button 
            variant="destructive"
            className="soft-button flex-1 py-3 rounded-xl bg-red-500 text-white font-medium"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}
