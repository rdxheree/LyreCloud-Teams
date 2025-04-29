import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Sidebar from "@/components/Sidebar";
import { useAuth } from "@/hooks/use-auth";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();

  return (
    <div className="flex flex-col min-h-screen">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      
      <div className="flex flex-1 relative w-full overflow-hidden">
        {user && <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />}
        
        <main className="flex-grow w-full px-4 md:px-10 pb-10 overflow-hidden">
          <div className="w-full mx-auto max-w-5xl">
            {children}
          </div>
        </main>
      </div>
      
      <Footer />
    </div>
  );
}
