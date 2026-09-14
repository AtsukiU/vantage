"use client";

import type { StockMetrics } from "./stockMetrics";

// スクリーニング・ポートフォリオなど、複数銘柄の現在値をまとめて
// 取りたい画面向けの共通ヘルパー。/api/stock/[ticker]/metrics を並列(上限付き)で叩く。
// stock-analyzer の fetch_all() が ThreadPoolExecutor で並列取得していたのと同じ考え方。
export async function fetchMetricsBatch(
  tickers: string[],
  opts: { concurrency?: number; onProgress?: (done: number, total: number) => void; scores?: boolean } = {}
): Promise<Map<string, StockMetrics>> {
  const concurrency = opts.concurrency ?? 6;
  const results = new Map<string, StockMetrics>();
  const total = tickers.length;
  let idx = 0;
  let done = 0;

  async function worker() {
    while (idx < tickers.length) {
      const i = idx++;
      const ticker = tickers[i];
      try {
        const res = await fetch(`/api/stock/${encodeURIComponent(ticker)}/metrics${opts.scores ? "?scores=1" : ""}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (res.ok && json.metrics) results.set(ticker, json.metrics as StockMetrics);
      } catch {
        // この銘柄はスキップ(他の銘柄の取得は継続)
      } finally {
        done++;
        opts.onProgress?.(done, total);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(tickers.length, 1)) }, worker)
  );
  return results;
}
