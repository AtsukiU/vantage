# yahoo-proxy

VANTAGE本体(Render)からYahoo Financeへの中継プロキシ。Renderのサーバーからだと、
Yahoo Financeの財務データ(PER/PBR/ROEなど)が200 OKなのに中身が空、という形で
ブロックされることが分かったため、ブロックされていないVercel経由でアクセスする。

## デプロイ方法

1. Vercelのダッシュボードで「Add New...」→「Project」
2. このリポジトリ(vantage)をimport
3. 「Root Directory」を `yahoo-proxy` に設定(重要: ここを指定しないと本体のNext.jsアプリを
   デプロイしようとしてしまう)
4. Framework Presetは「Other」のままでOK(このフォルダはフレームワーク不要)
5. デプロイ

デプロイ完了後のURL(例: `https://yahoo-proxy-xxxx.vercel.app`)の末尾に `/api/y` を付けた
ものを、VANTAGE本体側の環境変数 `YAHOO_PROXY_URL` に設定する
(例: `https://yahoo-proxy-xxxx.vercel.app/api/y`)。

## 仕組み

`GET /api/y?url=<encodeURIComponentしたYahooのURL>` を受け取り、許可リストにある
Yahoo Financeのホスト(fc.yahoo.com / query1.finance.yahoo.com / query2.finance.yahoo.com)
にだけ中継する。認証に必要なCookieはリクエストヘッダー `x-proxy-cookie` で受け渡しする。

レスポンスは `{ status, body, setCookies }` のJSON(Set-Cookieは複数あり得るため配列)。
呼び出し元(VANTAGE本体の `src/lib/yahooProxyFetch.ts`)がこれを元のFetch Response相当に
組み立て直して使う。
