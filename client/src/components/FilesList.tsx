import { useState } from "react";
import { SlidersHorizontal, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { File } from "@shared/schema";
import FileItem from "@/components/FileItem";
import { Skeleton } from "@/components/ui/skeleton";

interface FilesListProps {
  files: File[];
  isLoading: boolean;
  error: Error | null;
}

export default function FilesList({ files, isLoading, error }: FilesListProps) {
  return (
    <section>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-neutral-700">Your Files</h2>
        
        <div className="flex space-x-2">
          <Button 
            variant="outline" 
            className="soft-button bg-background px-4 py-2 rounded-full text-neutral-600 font-medium flex items-center"
          >
            <SlidersHorizontal className="h-5 w-5 mr-1" />
            Sort
          </Button>
          
          <Button 
            variant="outline" 
            className="soft-button bg-background px-4 py-2 rounded-full text-neutral-600 font-medium flex items-center"
          >
            <Filter className="h-5 w-5 mr-1" />
            Filter
          </Button>
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
      ) : (
        <div className="space-y-4">
          {files.map((file) => (
            <FileItem key={file.id} file={file} />
          ))}
        </div>
      )}
    </section>
  );
}

// Import for empty state
import { CloudUploadIcon } from "lucide-react";
