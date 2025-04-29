import { useState } from "react";
import { Copy, Download, Trash2, Expand, Minimize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const fileTypeInfo = getFileTypeInfo(file.mimeType);
  const { icon: FileTypeIcon, bgColor, iconColor } = fileTypeInfo;
  const isPreviewable = file.mimeType.startsWith('image/') || file.mimeType.startsWith('video/') || file.mimeType.startsWith('audio/');

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

  // File preview URL for direct linking to the file
  const previewUrl = `/api/files/${file.id}/download`;

  // Render the appropriate preview content based on file type
  const renderPreviewContent = () => {
    if (file.mimeType.startsWith('image/')) {
      return (
        <div className="flex justify-center">
          <img 
            src={previewUrl} 
            alt={file.originalFilename} 
            className="max-w-full max-h-[70vh] object-contain rounded-lg" 
          />
        </div>
      );
    } else if (file.mimeType.startsWith('video/')) {
      return (
        <div className="flex justify-center">
          <video 
            controls 
            className="max-w-full max-h-[70vh] rounded-lg"
          >
            <source src={previewUrl} type={file.mimeType} />
            Your browser does not support the video tag.
          </video>
        </div>
      );
    } else if (file.mimeType.startsWith('audio/')) {
      return (
        <div className="flex justify-center p-4">
          <audio controls className="w-full">
            <source src={previewUrl} type={file.mimeType} />
            Your browser does not support the audio tag.
          </audio>
        </div>
      );
    } else {
      return (
        <div className="flex flex-col items-center justify-center p-6 text-center">
          <FileTypeIcon className="h-20 w-20 mb-4 text-gray-400" />
          <p className="text-lg font-medium">No preview available</p>
          <p className="text-sm text-gray-500 mt-2">Download the file to view its contents</p>
        </div>
      );
    }
  };

  return (
    <>
      <div className="soft-element p-4 rounded-xl flex flex-col md:flex-row md:items-center">
        <div className="flex items-center flex-grow">
          {isPreviewable ? (
            <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
              <DialogTrigger asChild>
                <div className={`p-3 ${bgColor} rounded-lg mr-4 cursor-pointer transition-transform hover:scale-105`}>
                  <FileTypeIcon className={`h-8 w-8 ${iconColor}`} />
                </div>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogTitle className="text-xl font-semibold mb-4 text-center">
                  {file.originalFilename}
                </DialogTitle>
                <div className="pt-6">
                  {renderPreviewContent()}
                  <div className="mt-4 flex justify-center space-x-4">
                    <Button onClick={handleDownload} className="soft-button">
                      <Download className="h-4 w-4 mr-2" /> Download
                    </Button>
                    <Button onClick={handleCopyLink} className="soft-button">
                      <Copy className="h-4 w-4 mr-2" /> Copy Link
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          ) : (
            <div className={`p-3 ${bgColor} rounded-lg mr-4`}>
              <FileTypeIcon className={`h-8 w-8 ${iconColor}`} />
            </div>
          )}
          
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
          {isPreviewable && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="soft-button p-2 rounded-lg text-neutral-600 hover:text-primary"
                    onClick={() => setIsPreviewOpen(true)}
                  >
                    <Expand className="h-5 w-5" />
                    <span className="sr-only">Preview</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Preview</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

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
    </>
  );
}
