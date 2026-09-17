"use client";

import { useEffect, useMemo, useState } from "react";
import { GlassPageShell } from "../GlassPageShell";
import { GLASS_CARD, GLASS_PILL_GROUP, GLASS_TEXT2 } from "@/lib/glassStyles";
import { loadTradeLog, updateTradeMemo, type PortfolioTradeEvent } from "@/lib/portfolioTradeLog";
import { NotebookPen, Search } from "lucide-react";

// 「取引メモ」タブ: 実際の売買履歴(portfolioTradeLog.ts、買い/売り時に自動記録)を
// 時系列で一覧できるページ。銘柄ごとに検索・買い/売りで絞り込みができ、各取引に後から
// メモ(なぜ買った/売ったか)を書き足せる。運用アドバイザーの推奨から買った分は根拠バッジも出す。

const BUY_COLOR = "var(--status-good)";
const SELL_COLOR = "var(--accent-strong)";

function fmtJpy(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

function fmtPrice(price: number, currency: string): string {
  const prefix = currency === "JPY" ? "¥" : currency === "USD" ? "$" : "";
  return `${prefix}${price.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}`;
}

function MemoEditor({ trade, onSaved }: { trade: PortfolioTradeEvent; onSaved: (memo: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(trade.memo ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await updateTradeMemo(trade.id, value.trim());
    setSaving(false);
    setEditing(false);
    onSaved(value.trim());
  }

  if (!editing) {
    return (
      <button
        onClick={() => {
          setValue(trade.memo ?? "");
          setEditing(true);
        }}
        className="mt-1 block w-full rounded-lg bg-[var(--fill-subtle)] px-2.5 py-1 text-left text-[11px] text-[var(--text-secondary)] hover:bg-[var(--fill-pill)]"
      >
        {trade.memo ? trade.memo : <span className="text-[var(--text-muted)]">+ メモを書く</span>}
      </button>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-1.5">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") setEditing(false);
        }}
        autoFocus
        className="min-w-0 flex-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1 text-[11px]"
        placeholder="なぜ買った/売ったか、など"
      />
      <button onClick={save} disabled={saving} className="shrink-0 rounded-full bg-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-white">
        保存
      </button>
      <button onClick={() => setEditing(false)} className="shrink-0 text-[11px] text-[var(--text-muted)] hover:text-[var(--foreground)]">
        キャンセル
      </button>
    </div>
  );
}

export function TradeJournalTab({ hidden }: { hidden: boolean }) {
  const [trades, setTrades] = useState<PortfolioTradeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sideFilter, setSideFilter] = useState<"all" | "buy" | "sell">("all");

  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- タブを開き直すたびに読み込み中表示へ戻す
    setLoading(true);
    loadTradeLog().then((list) => {
      if (cancelled) return;
      setTrades(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [hidden]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return trades
      .filter((t) => sideFilter === "all" || t.side === sideFilter)
      .filter((t) => !q || t.name.toLowerCase().includes(q) || t.ticker.toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [trades, query, sideFilter]);

  return (
    <section hidden={hidden} className="h-full">
      <GlassPageShell>
        <div className={`${GLASS_CARD} mb-2 sm:mb-3`}>
          <div className="flex items-center gap-2">
            <NotebookPen size={16} strokeWidth={2.25} className="text-[var(--accent)]" />
            <h2 className="text-[12.5px] font-extrabold text-[var(--foreground)]">取引メモ</h2>
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            実際に買った/売った銘柄の履歴です。それぞれに理由や振り返りをメモできます。運用アドバイザーの推奨から買った分は根拠バッジが付きます。
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex min-w-[180px] flex-1 items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-3 py-1.5">
              <Search size={13} strokeWidth={2.25} className="shrink-0 text-[var(--text-muted)]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="銘柄名・ティッカーで絞り込み"
                className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-[var(--text-muted)]"
              />
            </div>
            <div className={GLASS_PILL_GROUP}>
              {(
                [
                  { id: "all", label: "すべて" },
                  { id: "buy", label: "買い" },
                  { id: "sell", label: "売り" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setSideFilter(opt.id)}
                  className="rounded-full px-3 py-1.5 text-[11px] font-semibold transition"
                  style={{
                    background: sideFilter === opt.id ? "var(--accent)" : "transparent",
                    color: sideFilter === opt.id ? "#fff" : "var(--text-secondary)",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className={`${GLASS_CARD} flex h-32 items-center justify-center text-[12.5px] text-[var(--text-secondary)]`}>読み込み中…</div>
        ) : filtered.length === 0 ? (
          <div className={`${GLASS_CARD} p-8 text-center text-[12.5px] text-[var(--text-secondary)]`}>
            {trades.length === 0 ? "まだ取引履歴がありません。銘柄を購入/売却すると、ここに記録されます。" : "条件に一致する取引がありません。"}
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.map((t) => (
              <div key={t.id} className={`${GLASS_CARD} p-2.5 sm:p-3`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold text-white"
                        style={{ background: t.side === "buy" ? BUY_COLOR : SELL_COLOR }}
                      >
                        {t.side === "buy" ? "買い" : "売り"}
                      </span>
                      <span className="truncate text-[12.5px] font-bold text-[var(--foreground)]">{t.name}</span>
                      <span className={`shrink-0 font-mono text-[11px] ${GLASS_TEXT2}`}>{t.ticker}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                      {new Date(t.date).toLocaleString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  {t.buyReason && (
                    <span className="shrink-0 rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[9px] font-semibold text-[var(--accent)]">
                      {t.buyReason}の推奨
                    </span>
                  )}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                  <span>
                    <span className={GLASS_TEXT2}>株数 </span>
                    <span className="font-semibold tabular-nums text-[var(--foreground)]">{t.shares.toLocaleString()}</span>
                  </span>
                  <span>
                    <span className={GLASS_TEXT2}>単価 </span>
                    <span className="font-semibold tabular-nums text-[var(--foreground)]">{fmtPrice(t.price, t.currency)}</span>
                  </span>
                  <span>
                    <span className={GLASS_TEXT2}>約定代金 </span>
                    <span className="font-semibold tabular-nums text-[var(--foreground)]">{fmtJpy(t.valueJpy)}</span>
                  </span>
                  {t.plJpy != null && (
                    <span>
                      <span className={GLASS_TEXT2}>実現損益 </span>
                      <span className="font-semibold tabular-nums" style={{ color: t.plJpy >= 0 ? "var(--status-good)" : "var(--price-up)" }}>
                        {t.plJpy >= 0 ? "+" : ""}
                        {fmtJpy(t.plJpy)}
                      </span>
                    </span>
                  )}
                </div>

                <MemoEditor trade={t} onSaved={(memo) => setTrades((prev) => prev.map((x) => (x.id === t.id ? { ...x, memo: memo || undefined } : x)))} />
              </div>
            ))}
          </div>
        )}
      </GlassPageShell>
    </section>
  );
}
