"use client";

import { useEffect, useState } from "react";
import type { Quote } from "@/lib/quotes";
import { GLASS_UP, GLASS_DOWN, GLASS_TEXT2 } from "@/lib/glassStyles";

const REFRESH_MS = 60 * 1000;

function formatPrice(q: Quote): string {
  const digits = q.symbol === "JPY=X" ? 3 : q.price >= 1000 ? 0 : 2;
  return q.price.toLocaleString("ja-JP", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatChangePercent(q: Quote): string {
  const sign = q.changePercent > 0 ? "+" : "";
  return `${sign}${q.changePercent.toFixed(2)}%`;
}

function QuoteChip({ quote }: { quote: Quote }) {
  const up = quote.change > 0;
  const down = quote.change < 0;
  const color = up ? GLASS_UP : down ? GLASS_DOWN : GLASS_TEXT2;
  const arrow = up ? "▲" : down ? "▼" : "―";

  return (
    <span className="mx-1 inline-flex shrink-0 items-baseline gap-1.5 whitespace-nowrap rounded-full bg-[var(--fill-pill)] px-3 py-1.5 text-[12.5px]">
      <span className="font-semibold text-[var(--foreground)]">{quote.label}</span>
      <span className="tabular-nums text-[var(--foreground)]">{formatPrice(quote)}</span>
      <span className="tabular-nums font-semibold" style={{ color }}>
        {arrow} {formatChangePercent(quote)}
      </span>
    </span>
  );
}

export function IndexTicker() {
  const [quotes, setQuotes] = useState<Quote[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/quotes", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && Array.isArray(json.quotes)) {
          setQuotes(json.quotes);
        }
      } catch {
        // keep showing the previous values on transient failures
      }
    }

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (quotes.length === 0) {
    return (
      <div className="h-11 shrink-0 border-b border-[var(--border-subtle)] bg-white/70" />
    );
  }

  return (
    <div className="group h-11 shrink-0 overflow-hidden border-b border-[var(--border-subtle)] bg-white/70 backdrop-blur">
      <div className="flex h-full animate-[ticker_35s_linear_infinite] items-center group-hover:[animation-play-state:paused]">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 items-center">
            {quotes.map((q) => (
              <QuoteChip key={`${copy}-${q.symbol}`} quote={q} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
