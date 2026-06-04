import React from "react";
import { splitPublishCopy } from "@/utils/postCopy";

/** 按帖文惯例展示：第 1 句标题、第 2 句正文、# 话题 */
export const PostCopyDisplay: React.FC<{
  rawTitle?: string;
  rawDescription?: string;
  className?: string;
}> = ({ rawTitle = "", rawDescription = "", className = "" }) => {
  const { publishTitle, publishBody, hashtags } = splitPublishCopy(
    rawTitle,
    rawDescription
  );

  if (!publishTitle && !publishBody && !hashtags.length) {
    return null;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {publishTitle ? (
        <p className="font-semibold text-sm leading-snug text-foreground">
          {publishTitle}
        </p>
      ) : null}
      {publishBody ? (
        <p className="text-sm leading-relaxed text-foreground/90">{publishBody}</p>
      ) : null}
      {hashtags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {hashtags.map((tag) => (
            <span
              key={tag}
              className="text-[11px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20"
            >
              #{tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
};
