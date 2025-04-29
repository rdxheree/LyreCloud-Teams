import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FileUpload from "@/components/FileUpload";
import UploadProgress from "@/components/UploadProgress";
import FilesList from "@/components/FilesList";
import DeleteConfirmationModal from "@/components/DeleteConfirmationModal";
import { useFileContext } from "@/contexts/FileContext";
import { useGetFiles } from "@/hooks/useFiles";

function HomeContent() {
  const { currentProgress, isDeleteModalOpen } = useFileContext();
  const { data: files, isLoading, error } = useGetFiles();
  
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      
      <main className="flex-grow px-6 md:px-10 pb-10">
        <div className="max-w-5xl mx-auto">
          <section className="mb-10">
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
        </div>
      </main>
      
      <Footer />
      
      {isDeleteModalOpen && <DeleteConfirmationModal />}
    </div>
  );
}

export default function Home() {
  return <HomeContent />;
}
