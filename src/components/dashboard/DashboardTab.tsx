"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { GlassPageShell } from "../GlassPageShell";
import { OverallScoreBadge } from "../OverallScoreBadge";
import { PortfolioValueChart } from "../portfolio/PortfolioValueChart";
import { loadPortfolio, loadCashJpy, type Holding } from "@/lib/portfolioStore";
import { getHistory, type PortfolioSnapshot } from "@/lib/portfolioHistoryStore";
import { fetchMetricsBatch } from "@/lib/fetchMetricsBatch";
import type { StockMetrics } from "@/lib/stockMetrics";
import type { DailyScreenState, DailyScreenEntry, ScreenMarket } from "@/lib/dailyScreenStore";
import { computeOverallScore } from "@/lib/dailyPickOverall";
import { computePortfolioAdvice } from "@/lib/portfolioAdvice";
import { computePortfolioHealth } from "@/lib/portfolioHealth";
import type { NewsItem } from "@/lib/news";
import type { Quote } from "@/lib/quotes";
import type { FxOutlook } from "@/lib/fxOutlook";
import { GLASS_CARD, GLASS_UP, GLASS_DOWN, GLASS_ACCENT, GLASS_EXCELLENT } from "@/lib/glassStyles";
import { Wallet, TrendingUp, Star, ChevronRight, AlertTriangle, Landmark, Newspaper, ArrowLeftRight } from "lucide-react";

type NavTab = "news" | "dailypicks" | "personas" | "portfolio";

function CardHeader({
  icon: Icon,
  iconColor,
  title,
  onNavigate,
}: {
  icon: LucideIcon;
  iconColor: string;
  title: string;
  onNavigate?: () => void;
}) {
  const content = (
    <>
      <Icon size={14} strokeWidth={2.25} style={{ color: iconColor }} />
      <h3 className="flex-1 text-[13px] font-extrabold text-[#1c1b18]">{title}</h3>
      {onNavigate && <ChevronRight size={14} strokeWidth={2.5} className="text-[#a39d8c]" />}
    </>
  );
  if (!onNavigate) {
    return <div className="flex shrink-0 items-center gap-2 px-2 pb-0.5 pt-2">{content}</div>;
  }
  return (
    <button onClick={onNavigate} className="flex shrink-0 items-center gap-2 rounded-t-[18px] px-2 pb-0.5 pt-2 text-left transition hover:bg-[#f9f6ee]">
      {content}
    </button>
  );
}

function StatInline({
  value,
  valueColor,
  label,
  onClick,
}: {
  value: string;
  valueColor?: string;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className="rounded-lg px-1 py-0.5 text-left transition hover:bg-white/60">
      <div className="truncate text-[17px] font-bold tabular-nums leading-tight" style={{ color: valueColor ?? "#1c1b18" }}>
        {value}
      </div>
      <div className="truncate text-[10.5px] text-[#6c6656]">{label}</div>
    </button>
  );
}

function MiniStatCard({
  icon: Icon,
  iconColor,
  value,
  valueColor,
  label,
  onClick,
}: {
  icon: LucideIcon;
  iconColor: string;
  value: string;
  valueColor?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={`${GLASS_CARD} flex min-w-0 flex-col gap-1 p-2 text-left transition hover:brightness-[0.98]`}>
      <Icon size={15} strokeWidth={2.25} style={{ color: iconColor }} />
      <div className="truncate text-[20px] font-bold tabular-nums" style={{ color: valueColor ?? "#1c1b18" }}>
        {value}
      </div>
      <div className="truncate text-[10px] text-[#6c6656]">{label}</div>
    </button>
  );
}

