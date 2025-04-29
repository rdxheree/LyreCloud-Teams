import { useState } from "react";
import Layout from "@/components/Layout";
import FileUpload from "@/components/FileUpload";
import UploadProgress from "@/components/UploadProgress";
import FilesList from "@/components/FilesList";
import DeleteConfirmationModal from "@/components/DeleteConfirmationModal";
import { useFileContext } from "@/contexts/FileContext";
import { useGetFiles } from "@/hooks/useFiles";
import { File as SchemaFile } from "@shared/schema";

function HomeContent() {
  const { currentProgress, isDeleteModalOpen } = useFileContext();
  const { data: files, isLoading, error } = useGetFiles();
  
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
      
      <FilesList files={files || []} isLoading={isLoading} error={error} />
      
      {isDeleteModalOpen && <DeleteConfirmationModal />}
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
