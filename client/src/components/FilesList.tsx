import { useState, useCallback, useEffect } from "react";
import { 
  SlidersHorizontal, 
  Filter, 
  ArrowUpDown, 
  Calendar, 
  FileText, 
  Download, 
  Trash2, 
  CheckSquare,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { File } from "@shared/schema";
import FileItem from "@/components/FileItem";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useFileContext } from "@/contexts/FileContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import RenameFileModal from "./RenameFileModal";

interface FilesListProps {
  files: File[];
  isLoading: boolean;
  error: Error | null;
}

type SortBy = "name" | "date" | "size";
type SortOrder = "asc" | "desc";
type FileType = "all" | "image" | "document" | "audio" | "video" | "other";

export default function FilesList({ files, isLoading, error }: FilesListProps) {
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [fileType, setFileType] = useState<FileType>("all");
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  const [isDownloadLoading, setIsDownloadLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const { 
    selectedFileIds, 
    isMultiSelectMode, 
    setMultiSelectMode, 
    clearSelectedFiles, 
    setIsRenameModalOpen,
    setFileToRename
  } = useFileContext();
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Refresh files function
  const refreshFiles = useCallback(async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['/api/files'] });
      // Wait for at least 500ms to show the animation
      await new Promise(resolve => setTimeout(resolve, 500));
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient, isRefreshing]);
  
  // Refresh files only when component mounts
  useEffect(() => {
    // Only refresh once on initial page load, no recurring updates
    refreshFiles();
    
    // No intervals - prevent infinite refreshes
  }, []);
  
  // Sort files based on current sort criteria
  const sortedFiles = [...files].sort((a, b) => {
    if (sortBy === "name") {
      return sortOrder === "asc" 
        ? a.originalFilename.localeCompare(b.originalFilename)
        : b.originalFilename.localeCompare(a.originalFilename);
    } else if (sortBy === "date") {
      return sortOrder === "asc"
        ? new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime()
        : new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
    } else { // size
      return sortOrder === "asc" ? a.size - b.size : b.size - a.size;
    }
  });
  
  // Filter files based on file type
  const filteredFiles = sortedFiles.filter(file => {
    if (fileType === "all") return true;
    
    if (fileType === "image") {
      return file.mimeType.startsWith("image/");
    } else if (fileType === "document") {
      return [
        "application/pdf", 
        "application/msword", 
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ].includes(file.mimeType);
    } else if (fileType === "audio") {
      return file.mimeType.startsWith("audio/");
    } else if (fileType === "video") {
      return file.mimeType.startsWith("video/");
    } else {
      return !file.mimeType.startsWith("image/") && 
             !file.mimeType.startsWith("audio/") && 
             !file.mimeType.startsWith("video/") && 
             ![
               "application/pdf", 
               "application/msword", 
               "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
               "text/plain",
               "application/vnd.ms-excel",
               "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
             ].includes(file.mimeType);
    }
  });
  
  // Get file name for a given ID
  const getFileName = useCallback((id: number) => {
    const file = files.find(file => file.id === id);
    return file?.originalFilename;
  }, [files]);

  // Toggle sort order and potentially change sort by
  const handleSort = (by: SortBy) => {
    if (sortBy === by) {
      // Toggle order if clicking the same sort option
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      // Set new sort by and default to descending
      setSortBy(by);
      setSortOrder("desc");
    }
  };
  
  // Delete multiple files
  const handleBatchDelete = async () => {
    if (selectedFileIds.length === 0) return;
    
    setIsDeleteLoading(true);
    try {
      const response = await apiRequest<{
        message: string;
        results: Array<{ id: number; success: boolean; message?: string }>;
      }>({
        url: '/api/files/delete-multiple',
        method: 'POST',
        data: {
          ids: selectedFileIds
        }
      });
      
      // Check results
      const { results } = response;
      const successCount = results ? results.filter((r) => r.success).length : 0;
      
      // Update the files list
      queryClient.invalidateQueries({ queryKey: ['/api/files'] });
      
      // Show success message
      toast({
        title: `${successCount} ${successCount === 1 ? 'file' : 'files'} deleted`,
        description: successCount < selectedFileIds.length 
          ? `${selectedFileIds.length - successCount} files could not be deleted.`
          : "Files were successfully deleted.",
      });
      
      // Exit multi-select mode
      setMultiSelectMode(false);
      clearSelectedFiles();
    } catch (error) {
      console.error('Error deleting files:', error);
      toast({
        title: "Error deleting files",
        description: "There was a problem deleting the selected files.",
        variant: "destructive",
      });
    } finally {
      setIsDeleteLoading(false);
    }
  };
  
  // Download multiple files
  const handleBatchDownload = () => {
    if (selectedFileIds.length === 0) return;
    
    setIsDownloadLoading(true);
    
    // Create a download link for each file and click it
    try {
      let successCount = 0;
      
      selectedFileIds.forEach(id => {
        const file = files.find(f => f.id === id);
        if (!file) return;
        
        // Use CDN endpoint instead of download endpoint for reliability
        const downloadUrl = `/cdn/${file.filename}`;
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = file.originalFilename;
        a.setAttribute('target', '_blank');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        successCount++;
      });
      
      toast({
        title: "Downloads started",
        description: `Downloading ${successCount} ${successCount === 1 ? 'file' : 'files'}`,
      });
      
      // Exit multi-select mode after a delay
      setTimeout(() => {
        setMultiSelectMode(false);
        clearSelectedFiles();
        setIsDownloadLoading(false);
      }, 1000);
    } catch (error) {
      console.error('Error downloading files:', error);
      toast({
        title: "Error downloading files",
        description: "There was a problem downloading the selected files.",
        variant: "destructive",
      });
      setIsDownloadLoading(false);
    }
  };
  
  return (
    <section className="w-full overflow-hidden">
      <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
        {isMultiSelectMode ? (
          <>
            <div className="flex items-center">
              <h2 className="text-xl font-semibold text-neutral-700 mr-2">
                {selectedFileIds.length} {selectedFileIds.length === 1 ? 'file' : 'files'} selected
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMultiSelectMode(false);
                  clearSelectedFiles();
                }}
                className="text-neutral-500 hover:text-neutral-700"
              >
                Cancel
              </Button>
            </div>
            
            <div className="flex space-x-2">
              <Button
                variant="outline"
                className="soft-button bg-primary px-4 py-2 rounded-full text-white font-medium flex items-center"
                onClick={handleBatchDownload}
                disabled={selectedFileIds.length === 0 || isDownloadLoading}
              >
                <Download className="h-5 w-5 mr-1" />
                {isDownloadLoading ? 'Downloading...' : 'Download'}
              </Button>
              
              <Button
                variant="outline"
                className="soft-button bg-red-500 px-4 py-2 rounded-full text-white font-medium flex items-center"
                onClick={handleBatchDelete}
                disabled={selectedFileIds.length === 0 || isDeleteLoading}
              >
                <Trash2 className="h-5 w-5 mr-1" />
                {isDeleteLoading ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-neutral-700">Your Files</h2>
            
            <div className="flex space-x-2 flex-shrink-0">
              <Button
                variant="outline"
                className="soft-button bg-background px-4 py-2 rounded-full text-neutral-600 font-medium flex items-center"
                onClick={refreshFiles}
                title="Refresh file list"
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-5 w-5 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </Button>
              
              <Button
                variant="outline"
                className="soft-button bg-background px-4 py-2 rounded-full text-neutral-600 font-medium flex items-center"
                onClick={() => setMultiSelectMode(true)}
              >
                <CheckSquare className="h-5 w-5 mr-1" />
                Select
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="soft-button bg-background px-4 py-2 rounded-full text-neutral-600 font-medium flex items-center"
                  >
                    <SlidersHorizontal className="h-5 w-5 mr-1" />
                    Sort
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="soft-element-inner">
                  <DropdownMenuItem onClick={() => handleSort("name")} className="cursor-pointer">
                    <FileText className="h-4 w-4 mr-2" />
                    Name {sortBy === "name" && <ArrowUpDown className="h-4 w-4 ml-1" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSort("date")} className="cursor-pointer">
                    <Calendar className="h-4 w-4 mr-2" />
                    Date {sortBy === "date" && <ArrowUpDown className="h-4 w-4 ml-1" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSort("size")} className="cursor-pointer">
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    Size {sortBy === "size" && <ArrowUpDown className="h-4 w-4 ml-1" />}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="soft-button bg-background px-4 py-2 rounded-full text-neutral-600 font-medium flex items-center"
                  >
                    <Filter className="h-5 w-5 mr-1" />
                    Filter
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="soft-element-inner">
                  <DropdownMenuItem onClick={() => setFileType("all")} className="cursor-pointer">
                    All Files {fileType === "all" && "✓"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFileType("image")} className="cursor-pointer">
                    Images {fileType === "image" && "✓"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFileType("document")} className="cursor-pointer">
                    Documents {fileType === "document" && "✓"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFileType("video")} className="cursor-pointer">
                    Videos {fileType === "video" && "✓"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFileType("audio")} className="cursor-pointer">
                    Audio {fileType === "audio" && "✓"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFileType("other")} className="cursor-pointer">
                    Other {fileType === "other" && "✓"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}
      </div>
      
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="soft-element p-4 rounded-xl">
              <div className="flex items-center">
                <Skeleton className="h-14 w-14 rounded-lg mr-4" />
                <div className="flex-grow">
                  <Skeleton className="h-5 w-48 mb-2" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <div className="flex space-x-2">
                  <Skeleton className="h-9 w-9 rounded-lg" />
                  <Skeleton className="h-9 w-9 rounded-lg" />
                  <Skeleton className="h-9 w-9 rounded-lg" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="soft-element p-6 rounded-xl text-center">
          <p className="text-red-500">Error loading files: {error.message}</p>
          <Button 
            onClick={() => window.location.reload()} 
            className="mt-4 soft-button"
          >
            Retry
          </Button>
        </div>
      ) : files.length === 0 ? (
        <div className="soft-element p-10 rounded-xl text-center">
          <div className="p-4 rounded-full bg-neutral-100 inline-block mb-4">
            <CloudUploadIcon className="h-16 w-16 text-neutral-300" />
          </div>
          <h3 className="text-lg font-medium text-neutral-600 mb-2">No files uploaded yet</h3>
          <p className="text-neutral-500 mb-4">Upload your first file using the upload section above</p>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="soft-element p-6 rounded-xl text-center">
          <div className="p-3 rounded-full bg-neutral-100 inline-block mb-3">
            <Filter className="h-10 w-10 text-neutral-300" />
          </div>
          <h3 className="text-lg font-medium text-neutral-600 mb-2">No matching files</h3>
          <p className="text-neutral-500 mb-4">Try changing your filter criteria</p>
          <Button 
            variant="outline" 
            className="soft-button" 
            onClick={() => setFileType("all")}
          >
            Show All Files
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredFiles.map((file) => (
            <FileItem key={file.id} file={file} />
          ))}
        </div>
      )}
    </section>
  );
}

// Import for empty state
import { CloudUploadIcon } from "lucide-react";
