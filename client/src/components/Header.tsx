import { Menu, User, UserCog, LogOut, FileIcon, CloudIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { user, logoutMutation } = useAuth();
  const [location, navigate] = useLocation();
  const isMobile = useIsMobile();

  const handleLogout = () => {
    logoutMutation.mutate();
    navigate("/auth");
  };

  return (
    <header className="py-4 px-4 md:px-10 flex items-center justify-between soft-element mb-4 md:mb-8 overflow-hidden">
      <div className="flex items-center overflow-hidden max-w-[60%]">
        {user && isMobile && (
          <Button variant="ghost" size="icon" onClick={onMenuClick} className="mr-2 flex-shrink-0 p-1">
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <img src="/cdn/500-500-max.webp" alt="LyreCloud Logo" className="h-7 md:h-8 w-auto flex-shrink-0" />
        <h1 className="ml-2 md:ml-3 text-lg md:text-2xl font-semibold text-primary-600 truncate">LyreCloud Teams</h1>
      </div>

      {user && (
        <div className="flex items-center gap-2 md:gap-4">
          {/* Mobile Profile Menu */}
          {isMobile && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full ml-auto p-0">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-sm">
                      {user.username.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 mr-2">
                <DropdownMenuLabel>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {user.username}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-600">
                  <LogOut className="h-4 w-4 mr-2" />
                  Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          
          {/* Desktop Navigation */}
          {!isMobile && (
            <div className="flex items-center gap-4">
              <Link href="/">
                <button className={`flex items-center gap-1 px-3 py-2 rounded-md transition-colors ${location === '/' ? 'bg-gray-100 font-medium' : 'hover:bg-gray-100'}`}>
                  <FileIcon className="h-4 w-4" />
                  Files
                </button>
              </Link>
              
              {user.role === "admin" && (
                <Link href="/admin/user-management">
                  <button className={`flex items-center gap-1 px-3 py-2 rounded-md transition-colors ${location === '/admin/user-management' ? 'bg-gray-100 font-medium' : 'hover:bg-gray-100'}`}>
                    <UserCog className="h-4 w-4" />
                    User Management
                  </button>
                </Link>
              )}
            </div>
          )}
          
          {/* Profile Section - Desktop Only */}
          {!isMobile && (
            <span className="text-sm inline-block">
              Welcome, <span className="font-semibold">{user.username}</span>
            </span>
          )}

          {/* Profile Menu - Desktop Only */}
          {!isMobile && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {user.username.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {user.username}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-600">
                  <LogOut className="h-4 w-4 mr-2" />
                  Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </header>
  );
}
