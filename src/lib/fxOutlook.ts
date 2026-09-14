// 円安/円高の局面を判定し、「新規に買うなら日本株(輸出関連)と米国株のどちらが
// 為替の観点でやや有利か」を機械的に導くための軽量な観測ロジック。
// 個別銘柄の売買推奨(personaStore等)とは独立していて、あくまで参考情報のカードとして使う。

const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; StockNewsApp/1.0)" };

export type FxPhase = "円安進行中" | "円安基調" | "中立" | "円高基調" | "円高進行中";

export interface FxOutlook {
  usdJpy: number;
  changePercent: number; // 前日比
  ma50: number | null;
  ma200: number | null;
  vsMa50Pct: number | null;
  vsMa200Pct: number | null;
  roc20dPct: number | null; // 直近20営業日(約1か月)の変化率
  phase: FxPhase;
  lean: string;
  reasoning: string[];
}

function sma(closes: number[], n: number): number | null {
  if (closes.length < n) return null;
  const slice = closes.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function derivePhase(vsMa50Pct: number | null, vsMa200Pct: number | null, roc20dPct: number | null): FxPhase {
  const aboveBoth = vsMa50Pct != null && vsMa50Pct > 0 && vsMa200Pct != null && vsMa200Pct > 0;
  const belowBoth = vsMa50Pct != null && vsMa50Pct < 0 && vsMa200Pct != null && vsMa200Pct < 0;
  const strongUp = roc20dPct != null && roc20dPct >= 1.5;
  const strongDown = roc20dPct != null && roc20dPct <= -1.5;

  if (aboveBoth && strongUp) return "円安進行中";
  if (aboveBoth) return "円安基調";
  if (belowBoth && strongDown) return "円高進行中";
  if (belowBoth) return "円高基調";
  return "中立";
}

function deriveLeanAndReasoning(phase: FxPhase): { lean: string; reasoning: string[] } {
  switch (phase) {
    case "円安進行中":
    case "円安基調":
      return {
        lean: "日本株(輸出関連)がやや有利",
        reasoning: [
          "円安局面: 輸出企業中心の日本株は海外収益の円換算額が膨らみ、業績面で追い風になりやすい",
          "米国株を今から円で新規に買う場合、為替的には割高な水準で仕込むことになり、将来円高に振れた際の目減りリスクを抱えやすい",
        ],
      };
    case "円高進行中":
    case "円高基調":
      return {
        lean: "米国株がやや有利(為替メリット)",
        reasoning: [
          "円高局面: 輸出企業中心の日本株は海外収益の円換算額が目減りし、業績面で逆風になりやすい",
          "米国株を円で新規に買うなら、為替的には相対的に安く仕込める水準",
        ],
      };
    default:
      return {
        lean: "中立(為替だけでは判断材料が弱い)",
        reasoning: ["方向感の乏しいレンジ相場です。為替を理由に日本株/米国株の配分を大きく傾ける根拠は現状弱く、個別銘柄の業績・バリュエーションを優先した方がよさそうです"],
      };
  }
}

// 1年分の日足を取得して計算する比較的重い処理な上、複数のタブから同じ結果を求められるため、
// 短時間だけプロセス内にキャッシュする(quotes.ts・marketBenchmark.tsと同じ考え方)。
// 移動平均ベースの局面判定なので、1分程度の遅延は実用上問題にならない。
const CACHE_TTL_MS = 60 * 1000;
let cache: { data: FxOutlook | null; fetchedAt: number } | null = null;

export async function fetchFxOutlook(): Promise<FxOutlook | null> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.data;
  const data = await fetchFxOutlookUncached();
  cache = { data, fetchedAt: Date.now() };
  return data;
}

async function fetchFxOutlookUncached(): Promise<FxOutlook | null> {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/JPY=X?range=1y&interval=1d";
  const res = await fetch(url, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const meta = result?.meta;
  const rawCloses: (number | null)[] | undefined = result?.indicators?.quote?.[0]?.close;
  if (!meta || typeof meta.regularMarketPrice !== "number" || !rawCloses) return null;

  const closes = rawCloses.filter((c): c is number => typeof c === "number");
  if (closes.length < 20) return null;

  const usdJpy = meta.regularMarketPrice;
  // range=1yで取得すると chartPreviousClose が前日終値ではなくレンジ起点付近の値になることがあるため、
  // meta.regularMarketChangePercent(Yahoo側で計算済みの前日比)を優先して使う。
  const changePercent: number =
    typeof meta.regularMarketChangePercent === "number"
      ? meta.regularMarketChangePercent
      : (() => {
          const previousClose: number | undefined = meta.chartPreviousClose ?? meta.previousClose;
          return typeof previousClose === "number" && previousClose !== 0 ? ((usdJpy - previousClose) / previousClose) * 100 : 0;
        })();

  const ma50 = sma(closes, 50);
  const ma200 = sma(closes, 200);
  const vsMa50Pct = ma50 != null ? ((usdJpy - ma50) / ma50) * 100 : null;
  const vsMa200Pct = ma200 != null ? ((usdJpy - ma200) / ma200) * 100 : null;

  const closeMonthAgo = closes.length >= 21 ? closes[closes.length - 21] : null;
  const roc20dPct = closeMonthAgo != null ? ((usdJpy - closeMonthAgo) / closeMonthAgo) * 100 : null;

  const phase = derivePhase(vsMa50Pct, vsMa200Pct, roc20dPct);
  const { lean, reasoning } = deriveLeanAndReasoning(phase);

  return { usdJpy, changePercent, ma50, ma200, vsMa50Pct, vsMa200Pct, roc20dPct, phase, lean, reasoning };
}
