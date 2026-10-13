"use client";

import { Check, ClipboardCopy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** PGN panel: numbered SAN moves; click a move to review that position. */
export function MoveList({
  sans,
  pgn,
  viewIndex,
  onSelect,
}: {
  sans: string[];
  pgn: string;
  /** Number of half-moves shown on the board (sans.length = live). */
  viewIndex: number;
  onSelect: (index: number) => void;
}) {
  const [copied, setCopied] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [sans.length]);

  const rows: { n: number; w?: string; b?: string }[] = [];
  for (let i = 0; i < sans.length; i += 2) {
    rows.push({ n: i / 2 + 1, w: sans[i], b: sans[i + 1] });
  }

  const cell = (san: string | undefined, idx: number) =>
    san ? (
      <button
        type="button"
        onClick={() => onSelect(idx)}
        className={cn(
          "rounded px-1.5 py-0.5 text-left font-mono text-sm hover:bg-muted",
          viewIndex === idx && "bg-accent font-semibold text-accent-foreground hover:bg-accent",
        )}
      >
        {san}
      </button>
    ) : (
      <span />
    );

  return (
    <div className="flex flex-col gap-2">
      <div className="h-56 overflow-y-auto rounded-lg border bg-card p-2 lg:h-72">
        {rows.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">No moves yet.</p>
        ) : (
          <div className="grid grid-cols-[2rem_1fr_1fr] items-center gap-y-0.5">
            {rows.map((r) => (
              <div key={r.n} className="contents">
                <span className="text-xs text-muted-foreground">{r.n}.</span>
                {cell(r.w, r.n * 2 - 1)}
                {cell(r.b, r.n * 2)}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Button size="xs" variant="outline" disabled={viewIndex <= 0} onClick={() => onSelect(0)}>
          ⏮
        </Button>
        <Button size="xs" variant="outline" disabled={viewIndex <= 0} onClick={() => onSelect(viewIndex - 1)}>
          ◀
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={viewIndex >= sans.length}
          onClick={() => onSelect(viewIndex + 1)}
        >
          ▶
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={viewIndex >= sans.length}
          onClick={() => onSelect(sans.length)}
        >
          ⏭ Live
        </Button>
        <Button
          size="xs"
          variant="ghost"
          className="ml-auto"
          onClick={() => {
            void navigator.clipboard.writeText(pgn || "").then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? <Check /> : <ClipboardCopy />} PGN
        </Button>
      </div>
    </div>
  );
}
