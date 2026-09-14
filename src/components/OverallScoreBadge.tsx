"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CommitteeVerdict } from "@/lib/committeeScore";
import { gradeColor } from "@/lib/scoreColor";
import { MINERVINI_TOTAL, CANSLIM_TOTAL } from "@/lib/dailyPickOverall";

// 総合評価(S/A/B/C/D)を主役として大きく見せ、内訳(ミネルヴィニ/CANSLIM/財務健全性/投資委員会、
// さらに投資委員会の5役の賛否)はタップ/クリックした時だけ見せる。以前はCSSのgroup-hoverだけで
// 出していたが、それだとホバーの無いスマホでは内訳が一切見られなかった(タップしても何も
// 起きない)ため、タップでも開閉できるようJS制御のポータル吹き出しに変更した
// (AdviceTooltip/DashboardTab.tsxと同じ「document.bodyへポータル+position:fixed」の考え方)。
export interface ScoreBreakdown {
  minerviniScore: number | null;
  canslimScore: number | null;
  qualityScore: number | null;
  qualityTotal: number | null;
  committeeAgree: number | null;
  committeeTotal: number | null;
  committeeRoles?: CommitteeVerdict["roles"] | null;
}

const ROLE_LABEL: Record<"fundamental" | "technical" | "sentiment" | "risk" | "macro", string> = {
  fundamental: "ファンダメンタル役",
  technical: "テクニカル役",
  sentiment: "センチメント役",
  risk: "リスク管理役",
  macro: "マクロ役",
};
const ROLE_ORDER = ["fundamental", "technical", "sentiment", "risk", "macro"] as const;

function breakdownColor(value: number | null, total: number | null): string {
  if (value == null || !total) return "#8a8368";
  const ratio = value / total;
  if (ratio >= 0.8) return "#e0b876";
  if (ratio >= 0.6) return "var(--status-good-soft)";
  return "#c9c2ab";
}

function BreakdownRow({ label, value, total }: { label: string; value: number | null; total: number | null }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-white/70">{label}</span>
      <span style={{ color: breakdownColor(value, total) }}>
        {value ?? "—"}/{total ?? "—"}
      </span>
    </div>
  );
}

function BreakdownPopup({ rect, breakdown }: { rect: DOMRect; breakdown: ScoreBreakdown }) {
  const estimatedHeight = 140 + (breakdown.committeeRoles ? 110 : 0);
  const openUpward = window.innerHeight - rect.bottom < estimatedHeight + 12;
  const left = Math.max(8, Math.min(rect.right - 208, window.innerWidth - 216));
  const position: { top?: number; bottom?: number } = openUpward
    ? { bottom: window.innerHeight - rect.top + 6 }
    : { top: rect.bottom + 6 };
  return createPortal(
    <div
      className="fixed z-50 w-52 rounded-lg bg-[#1c1b18] p-2.5 text-left text-[11px] font-normal normal-case text-white shadow-lg"
      style={{ ...position, left }}
    >
      <BreakdownRow label="ミネルヴィニ" value={breakdown.minerviniScore} total={MINERVINI_TOTAL} />
      <BreakdownRow label="CANSLIM" value={breakdown.canslimScore} total={CANSLIM_TOTAL} />
      <BreakdownRow label="財務健全性" value={breakdown.qualityScore} total={breakdown.qualityTotal} />
      <BreakdownRow label="投資委員会" value={breakdown.committeeAgree} total={breakdown.committeeTotal} />
      {breakdown.committeeRoles && (
        <div className="mt-1.5 border-t border-white/10 pt-1.5">
          <div className="mb-0.5 text-white/50">投資委員会の内訳</div>
          {ROLE_ORDER.map((role) => {
            const pass = breakdown.committeeRoles![role];
            return (
              <div key={role} className="flex items-center gap-1.5 py-0.5" style={{ color: pass ? "var(--status-good-soft)" : "var(--status-bad-soft)" }}>
                {pass ? "✓" : "✕"} {ROLE_LABEL[role]}
              </div>
            );
          })}
        </div>
      )}
    </div>,
    document.body
  );
}

export function OverallScoreBadge({ score, grade, breakdown }: { score: number; grade: string; breakdown: ScoreBreakdown }) {
  const color = gradeColor(grade);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!rect) return;
    function handleOutside(e: Event) {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) setRect(null);
    }
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, [rect]);

  function toggle(e: React.MouseEvent) {
    // 親要素(カード全体がbuttonの場合など)への遷移クリックと競合しないようにする。
    e.stopPropagation();
    setRect((prev) => (prev ? null : (anchorRef.current?.getBoundingClientRect() ?? null)));
  }

  return (
    <span
      ref={anchorRef}
      onClick={toggle}
      className="relative inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
      style={{ background: `${color}1f`, color }}
    >
      {grade}
      <span className="font-mono font-normal text-[var(--text-secondary)]">{score}</span>
      {rect && <BreakdownPopup rect={rect} breakdown={breakdown} />}
    </span>
  );
}
