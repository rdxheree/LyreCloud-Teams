import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Power, PowerOff, RefreshCw, InfoIcon } from "lucide-react";

interface KeepAliveStatus {
  isRunning: boolean;
  lastRunTime: string | null;
  nextRunTime: string | null;
}

export default function KeepAliveSettings() {
  const { toast } = useToast();
  const [isTriggeringManually, setIsTriggeringManually] = useState(false);
  
  // Fetch keep-alive status
  const { 
    data: status, 
    isLoading: isLoadingStatus,
    refetch: refetchStatus
  } = useQuery<KeepAliveStatus>({
    queryKey: ["/api/system/keep-alive/status"],
    queryFn: async () => {
      try {
        const response = await apiRequest<{ success: boolean; isRunning: boolean; lastRunTime: string | null; nextRunTime: string | null }>({
          method: "GET",
          url: "/api/system/keep-alive/status"
        });
        return response;
      } catch (error) {
        console.error("Failed to fetch keep-alive status:", error);
        return { isRunning: false, lastRunTime: null, nextRunTime: null };
      }
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Start keep-alive service
  const startMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest<{ success: boolean; message: string }>({
        method: "POST",
        url: "/api/system/keep-alive/start"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system/keep-alive/status"] });
      toast({
        title: "Service Started",
        description: "Keep-alive service has been started successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Start",
        description: error.message || "Failed to start keep-alive service.",
        variant: "destructive",
      });
    },
  });

  // Stop keep-alive service
  const stopMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest<{ success: boolean; message: string }>({
        method: "POST",
        url: "/api/system/keep-alive/stop"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system/keep-alive/status"] });
      toast({
        title: "Service Stopped",
        description: "Keep-alive service has been stopped successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Stop",
        description: error.message || "Failed to stop keep-alive service.",
        variant: "destructive",
      });
    },
  });

  // Manually trigger keep-alive process
  const triggerMutation = useMutation({
    mutationFn: async () => {
      setIsTriggeringManually(true);
      const result = await apiRequest<{ success: boolean; message: string; fileCount: number; elapsedTime?: number }>({
        method: "POST",
        url: "/api/system/keep-alive/trigger"
      });
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/system/keep-alive/status"] });
      toast({
        title: "Links Refreshed",
        description: `Successfully checked ${data.fileCount} file links in ${data.elapsedTime ? Math.round(data.elapsedTime / 1000) : '?'} seconds.`,
      });
      setIsTriggeringManually(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Refresh Failed",
        description: error.message || "Failed to manually refresh file links.",
        variant: "destructive",
      });
      setIsTriggeringManually(false);
    },
  });

  // Format date for display
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    try {
      return new Date(dateString).toLocaleString();
    } catch (e) {
      return dateString;
    }
  };

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="text-lg">Keep-Alive Service</CardTitle>
        <CardDescription>
          Ensures file links remain accessible 24/7 without downtime
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoadingStatus ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="font-medium">Status:</div>
                {status?.isRunning ? (
                  <Badge className="bg-green-500 hover:bg-green-600">Active</Badge>
                ) : (
                  <Badge variant="outline" className="text-red-500 border-red-200">Inactive</Badge>
                )}
              </div>
              
              <div className="flex space-x-2">
                {status?.isRunning ? (
                  <Button
                    variant="outline"
                    className="border-red-200 text-red-500 hover:bg-red-50"
                    onClick={() => stopMutation.mutate()}
                    disabled={stopMutation.isPending}
                  >
                    {stopMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Stopping...
                      </>
                    ) : (
                      <>
                        <PowerOff className="mr-2 h-4 w-4" />
                        Stop Service
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="border-green-200 text-green-500 hover:bg-green-50"
                    onClick={() => startMutation.mutate()}
                    disabled={startMutation.isPending}
                  >
                    {startMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Starting...
                      </>
                    ) : (
                      <>
                        <Power className="mr-2 h-4 w-4" />
                        Start Service
                      </>
                    )}
                  </Button>
                )}
                
                <Button
                  variant="default"
                  onClick={() => triggerMutation.mutate()}
                  disabled={triggerMutation.isPending || isTriggeringManually}
                >
                  {triggerMutation.isPending || isTriggeringManually ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Refreshing Links...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Refresh Links Now
                    </>
                  )}
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="text-sm">
                <span className="font-medium">Last Run:</span>{" "}
                {formatDate(status?.lastRunTime || null)}
              </div>
              <div className="text-sm">
                <span className="font-medium">Next Run:</span>{" "}
                {status?.isRunning 
                  ? formatDate(status?.nextRunTime || null)
                  : "Service is stopped"}
              </div>
            </div>
            
            <Alert>
              <InfoIcon className="h-4 w-4" />
              <AlertTitle>How it works</AlertTitle>
              <AlertDescription className="text-sm">
                <p>The keep-alive service periodically verifies all file links to maintain their accessibility.</p> 
                <p className="mt-1">By default, it runs every 5 minutes to ensure links remain active 24/7 without downtime.</p>
              </AlertDescription>
            </Alert>
          </div>
        )}
      </CardContent>
    </Card>
  );
}