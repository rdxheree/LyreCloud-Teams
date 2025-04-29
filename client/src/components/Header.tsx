import { CloudIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Header() {
  return (
    <header className="py-4 px-6 md:px-10 flex items-center justify-between soft-element mb-8">
      <div className="flex items-center">
        <CloudIcon className="h-8 w-8 text-primary" />
        <h1 className="ml-3 text-2xl font-semibold text-primary-600">LyreCloud Teams</h1>
      </div>
      
      <div className="flex space-x-2">
        <Button 
          variant="outline" 
          className="soft-button bg-background px-4 py-2 rounded-full text-primary font-medium"
        >
          Sign In
        </Button>
        
        <Button 
          className="soft-button bg-primary text-white px-4 py-2 rounded-full font-medium"
        >
          Sign Up
        </Button>
      </div>
    </header>
  );
}
