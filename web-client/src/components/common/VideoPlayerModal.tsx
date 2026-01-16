import React from "react";
import { X } from "lucide-react";

interface VideoPlayerModalProps {
  url: string | null;
  onClose: () => void;
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  url,
  onClose,
}) => {
  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-4 right-4 z-20 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
          onClick={onClose}
        >
          <X className="w-6 h-6" />
        </button>

        <video
          src={url}
          controls
          autoPlay
          className="w-full h-full flex-1"
          {...({ referrerPolicy: "no-referrer" } as any)}
        >
          您的浏览器不支持视频播放。
        </video>
      </div>
    </div>
  );
};
