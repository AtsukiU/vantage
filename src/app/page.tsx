"use client";

import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { NewsFeed } from "@/components/NewsFeed";
import { DailyScanBanner } from "@/components/DailyScanBanner";
import { DailyScanLoadingOverlay } from "@/components/DailyScanLoadingOverlay";
import { GlassPageShell } from "@/components/GlassPageShell";
import { DashboardTab } from "@/components/dashboard/DashboardTab";
import { StockTab, type StockSelection } from "@/components/stock/StockTab";
import { PortfolioTab } from "@/components/portfolio/PortfolioTab";
import { PortfolioHistoryTab } from "@/components/portfolio/PortfolioHistoryTab";
import { CompareTab } from "@/components/compare/CompareTab";
import { DailyPicksTab } from "@/components/dailypicks/DailyPicksTab";
import { PersonasTab } from "@/components/personas/PersonasTab";
import { WatchlistTab } from "@/components/watchlist/WatchlistTab";
import { SettingsTab } from "@/components/settings/SettingsTab";
import type { Market } from "@/lib/feeds";
import { StockSearchBar } from "@/components/stock/StockSearchBar";
import { LayoutGrid, Newspaper, Star, Scale, Wallet, Users, Eye, Settings, Menu, X, type LucideIcon } from "lucide-react";

type TabKey =
  | "dashboard"
  | "news"
  | "stock"
  | "portfolio"
  | "portfolio-history"
  | "compare"
  | "dailypicks"
  | "personas"
  | "watchlist"
  | "settings";

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "dashboard", label: "ダッシュボード", icon: LayoutGrid },
  { key: "portfolio", label: "ポートフォリオ", icon: Wallet },
  { key: "news", label: "ニュース", icon: Newspaper },
  { key: "dailypicks", label: "本日の注目銘柄", icon: Star },
  { key: "personas", label: "運用アドバイザー", icon: Users },
  { key: "compare", label: "銘柄比較", icon: Scale },
  { key: "watchlist", label: "ウォッチリスト", icon: Eye },
];

// 設定はよく使う操作ではないため、他タブと並べたナビゲーショングリッドには入れず、
// ロゴ横の小さな歯車アイコンから単独で開く(TABS配列には含めない)。
// stockもナビゲーショングリッドには並べない(銘柄検索はサイドバー常設の検索ボックスから
// 直接入るため、ナビタイルとしては不要になった)。ただし検索結果を選ぶと?tab=stockへ
// 遷移するので、VALID_TABSには引き続き含めておく必要がある(外すとURLが弾かれてダッシュ
// ボードに戻されてしまう)。
const VALID_TABS = new Set<string>([...TABS.map((t) => t.key), "settings", "stock", "portfolio-history"]);

