import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFileContext } from "@/contexts/FileContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";

interface RenameFileModalProps {
  getFileName: (id: number) => string | undefined;
}

export default function RenameFileModal({ getFileName }: RenameFileModalProps) {
  const { isRenameModalOpen, setIsRenameModalOpen, fileToRename, setFileToRename } = useFileContext();
  const [newFileName, setNewFileName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Reset state when modal is opened with a different file
  useEffect(() => {
    if (fileToRename !== null) {
      const currentName = getFileName(fileToRename);
      setNewFileName(currentName || "");
    }
  }, [fileToRename, getFileName]);

  const handleClose = () => {
    setIsRenameModalOpen(false);
    setFileToRename(null);
  };

  const handleRename = async () => {
    if (!fileToRename || !newFileName.trim()) return;

    setIsLoading(true);
    try {
      await apiRequest<{ message: string; success: boolean }>({
        url: `/api/files/${fileToRename}/rename`,
        method: "PATCH",
        data: { newName: newFileName.trim() }
      });

      // Update the cache
      queryClient.invalidateQueries({ queryKey: ['/api/files'] });

      toast({
        title: "File renamed",
        description: "The file has been successfully renamed.",
      });

      // Close the modal
      handleClose();
    } catch (error) {
      console.error("Error renaming file:", error);
      toast({
        title: "Failed to rename file",
        description: "There was an error renaming the file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isRenameModalOpen} onOpenChange={setIsRenameModalOpen}>
      <DialogContent className="soft-element">
        <DialogHeader>
          <DialogTitle>Rename File</DialogTitle>
          <DialogDescription>
            Enter a new name for the file.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Label htmlFor="fileName" className="text-neutral-800">
            File Name
          </Label>
          <Input
            id="fileName"
            className="mt-2 soft-element-inner"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            className="soft-button"
          >
            Cancel
          </Button>
          <Button
            onClick={handleRename}
            className="soft-button bg-primary text-white"
            disabled={!newFileName.trim() || isLoading}
          >
            {isLoading ? "Renaming..." : "Rename"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}