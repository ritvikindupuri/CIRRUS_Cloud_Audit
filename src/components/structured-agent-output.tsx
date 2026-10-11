import React from "react";

interface StructuredAgentOutputProps {
  content: string;
  className?: string;
  highlight?: string;
  isRegex?: boolean;
}

/**
 * Parses raw agent thoughts / summaries and structures them into clean,
 * executive-grade readable reports with proper spacing, distinct headers,
 * bulleted lists, and monospace badges for ARNs and resource identifiers.
 */
export function StructuredAgentOutput({
  content,
  className = "",
  highlight = "",
  isRegex = false,
}: StructuredAgentOutputProps) {
  if (!content || !content.trim()) return null;

  const rawLines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let currentList: string[] = [];

  function flushList() {
    if (currentList.length > 0) {
      blocks.push(
        <ul key={`list-${blocks.length}`} className="my-2.5 space-y-1.5 pl-5 list-disc text-xs text-foreground/90">
          {currentList.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderFormattedInline(item, highlight, isRegex)}
            </li>
          ))}
        </ul>
      );
      currentList = [];
    }
  }

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();

    if (!line) {
      flushList();
      continue;
    }

    // Markdown Headings: #, ##, ###
    if (/^#{1,4}\s+/.test(line)) {
      flushList();
      const headingText = line.replace(/^#{1,4}\s+/, "");
      blocks.push(
        <h4
          key={`h-${i}`}
          className="mt-4 mb-2 text-xs font-bold uppercase tracking-wider text-primary font-mono flex items-center gap-2 border-b border-border/50 pb-1"
        >
          <span className="text-[10px] text-muted-foreground">■</span>
          {renderFormattedInline(headingText, highlight, isRegex)}
        </h4>
      );
      continue;
    }

    // Bold section headers like "**Key Observations:**" or "Analysis Findings:"
    if (/^(\*\*[^*]+:\*\*|[A-Z][A-Za-z0-9\s/_-]{2,40}:)$/.test(line)) {
      flushList();
      const cleanHeader = line.replace(/^\*\*|\*\*$/g, "");
      blocks.push(
        <h5
          key={`sh-${i}`}
          className="mt-3.5 mb-1.5 text-xs font-semibold text-foreground/95 flex items-center gap-1.5 font-mono"
        >
          <span className="text-primary font-bold">›</span>
          {renderFormattedInline(cleanHeader, highlight, isRegex)}
        </h5>
      );
      continue;
    }

    // Bullet points: *, -, +, or numbers like "1."
    if (/^([*+-]|\d+\.)\s+/.test(line)) {
      const bulletText = line.replace(/^([*+-]|\d+\.)\s+/, "");
      currentList.push(bulletText);
      continue;
    }

    // Standalone Callouts / Risk severity flags
    if (/^(NOTE|WARNING|CRITICAL|HIGH|MEDIUM|LOW):/i.test(line)) {
      flushList();
      const [tag, ...rest] = line.split(":");
      const tagUpper = tag.toUpperCase();
      const isRisk = ["CRITICAL", "HIGH", "WARNING"].includes(tagUpper);
      blocks.push(
        <div
          key={`callout-${i}`}
          className={`my-2 rounded border px-3 py-2 text-xs font-mono ${
            isRisk
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-primary/40 bg-primary/10 text-primary"
          }`}
        >
          <span className="font-bold uppercase tracking-wide mr-1.5">{tagUpper}:</span>
          {renderFormattedInline(rest.join(":").trim(), highlight, isRegex)}
        </div>
      );
      continue;
    }

    // Regular paragraph
    flushList();
    blocks.push(
      <p key={`p-${i}`} className="my-1.5 text-xs leading-relaxed text-foreground/90 font-normal">
        {renderFormattedInline(line, highlight, isRegex)}
      </p>
    );
  }

  flushList();

  return (
    <div className={`space-y-1 text-left ${className}`}>
      {blocks}
    </div>
  );
}

function renderFormattedInline(text: string, highlight: string, isRegex: boolean): React.ReactNode {
  // Tokenize by inline code `code` or **bold**
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (!part) return null;

    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      const code = part.slice(1, -1);
      return (
        <code
          key={index}
          className="mx-0.5 rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[11px] text-foreground border border-border/60"
        >
          {applyHighlight(code, highlight, isRegex)}
        </code>
      );
    }

    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      const bold = part.slice(2, -2);
      return (
        <strong key={index} className="font-semibold text-foreground">
          {applyHighlight(bold, highlight, isRegex)}
        </strong>
      );
    }

    if (part.includes("arn:aws:")) {
      const arnParts = part.split(/(arn:aws:[^\s]+)/g);
      return arnParts.map((sub, sIdx) => {
        if (sub.startsWith("arn:aws:")) {
          return (
            <code
              key={`${index}-${sIdx}`}
              className="mx-0.5 rounded bg-primary/10 px-1 py-0.5 font-mono text-[10.5px] text-primary border border-primary/25 break-all font-semibold"
            >
              {applyHighlight(sub, highlight, isRegex)}
            </code>
          );
        }
        return applyHighlight(sub, highlight, isRegex);
      });
    }

    return applyHighlight(part, highlight, isRegex);
  });
}

function applyHighlight(text: string, highlight: string, isRegex: boolean): React.ReactNode {
  if (!highlight || !highlight.trim()) return text;
  try {
    const re = isRegex ? new RegExp(`(${highlight})`, "gi") : new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = text.split(re);
    if (parts.length === 1) return text;
    return parts.map((chunk, idx) =>
      re.test(chunk) ? (
        <mark key={idx} className="bg-amber-400/30 text-amber-200 px-0.5 rounded">
          {chunk}
        </mark>
      ) : (
        chunk
      )
    );
  } catch {
    return text;
  }
}
