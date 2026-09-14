"use client";

import type { PeerComparison } from "@/lib/stockPeers";

const GOOD = "var(--status-good)";
const UP = "var(--price-up)";
const DOWN = "var(--price-down)";

function fmtCap(n: number | null, currency: string | null): string {
  if (n == null) return "—";
  const prefix = currency === "JPY" ? "¥" : currency === "USD" ? "$" : "";
  if (n >= 1e12) return `${prefix}${(n / 1e12).toFixed(1)}兆`;
  if (n >= 1e8) return `${prefix}${(n / 1e8).toFixed(0)}億`;
  if (n >= 1e6) return `${prefix}${(n / 1e6).toFixed(0)}M`;
  return `${prefix}${n.toLocaleString("ja-JP")}`;
}

// 銘柄本体より割安/優秀な値なら緑で強調(PER/PBRは低いほど、ROE/配当利回りは高いほど良い)。
function cellColor(peerValue: number | null, baseValue: number | null, lowerIsBetter: boolean): string {
  if (peerValue == null || baseValue == null) return "var(--foreground)";
  const better = lowerIsBetter ? peerValue < baseValue : peerValue > baseValue;
  return better ? GOOD : "var(--foreground)";
}

export function PeerComparisonSection({
  peers,
  baseMetrics,
  onOpenDetail,
}: {
  peers: PeerComparison[];
  baseMetrics: { per: number | null; pbr: number | null; roe: number | null; dividendYield: number | null };
  onOpenDetail: (symbol: string, name: string) => void;
}) {
  if (peers.length === 0) {
    return <div className="text-[11px] text-[var(--text-muted)]">類似銘柄のデータが見つかりませんでした</div>;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[12.5px]">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-left text-[11px] text-[var(--text-secondary)]">
              <th className="py-2 pr-2 font-medium">銘柄</th>
              <th className="py-2 px-2 text-right font-medium">価格</th>
              <th className="py-2 px-2 text-right font-medium">前日比</th>
              <th className="py-2 px-2 text-right font-medium">PER</th>
              <th className="py-2 px-2 text-right font-medium">PBR</th>
              <th className="py-2 px-2 text-right font-medium">ROE</th>
              <th className="py-2 px-2 text-right font-medium">配当利回り</th>
              <th className="py-2 pl-2 text-right font-medium">時価総額</th>
            </tr>
          </thead>
          <tbody>
            {peers.map((p) => {
              const up = (p.dayChangePercent ?? 0) >= 0;
              const currencyPrefix = p.currency === "JPY" ? "¥" : p.currency === "USD" ? "$" : "";
              return (
                <tr key={p.ticker} className="border-b border-[var(--border-faint)] last:border-0">
                  <td className="py-2 pr-2">
                    <button
                      onClick={() => onOpenDetail(p.ticker, p.name ?? p.ticker)}
                      className="text-left font-semibold text-[var(--foreground)] hover:text-[var(--accent)] hover:underline"
                    >
                      {p.name ?? p.ticker}
                    </button>
                    <div className="font-mono text-[11px] text-[var(--text-secondary)]">{p.ticker}</div>
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-[var(--foreground)]">
                    {p.price != null
                      ? `${currencyPrefix}${p.price.toLocaleString("ja-JP", { maximumFractionDigits: p.currency === "JPY" ? 0 : 2 })}`
                      : "—"}
                  </td>
                  <td className="py-2 px-2 text-right font-mono font-semibold" style={{ color: p.dayChangePercent == null ? "var(--text-muted)" : up ? UP : DOWN }}>
                    {p.dayChangePercent != null ? `${up ? "▲" : "▼"}${p.dayChangePercent.toFixed(2)}%` : "—"}
                  </td>
                  <td className="py-2 px-2 text-right font-mono" style={{ color: cellColor(p.per, baseMetrics.per, true) }}>
                    {p.per != null ? `${p.per.toFixed(1)}倍` : "—"}
                  </td>
                  <td className="py-2 px-2 text-right font-mono" style={{ color: cellColor(p.pbr, baseMetrics.pbr, true) }}>
                    {p.pbr != null ? `${p.pbr.toFixed(1)}倍` : "—"}
                  </td>
                  <td className="py-2 px-2 text-right font-mono" style={{ color: cellColor(p.roe, baseMetrics.roe, false) }}>
                    {p.roe != null ? `${p.roe.toFixed(1)}%` : "—"}
                  </td>
                  <td className="py-2 px-2 text-right font-mono" style={{ color: cellColor(p.dividendYield, baseMetrics.dividendYield, false) }}>
                    {p.dividendYield != null ? `${p.dividendYield.toFixed(1)}%` : "—"}
                  </td>
                  <td className="py-2 pl-2 text-right font-mono text-[var(--text-secondary)]">{fmtCap(p.marketCap, p.currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
        Yahoo Financeの類似銘柄アルゴリズムによる関連銘柄です(厳密な業種分類ではありません)。緑色は本銘柄よりPER/PBRが低い、またはROE/配当利回りが高いことを示します。
      </p>
    </div>
  );
}
