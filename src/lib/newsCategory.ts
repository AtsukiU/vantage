// ニュース記事のタイトルから内容を推定して分類する(見出しパターンに基づくヒューリスティック、
// 完璧な分類ではない)。RSSフィードは市場全体のニュース・個別銘柄の自動生成株価カード・
// ランキング記事・その他の解説記事が混在しているため、見やすく仕分けるために使う。

export type NewsCategory = "market" | "quote" | "ranking" | "other";

export const NEWS_CATEGORY_LABEL: Record<NewsCategory, string> = {
  market: "市場全体",
  quote: "銘柄・ファンド情報",
  ranking: "ランキング",
  other: "個別ニュース",
};

export const NEWS_CATEGORY_COLOR: Record<NewsCategory, string> = {
  market: "bg-blue-50 text-blue-700",
  quote: "bg-emerald-50 text-emerald-700",
  ranking: "bg-amber-50 text-amber-700",
  other: "bg-slate-100 text-slate-700",
};

// 【603A】【9I31115A】のような証券コード風の括弧表記(Yahoo!ファイナンス系の自動生成記事に多い)
const TICKER_BRACKET = /【[0-9A-Z]{3,6}】/;
const FUND_KEYWORDS = /NEXT FUNDS|iFree|上場投信|投資信託|ETF|ETN|ファンド|REIT指数|ブル|ベア/i;
const QUOTE_KEYWORDS = /株価・株式情報|基準価格|株式情報/;
const RANKING_KEYWORDS = /ランキング|値上がり率|値下がり率|出来高|注目度/;
const MARKET_KEYWORDS =
  /日経平均|ＴＯＰＩＸ|TOPIX|東証(プライム|スタンダード|グロース|REIT指数|業種別|終値|反発|続落|続伸)?|S&P|NASDAQ|NYダウ|ダウ平均|米国株式市場|為替|ドル円|円安|円高|金利|雇用統計|GDP|消費者物価|市況|騰落レシオ|全体相場|株式市場概況|寄付|大引け|前引け/;

export function categorizeNewsTitle(title: string): NewsCategory {
  if (TICKER_BRACKET.test(title) && (QUOTE_KEYWORDS.test(title) || FUND_KEYWORDS.test(title))) {
    return "quote";
  }
  if (RANKING_KEYWORDS.test(title)) return "ranking";
  if (MARKET_KEYWORDS.test(title)) return "market";
  return "other";
}
