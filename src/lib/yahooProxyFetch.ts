// Yahoo Financeの認証必須エンドポイント(crumb+cookie)は、Renderのサーバー(IPアドレス)からだと
// 200 OKなのに中身が空、という形で静かにブロックされていることが判明した(ローカルPC・他のクラウド
// からは正常に取れる)。恒久対応として、Vercel(無料枠)に建てた薄い中継プロキシ経由でYahooに
// アクセスできるようにする。YAHOO_PROXY_URL未設定時は今まで通り直接fetchする(ローカル開発や、
// 将来Renderのブロックが解除された場合はプロキシ無しでも動く)。
//
// プロキシ側(yahoo-proxy/api/y.js)は `{ status, body, setCookies }` のJSONで結果を包んで返す
// 決まりになっている(Set-Cookieはヘッダーだと複数値の扱いが面倒なため、配列で明示的に渡す)。

const PROXY_URL = process.env.YAHOO_PROXY_URL;
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; StockNewsApp/1.0)" };

export function isYahooProxyConfigured(): boolean {
  return !!PROXY_URL;
}

interface ProxyEnvelope {
  status: number;
  body: string;
  setCookies: string[];
}

export async function yahooFetch(
  url: string,
  extraHeaders: Record<string, string> = {},
  timeoutMs = 15000
): Promise<Response> {
  const headers: Record<string, string> = { ...HEADERS, ...extraHeaders };

  if (!PROXY_URL) {
    return fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  }

  const proxyHeaders: Record<string, string> = {};
  if (headers["Cookie"]) proxyHeaders["x-proxy-cookie"] = headers["Cookie"];

  const proxied = `${PROXY_URL}?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxied, { headers: proxyHeaders, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    // プロキシ自体に繋がらない(Vercel側の一時障害等)。呼び出し元の429/5xxリトライと同じ扱いに
    // できるよう、ダミーの5xxレスポンスとして返す。
    return new Response("", { status: 502 });
  }

  const envelope = (await res.json()) as ProxyEnvelope;
  const outHeaders = new Headers();
  for (const c of envelope.setCookies) outHeaders.append("set-cookie", c);
  return new Response(envelope.body, { status: envelope.status, headers: outHeaders });
}
