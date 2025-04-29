import { CloudIcon, FileIcon, UserCog, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logoutMutation } = useAuth();
  const [location, navigate] = useLocation();
  const isMobile = useIsMobile();

  const handleLogout = () => {
    logoutMutation.mutate();
    navigate("/auth");
    onClose();
  };

  if (!isOpen && isMobile) return null;

  const linkClass = "flex items-center gap-2 py-3 px-4 w-full text-left hover:bg-gray-100 transition-colors";
  const activeLinkClass = linkClass + " bg-gray-100 font-medium";

  return (
    <div className="fixed inset-0 z-50 lg:static lg:z-auto">
      {/* Overlay for mobile */}
      {isMobile && (
        <div 
          className="absolute inset-0 bg-black/50" 
          onClick={onClose}
        />
      )}
      
      <aside 
        className={`fixed top-0 bottom-0 left-0 w-64 bg-white shadow-lg flex flex-col transition-transform lg:static lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-4 border-b flex items-center gap-3">
          <CloudIcon className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold text-primary-600">LyreCloud</h1>
        </div>
        
        <nav className="flex-1 py-4">
          <ul>
            <li>
              <Link href="/">
                <a 
                  className={location === "/" ? activeLinkClass : linkClass}
                  onClick={isMobile ? onClose : undefined}
                >
                  <FileIcon className="h-5 w-5" />
                  Files
                </a>
              </Link>
            </li>
            
            {user && user.role === "admin" && (
              <li>
                <Link href="/admin/user-management">
                  <a 
                    className={location === "/admin/user-management" ? activeLinkClass : linkClass}
                    onClick={isMobile ? onClose : undefined}
                  >
                    <UserCog className="h-5 w-5" />
                    User Management
                  </a>
                </Link>
              </li>
            )}
          </ul>
        </nav>
        
        {user && (
          <div className="mt-auto p-4 border-t">
            <div className="mb-4 text-sm">
              Logged in as: <span className="font-medium">{user.username}</span>
            </div>
            <Button 
              variant="destructive" 
              className="w-full justify-start" 
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Log Out
            </Button>
          </div>
        )}
      </aside>
    </div>
  );
}
