"use client";

import { useEffect, useState } from "react";
import { GlassPageShell } from "../GlassPageShell";
import { StockSearchBar } from "../stock/StockSearchBar";
import { loadWatchlist, saveWatchlist, addToWatchlist, removeFromWatchlist, type WatchlistItem } from "@/lib/watchlistStore";
import { fetchMetricsBatch } from "@/lib/fetchMetricsBatch";
import type { StockMetrics } from "@/lib/stockMetrics";
import { computeOverallScore, MINERVINI_TOTAL, CANSLIM_TOTAL, QUALITY_TOTAL } from "@/lib/dailyPickOverall";
import { GLASS_CARD, GLASS_UP, GLASS_DOWN, GLASS_TEXT2 } from "@/lib/glassStyles";
import { OverallScoreBadge } from "../OverallScoreBadge";
import { Eye } from "lucide-react";

const COMMITTEE_TOTAL = 5; // committeeScore.tsで常に5固定(PM役は参考情報のため合議数に含まない)

function fmt(n: number, currency: string): string {
  const digits = currency === "JPY" ? 0 : 2;
  return n.toLocaleString("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function prefix(currency: string): string {
  return currency === "JPY" ? "¥" : currency === "USD" ? "$" : "";
}

export function WatchlistTab({
  hidden,
  onOpenDetail,
}: {
  hidden: boolean;
  onOpenDetail: (symbol: string, name: string) => void;
}) {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [prices, setPrices] = useState<Map<string, StockMetrics>>(new Map());
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hidden) return; // 他のタブで共有ウォッチリストが変更された後に再訪した時も最新化する
    let cancelled = false;
    loadWatchlist().then((w) => {
      if (cancelled) return;
      setItems(w);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [hidden]);

  useEffect(() => {
    if (!hydrated || items.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 銘柄が無い時の価格マップをリセット
      setPrices(new Map());
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchMetricsBatch(
      items.map((i) => i.ticker),
      { concurrency: 6, scores: true }
    )
      .then((res) => {
        if (!cancelled) setPrices(res);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, items.map((i) => i.ticker).join(",")]);

  function handleAdd(symbol: string, name: string) {
    const next = addToWatchlist(items, symbol, name);
    setItems(next);
    void saveWatchlist(next);
  }

  function handleRemove(ticker: string) {
    const next = removeFromWatchlist(items, ticker);
    setItems(next);
    void saveWatchlist(next);
  }

  return (
    <section hidden={hidden} className="h-full">
      <GlassPageShell>
        <div className={`${GLASS_CARD} mb-4`}>
          <div className="flex items-center gap-2">
            <Eye size={15} strokeWidth={2.25} className="text-[var(--accent)]" />
            <h2 className="text-[12.5px] font-extrabold text-[var(--foreground)]">ウォッチリスト</h2>
          </div>
          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
            保有していないが気になる銘柄を並べて眺めるためのリストです(ポートフォリオとは別で、株数・取得単価は不要)。
          </p>
          <div className="mt-3">
            <StockSearchBar onSelect={handleAdd} />
          </div>
        </div>

        <div className={`${GLASS_CARD} overflow-hidden p-0`}>
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--text-secondary)]">
              まだ銘柄がありません。上の検索から追加してください。
            </div>
          ) : (
            <>
            {/* スマホ幅では横スクロール前提の表ではなく、1銘柄1カードの縦積みリストにする。 */}
            <div className="divide-y divide-[var(--border-faint)] md:hidden">
              {items.map((item) => {
                const m = prices.get(item.ticker);
                const price = m?.price ?? null;
                const up = (m?.dayChangePercent ?? 0) >= 0;
                const currency = m?.currency ?? (item.ticker.endsWith(".T") ? "JPY" : "USD");
                const overall = computeOverallScore({
                  minerviniScore: m?.minerviniScore ?? null,
                  minerviniTotal: MINERVINI_TOTAL,
                  canslimScore: m?.canslimScore ?? null,
                  canslimTotal: CANSLIM_TOTAL,
                  qualityScore: m?.qualityScore ?? null,
                  qualityTotal: m?.qualityTotal ?? QUALITY_TOTAL,
                  committeeAgree: m?.committeeScore ?? null,
                  committeeTotal: m?.committeeTotal ?? COMMITTEE_TOTAL,
                });
                return (
                  <div key={item.ticker} className="flex flex-col gap-1.5 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <button onClick={() => onOpenDetail(item.ticker, item.name)} className="min-w-0 text-left">
                        <div className="truncate font-semibold text-[var(--foreground)] hover:text-[var(--accent)] hover:underline">{item.name}</div>
                        <div className="font-mono text-[11px] text-[var(--text-secondary)]">{item.ticker}</div>
                      </button>
                      <button onClick={() => handleRemove(item.ticker)} className="shrink-0 text-xs text-[var(--text-muted)] hover:text-red-600">
                        削除
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[15px] tabular-nums text-[var(--foreground)]">
                        {loading && price == null ? "…" : price != null ? `${prefix(currency)}${fmt(price, currency)}` : "—"}
                      </span>
                      <span
                        className="text-[15px] tabular-nums font-semibold"
                        style={{ color: m?.dayChangePercent == null ? GLASS_TEXT2 : up ? GLASS_UP : GLASS_DOWN }}
                      >
                        {m?.dayChangePercent != null ? `${up ? "▲" : "▼"} ${m.dayChangePercent.toFixed(2)}%` : "—"}
                      </span>
                      <OverallScoreBadge
                        score={overall.score}
                        grade={overall.grade}
                        breakdown={{
                          minerviniScore: m?.minerviniScore ?? null,
                          canslimScore: m?.canslimScore ?? null,
                          qualityScore: m?.qualityScore ?? null,
                          qualityTotal: m?.qualityTotal ?? QUALITY_TOTAL,
                          committeeAgree: m?.committeeScore ?? null,
                          committeeTotal: m?.committeeTotal ?? COMMITTEE_TOTAL,
                          committeeRoles: m?.committeeRoles,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <table className="hidden w-full text-sm md:table">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--fill-subtle)] text-left text-xs text-[var(--text-secondary)]">
                <tr>
                  <th className="px-4 py-2 font-medium">銘柄</th>
                  <th className="px-3 py-2 text-right font-medium">価格</th>
                  <th className="px-3 py-2 text-right font-medium">前日比</th>
                  <th className="px-3 py-2 text-right font-medium">総合評価</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const m = prices.get(item.ticker);
                  const price = m?.price ?? null;
                  const up = (m?.dayChangePercent ?? 0) >= 0;
                  const currency = m?.currency ?? (item.ticker.endsWith(".T") ? "JPY" : "USD");
                  const overall = computeOverallScore({
                    minerviniScore: m?.minerviniScore ?? null,
                    minerviniTotal: MINERVINI_TOTAL,
                    canslimScore: m?.canslimScore ?? null,
                    canslimTotal: CANSLIM_TOTAL,
                    qualityScore: m?.qualityScore ?? null,
                    qualityTotal: m?.qualityTotal ?? QUALITY_TOTAL,
                    committeeAgree: m?.committeeScore ?? null,
                    committeeTotal: m?.committeeTotal ?? COMMITTEE_TOTAL,
                  });
                  return (
                    <tr key={item.ticker} className="border-b border-[var(--border-faint)] last:border-0">
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => onOpenDetail(item.ticker, item.name)}
                          className="text-left font-semibold text-[var(--foreground)] hover:text-[var(--accent)] hover:underline"
                        >
                          {item.name}
                        </button>
                        <div className="font-mono text-xs text-[var(--text-secondary)]">{item.ticker}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-[15px] tabular-nums text-[var(--foreground)]">
                        {loading && price == null ? "…" : price != null ? `${prefix(currency)}${fmt(price, currency)}` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[15px] tabular-nums font-semibold" style={{ color: m?.dayChangePercent == null ? GLASS_TEXT2 : up ? GLASS_UP : GLASS_DOWN }}>
                        {m?.dayChangePercent != null ? `${up ? "▲" : "▼"} ${m.dayChangePercent.toFixed(2)}%` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <OverallScoreBadge
                          score={overall.score}
                          grade={overall.grade}
                          breakdown={{
                            minerviniScore: m?.minerviniScore ?? null,
                            canslimScore: m?.canslimScore ?? null,
                            qualityScore: m?.qualityScore ?? null,
                            qualityTotal: m?.qualityTotal ?? QUALITY_TOTAL,
                            committeeAgree: m?.committeeScore ?? null,
                            committeeTotal: m?.committeeTotal ?? COMMITTEE_TOTAL,
                            committeeRoles: m?.committeeRoles,
                          }}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => handleRemove(item.ticker)} className="text-xs text-[var(--text-muted)] hover:text-red-600">
                          削除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </>
          )}
        </div>
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          ウォッチリストはこの端末に保存されます(Upstash設定時は端末間で同期)。スコアは銘柄詳細ページと同じ計算です。
        </p>
      </GlassPageShell>
    </section>
  );
}
