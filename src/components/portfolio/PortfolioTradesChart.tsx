"use client";

import { useState } from "react";
import type { PortfolioSnapshot } from "@/lib/portfolioHistoryStore";
import type { PortfolioTradeEvent } from "@/lib/portfolioTradeLog";
import { GLASS_TEXT2 } from "@/lib/glassStyles";

// PortfolioValueChart(コンパクト版)の詳細版。同じ総資産推移の面グラフに、売買イベントを
// 買い/売りの三角マーカーとして重ねる。マーカーは日付ベースでhistoryの横軸にスナップし、
// タップ/ホバーで銘柄名・単価・(売りは)実現損益を出す。下に売買履歴の一覧も添える。

const W = 600;
const H = 220;
const PAD = 10;
const MARKER_Y = H - PAD - 4; // マーカー専用レーン(グラフ下端付近、面グラフの上に重ねる)

const STOCK_COLOR = "var(--accent)";
const CASH_COLOR = "var(--accent-strong)";
const BUY_COLOR = "var(--status-good)";
const SELL_COLOR = "var(--accent-strong)";

function fmtJpy(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

function dayMs(dateStr: string): number {
  return new Date(`${dateStr.slice(0, 10)}T00:00:00Z`).getTime();
}

export function PortfolioTradesChart({ history, trades }: { history: PortfolioSnapshot[]; trades: PortfolioTradeEvent[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

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

  const firstMs = dayMs(history[0].date);
  const lastMs = dayMs(history[history.length - 1].date);
  const spanMs = Math.max(lastMs - firstMs, 1);

  function xForDate(dateStr: string): number {
    const ms = dayMs(dateStr);
    const clamped = Math.min(Math.max(ms, firstMs), lastMs);
    return PAD + ((clamped - firstMs) / spanMs) * (W - PAD * 2);
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

  // 履歴の期間内(または前後の端)に収まる売買だけをマーカー化する
  const visibleTrades = trades.filter((t) => t.date);
  const active = visibleTrades.find((t) => t.id === activeId) ?? null;
  const activeX = active ? xForDate(active.date) : 0;

  const first = history[0];
  const last = history[history.length - 1];

  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 220 }}>
          <path d={stockPath} fill={STOCK_COLOR} fillOpacity="0.22" stroke="none" />
          <path d={cashPath} fill={CASH_COLOR} fillOpacity="0.35" stroke="none" />
          <path d={totalLinePath} fill="none" stroke={STOCK_COLOR} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={totalTopPoints[totalTopPoints.length - 1].x} cy={totalTopPoints[totalTopPoints.length - 1].y} r="3" fill={STOCK_COLOR} />

          {visibleTrades.map((t) => {
            const x = xForDate(t.date);
            const isBuy = t.side === "buy";
            const color = isBuy ? BUY_COLOR : SELL_COLOR;
            // 買い=上向き三角、売り=下向き三角。マーカー専用レーンに並べ、面グラフの塗りと重ならないようにする。
            const points = isBuy
              ? `${x},${MARKER_Y - 5} ${x - 4.5},${MARKER_Y + 4} ${x + 4.5},${MARKER_Y + 4}`
              : `${x},${MARKER_Y + 4} ${x - 4.5},${MARKER_Y - 5} ${x + 4.5},${MARKER_Y - 5}`;
            return (
              <polygon
                key={t.id}
                points={points}
                fill={color}
                stroke="var(--card-bg)"
                strokeWidth="0.75"
                opacity={activeId == null || activeId === t.id ? 1 : 0.35}
                onMouseEnter={() => setActiveId(t.id)}
                onMouseLeave={() => setActiveId((cur) => (cur === t.id ? null : cur))}
                onClick={() => setActiveId((cur) => (cur === t.id ? null : t.id))}
                style={{ cursor: "pointer" }}
              />
            );
          })}
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute z-10 w-44 -translate-x-1/2 rounded-lg bg-[#1c1b18] p-2 text-[11px] text-white shadow-lg"
            style={{
              left: `${(activeX / W) * 100}%`,
              top: activeX > W * 0.7 ? "auto" : 0,
              right: activeX > W * 0.7 ? 0 : "auto",
              bottom: undefined,
            }}
          >
            <div className="font-semibold">
              {active.side === "buy" ? "買い" : "売り"}: {active.name}
            </div>
            <div className="mt-0.5 text-white/70">{active.date.slice(0, 10)}</div>
            <div className="mt-0.5">
              {active.shares.toLocaleString()}株 @ {active.currency === "JPY" ? "¥" : active.currency === "USD" ? "$" : ""}
              {active.price.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}
            </div>
            <div className="text-white/70">約定代金 {fmtJpy(active.valueJpy)}</div>
            {active.side === "sell" && active.plJpy != null && (
              <div className="font-semibold" style={{ color: active.plJpy >= 0 ? "var(--status-good-soft)" : "var(--status-bad-soft)" }}>
                実現損益 {active.plJpy >= 0 ? "+" : ""}
                {fmtJpy(active.plJpy)}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-1 flex justify-between text-[11px] text-[var(--text-muted)]">
        <span>{first.date}</span>
        <span>{last.date}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-0 border-x-[4px] border-b-[6px] border-x-transparent" style={{ borderBottomColor: BUY_COLOR }} />
          <span className="text-[var(--text-secondary)]">買い</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-0 border-x-[4px] border-t-[6px] border-x-transparent" style={{ borderTopColor: SELL_COLOR }} />
          <span className="text-[var(--text-secondary)]">売り</span>
        </span>
        <span className="text-[var(--text-secondary)]">
          合計 <span className="font-semibold tabular-nums text-[var(--foreground)]">{fmtJpy(last.valueJpy + last.cashJpy)}</span>
        </span>
      </div>

      {visibleTrades.length > 0 && (
        <div className="mt-3 max-h-52 overflow-auto">
          <table className="w-full min-w-[420px] text-[11px]">
            <thead>
              <tr className={`border-b border-[var(--border-subtle)] text-left ${GLASS_TEXT2}`}>
                <th className="whitespace-nowrap py-1 pr-2 font-semibold">日付</th>
                <th className="whitespace-nowrap py-1 pr-2 font-semibold">銘柄</th>
                <th className="whitespace-nowrap py-1 pr-2 font-semibold">売買</th>
                <th className="whitespace-nowrap py-1 pr-2 font-semibold text-right">単価</th>
                <th className="whitespace-nowrap py-1 pr-2 font-semibold text-right">損益</th>
              </tr>
            </thead>
            <tbody>
              {visibleTrades
                .slice()
                .reverse()
                .slice(0, 30)
                .map((t) => (
                  <tr key={t.id} className="border-b border-[var(--fill-pill)] last:border-none">
                    <td className="whitespace-nowrap py-1 pr-2 text-[var(--text-muted)]">{t.date.slice(0, 10)}</td>
                    <td className="whitespace-nowrap py-1 pr-2">{t.name}</td>
                    <td
                      className="whitespace-nowrap py-1 pr-2 font-semibold"
                      style={{ color: t.side === "buy" ? BUY_COLOR : SELL_COLOR }}
                    >
                      {t.side === "buy" ? "買い" : "売り"}
                    </td>
                    <td className="whitespace-nowrap py-1 pr-2 text-right tabular-nums">
                      {t.currency === "JPY" ? "¥" : t.currency === "USD" ? "$" : ""}
                      {t.price.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}
                    </td>
                    <td
                      className="whitespace-nowrap py-1 pr-2 text-right tabular-nums"
                      style={{ color: t.plJpy == null ? undefined : t.plJpy >= 0 ? "var(--status-good)" : "var(--price-up)" }}
                    >
                      {t.plJpy != null ? `${t.plJpy >= 0 ? "+" : ""}${fmtJpy(t.plJpy)}` : "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
