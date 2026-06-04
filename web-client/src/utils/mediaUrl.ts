/**
 * 将各类图片地址统一为当前站点可加载的 URL
 */
export function resolveImageSrc(url: string | undefined | null): string {
  if (!url) return "";

  const u = url.trim();
  if (!u) return "";

  if (u.startsWith("data:") || u.startsWith("blob:")) {
    return u;
  }

  // PicTactic 直连地址 → GrowHub 静态代理
  const pictacticStatic = u.match(/^https?:\/\/(?:localhost|127\.0\.0\.1):8019(\/static\/.*)$/i);
  if (pictacticStatic) {
    return `/api/growhub_imagegen${pictacticStatic[1]}`;
  }

  if (u.startsWith("/static/")) {
    return `/api/growhub_imagegen${u}`;
  }

  if (u.startsWith("/api/")) {
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}${u}`;
    }
    return u;
  }

  // 外链封面（抖音等）走服务端代理，避免防盗链导致 <img> 无法显示
  if (u.startsWith("http://") || u.startsWith("https://")) {
    return `/api/growhub_imagegen/proxy-remote?url=${encodeURIComponent(u)}`;
  }

  return u;
}

/** 本地提取的音频（/static/audio_extractions）→ 当前 API 源站可播放地址 */
export function resolveAudioSrc(url: string | undefined | null): string {
  if (!url) return "";
  const u = url.trim();
  if (!u) return "";
  if (u.startsWith("data:") || u.startsWith("blob:") || u.startsWith("http://") || u.startsWith("https://")) {
    return u;
  }
  const path = u.startsWith("/") ? u : `/${u}`;
  if (!path.includes("/static/audio_extractions/")) {
    return path;
  }
  if (typeof window !== "undefined" && window.location?.port === "8040") {
    return `${window.location.origin}${path}`;
  }
  const host =
    typeof window !== "undefined" ? window.location.hostname : "127.0.0.1";
  return `http://${host}:8040${path}`;
}

/** axios 请求路径（去掉 /api 前缀） */
export function toApiPath(resolvedSrc: string): string {
  if (resolvedSrc.startsWith("/api/")) {
    return resolvedSrc.slice(4);
  }
  return resolvedSrc;
}
