"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { NewsItem } from "@/lib/news";
import type { Market } from "@/lib/feeds";
import { relativeTimeJa, formatClock } from "@/lib/format";
import { categorizeNewsTitle, NEWS_CATEGORY_LABEL, NEWS_CATEGORY_COLOR, type NewsCategory } from "@/lib/newsCategory";
import { translateUnique } from "@/lib/translateClient";
import { NewsPreviewModal } from "./NewsPreviewModal";

interface ApiResponse {
  market: Market;
  updatedAt: string;
  count: number;
  items: NewsItem[];
  error?: string;
}

const AUTO_REFRESH_MS = 5 * 60 * 1000;

const SOURCE_COLORS: Record<string, string> = {
  "Yahoo!ニュース": "bg-red-50 text-red-700",
  "Yahoo Finance": "bg-violet-50 text-violet-700",
  MarketWatch: "bg-emerald-50 text-emerald-700",
  CNBC: "bg-amber-50 text-amber-700",
};

function sourceColor(source: string): string {
  return SOURCE_COLORS[source] ?? "bg-slate-100 text-slate-700";
}

const CATEGORY_ORDER: NewsCategory[] = ["market", "quote", "ranking", "other"];

type Entry = { item: NewsItem; category: NewsCategory };

export function NewsFeed({
  market,
  hidden,
  onCountChange,
  refreshSignal,
}: {
  market: Market;
  hidden: boolean;
  onCountChange?: (count: number) => void;
  // 「本日の注目銘柄」スキャン開始と同時にニュースも読み直したい時、親からこの値を
  // 変化させて明示的な再取得を起こすためのシグナル(値そのものに意味は無い)。
  refreshSignal?: number;
}) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<NewsCategory | "all">("all");
  // 米国株ニュースは英語のため、タイトル・概要を日本語に一括翻訳したもの(原文→訳文)。
  // 銘柄名・企業名などの固有名詞はAPI側で無理に訳さない前提。翻訳できない場合は原文のまま。
  const [translations, setTranslations] = useState<Map<string, string>>(new Map());
  const [previewItem, setPreviewItem] = useState<NewsItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/news?market=${market}`, {
        cache: "no-store",
      });
      const json: ApiResponse = await res.json();
      if (!res.ok) throw new Error(json.error ?? "取得に失敗しました");
      setData(json);
      onCountChange?.(json.count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- マウント時・市場切替時の初回取得
    load();
    const id = setInterval(load, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // refreshSignalが変化した時だけ再取得する(マウント直後の初回はundefined→undefinedのままで
  // 発火しないよう、値そのものではなく「変化」をトリガーにする)。
  const firstRefreshSignal = useRef(refreshSignal);
  useEffect(() => {
    if (refreshSignal === firstRefreshSignal.current) return;
    firstRefreshSignal.current = refreshSignal;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  useEffect(() => {
    if (market !== "us" || !data || data.items.length === 0) return;
    let cancelled = false;
    const texts = data.items.flatMap((i) => [i.title, i.description ?? ""]).filter(Boolean);
    translateUnique(texts).then((map) => {
      if (!cancelled) setTranslations(map);
    });
    return () => {
      cancelled = true;
    };
  }, [market, data]);

  function tr(text: string): string {
    return translations.get(text) ?? text;
  }

  const categorized = useMemo(
    () => (data?.items ?? []).map((item) => ({ item, category: categorizeNewsTitle(item.title) })),
    [data]
  );
  const counts = useMemo(() => {
    const c: Record<NewsCategory, number> = { market: 0, quote: 0, ranking: 0, other: 0 };
    for (const { category } of categorized) c[category]++;
    return c;
  }, [categorized]);
  const visible = categoryFilter === "all" ? categorized : categorized.filter((c) => c.category === categoryFilter);

  // マガジンレイアウト用の区分け(「すべて」表示の時だけ使う):
  // 「銘柄・ファンド情報」(機械的な株価ボード記事)は下部の折りたたみへ。
  // 重要度は「市場全体 > ランキング > 個別ニュース」のカテゴリを優先し、同カテゴリ内は
  // 新しい順(Array.sortは安定ソートなので、元の新しい順を保ったまま並び替わる)。
  const CATEGORY_PRIORITY: Record<NewsCategory, number> = { market: 0, ranking: 1, other: 2, quote: 3 };
  const nonQuote = categorized
    .filter((c) => c.category !== "quote")
    .slice()
    .sort((a, b) => CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category]);
  const quoteEntries = categorized.filter((c) => c.category === "quote");
  const heroEntry: Entry | null = nonQuote[0] ?? categorized[0] ?? null;
  const afterHero = nonQuote.filter((c) => c !== heroEntry);
  const stripEntries = afterHero.slice(0, 3);
  const restEntries = afterHero.slice(3);

  return (
    <section hidden={hidden} className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm text-[var(--text-secondary)]">
        <span>
          {data
            ? `更新: ${relativeTimeJa(data.updatedAt)} ・ ${data.count}件`
            : "読み込み中..."}
        </span>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface)] disabled:opacity-50"
        >
          {loading ? "更新中..." : "更新"}
        </button>
      </div>

      {data && data.items.length > 0 && (
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
          <button
            onClick={() => setCategoryFilter("all")}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${
              categoryFilter === "all" ? "bg-[var(--accent)] text-white" : "bg-[var(--fill-pill)] text-[var(--text-secondary)] hover:text-[var(--foreground)]"
            }`}
          >
            すべて({categorized.length})
          </button>
          {CATEGORY_ORDER.filter((cat) => counts[cat] > 0).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${
                categoryFilter === cat ? "bg-[var(--accent)] text-white" : "bg-[var(--fill-pill)] text-[var(--text-secondary)] hover:text-[var(--foreground)]"
              }`}
            >
              {NEWS_CATEGORY_LABEL[cat]}({counts[cat]})
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button
            onClick={load}
            className="ml-3 underline underline-offset-2 hover:no-underline"
          >
            再試行
          </button>
        </div>
      )}

      {loading && !data && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <li
              key={i}
              className="h-24 animate-pulse rounded-xl bg-[var(--border-faint)]"
            />
          ))}
        </ul>
      )}

      {data && data.items.length === 0 && !loading && (
        <div className="rounded-xl border border-dashed border-[var(--border-subtle)] px-4 py-10 text-center text-sm text-[var(--text-secondary)]">
          直近24時間のニュースが見つかりませんでした。
        </div>
      )}

      {/* 「すべて」表示: マガジン風レイアウト(hero + strip + 残りグリッド + 相場ボード折りたたみ) */}
      {data && categoryFilter === "all" && heroEntry && (
        <div className="flex flex-col gap-4">
          <button
            onClick={() => setPreviewItem(heroEntry.item)}
            className="group relative overflow-hidden rounded-[18px] border border-white/10 bg-[#1c1b18] px-6 py-6 text-left shadow-[0_1px_2px_rgba(28,27,24,0.04),0_10px_24px_-8px_rgba(28,27,24,0.14)] transition hover:border-[var(--accent)]/50 sm:px-8 sm:py-7"
          >
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="glow-blob absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[var(--accent)] opacity-30 blur-[70px]" />
              <div className="glow-blob absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-[var(--accent-strong)] opacity-25 blur-[60px]" />
            </div>
            <div className="relative">
              <span className="inline-block rounded-full bg-[var(--accent-strong)] px-2.5 py-1 text-[11px] font-bold text-[var(--foreground)]">
                {NEWS_CATEGORY_LABEL[heroEntry.category]}
              </span>
              <h3 className="mt-3 line-clamp-2 max-w-2xl text-[19px] font-extrabold leading-snug text-white sm:text-[22px]">
                {tr(heroEntry.item.title)}
              </h3>
              {heroEntry.item.description && (
                <p className="mt-2 line-clamp-2 max-w-2xl text-[12.5px] leading-relaxed text-white/70">{tr(heroEntry.item.description)}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-white/60">
                <span>{heroEntry.item.source}</span>
                <span title={formatClock(heroEntry.item.pubDate)}>{relativeTimeJa(heroEntry.item.pubDate)}</span>
              </div>
            </div>
          </button>

          {stripEntries.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {stripEntries.map(({ item, category }, i) => (
                <button
                  key={item.link}
                  onClick={() => setPreviewItem(item)}
                  className="group relative flex flex-col overflow-hidden rounded-[14px] border border-white/10 bg-[#1c1b18] px-4 py-3.5 text-left transition hover:border-[var(--accent)]/50"
                >
                  <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-70 transition group-hover:opacity-100">
                    <div className="glow-blob absolute -right-8 -top-10 h-24 w-24 rounded-full bg-[var(--accent)] opacity-40 blur-[36px]" />
                    <div className="glow-blob absolute -bottom-8 -left-6 h-20 w-20 rounded-full bg-[var(--accent-strong)] opacity-30 blur-[30px]" />
                  </div>
                  <div className="relative">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-strong)] font-mono text-[11px] font-bold text-[var(--foreground)]">
                      {i + 1}
                    </span>
                    <p className="mt-2 line-clamp-2 text-[15px] font-bold leading-snug text-white">{tr(item.title)}</p>
                    {item.description && (
                      <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-white/60">{tr(item.description)}</p>
                    )}
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-white/50">
                      <span className="rounded-full bg-white/10 px-1.5 py-0.5 font-medium text-white/80">
                        {NEWS_CATEGORY_LABEL[category]}
                      </span>
                      <span title={formatClock(item.pubDate)}>{relativeTimeJa(item.pubDate)}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {restEntries.length > 0 && (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {restEntries.map(({ item, category }) => (
                <li key={item.link}>
                  <button
                    onClick={() => setPreviewItem(item)}
                    className="group flex h-full w-full flex-col rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 py-3 text-left backdrop-blur-[var(--card-blur)] transition hover:border-[var(--accent)]/40 hover:bg-[var(--surface)]"
                  >
                    <p className="line-clamp-2 font-medium leading-snug text-[var(--foreground)] group-hover:text-[var(--accent)]">{tr(item.title)}</p>
                    {item.description && (
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--text-muted)]">{tr(item.description)}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <span className={`rounded-full px-2 py-0.5 font-medium ${NEWS_CATEGORY_COLOR[category]}`}>
                        {NEWS_CATEGORY_LABEL[category]}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 font-medium ${sourceColor(item.source)}`}>{item.source}</span>
                      <span title={formatClock(item.pubDate)}>{relativeTimeJa(item.pubDate)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {quoteEntries.length > 0 && (
            <details className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] backdrop-blur-[var(--card-blur)]">
              <summary className="cursor-pointer select-none list-none px-4 py-2.5 text-xs font-semibold text-[var(--text-secondary)]">
                銘柄・ファンド情報(株価ボード)を{quoteEntries.length}件表示
              </summary>
              <div className="border-t border-[var(--border-subtle)]">
                {quoteEntries.map(({ item }) => (
                  <button
                    key={item.link}
                    onClick={() => setPreviewItem(item)}
                    className="flex w-full items-center gap-3 border-b border-[var(--fill-pill)] px-4 py-2 text-left text-[12.5px] last:border-none hover:bg-[var(--fill-subtle)]"
                  >
                    <span className="min-w-0 flex-1 truncate text-[var(--foreground)]">{tr(item.title)}</span>
                    <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{relativeTimeJa(item.pubDate)}</span>
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* カテゴリを絞り込んだ時は通常のグリッド表示 */}
      {data && categoryFilter !== "all" && visible.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map(({ item, category }) => (
            <li key={item.link}>
              <button
                onClick={() => setPreviewItem(item)}
                className="group flex h-full w-full flex-col rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 py-3 text-left backdrop-blur-[var(--card-blur)] transition hover:border-[var(--accent)]/40 hover:bg-[var(--surface)]"
              >
                <p className="font-medium leading-snug text-[var(--foreground)] group-hover:text-[var(--accent)]">
                  {tr(item.title)}
                </p>
                {item.description && (
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">{tr(item.description)}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${NEWS_CATEGORY_COLOR[category]}`}>
                    {NEWS_CATEGORY_LABEL[category]}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium ${sourceColor(
                      item.source
                    )}`}
                  >
                    {item.source}
                  </span>
                  <span title={formatClock(item.pubDate)}>
                    {relativeTimeJa(item.pubDate)}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {data && data.items.length > 0 && visible.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border-subtle)] px-4 py-10 text-center text-sm text-[var(--text-secondary)]">
          このカテゴリのニュースはありません。
        </div>
      )}

      <AnimatePresence>
        {previewItem && (
          <NewsPreviewModal
            key={previewItem.link}
            item={previewItem}
            title={tr(previewItem.title)}
            description={previewItem.description ? tr(previewItem.description) : null}
            onClose={() => setPreviewItem(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
