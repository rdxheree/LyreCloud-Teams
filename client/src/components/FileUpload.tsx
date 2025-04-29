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
    
    const file = acceptedFiles[0];
    
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "File too large",
        description: "Maximum file size is 1GB",
        variant: "destructive",
      });
      return;
    }
    
    // Handle the upload with progress tracking
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
      onSettled: () => {
        // Clear progress when upload is complete or fails
        setTimeout(() => {
          setCurrentProgress(null);
        }, 1000);
      }
    });
    
  }, [uploadFile, setCurrentProgress, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: isPending,
    maxFiles: 1,
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
