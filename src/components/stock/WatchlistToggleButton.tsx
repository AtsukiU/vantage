"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { loadWatchlist, saveWatchlist, addToWatchlist, removeFromWatchlist } from "@/lib/watchlistStore";

// 銘柄詳細ページ右上に置く、ウォッチリスト追加/削除トグル。一覧(WatchlistTab)を
// 開かなくても、見ている銘柄をその場で追加できるようにする。
export function WatchlistToggleButton({ symbol, name }: { symbol: string; name: string }) {
  const [inList, setInList] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadWatchlist().then((items) => {
      if (!cancelled) setInList(items.some((i) => i.ticker === symbol));
    });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  async function toggle() {
    if (inList === null) return;
    const items = await loadWatchlist();
    const next = inList ? removeFromWatchlist(items, symbol) : addToWatchlist(items, symbol, name);
    await saveWatchlist(next);
    setInList(!inList);
  }

  return (
    <motion.button
      onClick={toggle}
      whileTap={{ scale: 0.88 }}
      whileHover={{ scale: 1.05 }}
      disabled={inList === null}
      title={inList ? "ウォッチリストから削除" : "ウォッチリストに追加"}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-50"
      style={{
        borderColor: inList ? "var(--accent)" : "var(--border-subtle)",
        background: inList ? "var(--accent)" : "transparent",
        color: inList ? "#ffffff" : "var(--text-secondary)",
      }}
    >
      <motion.span
        key={String(inList)}
        initial={{ scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 20 }}
        className="flex items-center justify-center"
      >
        <Star size={16} strokeWidth={2.25} fill={inList ? "currentColor" : "none"} />
      </motion.span>
    </motion.button>
  );
}
