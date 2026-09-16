"use client";

import { useEffect, useState } from "react";
import { GlassPageShell } from "../GlassPageShell";
import { GLASS_CARD } from "@/lib/glassStyles";
import { getHistory, type PortfolioSnapshot } from "@/lib/portfolioHistoryStore";
import { loadTradeLog, backfillFromHoldings, type PortfolioTradeEvent } from "@/lib/portfolioTradeLog";
import { loadPortfolio } from "@/lib/portfolioStore";
import { fetchMetricsBatch } from "@/lib/fetchMetricsBatch";
import { PortfolioTradesChart } from "./PortfolioTradesChart";
import { ChevronLeft, TrendingUp } from "lucide-react";

// 「ポートフォリオ」タブの資産推移グラフから遷移する専用の詳細ページ。ナビゲーショングリッドには
// 並べず(stock/settingsタブと同じ位置づけ)、ポートフォリオタブ側のグラフをクリックすると
// ?tab=portfolio-historyへ遷移してここが開く。サイドバーは常に表示されたままなので、
// 他タブへはそちらから移動できるが、分かりやすさのため上部に明示的な「戻る」も置く。
export function PortfolioHistoryTab({ hidden, onBack }: { hidden: boolean; onBack: () => void }) {
  const [history, setHistory] = useState<PortfolioSnapshot[]>([]);
  const [trades, setTrades] = useState<PortfolioTradeEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- タブを開き直すたびに読み込み中表示へ戻す
    setLoading(true);
    Promise.all([getHistory(), loadTradeLog(), loadPortfolio(), fetchMetricsBatch(["JPY=X"])]).then(
      async ([hist, tradeLog, holdings, priceMap]) => {
        if (cancelled) return;
        const usdJpyRate = priceMap.get("JPY=X")?.price ?? 150;
        // このログ導入前から保有していた銘柄はマーカーが出ないため、現在の保有情報から
        // 「買い」イベントを1件だけ遡って補完する(平均取得単価・合計株数の近似)。
        const merged = await backfillFromHoldings(holdings, usdJpyRate);
        if (cancelled) return;
        setHistory(hist);
        setTrades(merged.length > tradeLog.length ? merged : tradeLog);
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [hidden]);

  return (
    <section hidden={hidden} className="h-full">
      <GlassPageShell>
        <button
          onClick={onBack}
          className="mb-3 flex items-center gap-1 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--accent)]"
        >
          <ChevronLeft size={14} strokeWidth={2.5} />
          ポートフォリオに戻る
        </button>

        <div className={`${GLASS_CARD} mb-3 sm:mb-4`}>
          <div className="flex items-center gap-2">
            <TrendingUp size={16} strokeWidth={2.25} className="text-[var(--accent)]" />
            <h2 className="text-[12.5px] font-extrabold text-[var(--foreground)]">資産推移の詳細</h2>
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            総資産(現金+株式、円換算)の推移に、実際の売買タイミングを重ねて表示します。買い(緑の上三角)/売り(金の下三角)をタップ・ホバーすると、その時の銘柄名・単価・(売りは)実現損益が見られます。
          </p>

          <div className="mt-4">
            {loading ? (
              <div className="flex h-[220px] items-center justify-center text-[12.5px] text-[var(--text-secondary)]">読み込み中…</div>
            ) : (
              <PortfolioTradesChart history={history} trades={trades} />
            )}
          </div>
        </div>
      </GlassPageShell>
    </section>
  );
}
