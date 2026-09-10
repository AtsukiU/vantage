import raw from "./data/jpListedCompanies.json";

// JPX(日本取引所グループ)が公開している「東証上場銘柄一覧」を取り込んだ検索用データ。
// https://www.jpx.co.jp/markets/statistics-equities/misc/01.html の data_j.xlsx を
// コード・銘柄名・市場区分の3列だけに絞って抽出したもの(約4,400件、内国株式+ETF/REIT等)。
// Yahoo Financeの検索APIは日本語のカタカナ・中小型株名に弱いため、この一覧をローカルで
// 前方一致・部分一致検索することで、東証上場銘柄であればほぼ全てを日本語名から見つけられる。

interface JpListedEntry {
  code: string;
  name: string;
  market: string;
}

const ENTRIES: JpListedEntry[] = (raw as [string, string, string][]).map(([code, name, market]) => ({
  code,
  name,
  market,
}));

// 銘柄名は全角英数字で登録されていることが多いため、半角に正規化してから照合する
// (例: "ＮＥＸＴ　ＦＵＮＤＳ" -> "next funds")。
function toHalfWidth(s: string): string {
  return s
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ")
    .trim();
}

const NORMALIZED = ENTRIES.map((entry) => ({
  entry,
  normalizedName: toHalfWidth(entry.name).toLowerCase(),
}));

const BY_CODE = new Map(ENTRIES.map((e) => [e.code, e]));

function inferQuoteType(market: string): string {
  if (market.includes("ETF") || market.includes("REIT")) return "ETF";
  return "EQUITY";
}

export interface JpDirectoryResult {
  symbol: string;
  name: string;
  exchange: string;
  quoteType: string;
}

function toResult(entry: JpListedEntry): JpDirectoryResult {
  return {
    symbol: `${entry.code}.T`,
    name: entry.name,
    exchange: entry.market,
    quoteType: inferQuoteType(entry.market),
  };
}

// 「本日の注目銘柄」の毎日フルスキャン対象。プライム市場(内国株式・外国株式)のみに絞り、
// ETF/REIT/PRO Marketなどファンダメンタル分析の対象にならない区分は除外する。
// 約1,550銘柄になる(スタンダード・グロースまで含めると4,000社超になり、非公式APIへの
// 問い合わせ回数が過大になるため対象外にしている)。
export function getPrimeMarketTickers(): { ticker: string; name: string }[] {
  return ENTRIES.filter((e) => e.market.includes("プライム")).map((e) => ({
    ticker: `${e.code}.T`,
    name: e.name,
  }));
}

export function searchJpListedDirectory(query: string, limit = 8): JpDirectoryResult[] {
  const trimmed = query.trim();
  const q = toHalfWidth(trimmed).toLowerCase();
  if (!q) return [];

  const results: JpDirectoryResult[] = [];
  const seen = new Set<string>();

  function push(entry: JpListedEntry) {
    if (seen.has(entry.code)) return;
    seen.add(entry.code);
    results.push(toResult(entry));
  }

  // 証券コード(4桁)そのものでの検索
  if (/^\d{4}$/.test(trimmed)) {
    const byCode = BY_CODE.get(trimmed);
    if (byCode) push(byCode);
  }

  // 完全一致
  for (const { entry, normalizedName } of NORMALIZED) {
    if (results.length >= limit) break;
    if (normalizedName === q) push(entry);
  }
  // 前方一致
  for (const { entry, normalizedName } of NORMALIZED) {
    if (results.length >= limit) break;
    if (normalizedName.startsWith(q)) push(entry);
  }
  // 部分一致
  for (const { entry, normalizedName } of NORMALIZED) {
    if (results.length >= limit) break;
    if (normalizedName.includes(q)) push(entry);
  }

  return results.slice(0, limit);
}
