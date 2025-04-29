import { useState } from "react";
import { Copy, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { File } from "@shared/schema";
import { useFileContext } from "@/contexts/FileContext";
import { getFileTypeInfo, formatFileSize, formatUploadDate } from "@/lib/fileTypes";
import { useToast } from "@/hooks/use-toast";

interface FileItemProps {
  file: File;
}

export default function FileItem({ file }: FileItemProps) {
  const { toast } = useToast();
  const { setSelectedFileId, setIsDeleteModalOpen } = useFileContext();
  const { icon: FileTypeIcon, bgColor, iconColor } = getFileTypeInfo(file.mimeType);

  const handleCopyLink = () => {
    // Get the current domain
    const domain = window.location.origin;
    const fileLink = `${domain}/api/files/${file.id}/download`;
    
    navigator.clipboard.writeText(fileLink)
      .then(() => {
        toast({
          title: "Link copied to clipboard",
          description: "You can now share it with others",
        });
      })
      .catch(() => {
        toast({
          title: "Failed to copy link",
          description: "Please try again",
          variant: "destructive",
        });
      });
  };

  const handleDownload = () => {
    // Create a download link and click it
    const downloadUrl = `/api/files/${file.id}/download`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = file.originalFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    toast({
      title: "Download started",
      description: `Downloading ${file.originalFilename}`,
    });
  };

  const handleDelete = () => {
    setSelectedFileId(file.id);
    setIsDeleteModalOpen(true);
  };

  return (
    <div className="soft-element p-4 rounded-xl flex flex-col md:flex-row md:items-center">
      <div className="flex items-center flex-grow">
        <div className={`p-3 ${bgColor} rounded-lg mr-4`}>
          <FileTypeIcon className={`h-8 w-8 ${iconColor}`} />
        </div>
        
        <div className="flex-grow">
          <h3 className="font-medium text-neutral-800 mb-1">
            {file.originalFilename}
          </h3>
          
          <div className="flex text-sm text-neutral-500">
            <span className="mr-4">{formatFileSize(file.size)}</span>
            <span>Uploaded {formatUploadDate(file.uploadedAt)}</span>
          </div>
        </div>
      </div>
      
      <div className="flex mt-4 md:mt-0 space-x-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="icon" 
                className="soft-button p-2 rounded-lg text-neutral-600 hover:text-primary"
                onClick={handleCopyLink}
              >
                <Copy className="h-5 w-5" />
                <span className="sr-only">Copy Link</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Copy Link</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="icon" 
                className="soft-button p-2 rounded-lg text-neutral-600 hover:text-primary"
                onClick={handleDownload}
              >
                <Download className="h-5 w-5" />
                <span className="sr-only">Download</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Download</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="icon" 
                className="soft-button p-2 rounded-lg text-neutral-600 hover:text-red-500"
                onClick={handleDelete}
              >
                <Trash2 className="h-5 w-5" />
                <span className="sr-only">Delete</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Delete</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
