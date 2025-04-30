import { useState } from "react";
import Layout from "@/components/Layout";
import FileUpload from "@/components/FileUpload";
import UploadProgress from "@/components/UploadProgress";
import FilesList from "@/components/FilesList";
import DeleteConfirmationModal from "@/components/DeleteConfirmationModal";
import RenameFileModal from "@/components/RenameFileModal";
import MessageEmbed from "@/components/MessageEmbed";
import { useFileContext } from "@/contexts/FileContext";
import { useGetFiles } from "@/hooks/useFiles";
import { File as SchemaFile } from "@shared/schema";

function HomeContent() {
  const { currentProgress, isDeleteModalOpen, isRenameModalOpen } = useFileContext();
  const { data: files, isLoading, error } = useGetFiles();
  const [showEmbed, setShowEmbed] = useState(true);
  
  // Function to get a file name by ID
  const getFileName = (id: number) => {
    if (!files) return undefined;
    const file = files.find(f => f.id === id);
    return file?.originalFilename;
  };
  
  return (
    <>
      <section className="mb-10 w-full overflow-hidden">
        <h2 className="text-xl font-semibold mb-4 text-neutral-700">Upload Files</h2>
        <FileUpload />
        
        {currentProgress && (
          <UploadProgress
            fileName={currentProgress.file.name}
            fileSize={currentProgress.file.size}
            progress={currentProgress.progress}
            uploadedBytes={currentProgress.uploadedBytes}
          />
        )}
      </section>
      
      {showEmbed && (
        <section className="mb-10 w-full overflow-hidden">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-neutral-700">Featured Content</h2>
            <button 
              className="text-sm text-neutral-500 hover:text-neutral-700"
              onClick={() => setShowEmbed(false)}
            >
              Dismiss
            </button>
          </div>
          <MessageEmbed 
            imageUrl="https://teams.lyrecloud.com/cdn/Black_and_Blue_Modern_Training_and_Development_Presentation_960_x_540_px_1.png"
            title="LyreCloud Teams Training"
            description="Learn how to effectively use LyreCloud Teams for secure file management and team collaboration."
            linkUrl="https://teams.lyrecloud.com"
            linkText="View training materials"
          />
        </section>
      )}
      
      <FilesList files={files || []} isLoading={isLoading} error={error} />
      
      {isDeleteModalOpen && <DeleteConfirmationModal />}
      {isRenameModalOpen && <RenameFileModal getFileName={getFileName} />}
    </>
  );
}

export default function Home() {
  return (
    <Layout>
      <HomeContent />
    </Layout>
  );
}
