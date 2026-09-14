"use client";

import type { StockSignals } from "@/lib/stockSignals";

const UP = "var(--price-up)";
const DOWN = "var(--price-down)";
const GOOD = "var(--status-good)";

function fmtShares(n: number | null): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(2)}億株`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e4).toFixed(1)}万株`;
  return n.toLocaleString("ja-JP") + "株";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const ACTION_LABEL: Record<string, string> = {
  up: "格上げ",
  down: "格下げ",
  init: "新規カバー",
  main: "維持",
  reit: "再表明",
};

export function InvestorSignalsSection({ signals }: { signals: StockSignals }) {
  const hasShortInterest = signals.sharesShort != null;
  const netInsiderShares =
    signals.netInsiderBuyShares != null && signals.netInsiderSellShares != null
      ? signals.netInsiderBuyShares - signals.netInsiderSellShares
      : null;

  return (
    <div className="flex flex-col gap-5">
      {/* インサイダー売買 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-[12.5px] font-extrabold text-[var(--foreground)]">インサイダー売買(直近6ヶ月)</h4>
          {netInsiderShares != null && (
            <span className="font-mono text-[11px] font-bold" style={{ color: netInsiderShares >= 0 ? GOOD : DOWN }}>
              純{netInsiderShares >= 0 ? "買い越し" : "売り越し"} {fmtShares(Math.abs(netInsiderShares))}
            </span>
          )}
        </div>
        {signals.insiderTransactions.length === 0 ? (
          <div className="text-[11px] text-[var(--text-muted)]">開示データがありません</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {signals.insiderTransactions.slice(0, 5).map((t, i) => {
              const isBuy = /Buy|買/.test(t.transactionText);
              const isSell = /Sale|Sell|売/.test(t.transactionText);
              return (
                <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="min-w-0 truncate text-[var(--foreground)]">
                    {t.filerName}
                    {t.filerRelation && <span className="text-[var(--text-muted)]"> ({t.filerRelation})</span>}
                  </span>
                  <span
                    className="shrink-0 font-mono"
                    style={{ color: isBuy ? GOOD : isSell ? DOWN : "var(--text-secondary)" }}
                  >
                    {fmtDate(t.date)} {fmtShares(t.shares)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 機関投資家保有 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-[12.5px] font-extrabold text-[var(--foreground)]">機関投資家保有</h4>
          <span className="text-[11px] text-[var(--text-secondary)]">
            {signals.institutionsPercentHeld != null ? `${signals.institutionsPercentHeld.toFixed(1)}%保有` : "—"}
            {signals.netInstitutionalBuyingPercent != null && (
              <span style={{ color: signals.netInstitutionalBuyingPercent >= 0 ? GOOD : DOWN }}>
                {" "}
                (6ヶ月{signals.netInstitutionalBuyingPercent >= 0 ? "+" : ""}
                {signals.netInstitutionalBuyingPercent.toFixed(1)}%)
              </span>
            )}
          </span>
        </div>
        {signals.institutionalHolders.length === 0 ? (
          <div className="text-[11px] text-[var(--text-muted)]">開示データがありません</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {signals.institutionalHolders.map((h, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="min-w-0 truncate text-[var(--foreground)]">{h.organization}</span>
                <span className="shrink-0 font-mono text-[var(--text-secondary)]">
                  {h.pctHeld != null ? `${h.pctHeld.toFixed(2)}%` : "—"}
                  {h.pctChange != null && (
                    <span style={{ color: h.pctChange >= 0 ? GOOD : DOWN }}> ({h.pctChange >= 0 ? "+" : ""}{h.pctChange.toFixed(1)}%)</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 空売り比率(米国株のみ) */}
      {hasShortInterest && (
        <div>
          <h4 className="mb-2 text-[12.5px] font-extrabold text-[var(--foreground)]">空売り比率</h4>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-secondary)]">
            <span>
              浮動株比率 <span className="font-mono text-[var(--foreground)]">{signals.shortPercentOfFloat != null ? `${signals.shortPercentOfFloat.toFixed(1)}%` : "—"}</span>
            </span>
            <span>
              空売り残高日数 <span className="font-mono text-[var(--foreground)]">{signals.shortRatio != null ? `${signals.shortRatio.toFixed(1)}日` : "—"}</span>
            </span>
            {signals.sharesShort != null && signals.sharesShortPriorMonth != null && (
              <span>
                前月比{" "}
                <span
                  className="font-mono"
                  style={{ color: signals.sharesShort >= signals.sharesShortPriorMonth ? DOWN : GOOD }}
                >
                  {signals.sharesShort >= signals.sharesShortPriorMonth ? "増加" : "減少"}
                </span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* アナリスト格上げ/格下げモメンタム */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-[12.5px] font-extrabold text-[var(--foreground)]">アナリスト格上げ/格下げ(直近90日)</h4>
          <span className="font-mono text-[11px] font-bold">
            <span style={{ color: UP }}>↑{signals.upgrades90d}</span>{" "}
            <span style={{ color: DOWN }}>↓{signals.downgrades90d}</span>
          </span>
        </div>
        {signals.analystActions.length === 0 ? (
          <div className="text-[11px] text-[var(--text-muted)]">データがありません</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {signals.analystActions.slice(0, 5).map((a, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="min-w-0 truncate text-[var(--foreground)]">{a.firm}</span>
                <span
                  className="shrink-0 font-mono"
                  style={{ color: a.action === "up" ? UP : a.action === "down" ? DOWN : "var(--text-secondary)" }}
                >
                  {fmtDate(a.date)} {ACTION_LABEL[a.action] ?? a.action}
                  {a.toGrade && ` → ${a.toGrade}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 決算サプライズ実績 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-[12.5px] font-extrabold text-[var(--foreground)]">決算サプライズ実績</h4>
          {signals.beatStreak >= 2 && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={{ background: "rgba(47,158,92,.12)", color: GOOD }}
            >
              {signals.beatStreak}期連続で予想上回り
            </span>
          )}
        </div>
        {signals.earningsSurprises.length === 0 ? (
          <div className="text-[11px] text-[var(--text-muted)]">データがありません</div>
        ) : (
          <div className="flex h-16 items-end gap-2">
            {signals.earningsSurprises.map((e, i) => {
              const s = e.surprisePercent;
              const heightPct = s == null ? 4 : Math.min(100, Math.max(6, Math.abs(s) * 4));
              return (
                <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[9px] font-mono" style={{ color: s == null ? "var(--text-muted)" : s >= 0 ? UP : DOWN }}>
                    {s != null ? `${s >= 0 ? "+" : ""}${s.toFixed(1)}%` : "—"}
                  </span>
                  <div
                    className="w-full rounded-t"
                    style={{ height: `${heightPct}%`, background: s == null ? "var(--border-subtle)" : s >= 0 ? UP : DOWN }}
                  />
                  <span className="text-[9px] text-[var(--text-muted)]">{fmtDate(e.quarter)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
