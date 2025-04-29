import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, ShieldAlert, User, UserCog, UserMinus, UserPlus } from "lucide-react";

type User = {
  id: number;
  username: string;
  role: string;
  status: string;
  isApproved: boolean;
};

export default function UserManagementPage() {
  const { user } = useAuth();
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("users");

  // Redirect non-admin users
  useEffect(() => {
    if (user && user.role !== "admin") {
      navigate("/");
      toast({
        title: "Access Denied",
        description: "You do not have admin privileges",
        variant: "destructive",
      });
    }
  }, [user, navigate, toast]);

  // Fetch all users
  const { data: users = [], isLoading: isLoadingUsers } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user && user.role === "admin",
  });

  // Fetch pending users
  const { data: pendingUsers = [], isLoading: isLoadingPendingUsers } = useQuery<User[]>({
    queryKey: ["/api/admin/pending-users"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user && user.role === "admin",
  });

  // Approve user mutation
  const approveUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/admin/approve-user/${userId}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-users"] });
      toast({
        title: "User Approved",
        description: "User has been approved successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Reject user mutation
  const rejectUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/admin/reject-user/${userId}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-users"] });
      toast({
        title: "User Rejected",
        description: "User has been rejected",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Make admin mutation
  const makeAdminMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/admin/make-admin/${userId}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Admin Role Granted",
        description: "User has been granted admin privileges",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Remove admin mutation
  const removeAdminMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/admin/remove-admin/${userId}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Admin Role Removed",
        description: "User's admin privileges have been removed",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("DELETE", `/api/admin/delete-user/${userId}`);
      return await res.json();
    },
    onSuccess: () => {
      setDeleteUserId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-users"] });
      toast({
        title: "User Deleted",
        description: "User has been deleted successfully",
      });
    },
    onError: (error: Error) => {
      setDeleteUserId(null);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handler functions
  const handleApproveUser = (userId: number) => approveUserMutation.mutate(userId);
  const handleRejectUser = (userId: number) => rejectUserMutation.mutate(userId);
  const handleMakeAdmin = (userId: number) => makeAdminMutation.mutate(userId);
  const handleRemoveAdmin = (userId: number) => removeAdminMutation.mutate(userId);
  const handleDeleteUser = (userId: number) => setDeleteUserId(userId);
  const confirmDeleteUser = () => {
    if (deleteUserId) deleteUserMutation.mutate(deleteUserId);
  };

  if (!user || user.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ShieldAlert className="h-8 w-8 text-red-500 mr-2" />
        <h1 className="text-xl font-bold">Access Denied</h1>
      </div>
    );
  }

  const renderUserStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline">Pending</Badge>;
      case "approved":
        return <Badge className="bg-green-500 hover:bg-green-600">Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const renderRoleBadge = (role: string) => {
    return role === "admin" ? (
      <Badge className="bg-blue-500 hover:bg-blue-600">Admin</Badge>
    ) : (
      <Badge variant="outline">User</Badge>
    );
  };

  return (
    <div className="container mx-auto py-10">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <UserCog className="mr-2 h-6 w-6" />
            User Management
          </CardTitle>
          <CardDescription>
            Manage user accounts and registration requests
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="users">
                <User className="mr-2 h-4 w-4" />
                Users
              </TabsTrigger>
              <TabsTrigger value="requests">
                <UserPlus className="mr-2 h-4 w-4" />
                Registration Requests
              </TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="mt-6">
              <div className="flex justify-end mb-4">
                <Button 
                  onClick={() => {
                    queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
                    toast({
                      title: "Refreshed",
                      description: "User list refreshed",
                    });
                  }}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                    <path d="M21 3v5h-5"/>
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                    <path d="M3 21v-5h5"/>
                  </svg>
                  Refresh Users
                </Button>
              </div>
              <Table>
                <TableCaption>List of all users in the system</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingUsers ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        <div className="flex justify-center">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    // Only show approved users in the Users list
                    users
                      .filter(user => user.isApproved)
                      .map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>{user.id}</TableCell>
                        <TableCell className="font-medium">
                          {user.username}
                        </TableCell>
                        <TableCell>{renderRoleBadge(user.role)}</TableCell>
                        <TableCell>{renderUserStatusBadge(user.status)}</TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            {/* Don't show Remove Admin button for rdxhere.exe */}
                            {user.role === "admin" && user.username !== "rdxhere.exe" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRemoveAdmin(user.id)}
                                disabled={removeAdminMutation.isPending}
                              >
                                Remove Admin
                              </Button>
                            ) : user.role !== "admin" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleMakeAdmin(user.id)}
                                disabled={makeAdminMutation.isPending}
                              >
                                Make Admin
                              </Button>
                            ) : null}
                            
                            {/* Don't show Delete button for rdxhere.exe */}
                            {user.username !== "rdxhere.exe" && (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDeleteUser(user.id)}
                                disabled={deleteUserMutation.isPending}
                              >
                                <UserMinus className="h-4 w-4 mr-1" />
                                Delete
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="requests" className="mt-6">
              <div className="flex justify-end mb-4">
                <Button 
                  onClick={() => {
                    queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-users"] });
                    toast({
                      title: "Refreshed",
                      description: "Registration requests refreshed",
                    });
                  }}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                    <path d="M21 3v5h-5"/>
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                    <path d="M3 21v-5h5"/>
                  </svg>
                  Refresh Requests
                </Button>
              </div>
              <Table>
                <TableCaption>Pending registration requests</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingPendingUsers ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        <div className="flex justify-center">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : pendingUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        No pending registration requests
                      </TableCell>
                    </TableRow>
                  ) : (
                    pendingUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>{user.id}</TableCell>
                        <TableCell className="font-medium">
                          {user.username}
                        </TableCell>
                        <TableCell>{renderUserStatusBadge(user.status)}</TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleApproveUser(user.id)}
                              disabled={approveUserMutation.isPending}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleRejectUser(user.id)}
                              disabled={rejectUserMutation.isPending}
                            >
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Delete User Confirmation Dialog */}
      <AlertDialog open={deleteUserId !== null} onOpenChange={() => setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the user
              account and remove their data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteUser}>
              {deleteUserMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
