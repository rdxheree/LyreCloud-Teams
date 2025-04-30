import { useState } from "react";
import { Copy, Download, Trash2, Expand, Minimize, PenLine, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { File } from "@shared/schema";
import { useFileContext } from "@/contexts/FileContext";
import { getFileTypeInfo, formatFileSize, formatUploadDate } from "@/lib/fileTypes";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface FileItemProps {
  file: File;
}

export default function FileItem({ file }: FileItemProps) {
  const { toast } = useToast();
  const { 
    setSelectedFileId, 
    setIsDeleteModalOpen, 
    setIsRenameModalOpen, 
    setFileToRename,
    isMultiSelectMode,
    selectedFileIds,
    toggleFileSelection
  } = useFileContext();
  
  const fileTypeInfo = getFileTypeInfo(file.mimeType);
  const { icon: FileTypeIcon, bgColor, iconColor } = fileTypeInfo;
  const isPreviewable = file.mimeType.startsWith('image/') || file.mimeType.startsWith('video/') || file.mimeType.startsWith('audio/');
  const isSelected = selectedFileIds.includes(file.id);

  const handleCopyLink = () => {
    // Create the CDN link in the format: <current-domain>/cdn/<filename>
    // Dynamically use the current domain from the browser
    const currentDomain = window.location.origin;
    const fileLink = `${currentDomain}/cdn/${file.filename}`;
    
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
  
  const handleRename = () => {
    setFileToRename(file.id);
    setIsRenameModalOpen(true);
  };
  
  const handleToggleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFileSelection(file.id);
  };

  // File preview URL for direct linking to the file
  const previewUrl = `/api/files/${file.id}/download`;

  // Render the appropriate preview content based on file type
  const renderPreview = () => {
    if (file.mimeType.startsWith('image/')) {
      return (
        <div className="h-28 w-28 overflow-hidden rounded-lg mr-4 flex-shrink-0">
          <img 
            src={previewUrl} 
            alt={file.originalFilename} 
            className="h-full w-full object-cover" 
          />
        </div>
      );
    } else if (file.mimeType.startsWith('video/')) {
      return (
        <div className="h-28 w-28 overflow-hidden rounded-lg mr-4 flex-shrink-0 relative">
          <video 
            className="h-full w-full object-cover"
            preload="metadata"
          >
            <source src={`${previewUrl}#t=0.1`} type={file.mimeType} />
          </video>
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 rounded-lg">
            <FileTypeIcon className={`h-10 w-10 text-white`} />
          </div>
        </div>
      );
    } else if (file.mimeType.startsWith('audio/')) {
      return (
        <div className={`p-3 h-28 w-28 ${bgColor} rounded-lg mr-4 flex items-center justify-center flex-shrink-0`}>
          <FileTypeIcon className={`h-16 w-16 ${iconColor}`} />
        </div>
      );
    } else {
      return (
        <div className={`p-3 h-28 w-28 ${bgColor} rounded-lg mr-4 flex items-center justify-center flex-shrink-0`}>
          <FileTypeIcon className={`h-16 w-16 ${iconColor}`} />
        </div>
      );
    }
  };

  return (
    <div className={cn(
      "soft-element p-4 rounded-xl w-full overflow-hidden",
      isMultiSelectMode && isSelected && "border-2 border-primary bg-primary/5"
    )}>
      <div className="flex flex-col md:flex-row w-full">
        {/* Select checkbox for multi-select mode */}
        {isMultiSelectMode && (
          <div className="pr-3 pt-1">
            <button 
              type="button"
              onClick={handleToggleSelect}
              className="text-neutral-600 hover:text-primary focus:outline-none"
            >
              {isSelected ? (
                <CheckSquare className="h-6 w-6 text-primary" />
              ) : (
                <Square className="h-6 w-6" />
              )}
              <span className="sr-only">
                {isSelected ? "Deselect file" : "Select file"}
              </span>
            </button>
          </div>
        )}
      
        {/* File Preview */}
        {renderPreview()}
        
        <div className="flex flex-col md:flex-row flex-grow justify-between w-full">
          <div className="flex-grow mt-2 md:mt-0 overflow-hidden">
            <h3 className="font-medium text-neutral-800 mb-1 truncate pr-2">
              {file.originalFilename}
            </h3>
            
            <div className="flex flex-wrap text-sm text-neutral-500">
              <span className="mr-4">{formatFileSize(file.size)}</span>
              <span className="mr-4">Uploaded on {formatUploadDate(file.uploadedAt)}</span>
              {file.uploadedBy && <span>Uploaded by {file.uploadedBy}</span>}
            </div>
            
            {/* For audio files, show the inline player */}
            {file.mimeType.startsWith('audio/') && (
              <div className="mt-3 max-w-full md:max-w-md overflow-hidden">
                <audio controls className="w-full h-8 max-w-full">
                  <source src={previewUrl} type={file.mimeType} />
                  Your browser does not support the audio tag.
                </audio>
              </div>
            )}
          </div>
          
          {!isMultiSelectMode && (
            <div className="flex mt-4 md:mt-0 space-x-2 md:justify-end items-start">
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
                      onClick={handleRename}
                    >
                      <PenLine className="h-5 w-5" />
                      <span className="sr-only">Rename</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Rename</p>
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
          )}
        </div>
      </div>
    </div>
  );
}
