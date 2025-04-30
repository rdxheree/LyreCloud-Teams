import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
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
import { 
  Loader2, 
  ShieldAlert, 
  User, 
  UserCog, 
  UserMinus, 
  UserPlus, 
  RefreshCw,
  ActivitySquare,
  Search,
  Filter
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Log type enum
enum LogType {
  USER_REGISTER = 'USER_REGISTER',
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  USER_DELETE = 'USER_DELETE',
  USER_ADMIN = 'USER_ADMIN',
  USER_ADMIN_REMOVE = 'USER_ADMIN_REMOVE',
  USER_APPROVE = 'USER_APPROVE',
  USER_REJECT = 'USER_REJECT',
  
  FILE_UPLOAD = 'FILE_UPLOAD',
  FILE_DELETE = 'FILE_DELETE',
  FILE_RENAME = 'FILE_RENAME',
  FILE_DOWNLOAD = 'FILE_DOWNLOAD',
  
  SYSTEM = 'SYSTEM',
}

type User = {
  id: number;
  username: string;
  role: string;
  status: string;
  isApproved: boolean;
};

type LogEntry = {
  id: string;
  type: string;
  timestamp: string;
  message: string;
  username: string;
  details?: Record<string, any>;
};

function AdminPage() {
  return (
    <Layout>
      <AdminContent />
    </Layout>
  );
}

function AdminContent() {
  const { user } = useAuth();
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("users");
  const [logType, setLogType] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLogsRefreshing, setIsLogsRefreshing] = useState(false);

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
    queryKey: ["/api/users"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user && user.role === "admin",
  });

  // Fetch pending users
  const { data: pendingUsers = [], isLoading: isLoadingPendingUsers } = useQuery<User[]>({
    queryKey: ["/api/users/pending"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user && user.role === "admin",
  });

  // Fetch logs
  const { data: logsResponse, isLoading: isLoadingLogs } = useQuery({
    queryKey: ["/api/logs", logType],
    queryFn: async ({ queryKey }) => {
      const [endpoint, filterType] = queryKey;
      const url = filterType ? `${endpoint as string}?type=${filterType as string}` : endpoint as string;
      return await apiRequest({ method: "GET", url });
    },
    enabled: !!user && user.role === "admin" && activeTab === "logs",
  });
  
  // Extract logs array from response
  const logs: LogEntry[] = logsResponse?.logs || [];

  // Approve user mutation
  const approveUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      return await apiRequest<{ message: string }>({
        method: "POST", 
        url: `/api/users/approve/${userId}`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/pending"] });
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
      return await apiRequest<{ message: string }>({
        method: "POST", 
        url: `/api/users/reject/${userId}`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/pending"] });
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
      return await apiRequest<{ message: string }>({
        method: "POST", 
        url: `/api/users/make-admin/${userId}`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
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
      return await apiRequest<{ message: string }>({
        method: "POST", 
        url: `/api/users/remove-admin/${userId}`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
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
      return await apiRequest<{ message: string }>({
        method: "DELETE", 
        url: `/api/users/${userId}`
      });
    },
    onSuccess: () => {
      setDeleteUserId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/pending"] });
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

  const refreshLogs = () => {
    setIsLogsRefreshing(true);
    queryClient.invalidateQueries({ queryKey: ["/api/logs"] })
      .then(() => {
        toast({
          title: "Logs Refreshed",
          description: "The logs list has been refreshed",
        });
      })
      .finally(() => {
        setIsLogsRefreshing(false);
      });
  };

  const getLogTypeDisplay = (type: string) => {
    switch (type) {
      case "USER_REGISTER": return "User Registration";
      case "USER_LOGIN": return "User Login";
      case "USER_LOGOUT": return "User Logout";
      case "USER_DELETE": return "User Deletion";
      case "USER_ADMIN": return "Admin Grant";
      case "USER_ADMIN_REMOVE": return "Admin Revoke";
      case "USER_APPROVE": return "User Approval";
      case "USER_REJECT": return "User Rejection";
      case "FILE_UPLOAD": return "File Upload";
      case "FILE_DELETE": return "File Deletion";
      case "FILE_RENAME": return "File Rename";
      case "FILE_DOWNLOAD": return "File Download";
      case "SYSTEM": return "System";
      default: return type;
    }
  };

  const getLogTypeBadge = (type: string) => {
    switch (type) {
      case "USER_REGISTER":
      case "USER_LOGIN":
      case "USER_LOGOUT":
        return <Badge variant="outline" className="bg-blue-50 text-blue-600 hover:bg-blue-50 hover:text-blue-600">{getLogTypeDisplay(type)}</Badge>;
      
      case "USER_DELETE":
      case "USER_REJECT":
      case "FILE_DELETE":
        return <Badge variant="destructive">{getLogTypeDisplay(type)}</Badge>;
      
      case "USER_ADMIN":
      case "USER_ADMIN_REMOVE":
      case "USER_APPROVE":
        return <Badge className="bg-purple-500 hover:bg-purple-600">{getLogTypeDisplay(type)}</Badge>;
      
      case "FILE_UPLOAD":
      case "FILE_RENAME":
      case "FILE_DOWNLOAD":
        return <Badge className="bg-green-500 hover:bg-green-600">{getLogTypeDisplay(type)}</Badge>;
      
      case "SYSTEM":
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">{getLogTypeDisplay(type)}</Badge>;
      
      default:
        return <Badge>{getLogTypeDisplay(type)}</Badge>;
    }
  };

  const formatLogTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // Filter logs based on search
  const filteredLogs = logs.filter(log => {
    // If no search query, show all logs
    if (!searchQuery.trim()) return true;
    
    // Search in message, username, type
    const query = searchQuery.toLowerCase();
    return (
      log.message.toLowerCase().includes(query) ||
      log.username.toLowerCase().includes(query) ||
      getLogTypeDisplay(log.type).toLowerCase().includes(query)
    );
  });

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
            Admin Panel
          </CardTitle>
          <CardDescription>
            Manage users, view logs, and monitor system activities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="users">
                <User className="mr-2 h-4 w-4" />
                User Management
              </TabsTrigger>
              <TabsTrigger value="logs">
                <ActivitySquare className="mr-2 h-4 w-4" />
                System Logs
              </TabsTrigger>
            </TabsList>

            {/* Users Tab Content */}
            <TabsContent value="users" className="mt-6">
              <Tabs defaultValue="all-users">
                <TabsList className="mb-4">
                  <TabsTrigger value="all-users">All Users</TabsTrigger>
                  <TabsTrigger value="pending">Pending Requests</TabsTrigger>
                </TabsList>

                <TabsContent value="all-users">
                  <div className="flex justify-end mb-4">
                    <Button 
                      onClick={() => {
                        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
                        toast({
                          title: "Refreshed",
                          description: "User list refreshed",
                        });
                      }}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-1"
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
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

                <TabsContent value="pending">
                  <div className="flex justify-end mb-4">
                    <Button 
                      onClick={() => {
                        queryClient.invalidateQueries({ queryKey: ["/api/users/pending"] });
                        toast({
                          title: "Refreshed",
                          description: "Registration requests refreshed",
                        });
                      }}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-1"
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
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
            </TabsContent>

            {/* Logs Tab Content */}
            <TabsContent value="logs" className="mt-6">
              <div className="flex flex-col space-y-4 mb-4">
                <div className="flex flex-col md:flex-row justify-between space-y-4 md:space-y-0 md:space-x-4">
                  {/* Search bar */}
                  <div className="flex items-center w-full md:w-2/3 relative">
                    <Search className="h-4 w-4 absolute left-3 text-muted-foreground" />
                    <Input
                      placeholder="Search logs..."
                      className="pl-10"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  
                  {/* Filter and refresh */}
                  <div className="flex space-x-2 w-full md:w-1/3 justify-end">
                    <Select
                      value={logType || "all_types"}
                      onValueChange={(value) => setLogType(value === "all_types" ? undefined : value)}
                    >
                      <SelectTrigger className="w-40 md:w-48">
                        <div className="flex items-center">
                          <Filter className="h-4 w-4 mr-2" />
                          <SelectValue placeholder="All Log Types" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all_types">All Types</SelectItem>
                        <SelectItem value="USER_REGISTER">Registration</SelectItem>
                        <SelectItem value="USER_LOGIN">Login</SelectItem>
                        <SelectItem value="USER_LOGOUT">Logout</SelectItem>
                        <SelectItem value="USER_DELETE">User Deletion</SelectItem>
                        <SelectItem value="USER_ADMIN">Admin Grant</SelectItem>
                        <SelectItem value="USER_ADMIN_REMOVE">Admin Revoke</SelectItem>
                        <SelectItem value="USER_APPROVE">User Approval</SelectItem>
                        <SelectItem value="USER_REJECT">User Rejection</SelectItem>
                        <SelectItem value="FILE_UPLOAD">File Upload</SelectItem>
                        <SelectItem value="FILE_DELETE">File Deletion</SelectItem>
                        <SelectItem value="FILE_RENAME">File Rename</SelectItem>
                        <SelectItem value="FILE_DOWNLOAD">File Download</SelectItem>
                        <SelectItem value="SYSTEM">System</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <Button
                      variant="outline"
                      className="flex items-center"
                      onClick={refreshLogs}
                      disabled={isLogsRefreshing}
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${isLogsRefreshing ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  </div>
                </div>
              </div>
              
              <Table>
                <TableCaption>System activity logs</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead className="w-full">Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingLogs ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        <div className="flex justify-center">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        No logs found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{getLogTypeBadge(log.type)}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {formatLogTimestamp(log.timestamp)}
                        </TableCell>
                        <TableCell className="font-medium">{log.username}</TableCell>
                        <TableCell>{log.message}</TableCell>
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
      <AlertDialog open={deleteUserId !== null} onOpenChange={(isOpen) => !isOpen && setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will permanently delete the user account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteUser}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default AdminPage;