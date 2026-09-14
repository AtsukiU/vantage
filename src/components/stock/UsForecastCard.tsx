"use client";

import type { UsForecast } from "@/lib/stockForecast";
import { TrendingUp } from "lucide-react";

const GOOD = "var(--status-good)";
const BAD = "var(--price-up)";

// 米国株限定の「1ヶ月先の株価傾向」カード。機械学習の将来予測ではなく、S&P500の過去データから
// 「似た状況だった時に実際どうなったか」を集計したヒストリカルベースレートを表示するだけ
// (computeUsForecastの結果をそのまま出す)。投資助言ではない旨を必ず明示する。
export function UsForecastCard({ forecast }: { forecast: UsForecast }) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <TrendingUp size={14} strokeWidth={2.25} className="text-[var(--accent)]" />
        <h3 className="text-[12.5px] font-extrabold text-[var(--foreground)]">1ヶ月先の株価傾向(過去データ参考値)</h3>
      </div>
      <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
        現在の状況({forecast.momentumLabel} × {forecast.rsLabel})と同じ条件だった過去の事例
        <span className="font-bold text-[var(--foreground)]"> {forecast.sampleSize.toLocaleString("ja-JP")}件</span>
        (S&P500構成銘柄、{forecast.generatedFrom.start}〜{forecast.generatedFrom.end})で、
        {forecast.forwardTradingDays}営業日後に実際どうなっていたかの統計です。
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg bg-[var(--fill-pill)] px-2.5 py-2 text-center">
          <div className="text-[11px] text-[var(--text-secondary)]">上昇していた割合</div>
          <div className="mt-0.5 text-[15px] font-extrabold" style={{ color: forecast.winRatePct >= 50 ? GOOD : BAD }}>
            {forecast.winRatePct.toFixed(1)}%
          </div>
        </div>
        <div className="rounded-lg bg-[var(--fill-pill)] px-2.5 py-2 text-center">
          <div className="text-[11px] text-[var(--text-secondary)]">平均リターン</div>
          <div className="mt-0.5 text-[15px] font-extrabold" style={{ color: forecast.meanReturnPct >= 0 ? GOOD : BAD }}>
            {forecast.meanReturnPct >= 0 ? "+" : ""}
            {forecast.meanReturnPct.toFixed(1)}%
          </div>
        </div>
        <div className="rounded-lg bg-[var(--fill-pill)] px-2.5 py-2 text-center">
          <div className="text-[11px] text-[var(--text-secondary)]">中央値</div>
          <div className="mt-0.5 text-[15px] font-extrabold" style={{ color: forecast.medianReturnPct >= 0 ? GOOD : BAD }}>
            {forecast.medianReturnPct >= 0 ? "+" : ""}
            {forecast.medianReturnPct.toFixed(1)}%
          </div>
        </div>
        <div className="rounded-lg bg-[var(--fill-pill)] px-2.5 py-2 text-center">
          <div className="text-[11px] text-[var(--text-secondary)]">上下10-90%レンジ</div>
          <div className="mt-0.5 text-[12.5px] font-bold text-[var(--foreground)]">
            {forecast.p10ReturnPct.toFixed(1)}〜{forecast.p90ReturnPct.toFixed(1)}%
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
        機械学習による将来予測ではなく、過去の統計的な傾向(ヒストリカルベースレート)です。集計期間(2017〜2026年)は米国株が全体的に上昇した期間のため、どのバケットも平均的にプラスに寄っている点に注意してください。個別銘柄の将来の値動きを保証するものではなく、投資助言でもありません。
      </p>
    </div>
  );
}
