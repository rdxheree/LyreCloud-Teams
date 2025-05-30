import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { File as SchemaFile } from "@shared/schema";

export function useGetFiles() {
  return useQuery<SchemaFile[]>({
    queryKey: ["/api/files"],
  });
}

export function useUploadFile() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      file,
      onProgress,
    }: {
      file: globalThis.File; // Browser's File API
      onProgress?: (progress: number, uploadedBytes: number) => void;
    }) => {
      const formData = new FormData();
      formData.append("file", file);

      const xhr = new XMLHttpRequest();
      
      // Setup upload progress tracking
      if (onProgress) {
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            onProgress(percentComplete, event.loaded);
          }
        });
      }

      // Return a promise that resolves/rejects based on the XHR request
      return new Promise<SchemaFile>((resolve, reject) => {
        xhr.open("POST", "/api/files/upload");
        
        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            const uploadedFile = JSON.parse(xhr.responseText);
            resolve(uploadedFile);
          } else {
            let errorMessage;
            try {
              const response = JSON.parse(xhr.responseText);
              errorMessage = response.message || 'Upload failed';
            } catch (e) {
              errorMessage = 'Upload failed';
            }
            reject(new Error(errorMessage));
          }
        };
        
        xhr.onerror = function() {
          reject(new Error('Network error during upload'));
        };
        
        xhr.send(formData);
      });
    },
    onSuccess: (uploadedFile) => {
      // Immediately update the cache with the new file
      const currentFiles = queryClient.getQueryData<SchemaFile[]>(['/api/files']) || [];
      queryClient.setQueryData(['/api/files'], [...currentFiles, uploadedFile]);
      
      // Also do a background refresh to ensure everything is synchronized
      queryClient.invalidateQueries({ queryKey: ['/api/files'] });
      
      toast({
        title: "File uploaded successfully",
        description: "Your file has been uploaded and is ready to share.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message || "There was an error uploading your file.",
        variant: "destructive",
      });
    },
  });
}

export function useDeleteFile() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest<{ message: string }>({
        method: 'DELETE',
        url: `/api/files/${id}`
      });
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['/api/files'] });
      toast({
        title: "File deleted",
        description: "The file has been successfully deleted.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Deletion failed",
        description: error.message || "There was an error deleting the file.",
        variant: "destructive",
      });
    },
  });
}
