"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NewsFeed } from "@/components/NewsFeed";
import { DailyScanBanner } from "@/components/DailyScanBanner";
import { GlassPageShell } from "@/components/GlassPageShell";
import { DashboardTab } from "@/components/dashboard/DashboardTab";
import { StockTab, type StockSelection } from "@/components/stock/StockTab";
import { PortfolioTab } from "@/components/portfolio/PortfolioTab";
import { SimulatorTab } from "@/components/simulator/SimulatorTab";
import { CompareTab } from "@/components/compare/CompareTab";
import { DailyPicksTab } from "@/components/dailypicks/DailyPicksTab";
import { PersonasTab } from "@/components/personas/PersonasTab";
import { WatchlistTab } from "@/components/watchlist/WatchlistTab";
import type { Market } from "@/lib/feeds";
import { LayoutGrid, Newspaper, Search, Star, Scale, Wallet, Gamepad2, Users, Eye, type LucideIcon } from "lucide-react";

type TabKey = "dashboard" | "news" | "stock" | "portfolio" | "simulator" | "compare" | "dailypicks" | "personas" | "watchlist";

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "dashboard", label: "ダッシュボード", icon: LayoutGrid },
  { key: "news", label: "ニュース", icon: Newspaper },
  { key: "stock", label: "銘柄検索", icon: Search },
  { key: "dailypicks", label: "本日の注目銘柄", icon: Star },
  { key: "personas", label: "運用アドバイザー", icon: Users },
  { key: "compare", label: "銘柄比較", icon: Scale },
  { key: "watchlist", label: "ウォッチリスト", icon: Eye },
  { key: "portfolio", label: "ポートフォリオ", icon: Wallet },
  { key: "simulator", label: "シミュレーター", icon: Gamepad2 },
];

const VALID_TABS = new Set<string>(TABS.map((t) => t.key));

