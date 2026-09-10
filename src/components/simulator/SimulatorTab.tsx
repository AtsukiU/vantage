"use client";

import { useEffect, useState } from "react";
import { GlassPageShell } from "../GlassPageShell";
import { StockSearchBar } from "../stock/StockSearchBar";
import {
  buy,
  sell,
  loadSimState,
  saveSimState,
  resetSimState,
  updateTrailingStops,
  setStopLoss,
  setTrailingEnabled,
  STARTING_CASH,
  type SimState,
} from "@/lib/simulatorStore";
import { fetchMetricsBatch } from "@/lib/fetchMetricsBatch";
import type { StockMetrics } from "@/lib/stockMetrics";
import { GLASS_CARD, GLASS_BTN_PRIMARY, GLASS_BTN_GHOST, GLASS_UP, GLASS_DOWN } from "@/lib/glassStyles";
import { TrailingStopBadge } from "../TrailingStopBadge";
import { StatTile } from "../StatTile";
import { ShieldAlert, Layers, JapaneseYen, DollarSign } from "lucide-react";

function fmt(n: number, currency: string): string {
  const digits = currency === "JPY" ? 0 : 2;
  return n.toLocaleString("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function prefix(currency: string): string {
  return currency === "JPY" ? "¥" : currency === "USD" ? "$" : "";
}

export function SimulatorTab({
  hidden,
  onOpenDetail,
}: {
  hidden: boolean;
  onOpenDetail: (symbol: string, name: string) => void;
}) {
  const [state, setState] = useState<SimState | null>(null);
  const [prices, setPrices] = useState<Map<string, StockMetrics>>(new Map());
  const [usdJpyRate, setUsdJpyRate] = useState<number | null>(null);
  const [pending, setPending] = useState<{ symbol: string; name: string } | null>(null);
  const [shares, setShares] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [stopLossPct, setStopLossPct] = useState("-8");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSimState().then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 合計評価額はJPY/USDを単純合算すると数字として意味を持たないため、
  // 実際のドル円レートで円換算してから合計する。
  useEffect(() => {
    let cancelled = false;
    fetchMetricsBatch(["JPY=X"]).then((res) => {
      const rate = res.get("JPY=X")?.price;
      if (!cancelled && rate) setUsdJpyRate(rate);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const tickers = [
    ...(state?.positions.map((p) => p.ticker) ?? []),
    ...(pending ? [pending.symbol] : []),
  ];
  const uniqueTickers = Array.from(new Set(tickers));

  useEffect(() => {
    if (uniqueTickers.length === 0) return;
    let cancelled = false;
    fetchMetricsBatch(uniqueTickers, { concurrency: 6 }).then((res) => {
      if (!cancelled) setPrices((prev) => new Map([...prev, ...res]));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueTickers.join(",")]);

  // 最新の株価が取れるたびに、含み益に応じてトレーリングストップ(損切りライン)を
  // 自動で切り上げる。ページを開いた/価格が更新されたタイミングでの判定であり、
  // 常時監視ではない点に注意。
  useEffect(() => {
    if (!state || prices.size === 0) return;
    const priceByTicker = new Map(
      Array.from(prices.entries()).map(([ticker, m]) => [ticker, { price: m.price, priceVs50ma: m.priceVs50ma }])
    );
    const next = updateTrailingStops(state, priceByTicker);
    if (next !== state) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 価格更新に応じたストップ再計算の反映
      setState(next);
      void saveSimState(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices]);

  function handleOrder() {
    if (!state || !pending) {
      setError("銘柄を検索して選択してください");
      return;
    }
    const meta = prices.get(pending.symbol);
    if (!meta || meta.price == null) {
      setError("現在値を取得できませんでした。少し待って再試行してください");
      return;
    }
    const sharesNum = Number(shares);
    if (!Number.isFinite(sharesNum) || sharesNum <= 0) {
      setError("株数を正しく入力してください");
      return;
    }
    const currency = meta.currency ?? (pending.symbol.endsWith(".T") ? "JPY" : "USD");
    const stopLossPctNum = Number(stopLossPct);
    try {
      const next =
        side === "buy"
          ? buy(state, {
              ticker: pending.symbol,
              name: meta.name ?? pending.name,
              shares: sharesNum,
              price: meta.price,
              currency,
              stopLossPct: Number.isFinite(stopLossPctNum) && stopLossPctNum < 0 ? stopLossPctNum : null,
            })
          : sell(state, {
              ticker: pending.symbol,
              name: meta.name ?? pending.name,
              shares: sharesNum,
              price: meta.price,
              currency,
            });
      setState(next);
      void saveSimState(next);
      setError(null);
      setShares("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "注文に失敗しました");
    }
  }

  function handleReset() {
    if (!window.confirm("シミュレーターを初期状態(資金・保有・履歴すべて)にリセットします。よろしいですか?")) {
      return;
    }
    resetSimState().then(setState);
    setPending(null);
    setError(null);
  }

  if (!state) return null;

  // ドル建ての金額は現在のドル円レートで円換算してから合計する(レート未取得時は
  // 直近の為替水準を目安として150円/ドルで暫定計算し、取得でき次第置き換える)。
  const rate = usdJpyRate ?? 150;
  const toJpy = (amount: number, currency: string) => (currency === "JPY" ? amount : amount * rate);

  let totalValueJpy = 0;
  let totalStartJpy = 0;
  for (const [currency, amount] of Object.entries(state.cash)) {
    totalValueJpy += toJpy(amount, currency);
  }
  for (const [currency, amount] of Object.entries(STARTING_CASH)) {
    totalStartJpy += toJpy(amount, currency);
  }
  for (const p of state.positions) {
    const m = prices.get(p.ticker);
    const price = m?.price ?? p.avgCost;
    totalValueJpy += toJpy(price * p.shares, p.currency);
  }
  const totalReturn = totalValueJpy - totalStartJpy;
  const totalReturnPct = totalStartJpy > 0 ? (totalReturn / totalStartJpy) * 100 : 0;

  return (
    <section hidden={hidden}>
      <GlassPageShell maxWidth="max-w-4xl">
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <StatTile
            variant="hero"
            icon={Layers}
            iconColor="#c9962f"
            label={`評価額合計(円換算${usdJpyRate == null ? "・レート取得中" : `・$1=¥${usdJpyRate.toFixed(1)}`})`}
            value={fmt(totalValueJpy, "JPY")}
            delta={{
              text: `${totalReturn >= 0 ? "▲" : "▼"} ${fmt(Math.abs(totalReturn), "JPY")} (${totalReturnPct >= 0 ? "+" : ""}${totalReturnPct.toFixed(1)}%)`,
              positive: totalReturn >= 0,
            }}
          />
          {Object.entries(state.cash).map(([currency, amount]) => (
            <StatTile
              key={currency}
              icon={currency === "JPY" ? JapaneseYen : DollarSign}
              iconColor={currency === "JPY" ? "#c9962f" : "#8f6ea3"}
              label={`現金(${currency})`}
              value={`${prefix(currency)}${fmt(amount, currency)}`}
            />
          ))}
        </div>

        <div className={`${GLASS_CARD} mb-4`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[13px] font-extrabold text-[#1c1b18]">投資シミュレーター(練習用・仮想資金)</h2>
              <p className="mt-1 text-xs text-[#6c6656]">
                実際のお金は動きません。現在の株価を使って仮想の資金で売買を練習できます。
              </p>
            </div>
            <button onClick={handleReset} className={`${GLASS_BTN_GHOST} shrink-0 hover:border-red-300 hover:text-red-600`}>
              リセット
            </button>
          </div>
        </div>

        <div className={`${GLASS_CARD} mb-4`}>
          <h3 className="mb-3 text-[13px] font-extrabold text-[#1c1b18]">注文</h3>
          <StockSearchBar
            onSelect={(symbol, name) => {
              setPending({ symbol, name });
              setError(null);
            }}
          />
          {pending && (
            <div className="mt-2 flex flex-wrap items-end gap-3 rounded-xl bg-[#f7f6f1] p-3">
              <div className="text-sm font-semibold text-[#1c1b18]">
                {pending.name} <span className="text-xs text-[#6c6656]">{pending.symbol}</span>
                {prices.get(pending.symbol)?.price != null && (
                  <span className="ml-2 text-xs text-[#6c6656]">
                    現在値 {prefix(prices.get(pending.symbol)!.currency ?? "")}
                    {fmt(prices.get(pending.symbol)!.price!, prices.get(pending.symbol)!.currency ?? "JPY")}
                  </span>
                )}
              </div>
              <div className="flex overflow-hidden rounded-full border border-[#e2dfd2]">
                <button
                  onClick={() => setSide("buy")}
                  className="px-3 py-1.5 text-sm font-semibold transition"
                  style={side === "buy" ? { background: GLASS_UP, color: "#fff" } : { color: "#6c6656" }}
                >
                  買い
                </button>
                <button
                  onClick={() => setSide("sell")}
                  className="px-3 py-1.5 text-sm font-semibold transition"
                  style={side === "sell" ? { background: GLASS_DOWN, color: "#fff" } : { color: "#6c6656" }}
                >
                  売り
                </button>
              </div>
              <label className="flex flex-col text-xs text-[#6c6656]">
                株数
                <input
                  type="number"
                  min="0"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  className="mt-1 w-24 rounded-md border border-[#e2dfd2] px-2 py-1 text-sm"
                  placeholder="100"
                />
              </label>
              {side === "buy" && (
                <label className="flex flex-col text-xs text-[#6c6656]">
                  初期損切り(%)
                  <input
                    type="number"
                    max="0"
                    value={stopLossPct}
                    onChange={(e) => setStopLossPct(e.target.value)}
                    className="mt-1 w-24 rounded-md border border-[#e2dfd2] px-2 py-1 text-sm"
                    placeholder="-8"
                  />
                </label>
              )}
              <button onClick={handleOrder} className={GLASS_BTN_PRIMARY}>
                注文する
              </button>
              <button onClick={() => setPending(null)} className="rounded-full px-3 py-1.5 text-sm text-[#6c6656] hover:text-[#1c1b18]">
                キャンセル
              </button>
            </div>
          )}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>

        <div className={`${GLASS_CARD} mb-4 overflow-hidden p-0`}>
          <div className="border-b border-[#e2dfd2] bg-[#f7f6f1] px-4 py-2 text-xs font-medium text-[#6c6656]">
            保有ポジション
          </div>
          {state.positions.length === 0 ? (
            <div className="p-6 text-center text-sm text-[#6c6656]">まだポジションがありません</div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {state.positions.map((p) => {
                  const m = prices.get(p.ticker);
                  const price = m?.price ?? p.avgCost;
                  const pl = (price - p.avgCost) * p.shares;
                  const plPct = p.avgCost > 0 ? ((price - p.avgCost) / p.avgCost) * 100 : 0;
                  const up = pl >= 0;
                  return (
                    <tr key={p.ticker} className="border-b border-[#efece2] last:border-0">
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => onOpenDetail(p.ticker, p.name)}
                          className="text-left font-semibold text-[#1c1b18] hover:text-[#c9962f] hover:underline"
                        >
                          {p.name}
                        </button>
                        <div className="font-mono text-xs text-[#6c6656]">{p.ticker}</div>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-[#1c1b18]">{p.shares}株</td>
                      <td className="px-4 py-2.5 tabular-nums text-[#1c1b18]">
                        取得 {prefix(p.currency)}
                        {fmt(p.avgCost, p.currency)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold" style={{ color: up ? GLASS_UP : GLASS_DOWN }}>
                        {prefix(p.currency)}
                        {fmt(Math.abs(pl), p.currency)} ({plPct >= 0 ? "+" : ""}
                        {plPct.toFixed(1)}%)
                        <TrailingStopBadge
                          price={price}
                          priceVs50ma={m?.priceVs50ma ?? null}
                          currency={p.currency}
                          isProfitable={pl > 0}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {(() => {
                          const near = p.stopLoss != null && price <= p.stopLoss * 1.03;
                          return (
                            <>
                              <div className="flex items-center justify-end gap-1">
                                {near && <ShieldAlert size={12} strokeWidth={2.5} className="text-[#c0392b]" />}
                                <span className={`text-[11px] ${near ? "font-bold text-[#c0392b]" : "text-[#6c6656]"}`}>損切</span>
                                <input
                                  type="number"
                                  value={p.stopLoss ?? ""}
                                  placeholder="未設定"
                                  onChange={(e) => {
                                    if (!state) return;
                                    const v = e.target.value;
                                    const next = setStopLoss(state, p.ticker, v === "" ? null : Number(v));
                                    setState(next);
                                    saveSimState(next);
                                  }}
                                  className="w-20 rounded-md border border-[#e2dfd2] px-1.5 py-0.5 text-right text-[11px] tabular-nums"
                                />
                              </div>
                              <label className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#a39d8c]">
                                <input
                                  type="checkbox"
                                  checked={p.trailing}
                                  onChange={(e) => {
                                    if (!state) return;
                                    const next = setTrailingEnabled(state, p.ticker, e.target.checked);
                                    setState(next);
                                    saveSimState(next);
                                  }}
                                  className="h-3 w-3"
                                />
                                トレーリング中
                              </label>
                            </>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className={`${GLASS_CARD} overflow-hidden p-0`}>
          <div className="border-b border-[#e2dfd2] bg-[#f7f6f1] px-4 py-2 text-xs font-medium text-[#6c6656]">
            取引履歴
          </div>
          {state.trades.length === 0 ? (
            <div className="p-6 text-center text-sm text-[#6c6656]">まだ取引がありません</div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {state.trades.slice(0, 30).map((t) => (
                  <tr key={t.id} className="border-b border-[#efece2] last:border-0">
                    <td className="px-4 py-2 text-xs text-[#a39d8c]">
                      {new Date(t.at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={
                          t.side === "buy"
                            ? { background: "rgba(192,57,43,.08)", color: GLASS_UP }
                            : { background: "rgba(47,111,176,.08)", color: GLASS_DOWN }
                        }
                      >
                        {t.side === "buy" ? "買い" : "売り"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[#1c1b18]">
                      {t.name} <span className="font-mono text-xs text-[#a39d8c]">{t.ticker}</span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-[#1c1b18]">
                      {t.shares}株 @ {prefix(t.currency)}
                      {fmt(t.price, t.currency)}
                      {t.feeNative > 0 && (
                        <div className="text-[10.5px] font-normal text-[#a39d8c]">
                          手数料 {prefix(t.currency)}{fmt(t.feeNative, t.currency)}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="mt-3 text-xs text-[#a39d8c]">
          取引履歴・残高はこのブラウザにのみ保存されます。開始時の仮想資金は ¥1,000,000 / $10,000 です。
        </p>
        <p className="mt-1.5 text-xs text-[#a39d8c]">
          損切りラインは買い注文時に設定した%から始まり、含み益が+8%を超えると以降は50日移動平均線を目安に自動で切り上がります(下がることはありません)。手動で数値を書き換えたり、トレーリングのON/OFFを切り替えることもできます。実際の注文執行は行わず、表示・記録のみです。
        </p>
        <p className="mt-1.5 text-xs text-[#a39d8c]">
          売買手数料はSBI証券の体系(国内株はゼロ革命で無料、米国株は約定代金の0.495%・上限22ドル)を想定して差し引いています。
        </p>
      </GlassPageShell>
    </section>
  );
}
