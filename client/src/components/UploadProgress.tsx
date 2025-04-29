import { formatFileSize } from "@/lib/fileTypes";

interface UploadProgressProps {
  fileName: string;
  fileSize: number;
  progress: number;
  uploadedBytes: number;
}

export default function UploadProgress({ 
  fileName, 
  fileSize, 
  progress, 
  uploadedBytes 
}: UploadProgressProps) {
  return (
    <div className="mt-6 soft-element p-6 rounded-xl">
      <div className="flex justify-between mb-2">
        <span className="font-medium text-neutral-700">
          Uploading file...
        </span>
        <span className="text-primary font-medium">{progress}%</span>
      </div>
      
      <div className="soft-element-inner h-4 rounded-full w-full">
        <div 
          className="bg-primary h-full rounded-full upload-progress" 
          style={{ width: `${progress}%` }}
        ></div>
      </div>
      
      <div className="flex justify-between mt-2 text-sm text-neutral-500">
        <span>{fileName}</span>
        <span>
          {formatFileSize(uploadedBytes)} / {formatFileSize(fileSize)}
        </span>
      </div>
    </div>
  );
}
