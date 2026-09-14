"use client";

import { useEffect, useRef, useState } from "react";

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
}

export function StockSearchBar({
  onSelect,
  placeholder = "ティッカー・銘柄名で検索(例: 7203.T、トヨタ、AAPL)",
  variant = "default",
}: {
  onSelect: (symbol: string, name: string) => void;
  placeholder?: string;
  // "sidebar": サイドバーのナビタイル(border-white/50 bg-white/40)と同じ半透明ガラス質感に
  // 合わせる。既定の白ベタ塗り(bg-white/90)は、検索欄単体のページ本文向けの見た目のまま残す。
  variant?: "default" | "sidebar";
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 検索欄が空になったら結果をクリア
      setResults([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stock/search?q=${encodeURIComponent(trimmed)}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "検索に失敗しました");
        if (!cancelled) {
          setResults(json.results ?? []);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setResults([]);
          setError(e instanceof Error ? e.message : "検索に失敗しました");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function selectResult(r: SearchResult) {
    onSelect(r.symbol, r.name);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative mb-4">
      <div
        className={`flex items-center gap-2 rounded-full border px-4 py-2.5 transition ${
          variant === "sidebar"
            ? "border-white/70 bg-white/65 focus-within:bg-white/85 hover:bg-white/75"
            : "border-[var(--border-subtle)] bg-[var(--surface)]"
        }`}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`shrink-0 text-[var(--text-secondary)] ${variant === "sidebar" ? "opacity-90" : "opacity-70"}`}
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full bg-transparent text-[12.5px] text-[var(--foreground)] outline-none placeholder:text-[var(--text-secondary)]"
        />
      </div>

      {open && query.trim().length > 0 && (
        <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] shadow-lg">
          {loading && <div className="px-4 py-3 text-[12.5px] text-[var(--text-secondary)]">検索中…</div>}
          {!loading && error && <div className="px-4 py-3 text-[12.5px] text-[var(--price-up)]">{error}</div>}
          {!loading && !error && results.length === 0 && (
            <div className="px-4 py-3 text-[12.5px] text-[var(--text-secondary)]">該当する銘柄が見つかりません</div>
          )}
          {!loading &&
            !error &&
            results.map((r) => (
              <button
                key={r.symbol}
                onClick={() => selectResult(r)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left transition hover:bg-[var(--fill-subtle)]"
              >
                <span className="truncate text-[12.5px] font-semibold text-[var(--foreground)]">{r.name}</span>
                <span className="ml-3 shrink-0 font-mono text-[11px] text-[var(--text-secondary)]">{r.symbol}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