function AllocationBarRow({
  label,
  segments,
}: {
  label: string;
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const positive = segments.filter((s) => s.value > 0);
  return (
    <div>
      <div className="mb-1.5 text-[10.5px] font-semibold text-[#6c6656]">{label}</div>
      {total <= 0 || positive.length === 0 ? (
        <div className="text-[10.5px] text-[#a39d8c]">データがありません</div>
      ) : (
        <>
          <div className="flex h-2 overflow-hidden rounded-full bg-[#efece0]">
            {positive.map((s) => (
              <div key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {positive.map((s) => (
              <span key={s.label} className="text-[11px] text-[#1c1b18]">
                {s.label} <span className="text-[#6c6656]">{((s.value / total) * 100).toFixed(0)}%</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("ja-JP");
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "こんばんは";
  if (h < 11) return "おはようございます";
  if (h < 17) return "こんにちは";
  return "こんばんは";
}

function todayLabel(): string {
  return new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
}

interface TopPick extends DailyScreenEntry {
  overallScore: number;
  overallGrade: string;
  market: ScreenMarket;
}

export function DashboardTab({
  hidden,
  onOpenDetail,
  onNavigateTab,
  refreshSignal,
}: {
  hidden: boolean;
  onOpenDetail: (symbol: string, name: string) => void;
  onNavigateTab: (tab: NavTab) => void;
  refreshSignal: number;
}) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [cashJpy, setCashJpy] = useState(0);
  const [prices, setPrices] = useState<Map<string, StockMetrics>>(new Map());
  const [history, setHistory] = useState<PortfolioSnapshot[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [topPicks, setTopPicks] = useState<TopPick[]>([]);
  const [pickMarket, setPickMarket] = useState<"all" | ScreenMarket>("all");
  const [dailyPool, setDailyPool] = useState<DailyScreenEntry[]>([]);
  const [fx, setFx] = useState<FxOutlook | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);

  useEffect(() => {
    if (hidden) return;
    let cancelled = false;

    async function load() {
      const [h, cash, hist, quotesRes, jpScan, usScan, fxRes, newsRes] = await Promise.all([
        loadPortfolio(),
        loadCashJpy(),
        getHistory(),
        fetch("/api/quotes", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ quotes: [] })),
        fetch("/api/daily-screen/status?market=jp", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/daily-screen/status?market=us", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/fx-outlook", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/news?market=jp", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ items: [] })),
      ]);
      if (cancelled) return;

      setHoldings(h);
      setCashJpy(cash);
      setHistory(hist);
      setQuotes(Array.isArray(quotesRes.quotes) ? quotesRes.quotes : []);
      setFx(fxRes);
      setNews(Array.isArray(newsRes.items) ? newsRes.items.slice(0, 4) : []);

      const pool: DailyScreenEntry[] = [];
      const picks: TopPick[] = [];
      for (const [market, scan] of [["jp", jpScan] as const, ["us", usScan] as const]) {
        const state = scan as DailyScreenState | null;
        if (state?.status === "done") {
          pool.push(...state.results);
          for (const e of state.results) {
            const { score, grade } = computeOverallScore(e);
            picks.push({ ...e, overallScore: score, overallGrade: grade, market });
          }
        }
      }
      picks.sort((a, b) => b.overallScore - a.overallScore);
      setTopPicks(picks.slice(0, 30));
      setDailyPool(pool);

      if (h.length > 0) {
        const priceMap = await fetchMetricsBatch([...h.map((x) => x.ticker), "JPY=X"], { concurrency: 6 });
        if (!cancelled) setPrices(priceMap);
      } else {
        setPrices(new Map());
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [hidden, refreshSignal]);

  const rate = prices.get("JPY=X")?.price ?? quotes.find((q) => q.symbol === "JPY=X")?.price ?? 150;
  const toJpy = (amount: number, currency: string) => (currency === "JPY" ? amount : amount * rate);

  let totalValueJpy = 0;
  const sectorTotalsJpy: Record<string, number> = {};
  const currencyTotalsJpy: Record<string, number> = {};
  for (const h of holdings) {
    const m = prices.get(h.ticker);
    const price = m?.price ?? h.avgCost;
    const valueJpy = toJpy(price * h.shares, h.currency);
    totalValueJpy += valueJpy;
    const sector = m?.sector ?? "その他";
    sectorTotalsJpy[sector] = (sectorTotalsJpy[sector] ?? 0) + valueJpy;
    currencyTotalsJpy[h.currency] = (currencyTotalsJpy[h.currency] ?? 0) + valueJpy;
  }
  const sectorBreakdown = Object.entries(sectorTotalsJpy).map(([sector, value]) => ({
    sector,
    pct: totalValueJpy > 0 ? (value / totalValueJpy) * 100 : 0,
  }));
  const currencyBreakdown = Object.entries(currencyTotalsJpy).map(([currency, value]) => ({
    currency,
    pct: totalValueJpy > 0 ? (value / totalValueJpy) * 100 : 0,
  }));
  const positionBreakdown = holdings.map((h) => {
    const m = prices.get(h.ticker);
    const price = m?.price ?? h.avgCost;
    const valueJpy = toJpy(price * h.shares, h.currency);
    return { name: h.name, pct: totalValueJpy > 0 ? (valueJpy / totalValueJpy) * 100 : 0 };
  });
  const health = computePortfolioHealth(totalValueJpy, cashJpy, sectorBreakdown, currencyBreakdown, positionBreakdown);
  const healthAlerts = (health?.items ?? []).filter((i) => i.level !== "good");

  const priceByTicker = new Map(holdings.map((h) => [h.ticker, { price: prices.get(h.ticker)?.price ?? null, currency: prices.get(h.ticker)?.currency ?? null }]));
  const advice = dailyPool.length > 0 ? computePortfolioAdvice(dailyPool, holdings, priceByTicker, rate, cashJpy).advice : [];
  const managerAdvice = advice.find((a) => a.personaId === "manager");
  const buyCount = managerAdvice?.buys.length ?? 0;
  const sellCount = managerAdvice?.sells.length ?? 0;

  let totalPlJpy = 0;
  for (const h of holdings) {
    const m = prices.get(h.ticker);
    const price = m?.price ?? h.avgCost;
    totalPlJpy += toJpy((price - h.avgCost) * h.shares, h.currency);
  }
  const nikkei = quotes.find((q) => q.label === "日経平均");
  const sp500 = quotes.find((q) => q.label === "S&P500");
  const SECTOR_COLORS = [GLASS_ACCENT, "#2f6fb0", "#8f6ea3", GLASS_EXCELLENT, "#3f8f8f", "#d9662c"];
  const sectorSegments = sectorBreakdown
    .slice()
    .sort((a, b) => b.pct - a.pct)
    .map((s, i) => ({ label: s.sector, value: s.pct, color: SECTOR_COLORS[i % SECTOR_COLORS.length] }));

  return (
    <section hidden={hidden} className="h-full">
      <GlassPageShell maxWidth="max-w-7xl" fitViewport>
        <div
          className="mb-1.5 flex min-h-0 shrink-0 flex-col gap-3 rounded-[18px] p-4 backdrop-blur-lg lg:min-h-[210px] lg:flex-row lg:items-stretch"
          style={{ background: "linear-gradient(135deg, rgba(253,248,238,0.55) 0%, rgba(246,226,184,0.42) 55%, rgba(224,169,48,0.28) 100%)" }}
        >
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 lg:pr-4">
            <div>
              <div className="text-[11px] text-[#a39d8c]">ダッシュボード</div>
              <div className="mt-1 flex items-baseline gap-3">
                <h2 className="text-[30px] font-extrabold text-[#1c1b18]">{greeting()}</h2>
                <span className="text-[12px] text-[#6c6656]">{todayLabel()}</span>
              </div>
            </div>
            <div className="h-px bg-[#e2dfd2]" />
            <div className="flex flex-wrap gap-5">
              <StatInline value={`¥${fmt(totalValueJpy + cashJpy)}`} label="総資産(円換算)" onClick={() => onNavigateTab("portfolio")} />
              <StatInline value={`¥${fmt(cashJpy)}`} label="現金" onClick={() => onNavigateTab("portfolio")} />
              <StatInline value={`¥${fmt(totalValueJpy)}`} label="評価額(株式)" onClick={() => onNavigateTab("portfolio")} />
              <StatInline
                value={`${totalPlJpy >= 0 ? "+" : ""}¥${fmt(totalPlJpy)}`}
                valueColor={totalPlJpy > 0 ? GLASS_UP : totalPlJpy < 0 ? GLASS_DOWN : undefined}
                label="保有評価損益(本日)"
                onClick={() => onNavigateTab("portfolio")}
              />
            </div>
          </div>

          <div className="hidden w-px shrink-0 bg-[#e2dfd2] lg:block" />

          <button onClick={() => onNavigateTab("portfolio")} className="flex min-h-0 flex-1 flex-col pl-1 text-left transition hover:brightness-[0.97] lg:min-w-0">
            <div className="mb-1 flex items-center gap-1.5">
              <TrendingUp size={13} strokeWidth={2.25} style={{ color: "#c9962f" }} />
              <span className="text-[11px] font-semibold text-[#6c6656]">総資産の推移</span>
            </div>
            <div className="min-h-0 flex-1">
              <PortfolioValueChart history={history} showLegend={false} />
            </div>
          </button>
        </div>

        {healthAlerts.length > 0 && (
          <button
            onClick={() => onNavigateTab("portfolio")}
            className="mb-1.5 flex shrink-0 items-center gap-2 rounded-[14px] border border-red-200/60 bg-red-50/55 px-3 py-1.5 text-left text-[11.5px] font-semibold text-[#a32d2d] backdrop-blur-lg transition hover:brightness-95"
          >
            <AlertTriangle size={14} strokeWidth={2.25} className="shrink-0" />
            <span className="flex-1 truncate">
              要確認({healthAlerts.length}件) — {healthAlerts[0].message}
            </span>
            <ChevronRight size={14} strokeWidth={2.5} className="shrink-0" />
          </button>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-1.5 lg:grid-cols-3">
          <div className={`${GLASS_CARD} flex min-h-0 flex-col overflow-hidden p-0`}>
            <CardHeader icon={Wallet} iconColor={GLASS_ACCENT} title="保有銘柄" onNavigate={() => onNavigateTab("portfolio")} />
            {holdings.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-[11px] text-[#6c6656]">保有銘柄がまだ登録されていません</div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-1.5">
                {holdings.map((h) => {
                  const m = prices.get(h.ticker);
                  const price = m?.price ?? h.avgCost;
                  const plNative = (price - h.avgCost) * h.shares;
                  const plJpy = toJpy(plNative, h.currency);
                  const plPct = h.avgCost > 0 ? ((price - h.avgCost) / h.avgCost) * 100 : 0;
                  const up = plJpy > 0;
                  const down = plJpy < 0;
                  const avatarColor = h.currency === "JPY" ? GLASS_ACCENT : "#8f6ea3";
                  return (
                    <button
                      key={h.id}
                      onClick={() => onOpenDetail(h.ticker, h.name)}
                      className="flex shrink-0 items-center gap-2 rounded-xl px-1.5 py-1.5 text-left transition hover:bg-white/50"
                    >
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ background: avatarColor }}
                      >
                        {h.ticker.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-bold text-[#1c1b18]">{h.name}</div>
                        <div className="font-mono text-[9.5px] text-[#a39d8c]">{h.shares}株</div>
                      </div>
                      <span
                        className="shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold text-white"
                        style={{ background: up ? GLASS_UP : down ? GLASS_DOWN : "#a39d8c" }}
                      >
                        {plJpy >= 0 ? "+" : ""}¥{fmt(plJpy)} ({plPct >= 0 ? "+" : ""}
                        {plPct.toFixed(1)}%)
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className={`${GLASS_CARD} flex min-h-0 flex-col overflow-hidden p-0 lg:col-span-2`}>
            <CardHeader icon={TrendingUp} iconColor="#6c6656" title="アドバイザーの提案" onNavigate={() => onNavigateTab("personas")} />
            <div className="flex min-h-0 flex-1 gap-3 overflow-y-auto p-2 pt-0">
              {buyCount === 0 && sellCount === 0 ? (
                <div className="flex flex-1 items-center justify-center text-[11px] text-[#a39d8c]">推奨はありません</div>
              ) : (
                <>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="text-[10.5px] font-semibold text-[#6c6656]">買い推奨</div>
                    {!managerAdvice?.buys.length ? (
                      <div className="text-[11px] text-[#a39d8c]">なし</div>
                    ) : (
                      managerAdvice.buys.slice(0, 4).map((b) => (
                        <button
                          key={`buy-${b.ticker}`}
                          onClick={() => onOpenDetail(b.ticker, b.name ?? b.ticker)}
                          className="flex items-center gap-2 rounded-[14px] border border-white/45 bg-white/48 p-2 text-left backdrop-blur-lg transition hover:bg-white/65"
                        >
                          <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: GLASS_UP }}>
                            買
                          </span>
                          <span className="truncate text-[12.5px] font-semibold text-[#1c1b18]">{b.name ?? b.ticker}</span>
                        </button>
                      ))
                    )}
                  </div>

                  <div className="w-px shrink-0 bg-[#e2dfd2]" />

                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="text-[10.5px] font-semibold text-[#6c6656]">売り推奨</div>
                    {!managerAdvice?.sells.length ? (
                      <div className="text-[11px] text-[#a39d8c]">なし</div>
                    ) : (
                      managerAdvice.sells.slice(0, 4).map((s) => (
                        <button
                          key={`sell-${s.ticker}`}
                          onClick={() => onOpenDetail(s.ticker, s.name ?? s.ticker)}
                          className="flex items-center gap-2 rounded-[14px] border border-white/45 bg-white/48 p-2 text-left backdrop-blur-lg transition hover:bg-white/65"
                        >
                          <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: GLASS_DOWN }}>
                            売
                          </span>
                          <span className="truncate text-[12.5px] font-semibold text-[#1c1b18]">{s.name ?? s.ticker}</span>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-1.5 lg:grid-cols-3">
          <div className={`${GLASS_CARD} flex min-h-0 flex-col overflow-hidden p-0`}>
            <CardHeader icon={Newspaper} iconColor={GLASS_ACCENT} title="注目ニュース" onNavigate={() => onNavigateTab("news")} />
            <div className="min-h-0 flex-1 overflow-y-auto">
              {news.length === 0 ? (
                <div className="flex h-full items-center justify-center text-[11px] text-[#6c6656]">読み込み中…</div>
              ) : (
                news.map((item) => (
                  <a
                    key={item.link}
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-baseline gap-2 border-b border-[#efece2] px-3 py-1.5 last:border-0 hover:bg-[#f7f6f1]"
                  >
                    <div className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-[#1c1b18]">{item.title}</div>
                    <div className="shrink-0 text-[10px] text-[#a39d8c]">{item.source}</div>
                  </a>
                ))
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-1.5 lg:col-span-2">
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-1.5 sm:grid-cols-2">
              <button
                onClick={() => onNavigateTab("portfolio")}
                className={`${GLASS_CARD} flex min-h-0 flex-col justify-center gap-3 overflow-y-auto text-left transition hover:brightness-[0.97]`}
              >
                <AllocationBarRow label="保有セクター別" segments={sectorSegments} />
                <div className="h-px bg-[#e2dfd2]" />
                <AllocationBarRow
                  label="ポートフォリオ比率"
                  segments={[
                    { label: "株式", value: Math.max(totalValueJpy, 0), color: GLASS_ACCENT },
                    { label: "現金", value: Math.max(cashJpy, 0), color: "#a39d8c" },
                  ]}
                />
              </button>

              <div className={`${GLASS_CARD} flex min-h-0 flex-col overflow-hidden p-0`}>
                <CardHeader icon={Star} iconColor="#cf9a4c" title="本日の注目銘柄" onNavigate={() => onNavigateTab("dailypicks")} />
                <div className="flex shrink-0 gap-1 px-2 pb-1.5">
                  {(
                    [
                      { key: "all", label: "すべて" },
                      { key: "jp", label: "日本株" },
                      { key: "us", label: "米国株" },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setPickMarket(m.key)}
                      className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold transition ${
                        pickMarket === m.key ? "bg-[#1c1b18] text-white" : "bg-[#f0efe6] text-[#6c6656] hover:text-[#1c1b18]"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2 pt-0">
                  {(() => {
                    const filteredPicks = (pickMarket === "all" ? topPicks : topPicks.filter((p) => p.market === pickMarket)).slice(0, 2);
                    if (filteredPicks.length === 0) {
                      return (
                        <div className="flex flex-1 items-center justify-center rounded-[16px] border border-dashed border-[#e2dfd2] p-2.5 text-center text-[10.5px] text-[#a39d8c]">
                          本日分のスキャン待ち
                        </div>
                      );
                    }
                    return filteredPicks.map((pick, i) => (
                      <button
                        key={`${pick.market}-${pick.ticker}`}
                        onClick={() => onOpenDetail(pick.ticker, pick.name ?? pick.ticker)}
                        className={
                          i === 0
                            ? "flex flex-1 items-center gap-2.5 rounded-[16px] p-2 text-left shadow-[0_1px_2px_rgba(28,27,24,0.04)] transition hover:brightness-[0.97]"
                            : "flex flex-1 items-center gap-2.5 rounded-[16px] border border-white/45 bg-white/48 backdrop-blur-lg p-2 text-left transition hover:bg-white/45"
                        }
                        style={i === 0 ? { background: "linear-gradient(135deg, #f6e2b8, #fdf8ee)" } : undefined}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[9.5px] font-semibold text-[#a39d8c]">{i + 1}位</div>
                          <div className="truncate text-[13px] font-bold text-[#1c1b18]">{pick.name ?? pick.ticker}</div>
                          <div className="font-mono text-[10px] text-[#6c6656]">{pick.ticker}</div>
                        </div>
                        <OverallScoreBadge
                          score={pick.overallScore}
                          grade={pick.overallGrade}
                          breakdown={{
                            minerviniScore: pick.minerviniScore,
                            canslimScore: pick.canslimScore,
                            qualityScore: pick.qualityScore,
                            qualityTotal: pick.qualityTotal,
                            committeeAgree: pick.committeeAgree,
                            committeeTotal: pick.committeeTotal,
                            committeeRoles: pick.committeeRoles,
                          }}
                        />
                      </button>
                    ));
                  })()}
                </div>
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-1 gap-1.5 sm:grid-cols-3">
              <button onClick={() => onNavigateTab("news")} className={`${GLASS_CARD} sm:col-span-2 flex min-w-0 flex-col gap-1 p-2 text-left transition hover:brightness-[0.98]`}>
                <div className="flex items-center gap-1.5">
                  <Landmark size={14} strokeWidth={2.25} style={{ color: "#6c6656" }} />
                  <span className="text-[10px] font-semibold text-[#6c6656]">市場</span>
                </div>
                <div className="flex flex-1 items-center gap-5">
                  <div>
                    <div className="text-[12px] font-bold text-[#1c1b18]">日経平均</div>
                    <div
                      className="text-[15px] font-bold tabular-nums"
                      style={{ color: nikkei ? (nikkei.changePercent > 0 ? GLASS_UP : nikkei.changePercent < 0 ? GLASS_DOWN : "#1c1b18") : "#1c1b18" }}
                    >
                      {nikkei ? `${nikkei.changePercent >= 0 ? "+" : ""}${nikkei.changePercent.toFixed(2)}%` : "--"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[12px] font-bold text-[#1c1b18]">S&amp;P500</div>
                    <div
                      className="text-[15px] font-bold tabular-nums"
                      style={{ color: sp500 ? (sp500.changePercent > 0 ? GLASS_UP : sp500.changePercent < 0 ? GLASS_DOWN : "#1c1b18") : "#1c1b18" }}
                    >
                      {sp500 ? `${sp500.changePercent >= 0 ? "+" : ""}${sp500.changePercent.toFixed(2)}%` : "--"}
                    </div>
                  </div>
                </div>
              </button>

              {fx && (
                <MiniStatCard
                  icon={ArrowLeftRight}
                  iconColor="#6c6656"
                  value={`¥${fx.usdJpy.toFixed(2)}`}
                  label="為替(ドル円)"
                  onClick={() => onNavigateTab("personas")}
                />
              )}
            </div>
          </div>
        </div>
      </GlassPageShell>
    </section>
  );
}
