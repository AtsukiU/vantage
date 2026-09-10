import { isFinancialSector, type StockMetrics } from "./stockMetrics";

export interface GaugeSpec {
  key: string;
  label: string;
  score: number | null; // 0-100のゲージ塗り具合
  valueText: string;
  benchmarkText: string;
  tooltip: string;
  good: boolean;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// ここでの「ゲージの塗り具合」は同業他社との統計的な順位(パーセンタイル)ではなく、
// 一般的に良いとされるしきい値(stockInsights.tsのルールと同じ基準)を0-100に正規化した
// 目安のスコアであることに注意。「上位◯%」のような順位表現はしない。
function per(v: number | null) {
  if (v == null || v <= 0) return null;
  return Math.round(clamp(100 - ((v - 5) / (30 - 5)) * 100, 0, 100));
}
function pbr(v: number | null) {
  if (v == null || v <= 0) return null;
  return Math.round(clamp(100 - ((v - 0.5) / (3 - 0.5)) * 100, 0, 100));
}
function roe(v: number | null) {
  if (v == null) return null;
  return Math.round(clamp((v / 25) * 100, 0, 100));
}
function equityRatio(v: number | null) {
  if (v == null) return null;
  return Math.round(clamp((v / 70) * 100, 0, 100));
}
function dividendYield(v: number | null) {
  if (v == null) return null;
  return Math.round(clamp((v / 6) * 100, 0, 100));
}
function marketCap(v: number | null) {
  if (v == null || v <= 0) return null;
  const log = Math.log10(v);
  return Math.round(clamp(((log - 9) / (14 - 9)) * 100, 0, 100));
}

function formatMarketCap(v: number | null, currency: string | null): string {
  if (v == null) return "—";
  const unit = currency === "JPY" ? "兆円" : "B";
  const value = currency === "JPY" ? v / 1e12 : v / 1e9;
  return `${value.toFixed(1)}${unit}`;
}

export function buildGaugeSpecs(m: StockMetrics): GaugeSpec[] {
  const isFinancial = isFinancialSector(m.sector);
  const perScore = per(m.per);
  const pbrScore = pbr(m.pbr);
  const roeScore = roe(m.roe);
  const equityScore = isFinancial ? null : equityRatio(m.equityRatio);
  const divScore = dividendYield(m.dividendYield);
  const capScore = marketCap(m.marketCap);

  return [
    {
      key: "per",
      label: "PER割安度",
      score: perScore,
      valueText: m.per != null ? `${m.per.toFixed(1)}倍` : "—",
      benchmarkText: "目安15倍以下",
      tooltip:
        "PER(株価収益率): 株価が1株当たり利益の何倍まで買われているかを示す指標。低いほど割安とされ、一般的に15倍以下が目安",
      good: (perScore ?? 0) >= 70,
    },
    {
      key: "pbr",
      label: "PBR割安度",
      score: pbrScore,
      valueText: m.pbr != null ? `${m.pbr.toFixed(2)}倍` : "—",
      benchmarkText: "目安1.5倍以下",
      tooltip:
        "PBR(株価純資産倍率): 株価が1株当たり純資産の何倍まで買われているかを示す指標。1倍未満は資産価値より株価が安いことを意味し、1.5倍以下が割安の目安",
      good: (pbrScore ?? 0) >= 70,
    },
    {
      key: "roe",
      label: "資本効率(ROE)",
      score: roeScore,
      valueText: m.roe != null ? `${m.roe.toFixed(1)}%` : "—",
      benchmarkText: "目安10%以上",
      tooltip:
        "ROE(自己資本利益率): 自己資本に対してどれだけ利益を生み出せているかを示す指標。10%以上が目安、15%以上は資本効率が高いとされる",
      good: (m.roe ?? 0) >= 15,
    },
    {
      key: "equity",
      label: "財務健全性",
      score: equityScore,
      valueText: m.equityRatio != null ? `${m.equityRatio.toFixed(1)}%` : "—",
      benchmarkText: isFinancial ? "銀行・金融株は業種特性上、対象外" : "自己資本比率 目安40%以上",
      tooltip: isFinancial
        ? "自己資本比率: 銀行・保険などの金融セクターは預金や保険契約準備金が負債計上されるため、自己資本比率が構造的に低くなります(メガバンクでも数%台が普通)。一般事業会社向けの目安をそのまま当てはめられないため、この銘柄では評価対象外にしています。"
        : "自己資本比率: 総資産のうち返済不要の自己資本が占める割合。高いほど負債への依存が少なく、40%以上が財務健全の目安とされる",
      good: !isFinancial && (m.equityRatio ?? 0) >= 60,
    },
    {
      key: "dividend",
      label: "配当利回り",
      score: divScore,
      valueText: m.dividendYield != null ? `${m.dividendYield.toFixed(1)}%` : "—",
      benchmarkText: "目安4%以上で高配当",
      tooltip:
        "配当利回り: 株価に対する年間配当金の割合。4%以上は高配当株の目安とされるが、利回りが極端に高い場合は減配リスクにも注意",
      good: (m.dividendYield ?? 0) >= 4,
    },
    {
      key: "marketcap",
      label: "規模(時価総額)",
      score: capScore,
      valueText: formatMarketCap(m.marketCap, m.currency),
      benchmarkText: "大きいほど値動きは安定的",
      tooltip:
        "時価総額: 株価×発行済株式数で算出する企業の市場価値。大きいほど値動きは相対的に安定しやすい傾向がある",
      good: false,
    },
  ];
}
