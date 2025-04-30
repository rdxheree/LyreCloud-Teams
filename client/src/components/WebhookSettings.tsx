import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, TestTube, Save, AlertTriangle, Check } from "lucide-react";

interface WebhookConfig {
  url: string;
  enabled: boolean;
  lastTestedAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastFailureReason?: string;
}

export default function WebhookSettings() {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch webhook configuration
  const { data: config, isLoading: isLoadingConfig } = useQuery<WebhookConfig>({
    queryKey: ["/api/webhook"],
    queryFn: async () => {
      try {
        const response = await apiRequest({
          method: "GET",
          url: "/api/webhook"
        });
        return response;
      } catch (error) {
        // If endpoint doesn't exist or returns error, use default config
        return { url: "", enabled: false };
      }
    },
  });

  // Update local state when config is loaded
  useEffect(() => {
    if (config) {
      setUrl(config.url || "");
      setEnabled(config.enabled || false);
      setHasChanges(false);
    }
  }, [config]);

  // Test webhook connection
  const testWebhookMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest<{ success: boolean; message: string }>({
        method: "POST",
        url: "/api/webhook/test"
      });
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Webhook Test Successful",
          description: "The webhook connection was successfully tested.",
          variant: "default",
        });
      } else {
        toast({
          title: "Webhook Test Failed",
          description: data.message || "Failed to connect to the webhook URL.",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Webhook Test Failed",
        description: error.message || "An error occurred while testing the webhook.",
        variant: "destructive",
      });
    }
  });

  // Save webhook configuration
  const saveWebhookMutation = useMutation({
    mutationFn: async (config: Partial<WebhookConfig>) => {
      return await apiRequest<{ success: boolean; config: WebhookConfig }>({
        method: "POST",
        url: "/api/webhook",
        body: config
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/webhook"] });
      setHasChanges(false);
      toast({
        title: "Webhook Configuration Saved",
        description: "The webhook settings have been successfully updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error Saving Webhook",
        description: error.message || "Failed to save webhook configuration.",
        variant: "destructive",
      });
    }
  });

  const handleSave = () => {
    saveWebhookMutation.mutate({ url, enabled });
  };

  const handleTest = () => {
    // Save first if there are pending changes
    if (hasChanges) {
      saveWebhookMutation.mutate(
        { url, enabled },
        {
          onSuccess: () => {
            testWebhookMutation.mutate();
          }
        }
      );
    } else {
      testWebhookMutation.mutate();
    }
  };

  // Format date for display
  const formatDate = (dateString?: string) => {
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
        <CardTitle className="text-lg">Discord Webhook Integration</CardTitle>
        <CardDescription>
          Configure Discord webhook to receive log events as message embeds
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoadingConfig ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="webhook-url">Discord Webhook URL</Label>
                <Input
                  id="webhook-url"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setHasChanges(true);
                  }}
                />
                <p className="text-sm text-muted-foreground">
                  Enter the full Discord webhook URL from your server settings
                </p>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="webhook-enabled"
                    checked={enabled}
                    onCheckedChange={(checked) => {
                      setEnabled(checked);
                      setHasChanges(true);
                    }}
                  />
                  <Label htmlFor="webhook-enabled">
                    Enable webhook notifications
                  </Label>
                </div>
                
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    onClick={handleTest}
                    disabled={!url || testWebhookMutation.isPending || saveWebhookMutation.isPending}
                  >
                    {testWebhookMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <TestTube className="mr-2 h-4 w-4" />
                        Test Connection
                      </>
                    )}
                  </Button>
                  
                  <Button
                    onClick={handleSave}
                    disabled={!hasChanges || saveWebhookMutation.isPending}
                  >
                    {saveWebhookMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
            
            {/* Status information */}
            {config && (
              <div className="space-y-3 pt-2">
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium">Last Tested:</span> {formatDate(config.lastTestedAt)}
                </div>
                
                {config.lastSuccessAt && (
                  <Alert className="bg-green-50 border-green-200">
                    <Check className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-600">Last Successful Connection</AlertTitle>
                    <AlertDescription className="text-green-700">
                      {formatDate(config.lastSuccessAt)}
                    </AlertDescription>
                  </Alert>
                )}
                
                {config.lastFailureAt && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Last Failed Connection</AlertTitle>
                    <AlertDescription>
                      {formatDate(config.lastFailureAt)}
                      {config.lastFailureReason && (
                        <div className="mt-1 text-sm">
                          Reason: {config.lastFailureReason}
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
            
            <div className="text-sm text-muted-foreground border-t pt-4 mt-4">
              <p>All system logs will be sent as Discord embeds when the webhook is enabled.</p>
              <p className="mt-1">Discord webhooks are color-coded by event type and include all log details.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}