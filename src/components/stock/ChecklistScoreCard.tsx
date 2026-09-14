"use client";

import { useState } from "react";
import type { ScoreResult } from "@/lib/checklistTypes";

const GOOD = "var(--status-good)";

export function ChecklistScoreCard({
  title,
  caveat,
  score,
}: {
  title: string;
  caveat?: string;
  score: ScoreResult;
}) {
  const [open, setOpen] = useState(false);
  const ratio = score.total > 0 ? score.passCount / score.total : 0;
  const scoreColor = ratio >= 0.75 ? GOOD : ratio >= 0.5 ? "#a9843b" : "var(--text-secondary)";

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <h3 className="text-[13px] font-extrabold text-[var(--foreground)]">{title}</h3>
        <span className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-[13px] font-extrabold tabular-nums" style={{ color: scoreColor }}>
            {score.passCount}/{score.total}
          </span>
          <span className="text-[11px] text-[var(--text-muted)]">{open ? "▲" : "▼"}</span>
        </span>
      </button>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--fill-pill)]">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${ratio * 100}%`, background: scoreColor }}
        />
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-2">
          {score.criteria.map((c) => (
            <div key={c.key} className="flex items-start gap-2 text-[12.5px] leading-relaxed">
              <span
                className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold"
                style={{
                  background: c.pass ? "rgba(47,158,92,.15)" : "rgba(108,102,86,.1)",
                  color: c.pass ? GOOD : "var(--text-muted)",
                }}
              >
                {c.pass ? "✓" : "–"}
              </span>
              <div>
                <div className={c.pass ? "font-semibold text-[var(--foreground)]" : "text-[var(--text-secondary)]"}>{c.label}</div>
                <div className="text-[11px] text-[var(--text-muted)]">{c.detail}</div>
              </div>
            </div>
          ))}
          {caveat && <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--text-muted)]">{caveat}</p>}
        </div>
      )}
    </div>
  );
}
