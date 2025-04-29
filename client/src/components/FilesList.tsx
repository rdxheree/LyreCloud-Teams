import { useState } from "react";
import { SlidersHorizontal, Filter, ArrowUpDown, Calendar, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { File } from "@shared/schema";
import FileItem from "@/components/FileItem";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
  
  return (
    <section className="w-full overflow-hidden">
      <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
        <h2 className="text-xl font-semibold text-neutral-700">Your Files</h2>
        
        <div className="flex space-x-2 flex-shrink-0">
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
