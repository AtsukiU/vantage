"use client";

import { useEffect, useState } from "react";
import type { StockMetrics } from "@/lib/stockMetrics";
import { isFinancialSector } from "@/lib/stockMetricsShared";
import type { PricePoint, ChartRange } from "@/lib/stockChart";
import type { StockInsight } from "@/lib/stockInsights";
import type { GaugeSpec } from "@/lib/stockGauges";
import type { HorizonEntry } from "@/lib/stockHorizonAnalysis";
import type { TechnicalAnalysis } from "@/lib/stockTechnicals";
import type { FinancialYear } from "@/lib/stockFinancials";
import type { StockSignals } from "@/lib/stockSignals";
import type { ScoreResult } from "@/lib/checklistTypes";
import type { PeerComparison } from "@/lib/stockPeers";
import type { NewsItem } from "@/lib/news";
import { relativeTimeJa } from "@/lib/format";
import { Gift, ExternalLink } from "lucide-react";
import { RingGauge } from "./RingGauge";
import { PriceChart } from "./PriceChart";
import { FinancialTrendChart } from "./FinancialTrendChart";
import { ChecklistScoreCard } from "./ChecklistScoreCard";
import { InvestorSignalsSection } from "./InvestorSignalsSection";
import { PositionSizeCalculator } from "./PositionSizeCalculator";
import { PeerComparisonSection } from "./PeerComparisonSection";
import { CommitteeVerdictCard } from "./CommitteeVerdictCard";
import { computeCommitteeVerdict } from "@/lib/committeeScore";
import { computePmRoleScore, buildHoldingSnapshots } from "@/lib/pmRoleScore";
import { loadPortfolio } from "@/lib/portfolioStore";
import { fetchMetricsBatch } from "@/lib/fetchMetricsBatch";
import { computeUsForecast } from "@/lib/stockForecast";
import { UsForecastCard } from "./UsForecastCard";
import { buildPickSummary } from "@/lib/stockPickSummary";
import { translateUnique } from "@/lib/translateClient";
import { WatchlistToggleButton } from "./WatchlistToggleButton";
import { AddToPortfolioForm } from "./AddToPortfolioForm";

interface DetailResponse {
  metrics: StockMetrics;
  priceHistory: PricePoint[];
  insights: StockInsight;
  gauges: GaugeSpec[];
  horizons: HorizonEntry[];
  technicals: TechnicalAnalysis;
  financialTrend: FinancialYear[];
  signals: StockSignals;
  minervini: ScoreResult | null;
  canslim: ScoreResult | null;
  qualityScore: ScoreResult | null;
  peers: PeerComparison[];
  fundamentalRole: ScoreResult | null;
  sentimentRole: ScoreResult | null;
  macroRole: ScoreResult | null;
  marginOfSafetyRatio: number | null;
  relativeStrengthPct: number | null;
}

// 以前はbg-white/85で固定していたが、ダークモード導入に伴い他タブと同じ
// var(--card-bg)系(テーマ・明暗モードで自動追従)に統一。
const CARD = "rounded-[18px] border border-[var(--card-border)] bg-[var(--card-bg)] backdrop-blur-[var(--card-blur)] p-5";

