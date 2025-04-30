import React, { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ExternalLink } from 'lucide-react';

interface MessageEmbedProps {
  title?: string;
  description?: string;
  imageUrl?: string;
  linkUrl?: string;
  linkText?: string;
}

export default function MessageEmbed({
  title = "LyreCloud Teams",
  description = "A secure and intuitive cloud file management platform designed for seamless digital storage and sharing.",
  imageUrl = "https://teams.lyrecloud.com/cdn/Black_and_Blue_Modern_Training_and_Development_Presentation_960_x_540_px_1.png",
  linkUrl = "https://teams.lyrecloud.com",
  linkText = "View details"
}: MessageEmbedProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  return (
    <Card className="w-full max-w-[600px] overflow-hidden border-l-4 border-l-blue-500">
      <CardContent className="p-4">
        {title && <h3 className="text-lg font-semibold mb-2">{title}</h3>}
        {description && <p className="text-gray-600 mb-4">{description}</p>}
        
        {imageUrl && !imageError && (
          <div className="relative">
            <img
              src={imageUrl}
              alt={title || "Message Embed"}
              className={`w-full rounded-md transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
            {!imageLoaded && (
              <div className="absolute inset-0 bg-gray-100 animate-pulse rounded-md" style={{ height: '250px' }}></div>
            )}
          </div>
        )}
        
        {linkUrl && (
          <>
            <Separator className="my-3" />
            <a 
              href={linkUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center text-blue-500 hover:text-blue-700 text-sm font-medium"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              {linkText}
            </a>
          </>
        )}
      </CardContent>
    </Card>
  );
}