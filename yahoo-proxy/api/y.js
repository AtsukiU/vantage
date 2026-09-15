// VANTAGE(Render上のNext.jsアプリ)からYahoo Financeへの中継プロキシ。
//
// Renderのサーバー(IPアドレス)から直接Yahoo Financeの認証必須エンドポイント
// (v10/finance/quoteSummary、fundamentals-timeseriesなど)を叩くと、200 OKなのに
// 財務データの中身が空、という形で静かにブロックされることが判明した。VercelのIPは
// ブロックされていないため、この関数を「Yahooへの代理アクセス役」として使う。
//
// 使い方: GET /api/y?url=<encodeURIComponentしたYahooのURL>
// - リクエストヘッダー x-proxy-cookie があれば、そのままYahooへの Cookie ヘッダーとして渡す
// - レスポンスは { status, body, setCookies } のJSON(Set-Cookieは複数あり得るため配列で返す。
//   呼び出し元のyahooProxyFetch.tsがこれを元のResponse相当に組み立て直す)

const ALLOWED_HOSTS = new Set([
  "fc.yahoo.com",
  "query1.finance.yahoo.com",
  "query2.finance.yahoo.com",
]);

const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; StockNewsApp/1.0)" };

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

module.exports = async function handler(req, res) {
  const target = req.query.url;
  if (!target || typeof target !== "string") {
    res.status(400).json({ error: "missing url query param" });
    return;
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    res.status(400).json({ error: "invalid url" });
    return;
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    res.status(403).json({ error: "host not allowed" });
    return;
  }

  const headers = { ...HEADERS };
  const cookie = req.headers["x-proxy-cookie"];
  if (cookie) headers["Cookie"] = Array.isArray(cookie) ? cookie[0] : cookie;

  try {
    const upstream = await fetch(parsed.toString(), { headers });
    const body = await upstream.text();
    res.status(200).json({
      status: upstream.status,
      body,
      setCookies: getSetCookies(upstream.headers),
    });
  } catch (e) {
    res.status(502).json({ error: "upstream fetch failed", detail: e instanceof Error ? e.message : String(e) });
  }
};
