"use client";

import type { PortfolioSnapshot } from "@/lib/portfolioHistoryStore";

const W = 600;
const H = 140;
const PAD = 8;

const STOCK_COLOR = "var(--accent)";
const CASH_COLOR = "var(--accent-strong)";

function fmtJpy(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

// 現金と株式評価額を積み上げ面グラフで表示し、総資産の推移と「その中身」を同時に見せる。
export function PortfolioValueChart({ history, showLegend = true }: { history: PortfolioSnapshot[]; showLegend?: boolean }) {
  if (history.length < 2) {
    return (
      <div className="flex h-[140px] items-center justify-center text-[12.5px] text-[var(--text-secondary)]">
        記録が2日分たまると推移グラフが表示されます
      </div>
    );
  }

  const totals = history.map((h) => h.valueJpy + h.cashJpy);
  const max = Math.max(...totals, 1);

  function yFor(v: number): number {
    return PAD + (1 - v / max) * (H - PAD * 2);
  }
  function xFor(i: number): number {
    return PAD + (i / (history.length - 1)) * (W - PAD * 2);
  }

  const cashTopPoints = history.map((h, i) => ({ x: xFor(i), y: yFor(h.cashJpy) }));
  const totalTopPoints = history.map((h, i) => ({ x: xFor(i), y: yFor(h.cashJpy + h.valueJpy) }));
  const baseY = H - PAD;

  const cashPath =
    cashTopPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") +
    ` L${cashTopPoints[cashTopPoints.length - 1].x.toFixed(1)},${baseY} L${cashTopPoints[0].x.toFixed(1)},${baseY} Z`;

  const stockPath =
    totalTopPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") +
    " L" +
    cashTopPoints
      .slice()
      .reverse()
      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" L") +
    " Z";

  const totalLinePath = totalTopPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  const first = history[0];
  const last = history[history.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 140 }}>
        <path d={stockPath} fill={STOCK_COLOR} fillOpacity="0.22" stroke="none" />
        <path d={cashPath} fill={CASH_COLOR} fillOpacity="0.35" stroke="none" />
        <path d={totalLinePath} fill="none" stroke={STOCK_COLOR} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={totalTopPoints[totalTopPoints.length - 1].x} cy={totalTopPoints[totalTopPoints.length - 1].y} r="3" fill={STOCK_COLOR} />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-[var(--text-muted)]">
        <span>{first.date}</span>
        <span>{last.date}</span>
      </div>
      {showLegend && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: STOCK_COLOR }} />
            <span className="text-[var(--text-secondary)]">株式評価額</span>
            <span className="font-semibold tabular-nums text-[var(--foreground)]">{fmtJpy(last.valueJpy)}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: CASH_COLOR }} />
            <span className="text-[var(--text-secondary)]">現金</span>
            <span className="font-semibold tabular-nums text-[var(--foreground)]">{fmtJpy(last.cashJpy)}</span>
          </span>
          <span className="text-[var(--text-secondary)]">
            合計 <span className="font-semibold tabular-nums text-[var(--foreground)]">{fmtJpy(last.valueJpy + last.cashJpy)}</span>
          </span>
        </div>
      )}
    </div>
  );
}
