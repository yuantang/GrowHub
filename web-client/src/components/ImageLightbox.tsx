import React, { useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, ExternalLink, Download, ZoomIn } from "lucide-react";
import { resolveImageSrc, toApiPath } from "@/utils/mediaUrl";
import api from "@/api";

interface ImageLightboxProps {
  images: string[];
  initialIndex?: number;
  onClose: () => void;
  title?: string;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  images,
  initialIndex = 0,
  onClose,
  title = "图片预览",
}) => {
  const [index, setIndex] = React.useState(
    Math.min(Math.max(0, initialIndex), Math.max(0, images.length - 1))
  );
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const currentRaw = images[index] ?? "";
  const displaySrc = resolveImageSrc(currentRaw);

  const loadImage = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
    }

    if (!displaySrc) {
      setError("无图片地址");
      setLoading(false);
      return;
    }

    if (displaySrc.startsWith("data:")) {
      setBlobUrl(displaySrc);
      setLoading(false);
      return;
    }

    try {
      const path = displaySrc.startsWith("http") ? displaySrc : toApiPath(displaySrc);
      const res = await api.get(path, { responseType: "blob" });
      const objectUrl = URL.createObjectURL(res.data as Blob);
      setBlobUrl(objectUrl);
    } catch {
      setError("图片加载失败，请检查网络或重新生成");
    } finally {
      setLoading(false);
    }
  }, [displaySrc]);

  useEffect(() => {
    loadImage();
    return () => {
      if (blobUrl && blobUrl.startsWith("blob:")) {
        URL.revokeObjectURL(blobUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, currentRaw]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(images.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, onClose]);

  const goPrev = () => setIndex((i) => Math.max(0, i - 1));
  const goNext = () => setIndex((i) => Math.min(images.length - 1, i + 1));

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `image-${index + 1}.jpg`;
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-5xl max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3 text-white">
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            {images.length > 1 && (
              <p className="text-[11px] text-white/60 mt-0.5">
                {index + 1} / {images.length}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleDownload}
              disabled={!blobUrl}
              className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-40"
              title="下载"
            >
              <Download className="w-5 h-5" />
            </button>
            <a
              href={displaySrc}
              target="_blank"
              rel="noreferrer"
              className="p-2 rounded-lg hover:bg-white/10"
              title="新窗口打开"
            >
              <ExternalLink className="w-5 h-5" />
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="relative flex-1 min-h-[50vh] flex items-center justify-center bg-black/40 rounded-xl border border-white/10 overflow-hidden">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
              加载中…
            </div>
          )}
          {error && !loading && (
            <div className="text-center text-white/80 text-sm px-6 space-y-3">
              <p>{error}</p>
              <button
                type="button"
                onClick={loadImage}
                className="text-xs px-3 py-1.5 rounded bg-white/10 hover:bg-white/20"
              >
                重试
              </button>
            </div>
          )}
          {blobUrl && !error && (
            <img
              src={blobUrl}
              alt={`预览 ${index + 1}`}
              className="max-w-full max-h-[78vh] object-contain"
            />
          )}

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={goPrev}
                disabled={index === 0}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white disabled:opacity-30 hover:bg-black/70"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={index >= images.length - 1}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white disabled:opacity-30 hover:bg-black/70"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

interface ImagePreviewProps {
  src: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  onClick?: () => void;
  showZoomHint?: boolean;
}

/** 带加载/失败态的缩略图，点击可触发外部 Lightbox */
export const ImagePreview: React.FC<ImagePreviewProps> = ({
  src,
  alt = "图片",
  className = "",
  imgClassName = "w-full h-full object-cover",
  onClick,
  showZoomHint = true,
}) => {
  const resolved = resolveImageSrc(src);
  const [status, setStatus] = React.useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    setStatus("loading");
  }, [src]);

  return (
    <div
      className={`relative overflow-hidden bg-muted/80 ${onClick ? "cursor-pointer group" : ""} ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted animate-pulse">
          <ZoomIn className="w-5 h-5 text-muted-foreground/40" />
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground p-2 text-center">
          <ImageIconPlaceholder />
          <span>加载失败</span>
          {onClick && <span className="text-purple-400">点击重试预览</span>}
        </div>
      )}
      {resolved && status !== "error" && (
        <img
          src={resolved}
          alt={alt}
          className={imgClassName}
          onLoad={() => setStatus("ok")}
          onError={() => setStatus("error")}
        />
      )}
      {showZoomHint && onClick && status === "ok" && (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <ZoomIn className="w-6 h-6 text-white drop-shadow" />
        </div>
      )}
    </div>
  );
};

const ImageIconPlaceholder = () => (
  <svg className="w-8 h-8 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="m21 15-5-5L5 21" />
  </svg>
);

export default ImagePreview;
