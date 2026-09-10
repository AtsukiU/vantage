import raw from "./data/sp500Companies.json";

// S&P500構成銘柄一覧(Wikipediaの「List of S&P 500 companies」から抽出、約503件)。
// 米国株には日本のJPXのような無料で使える公式全銘柄一覧が無いため、「本日の注目銘柄」の
// 米国株版はS&P500を「主要市場」相当の対象として使う(日本株のプライム市場と同じ位置づけ)。
// ティッカーの株式クラス表記(BRK.B等)はYahoo Finance形式のハイフン(BRK-B)に変換済み。

interface Sp500Entry {
  symbol: string;
  name: string;
}

const ENTRIES = raw as Sp500Entry[];

export function getSp500Tickers(): { ticker: string; name: string }[] {
  return ENTRIES.map((e) => ({ ticker: e.symbol, name: e.name }));
}
