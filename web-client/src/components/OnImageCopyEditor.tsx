import React from "react";
import {
  DEFAULT_ON_IMAGE_ACCENT_COLOR,
  DEFAULT_ON_IMAGE_HIGHLIGHTS,
  normalizePosterText,
  pruneHighlightWords,
} from "@/utils/postCopy";

/** 将文案按 accent 字色强调词切分（仅改字色，无底色块） */
export function renderLineWithHighlights(
  line: string,
  highlightWords: string[],
  accentColor: string = DEFAULT_ON_IMAGE_ACCENT_COLOR
): React.ReactNode[] {
  if (!line || !highlightWords.length) return [line];

  const normLine = normalizePosterText(line);
  const sorted = [...highlightWords]
    .filter((w) => w && normLine.includes(normalizePosterText(w)))
    .sort((a, b) => b.length - a.length);

  if (!sorted.length) return [line];

  type Span = { start: number; end: number };
  const spans: Span[] = [];

  for (const word of sorted) {
    const nw = normalizePosterText(word);
    let from = 0;
    while (from < normLine.length) {
      const idx = normLine.indexOf(nw, from);
      if (idx < 0) break;
      spans.push({ start: idx, end: idx + nw.length });
      from = idx + 1;
    }
  }

  if (!spans.length) return [line];

  spans.sort((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) {
      last.end = Math.max(last.end, s.end);
    } else {
      merged.push({ ...s });
    }
  }

  const mapNormToOrig: number[] = [];
  let ni = 0;
  for (let oi = 0; oi < line.length && ni <= normLine.length; oi++) {
    if (!/\s/.test(line[oi])) {
      mapNormToOrig[ni] = oi;
      ni++;
    }
  }
  mapNormToOrig[normLine.length] = line.length;

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  merged.forEach((span, i) => {
    const oStart = mapNormToOrig[span.start] ?? cursor;
    const oEnd = mapNormToOrig[span.end] ?? line.length;
    if (oStart > cursor) {
      nodes.push(
        <React.Fragment key={`t-${i}`}>{line.slice(cursor, oStart)}</React.Fragment>
      );
    }
    nodes.push(
      <span
        key={`a-${i}`}
        className="font-bold"
        style={{ color: accentColor }}
      >
        {line.slice(oStart, oEnd)}
      </span>
    );
    cursor = oEnd;
  });
  if (cursor < line.length) {
    nodes.push(<React.Fragment key="tail">{line.slice(cursor)}</React.Fragment>);
  }
  return nodes;
}

interface OnImageCopyEditorProps {
  value: string;
  highlightWords: string[];
  onChange: (value: string) => void;
  onHighlightsChange?: (words: string[]) => void;
  disabled?: boolean;
  accentColor?: string;
}

export const OnImageCopyEditor: React.FC<OnImageCopyEditorProps> = ({
  value,
  highlightWords,
  onChange,
  disabled,
  accentColor = DEFAULT_ON_IMAGE_ACCENT_COLOR,
}) => {
  const lines = value.split("\n").filter((l) => l.trim() || value.includes("\n"));
  const displayHighlights = pruneHighlightWords(
    highlightWords,
    value,
    [...DEFAULT_ON_IMAGE_HIGHLIGHTS]
  );

  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={
          "海报画面主文案，每行一条（回车换行）\n例如：自从我发现这个频率的声音能阻止大脑胡思乱想后…"
        }
        rows={4}
        className="w-full px-3 py-2 bg-background/80 border border-input rounded-md text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono leading-relaxed"
      />
      {value.trim() && (
        <div className="rounded-lg border border-violet-500/30 overflow-hidden">
          <p className="text-[10px] text-violet-200/90 font-medium px-3 pt-2 bg-violet-950/80">
            海报预览（珊瑚橙字 = 黑底白字上的醒目强调，无行首空格、无黄底块）
          </p>
          <div
            className="px-3 py-3 space-y-1.5 text-[15px] leading-relaxed"
            style={{
              background:
                "linear-gradient(165deg, #2d1b4e 0%, #1a1035 45%, #0f172a 100%)",
            }}
          >
            {(lines.length ? lines : [value]).map((line, idx) => (
              <p
                key={idx}
                className="whitespace-pre-wrap text-white/95 font-medium tracking-wide"
              >
                {renderLineWithHighlights(line, displayHighlights, accentColor)}
              </p>
            ))}
          </div>
          {displayHighlights.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 py-2 bg-muted/40 border-t border-border/50">
              <span className="text-[9px] text-muted-foreground w-full mb-0.5">
                生图将对下列词使用 accent 字色（{accentColor}）：
              </span>
              {displayHighlights.map((w) => (
                <span
                  key={w}
                  className="text-[9px] px-1.5 py-0.5 rounded font-bold border border-current/30"
                  style={{ color: accentColor }}
                >
                  {w}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