export default function Home() {
  // タブ・銘柄詳細の選択状態はReactのuseStateではなくURLクエリ(?tab=...&symbol=...)を
  // 正として持つ。これにより、ブラウザの戻る/進むボタンがアプリ内のタブ切り替え・銘柄切り替えを
  // たどるようになる(以前はuseStateだけで管理していたため、履歴に何も残らず「戻る」を押すと
  // 即座にアプリの外(前に開いていたページや空白)へ出てしまい、「進む」で戻ってきても
  // 状態が全部リセットされる=ユーザーには壊れたように見える問題があった)。
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const active: TabKey = tabParam && VALID_TABS.has(tabParam) ? (tabParam as TabKey) : "dashboard";
  const symbolParam = searchParams.get("symbol");
  const nameParam = searchParams.get("name");
  const stockSelection: StockSelection | null = symbolParam ? { symbol: symbolParam, name: nameParam ?? symbolParam } : null;

  const navigate = useCallback(
    (next: { tab?: TabKey; symbol?: string | null; name?: string | null }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.tab !== undefined) params.set("tab", next.tab);
      if (next.symbol !== undefined) {
        if (next.symbol == null) {
          params.delete("symbol");
          params.delete("name");
        } else {
          params.set("symbol", next.symbol);
          if (next.name) params.set("name", next.name);
          else params.delete("name");
        }
      }
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const setActive = useCallback((tab: TabKey) => navigate({ tab }), [navigate]);
  const setStockSelection = useCallback(
    (sel: StockSelection | null) => navigate({ symbol: sel?.symbol ?? null, name: sel?.name ?? null }),
    [navigate]
  );

  const [newsMarket, setNewsMarket] = useState<Market>("jp");
  const [counts, setCounts] = useState<Record<Market, number | null>>({
    jp: null,
    us: null,
  });
  const [newsRefreshSignal, setNewsRefreshSignal] = useState(0);

  // タブが横スクロールしないと全部見えない時だけ、隠れているタブがあることを示す
  // フェード(端をぼかす)を出す。常時フェードだと入りきっている時に不自然なので、
  // 実際にスクロール可能な時だけ表示する。
  const navRef = useRef<HTMLElement>(null);
  const [navScroll, setNavScroll] = useState({ left: false, right: false });

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    function update() {
      if (!el) return;
      setNavScroll({
        left: el.scrollLeft > 2,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
      });
    }
    update();
    el.addEventListener("scroll", update);
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  function openStockDetail(symbol: string, name: string) {
    navigate({ tab: "stock", symbol, name });
  }

  return (
    <div className="flex h-full">
      <aside
        className="relative hidden w-60 shrink-0 flex-col overflow-hidden border-r border-white/40 px-3 py-5 shadow-[0_1px_2px_rgba(28,27,24,0.04),0_10px_24px_-8px_rgba(28,27,24,0.10)] backdrop-blur-lg md:flex"
        style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(253,248,238,0.42) 55%, rgba(246,226,184,0.34) 100%)" }}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-[#f0a83a] opacity-[0.18] blur-[70px]" />
        </div>
        <div className="relative flex items-center gap-2 px-2 pb-7">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#c9962f]">
            <span className="text-sm font-extrabold text-white">V</span>
          </span>
          <h1 className="whitespace-nowrap text-base font-extrabold tracking-wide text-[#1c1b18]">
            VANTAGE<span className="text-[#cf9a4c]">.</span>
          </h1>
        </div>
        <nav className="relative grid flex-1 auto-rows-min grid-cols-2 content-start gap-2">
          {TABS.map((tab) => {
            const count = tab.key === "news" ? counts[newsMarket] : null;
            const Icon = tab.icon;
            const isActive = active === tab.key;
            const isDashboard = tab.key === "dashboard";
            return (
              <button
                key={tab.key}
                onClick={() => setActive(tab.key)}
                className={
                  isDashboard
                    ? `relative col-span-2 flex aspect-[2/1] items-center gap-2.5 rounded-2xl px-3 text-left transition ${
                        isActive
                          ? "bg-[#1c1b18] text-white shadow-[0_6px_16px_-6px_rgba(28,27,24,0.4)]"
                          : "border border-white/50 bg-white/40 text-[#6c6656] hover:bg-white/65 hover:text-[#1c1b18]"
                      }`
                    : `relative flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl px-1.5 text-center transition ${
                        isActive
                          ? "bg-[#1c1b18] text-white shadow-[0_6px_16px_-6px_rgba(28,27,24,0.4)]"
                          : "border border-white/50 bg-white/40 text-[#6c6656] hover:bg-white/65 hover:text-[#1c1b18]"
                      }`
                }
              >
                {count !== null && (
                  <span
                    className={`absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                      isActive ? "bg-white/15 text-white" : "bg-[#e2dfd2] text-[#6c6656]"
                    }`}
                  >
                    {count}
                  </span>
                )}
                <Icon size={isDashboard ? 19 : 22} strokeWidth={2.15} />
                <span className={isDashboard ? "text-[13px] font-semibold leading-tight" : "text-[10.5px] font-semibold leading-tight"}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
        <div className="relative mt-3 shrink-0">
          <DailyScanBanner compact onStart={() => setNewsRefreshSignal((n) => n + 1)} />
        </div>
        <div className="relative mt-3 rounded-xl bg-white/50 px-3 py-2.5 text-[10.5px] leading-relaxed text-[#6c6656]">
          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#c9962f]" />
          データはこの端末のブラウザに保存されます
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative shrink-0 overflow-hidden border-b border-[#e2dfd2] bg-[#f2ead2] md:hidden">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -left-16 -top-24 h-56 w-56 rounded-full bg-[#c9962f] opacity-[0.14] blur-[70px]" />
            <div className="absolute -right-12 -top-20 h-52 w-52 rounded-full bg-[#cf9a4c] opacity-[0.14] blur-[70px]" />
          </div>
          <div className="relative flex flex-col gap-2 bg-white/70 px-4 py-2.5 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-3">
            <h1 className="shrink-0 whitespace-nowrap text-base font-extrabold tracking-wide text-[#c9962f] sm:text-lg">
              VANTAGE<span className="text-[#cf9a4c]">.</span>
            </h1>
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <nav
                ref={navRef}
                className="scrollbar-none flex min-w-0 gap-1 overflow-x-auto rounded-full bg-[#f0efe6] p-1"
                style={
                  navScroll.left || navScroll.right
                    ? {
                        WebkitMaskImage: `linear-gradient(to right, ${navScroll.left ? "transparent, black 16px" : "black"}, ${
                          navScroll.right ? "black calc(100% - 16px), transparent" : "black"
                        })`,
                        maskImage: `linear-gradient(to right, ${navScroll.left ? "transparent, black 16px" : "black"}, ${
                          navScroll.right ? "black calc(100% - 16px), transparent" : "black"
                        })`,
                      }
                    : undefined
                }
              >
                {TABS.map((tab) => {
                  const count = tab.key === "news" ? counts[newsMarket] : null;
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActive(tab.key)}
                      title={tab.label}
                      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-sm font-medium transition xl:px-3 ${
                        active === tab.key
                          ? "bg-white text-[#c9962f] shadow-sm"
                          : "text-[#6c6656] hover:text-[#1c1b18]"
                      }`}
                    >
                      <Icon size={15} strokeWidth={2.25} />
                      <span className="hidden lg:inline">{tab.label}</span>
                      {count !== null && (
                        <span className="rounded-full bg-[#e2dfd2] px-1.5 py-0.5 text-xs text-[#6c6656]">
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        </header>

        <main className={`min-h-0 flex-1 overflow-y-auto bg-[#f2ead2] ${active === "dashboard" ? "lg:overflow-hidden" : ""}`}>
        <DashboardTab hidden={active !== "dashboard"} onOpenDetail={openStockDetail} onNavigateTab={setActive} refreshSignal={newsRefreshSignal} />

        <section hidden={active !== "news"}>
          <GlassPageShell maxWidth="max-w-6xl">
            <div className="flex flex-col gap-4">
              <DailyScanBanner onStart={() => setNewsRefreshSignal((n) => n + 1)} />
              <div className="flex w-fit gap-1 rounded-full bg-[#f0efe6] p-1">
                {([
                  { key: "jp", label: "日本株" },
                  { key: "us", label: "米国株" },
                ] as const).map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setNewsMarket(m.key)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      newsMarket === m.key ? "bg-white text-[#c9962f] shadow-sm" : "text-[#6c6656] hover:text-[#1c1b18]"
                    }`}
                  >
                    {m.label}
                    {counts[m.key] != null && <span className="ml-1.5 text-[#a39d8c]">{counts[m.key]}</span>}
                  </button>
                ))}
              </div>
              <NewsFeed
                market="jp"
                hidden={newsMarket !== "jp"}
                onCountChange={(count) => setCounts((c) => ({ ...c, jp: count }))}
                refreshSignal={newsRefreshSignal}
              />
              <NewsFeed
                market="us"
                hidden={newsMarket !== "us"}
                onCountChange={(count) => setCounts((c) => ({ ...c, us: count }))}
                refreshSignal={newsRefreshSignal}
              />
            </div>
          </GlassPageShell>
        </section>

        <StockTab
          hidden={active !== "stock"}
          selection={stockSelection}
          onSelectionChange={setStockSelection}
        />
        <DailyPicksTab hidden={active !== "dailypicks"} onOpenDetail={openStockDetail} />
        <PersonasTab hidden={active !== "personas"} onOpenDetail={openStockDetail} />
        <CompareTab hidden={active !== "compare"} onOpenDetail={openStockDetail} />
        <WatchlistTab hidden={active !== "watchlist"} onOpenDetail={openStockDetail} />
        <PortfolioTab hidden={active !== "portfolio"} onOpenDetail={openStockDetail} />
        <SimulatorTab hidden={active !== "simulator"} onOpenDetail={openStockDetail} />
        </main>
      </div>
    </div>
  );
}