// useSearchParams()を使うコンポーネントは本番ビルドの静的プリレンダリング時に
// Suspenseで包む必要があるため(包まないとビルドエラーになる)、実体はHomeContentに
// 移し、デフォルトエクスポート側でSuspense境界を用意する。
export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
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
  // 運用アドバイザーの買い推奨から銘柄詳細に遷移した時だけ、その根拠(投資家名など)を一時的に
  // 覚えておき、「ポートフォリオに追加」で実際に買った時に保有銘柄のバッジとして残す。
  // それ以外の遷移(検索・関連銘柄クリックなど)は毎回reason無しでopenStockDetailを呼ぶため、
  // 自然にリセットされる。
  const [pendingBuyReason, setPendingBuyReason] = useState<string | null>(null);

  // スマホ幅ではサイドバーの代わりにヘッダーのハンバーガーボタンから開く
  // ドロップダウンメニューでタブ切り替えを行う(アイコンだけの横スクロール一覧は
  // タップ操作が難しいという指摘を受けて、よくあるスマホアプリ式の展開メニューに変更)。
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function openStockDetail(symbol: string, name: string, buyReason?: string) {
    setPendingBuyReason(buyReason ?? null);
    navigate({ tab: "stock", symbol, name });
  }

  return (
    <div className="flex h-full">
      <aside
        // 縦に短いウィンドウだと、ロゴ+ナビグリッド+スキャンバナー+フッター注記の合計が
        // aside自体の高さを超えることがある。以前はoverflow-hiddenで問答無用に切り取って
        // いて、ウォッチリストタイル以降(バナー・フッター注記)が見えなくなっていた
        // (画面が低い時だけ再現する)。overflow-y-autoにして、はみ出した分は
        // サイドバー自体をスクロールして見られるようにする。
        className="relative hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-white/40 px-3 py-5 shadow-[0_1px_2px_rgba(28,27,24,0.04),0_10px_24px_-8px_rgba(28,27,24,0.10)] backdrop-blur-lg md:flex"
        style={{ background: "var(--gradient-sidebar)" }}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="glow-blob absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-[var(--glow)] opacity-[0.18] blur-[70px]" />
        </div>
        <div className="relative flex items-center gap-2 px-2 pb-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]">
            <span className="text-sm font-extrabold text-white">V</span>
          </span>
          <h1 className="whitespace-nowrap text-base font-extrabold tracking-wide text-[var(--foreground)]">
            VANTAGE<span className="text-[var(--accent-strong)]">.</span>
          </h1>
          <button
            onClick={() => setActive("settings")}
            title="設定"
            className={`ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition ${
              active === "settings" ? "bg-[#1c1b18] text-white" : "text-[var(--text-secondary)] hover:bg-white/60 hover:text-[var(--foreground)]"
            }`}
          >
            <Settings size={15} strokeWidth={2.25} />
          </button>
        </div>
        {/* 銘柄検索は以前ナビゲーショングリッドの1タイルだったが、どのタブを見ていてもすぐ検索
            できるよう、サイドバー常設の検索ボックスに変更した(選ぶと?tab=stockへ遷移する)。
            StockSearchBar自身がmb-4を持つので、ここではpx-2だけ付けて余白を二重にしない
            (以前はここにもmb-3を足していたため、ロゴ側のpb-4と合計値がズレて上下の余白が
            揃って見えなかった)。 */}
        <div className="relative px-2">
          <StockSearchBar onSelect={openStockDetail} placeholder="銘柄を検索" variant="sidebar" />
        </div>
        <nav className="relative grid flex-1 auto-rows-min grid-cols-2 content-start gap-2">
          {TABS.map((tab) => {
            const count = tab.key === "news" ? counts[newsMarket] : null;
            const Icon = tab.icon;
            const isActive = active === tab.key;
            const isDashboard = tab.key === "dashboard";
            return (
              <motion.button
                key={tab.key}
                onClick={() => setActive(tab.key)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className={
                  isDashboard
                    ? `relative col-span-2 flex aspect-[2/1] items-center gap-2.5 rounded-[var(--nav-radius)] px-3 text-left ${
                        isActive
                          ? "text-[var(--accent)]"
                          : "nav-tile border border-white/50 bg-white/40 text-[var(--text-secondary)] shadow-[0_1px_2px_rgba(28,27,24,0.04),0_6px_14px_-8px_rgba(28,27,24,0.14)] backdrop-blur-md transition hover:bg-white/65 hover:text-[var(--foreground)]"
                      }`
                    : `relative flex aspect-square flex-col items-center justify-center gap-1.5 rounded-[var(--nav-radius)] px-1.5 text-center ${
                        isActive
                          ? "text-[var(--accent)]"
                          : "nav-tile border border-white/50 bg-white/40 text-[var(--text-secondary)] shadow-[0_1px_2px_rgba(28,27,24,0.04),0_6px_14px_-8px_rgba(28,27,24,0.14)] backdrop-blur-md transition hover:bg-white/65 hover:text-[var(--foreground)]"
                      }`
                }
              >
                {isActive && (
                  // 以前は不透明な黒背景+独自のグロー演出だったが、「選択中のタブも背景の
                  // グラデーションが透けるガラス質感にしたい、専用の光暈は不要」という指示を受けて、
                  // 非アクティブなnav-tileと同じ透過+backdrop-blurの考え方に統一し、選択状態は
                  // アクセントカラーの縁取り+薄い塗りだけで示す(黒背景・グロー演出は撤去)。
                  // その後さらに「ダークモードはガラス質感をやめてフラットに」という方針になった
                  // ため、nav-activeクラスにダークモード用の不透明な上書きをglobals.cssで当てている。
                  <motion.span
                    layoutId="nav-active-bg"
                    transition={{ type: "spring", stiffness: 420, damping: 38 }}
                    className="nav-active absolute inset-0 rounded-[var(--nav-radius)] border border-[var(--accent)]/45 bg-[var(--accent)]/15 shadow-[0_1px_2px_rgba(28,27,24,0.04),0_6px_14px_-8px_rgba(28,27,24,0.14)] backdrop-blur-md"
                  />
                )}
                {count !== null && (
                  <span
                    className={`absolute right-1.5 top-1.5 z-10 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                      isActive ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "bg-[var(--border-subtle)] text-[var(--text-secondary)]"
                    }`}
                  >
                    {count}
                  </span>
                )}
                <Icon size={isDashboard ? 19 : 22} strokeWidth={2.15} className="relative z-10" />
                <span className={`relative z-10 ${isDashboard ? "text-[12.5px] font-semibold leading-tight" : "text-[11px] font-semibold leading-tight"}`}>
                  {tab.label}
                </span>
              </motion.button>
            );
          })}
        </nav>
        <div className="relative mt-3 shrink-0">
          <DailyScanBanner compact onStart={() => setNewsRefreshSignal((n) => n + 1)} />
        </div>
        <div className="nav-tile relative mt-3 rounded-xl bg-white/50 px-3 py-2.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          保有データはこの端末に保存(Upstash設定時は端末間で同期)
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative shrink-0 border-b border-[var(--border-subtle)] bg-[var(--background)] md:hidden">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="glow-blob absolute -left-16 -top-24 h-56 w-56 rounded-full bg-[var(--accent)] opacity-[0.14] blur-[70px]" />
            <div className="glow-blob absolute -right-12 -top-20 h-52 w-52 rounded-full bg-[var(--accent-strong)] opacity-[0.14] blur-[70px]" />
          </div>
          <div className="nav-tile relative flex items-center justify-between gap-3 bg-white/70 px-4 py-2.5 backdrop-blur">
            <h1 className="shrink-0 whitespace-nowrap text-base font-extrabold tracking-wide text-[var(--accent)] sm:text-lg">
              VANTAGE<span className="text-[var(--accent-strong)]">.</span>
            </h1>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={() => setActive("settings")}
                title="設定"
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
                  active === "settings" ? "bg-[#1c1b18] text-white" : "text-[var(--text-secondary)] hover:bg-white/60 hover:text-[var(--foreground)]"
                }`}
              >
                <Settings size={16} strokeWidth={2.25} />
              </button>
              <button
                onClick={() => setMobileMenuOpen((v) => !v)}
                title="メニュー"
                aria-expanded={mobileMenuOpen}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:bg-white/60 hover:text-[var(--foreground)]"
              >
                {mobileMenuOpen ? <X size={18} strokeWidth={2.25} /> : <Menu size={18} strokeWidth={2.25} />}
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <nav className="absolute inset-x-0 top-full z-40 max-h-[70vh] overflow-y-auto border-b border-[var(--border-subtle)] bg-[var(--surface)] p-2 shadow-[0_16px_28px_-10px_rgba(28,27,24,0.28)]">
              {TABS.map((tab) => {
                const count = tab.key === "news" ? counts[newsMarket] : null;
                const Icon = tab.icon;
                const isActive = active === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => {
                      setActive(tab.key);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition ${
                      isActive
                        ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--fill-subtle)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    <Icon size={18} strokeWidth={2.25} />
                    {tab.label}
                    {count !== null && (
                      <span className="ml-auto rounded-full bg-[var(--border-subtle)] px-1.5 py-0.5 text-xs text-[var(--text-secondary)]">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          )}
        </header>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setMobileMenuOpen(false)} />
        )}

        <main className={`min-h-0 flex-1 overflow-y-auto bg-[var(--background)] ${active === "dashboard" ? "lg:overflow-hidden" : ""}`}>
        <DashboardTab hidden={active !== "dashboard"} onOpenDetail={openStockDetail} onNavigateTab={setActive} refreshSignal={newsRefreshSignal} />

        <section hidden={active !== "news"} className="h-full">
          <GlassPageShell>
            <div className="flex flex-col gap-4">
              <div className="flex w-fit gap-1 rounded-full bg-[var(--fill-pill)] p-1">
                {([
                  { key: "jp", label: "日本株" },
                  { key: "us", label: "米国株" },
                ] as const).map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setNewsMarket(m.key)}
                    className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      newsMarket === m.key ? "bg-[var(--surface)] text-[var(--accent)] shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {m.label}
                    {counts[m.key] != null && <span className="ml-1.5 text-[var(--text-muted)]">{counts[m.key]}</span>}
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
          buyReason={pendingBuyReason}
          onBuyReasonConsumed={() => setPendingBuyReason(null)}
        />
        <DailyPicksTab hidden={active !== "dailypicks"} onOpenDetail={openStockDetail} />
        <PersonasTab hidden={active !== "personas"} onOpenDetail={openStockDetail} />
        <CompareTab hidden={active !== "compare"} onOpenDetail={openStockDetail} />
        <WatchlistTab hidden={active !== "watchlist"} onOpenDetail={openStockDetail} />
        <PortfolioTab
          hidden={active !== "portfolio"}
          onOpenDetail={openStockDetail}
          onOpenHistoryDetail={() => setActive("portfolio-history")}
        />
        <PortfolioHistoryTab hidden={active !== "portfolio-history"} onBack={() => setActive("portfolio")} />
        <SettingsTab hidden={active !== "settings"} />
        </main>
      </div>
      <DailyScanLoadingOverlay onScanComplete={() => setNewsRefreshSignal((n) => n + 1)} />
    </div>
  );
}