const RECOMMENDATION_LABEL: Record<string, string> = {
  strong_buy: "強気買い",
  buy: "買い",
  hold: "中立",
  underperform: "弱気",
  sell: "売り",
  strong_sell: "強気売り",
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function StockDetailView({
  symbol,
  name,
  onOpenDetail,
  buyReason,
  onBuyReasonConsumed,
}: {
  symbol: string;
  name: string;
  onOpenDetail?: (symbol: string, name: string) => void;
  buyReason?: string | null;
  onBuyReasonConsumed?: () => void;
}) {
  const [range, setRange] = useState<ChartRange>("1y");
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);

  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- symbol/range変更時の再取得開始を明示
    setDetailLoading(true);
    setDetailError(null);

    fetch(`/api/stock/${encodeURIComponent(symbol)}?range=${range}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "銘柄データの取得に失敗しました");
        if (!cancelled) setDetail(json as DetailResponse);
      })
      .catch((e) => {
        if (!cancelled) setDetailError(e instanceof Error ? e.message : "銘柄データの取得に失敗しました");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, range]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- symbol変更時の再取得開始を明示
    setNewsLoading(true);

    fetch(`/api/stock/${encodeURIComponent(symbol)}/news?name=${encodeURIComponent(name)}`, {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setNews(json.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setNews([]);
      })
      .finally(() => {
        if (!cancelled) setNewsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, name]);

  // 米国株の事業内容説明(longBusinessSummary)は英語のため、日本語訳を用意できたら
  // それを使う(未対応・翻訳失敗時は原文のまま)。銘柄名など固有名詞は無理に訳さない前提。
  const [translatedSummary, setTranslatedSummary] = useState<string | null>(null);
  useEffect(() => {
    const summary = detail?.metrics.longBusinessSummary;
    const isUs = !!detail && !symbol.endsWith(".T");
    if (!summary || !isUs) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 銘柄切替時に前の訳文を残さないためのリセット
      setTranslatedSummary(null);
      return;
    }
    let cancelled = false;
    translateUnique([summary]).then((map) => {
      if (!cancelled) setTranslatedSummary(map.get(summary) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [detail, symbol]);

  // PM役(ポートフォリオマネージャー)は保有中の他銘柄との集中リスクを見るため、
  // ブラウザのlocalStorageの保有データが必要。サーバー側では計算できないためここで行う。
  const [pmRole, setPmRole] = useState<ScoreResult | null>(null);
  useEffect(() => {
    if (!detail) return;
    let cancelled = false;
    (async () => {
      const holdings = await loadPortfolio();
      if (holdings.length === 0) {
        const result = computePmRoleScore([], detail.metrics.ticker, detail.metrics.sector, detail.metrics.currency);
        if (!cancelled) setPmRole(result);
        return;
      }
      const uniqueTickers = Array.from(new Set([...holdings.map((h) => h.ticker), "JPY=X"]));
      const priceMap = await fetchMetricsBatch(uniqueTickers, { concurrency: 6 });
      const rate = priceMap.get("JPY=X")?.price ?? 150;
      const priceByTicker = new Map(
        holdings.map((h) => {
          const m = priceMap.get(h.ticker);
          return [h.ticker, { price: m?.price ?? null, sector: m?.sector ?? null }] as const;
        })
      );
      const snapshots = buildHoldingSnapshots(holdings, priceByTicker, rate);
      const result = computePmRoleScore(snapshots, detail.metrics.ticker, detail.metrics.sector, detail.metrics.currency);
      if (!cancelled) setPmRole(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [detail]);

  if (detailLoading && !detail) {
    return <div className="py-16 text-center text-sm text-[var(--text-secondary)]">読み込み中…</div>;
  }
  if (detailError) {
    return (
      <div className={`${CARD} text-[12.5px] text-[var(--price-up)]`}>
        {detailError}
      </div>
    );
  }
  if (!detail) return null;

  const {
    metrics,
    priceHistory,
    insights,
    horizons,
    gauges,
    technicals,
    financialTrend,
    signals,
    minervini,
    canslim,
    qualityScore,
    peers,
    fundamentalRole,
    sentimentRole,
    macroRole,
    marginOfSafetyRatio,
    relativeStrengthPct,
  } = detail;

  const committee =
    fundamentalRole && minervini && sentimentRole && macroRole
      ? computeCommitteeVerdict(fundamentalRole, minervini, sentimentRole, marginOfSafetyRatio, macroRole, pmRole ?? undefined)
      : null;
  const isUp = (metrics.dayChangePercent ?? 0) >= 0;
  const currencyPrefix = metrics.currency === "JPY" ? "¥" : metrics.currency === "USD" ? "$" : "";
  // コモディティ先物・為替などは株式向けの財務指標(PER/PBR/ROEなど)が存在しないため、
  // 主要指標(ゲージ)とファンダメンタル分析は株式(EQUITY)のときだけ表示する。
  // テクニカル分析は価格ベースなのでどの資産種別でも意味を持つため常に表示する。
  const isEquity = metrics.quoteType === "EQUITY";
  const isJpEquity = isEquity && symbol.endsWith(".T");
  const isUsEquity = isEquity && !isJpEquity;
  // 価格ベースのミネルヴィニ7条件だけのスコア(委員会等で使う8条件版から相対力条件を除いたもの)。
  // 予測モデルの較正データがRS軸と価格トレンド軸を別々に集計しているため、二重評価を避けるために分離する。
  const priceOnlyMomentumScore =
    minervini != null ? minervini.passCount - (relativeStrengthPct != null && relativeStrengthPct > 0 ? 1 : 0) : null;
  const usForecast =
    isUsEquity && priceOnlyMomentumScore != null ? computeUsForecast(priceOnlyMomentumScore, relativeStrengthPct) : null;
  const pickSummary = isEquity
    ? buildPickSummary({ minervini, canslim, qualityScore, committee, relativeStrengthPct })
    : null;
  const businessSummaryShort =
    metrics.longBusinessSummary != null
      ? metrics.longBusinessSummary.length > 90
        ? `${metrics.longBusinessSummary.slice(0, 90)}…`
        : metrics.longBusinessSummary
      : null;
  const assetTypeLabel: Record<string, string> = {
    ETF: "ETF",
    FUTURE: "コモディティ先物",
    CURRENCY: "為替",
    CRYPTOCURRENCY: "暗号資産",
    INDEX: "指数",
  };

  const yutaiSearchUrl = isJpEquity
    ? `https://www.google.com/search?q=${encodeURIComponent(`${metrics.name ?? symbol} 株主優待`)}`
    : null;

  const fmtAmount = (n: number | null) =>
    n == null ? "—" : `${currencyPrefix}${n.toLocaleString("ja-JP", { maximumFractionDigits: metrics.currency === "JPY" ? 0 : 2 })}`;

  return (
    <div>
      {/* header */}
      <div className={`${CARD} mb-4`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-[var(--foreground)]">{metrics.name ?? symbol}</h2>
            <div className="font-mono text-[12.5px] text-[var(--text-secondary)]">
              {metrics.ticker}
              {metrics.sector ? ` ・ ${metrics.sector}` : ""}
            </div>
            {businessSummaryShort && (
              <p className="mt-1 max-w-md text-[11px] leading-relaxed text-[var(--text-secondary)]">{translatedSummary ?? businessSummaryShort}</p>
            )}
            {pickSummary && (
              <p className="mt-0.5 max-w-md text-[11px] font-semibold text-[var(--accent)]">{pickSummary}</p>
            )}
          </div>
          <div className="flex items-end gap-3">
            <div className="text-right">
              <div className="font-mono text-3xl font-extrabold tabular-nums text-[var(--foreground)]">
                {metrics.price != null
                  ? `${currencyPrefix}${metrics.price.toLocaleString("ja-JP", {
                      minimumFractionDigits: metrics.currency === "JPY" ? 0 : 2,
                      maximumFractionDigits: metrics.currency === "JPY" ? 0 : 2,
                    })}`
                  : "—"}
              </div>
              {metrics.dayChangePercent != null && (
                <div
                  className="text-[12.5px] font-bold tabular-nums"
                  style={{ color: isUp ? "var(--price-up)" : "var(--price-down)" }}
                >
                  {isUp ? "▲" : "▼"} {metrics.dayChangePercent.toFixed(2)}%
                </div>
              )}
            </div>
            <WatchlistToggleButton symbol={symbol} name={metrics.name ?? symbol} />
          </div>
        </div>

        <div className="mt-3">
          <AddToPortfolioForm
            symbol={symbol}
            name={metrics.name ?? symbol}
            currentPrice={metrics.price}
            currency={metrics.currency}
            buyReason={buyReason}
            onBought={onBuyReasonConsumed}
          />
        </div>

        {/* quick facts strip */}
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-[var(--border-subtle)] pt-3 text-[11px] text-[var(--text-secondary)]">
          {(technicals.week52High != null || technicals.week52Low != null) && (
            <span>
              52週高値/安値{" "}
              <span className="font-mono text-[var(--foreground)]">
                {fmtAmount(technicals.week52High)} / {fmtAmount(technicals.week52Low)}
              </span>
            </span>
          )}
          {metrics.targetMeanPrice != null && (
            <span>
              アナリスト目標株価{" "}
              <span className="font-mono text-[var(--foreground)]">{fmtAmount(metrics.targetMeanPrice)}</span>
              {metrics.targetLowPrice != null && metrics.targetHighPrice != null && (
                <span className="font-mono text-[var(--text-muted)]">
                  {" "}
                  ({fmtAmount(metrics.targetLowPrice)}〜{fmtAmount(metrics.targetHighPrice)}
                  {metrics.numberOfAnalystOpinions != null ? `・${metrics.numberOfAnalystOpinions}名` : ""})
                </span>
              )}
              {metrics.recommendationKey && (
                <span className="ml-1 text-[var(--accent)]">
                  ({RECOMMENDATION_LABEL[metrics.recommendationKey] ?? metrics.recommendationKey})
                </span>
              )}
            </span>
          )}
          {metrics.grahamNumber != null && (
            <span>
              グレアムナンバー{" "}
              <span className="font-mono text-[var(--foreground)]">{fmtAmount(metrics.grahamNumber)}</span>
              {metrics.price != null && (
                <span className="ml-1" style={{ color: metrics.price <= metrics.grahamNumber ? "var(--status-good)" : "var(--text-muted)" }}>
                  ({metrics.price <= metrics.grahamNumber ? "現在値以下" : "現在値超"})
                </span>
              )}
            </span>
          )}
          {metrics.earningsDate && (
            <span>
              次回決算 <span className="font-mono text-[var(--foreground)]">{formatDate(metrics.earningsDate)}予定</span>
            </span>
          )}
          {metrics.exDividendDate && (
            <span>
              権利落ち日 <span className="font-mono text-[var(--foreground)]">{formatDate(metrics.exDividendDate)}</span>
            </span>
          )}
          {yutaiSearchUrl && (
            <a
              href={yutaiSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
            >
              <Gift size={12} strokeWidth={2.25} />
              株主優待を調べる
              <ExternalLink size={11} strokeWidth={2.25} />
            </a>
          )}
        </div>
      </div>

      {isEquity && committee && fundamentalRole && sentimentRole && macroRole && minervini && (
        <div className={`${CARD} mb-4`}>
          <h3 className="mb-3 text-[12.5px] font-extrabold text-[var(--foreground)]">投資委員会</h3>
          <CommitteeVerdictCard
            metrics={metrics}
            technicals={technicals}
            signals={signals}
            minervini={minervini}
            fundamentalRole={fundamentalRole}
            sentimentRole={sentimentRole}
            macroRole={macroRole}
            committee={committee}
            marginOfSafetyRatio={marginOfSafetyRatio}
          />
        </div>
      )}

      <div className="grid items-start gap-4 md:grid-cols-[1fr_320px]">
        <div className="min-w-0 flex flex-col gap-4">
          <div className={CARD}>
            <PriceChart points={priceHistory} range={range} onRangeChange={setRange} />
          </div>

          <div className={CARD}>
            <h3 className="mb-3 text-[12.5px] font-extrabold text-[var(--foreground)]">テクニカル分析</h3>
            <div>
              {horizons.map((h, i) => (
                <div
                  key={h.horizon}
                  className={`flex gap-3.5 py-2.5 ${i === 0 ? "pt-0" : ""} ${
                    i === horizons.length - 1 ? "pb-0" : "border-b border-[var(--border-subtle)]"
                  }`}
                >
                  <div className="w-14 shrink-0 pt-px">
                    <span className="inline-block rounded-full bg-[var(--accent)]/10 px-2.5 py-0.5 text-[11px] font-extrabold text-[var(--text-secondary)]">
                      {h.horizon}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className="mb-0.5 text-[12.5px] font-extrabold"
                      style={{ color: h.good ? "var(--status-good)" : "var(--foreground)" }}
                    >
                      {h.verdict}
                    </div>
                    <div className="text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{h.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={CARD}>
            <h3 className="mb-3 text-[12.5px] font-extrabold text-[var(--foreground)]">ポジションサイジング計算機</h3>
            <PositionSizeCalculator currentPrice={metrics.price} currency={metrics.currency} />
          </div>

          {isEquity && minervini && (
            <div className={CARD}>
              <ChecklistScoreCard
                title="ミネルヴィニ・トレンドテンプレート"
                score={minervini}
                caveat="マーク・ミネルヴィニ氏のトレンドテンプレートを参考にした簡易判定です。相対力(RS)は本来のIBD式レーティングではなく、ベンチマーク指数との6ヶ月騰落率差で代用しています。"
              />
            </div>
          )}

          {usForecast && (
            <div className={CARD}>
              <UsForecastCard forecast={usForecast} />
            </div>
          )}

          {isEquity && canslim && (
            <div className={CARD}>
              <ChecklistScoreCard
                title="CANSLIMチェックリスト"
                score={canslim}
                caveat="ウィリアム・オニール氏のCANSLIMを参考にした簡易判定です。C(四半期利益)は取得できる利益成長率で代用するなど、本来の定義とは一部異なります。"
              />
            </div>
          )}

          {isEquity && qualityScore && (
            <div className={CARD}>
              <ChecklistScoreCard
                title="財務健全性スコア"
                score={qualityScore}
                caveat={
                  isFinancialSector(metrics.sector)
                    ? "ピオトロスキーのFスコアに着想を得た簡易スコアです。正式な算出方法(総資産回転率や株式希薄化など)とは異なる簡略版です。銀行・金融株は自己資本比率が業態上構造的に低いため、この銘柄では自己資本比率の基準を判定から除外しています(満点は8点)。"
                    : "ピオトロスキーのFスコアに着想を得た簡易スコアです。正式な算出方法(総資産回転率や株式希薄化など)とは異なる簡略版です。"
                }
              />
            </div>
          )}

          {isEquity && (
            <div className={CARD}>
              <h3 className="mb-3 text-[12.5px] font-extrabold text-[var(--foreground)]">業績推移(直近5期)</h3>
              <FinancialTrendChart data={financialTrend} currency={metrics.currency} />
            </div>
          )}

          {isEquity && (
            <div className={CARD}>
              <h3 className="mb-3 text-[12.5px] font-extrabold text-[var(--foreground)]">他の投資家が見ている指標</h3>
              <InvestorSignalsSection signals={signals} />
            </div>
          )}

          {isEquity && (
            <div className={CARD}>
              <h3 className="mb-3 text-[12.5px] font-extrabold text-[var(--foreground)]">類似銘柄との比較</h3>
              <PeerComparisonSection
                peers={peers}
                baseMetrics={{ per: metrics.per, pbr: metrics.pbr, roe: metrics.roe, dividendYield: metrics.dividendYield }}
                onOpenDetail={onOpenDetail ?? (() => {})}
              />
            </div>
          )}

          {isEquity ? (
            <div className={CARD}>
              <h3 className="mb-3 text-[12.5px] font-extrabold text-[var(--foreground)]">ファンダメンタル分析</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="mb-2 text-[12.5px] font-extrabold text-[var(--price-up)]">良い点</div>
                  <ul className="space-y-1 text-[12.5px] leading-relaxed text-[var(--foreground)]">
                    {insights.strengths.length === 0 && (
                      <li className="text-[var(--text-secondary)]">特筆すべき点はありません</li>
                    )}
                    {insights.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="mb-2 text-[12.5px] font-extrabold text-[var(--price-down)]">懸念点</div>
                  <ul className="space-y-1 text-[12.5px] leading-relaxed text-[var(--foreground)]">
                    {insights.concerns.length === 0 && (
                      <li className="text-[var(--text-secondary)]">特筆すべき点はありません</li>
                    )}
                    {insights.concerns.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className={`${CARD} text-[12.5px] text-[var(--text-secondary)]`}>
              {assetTypeLabel[metrics.quoteType ?? ""] ?? "この銘柄"}には株式のような財務指標(PER/PBR/ROEなど)がないため、ファンダメンタル分析は表示していません。価格の推移とテクニカル分析でご確認ください。
            </div>
          )}
        </div>

        <div className="min-w-0 flex flex-col gap-4">
          {isEquity && (
            <div className={CARD}>
              <h3 className="mb-3 text-[12.5px] font-extrabold text-[var(--foreground)]">主要指標</h3>
              <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                {gauges.map((g) => (
                  <RingGauge
                    key={g.key}
                    percent={g.score}
                    label={g.label}
                    valueText={g.valueText}
                    benchmarkText={g.benchmarkText}
                    tooltip={g.tooltip}
                    good={g.good}
                  />
                ))}
              </div>
            </div>
          )}

          <div className={CARD}>
            <h3 className="mb-3 text-[12.5px] font-extrabold text-[var(--foreground)]">関連ニュース</h3>
            {newsLoading && <div className="text-[12.5px] text-[var(--text-secondary)]">読み込み中…</div>}
            {!newsLoading && news.length === 0 && (
              <div className="text-[12.5px] text-[var(--text-secondary)]">関連ニュースが見つかりませんでした</div>
            )}
            <div>
              {news.slice(0, 6).map((item, i, arr) => (
                <a
                  key={item.link}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block py-2.5 ${i === 0 ? "pt-0" : ""} ${
                    i === arr.length - 1 ? "pb-0" : "border-b border-black/[0.06]"
                  }`}
                >
                  <div className="mb-1 text-[11px] text-[var(--text-secondary)]">
                    {item.source} ・ {relativeTimeJa(item.pubDate)}
                  </div>
                  <div className="text-[12.5px] font-bold leading-snug text-[var(--foreground)]">{item.title}</div>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
