import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { CloudUploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUploadFile } from "@/hooks/useFiles";
import { useFileContext } from "@/contexts/FileContext";
import { useToast } from "@/hooks/use-toast";

// 1GB in bytes
const MAX_FILE_SIZE = 1024 * 1024 * 1024;

export default function FileUpload() {
  const { toast } = useToast();
  const { setCurrentProgress } = useFileContext();
  const { mutate: uploadFile, isPending } = useUploadFile();
  
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    // Process multiple files sequentially
    const uploadFiles = async () => {
      for (let i = 0; i < acceptedFiles.length; i++) {
        const file = acceptedFiles[i];
        
        // Check file size
        if (file.size > MAX_FILE_SIZE) {
          toast({
            title: "File too large",
            description: `${file.name} is too large. Maximum file size is 1GB`,
            variant: "destructive",
          });
          continue; // Skip this file but process the rest
        }
        
        // Show which file is being uploaded out of the total
        toast({
          title: `Uploading file ${i + 1} of ${acceptedFiles.length}`,
          description: file.name,
        });
        
        try {
          // Handle the upload with progress tracking
          await new Promise<void>((resolve, reject) => {
            uploadFile({
              file, 
              onProgress: (progress, uploadedBytes) => {
                setCurrentProgress({
                  file: {
                    name: file.name,
                    size: file.size,
                  },
                  progress,
                  uploadedBytes,
                });
              }
            }, {
              onSuccess: () => resolve(),
              onError: (error) => reject(error),
              onSettled: () => {
                // Clear progress when upload is complete or fails
                setTimeout(() => {
                  setCurrentProgress(null);
                }, 1000);
              }
            });
          });
        } catch (error) {
          console.error(`Error uploading ${file.name}:`, error);
          // Continue with the next file even if one fails
        }
      }
      
      // Notify when all uploads are complete
      if (acceptedFiles.length > 1) {
        toast({
          title: "Bulk upload complete",
          description: `Successfully processed ${acceptedFiles.length} files`,
        });
      }
    };
    
    // Start the upload process
    uploadFiles();
    
  }, [uploadFile, setCurrentProgress, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: isPending,
    multiple: true, // Allow multiple files
  });

  return (
    <div 
      {...getRootProps()} 
      className={`soft-element-inner flex flex-col items-center justify-center p-10 border-2 border-dashed 
        border-primary-200 rounded-xl text-center cursor-pointer hover:file-hover transition-all
        ${isDragActive ? 'file-hover' : ''} ${isPending ? 'opacity-70 cursor-not-allowed' : ''}`}
    >
      <input {...getInputProps()} />
      
      <CloudUploadIcon className="h-16 w-16 text-primary-300 mb-4" />
      
      <h3 className="text-lg font-medium text-neutral-600 mb-2">
        {isDragActive ? "Drop file here" : "Drag files here or click to upload"}
      </h3>
      
      <p className="text-neutral-500 mb-4">Upload files up to 1GB</p>
      
      <Button 
        className="soft-button bg-primary text-white font-medium py-2 px-6 rounded-full"
        disabled={isPending}
      >
        {isPending ? "Uploading..." : "Select Files"}
      </Button>
    </div>
  );
}
