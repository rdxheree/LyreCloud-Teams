import { CloudIcon, Menu, User, UserCog, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Header() {
  const { user, logoutMutation } = useAuth();
  const [_, navigate] = useLocation();

  const handleLogout = () => {
    logoutMutation.mutate();
    navigate("/auth");
  };

  return (
    <header className="py-4 px-6 md:px-10 flex items-center justify-between soft-element mb-8">
      <div className="flex items-center">
        <CloudIcon className="h-8 w-8 text-primary" />
        <h1 className="ml-3 text-2xl font-semibold text-primary-600">LyreCloud Teams</h1>
      </div>

      {user && (
        <div className="flex items-center gap-4">
          <span className="text-sm hidden md:inline-block">
            Welcome, <span className="font-semibold">{user.username}</span>
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
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

              {user.role === "admin" && (
                <>
                  <DropdownMenuItem asChild>
                    <Link href="/admin/user-management" className="cursor-pointer flex items-center gap-2">
                      <UserCog className="h-4 w-4" />
                      User Management
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}

              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-600">
                <LogOut className="h-4 w-4 mr-2" />
                Log Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </header>
  );
}
