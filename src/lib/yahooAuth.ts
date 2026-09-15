// Yahoo Financeの v10/finance/quoteSummary エンドポイントは(v8/finance/chart や検索APIと違い)
// クッキー+crumb(CSRFトークン相当)を要求するようになっている。yfinance等が使っているのと同じ
// 2段階フロー(fc.yahoo.comでセッションクッキー取得 → getcrumbでcrumb取得)を実装し、
// プロセス内でキャッシュして使い回す。
// この2つのfetchはyahooFetch経由にしている(YAHOO_PROXY_URL設定時はVercel中継プロキシを通す。
// Renderからだとこの認証フロー自体は成立するが、この後のquoteSummary本体の中身が空で返って
// くるという劣化が起きているため、プロキシは主にstockMetrics.ts側のfetchYahooAuthenticatedで
// 効いてくる。ここも念のため揃えておく)。

import { yahooFetch } from "./yahooProxyFetch";

export interface YahooAuth {
  cookie: string;
  crumb: string;
  fetchedAt: number;
}

const TTL_MS = 50 * 60 * 1000;
// このfetchが固まると、全銘柄が待つ共有pendingプロミスごと止まってしまう(スキャン全体の
// フリーズにつながった実例があるため、タイムアウトは特に重要)。
const FETCH_TIMEOUT_MS = 15000;
// 1550銘柄超のフルスキャンで実測した現象: 同じcookie+crumbを大量リクエストで使い続けると、
// Yahoo側が401/429のような明示的エラーを返さずに「200 OKだがfinancialData等の中身が空」という
// 静かな劣化を起こす(財務健全性スコアが実際は健全な大型株でも軒並み0点になる原因だった)。
// 時間ベースのTTLだけでは検知できないため、リクエスト件数ベースでも定期的に強制更新する
// (何件で劣化し始めるかはYahoo非公式APIの挙動で厳密には不明なため、安全側に倒した目安値)。
const REFRESH_AFTER_REQUESTS = 200;

let cached: YahooAuth | null = null;
let pending: Promise<YahooAuth> | null = null;
let requestsSinceRefresh = 0;

function parseCookieHeader(setCookies: string[]): string {
  return setCookies.map((sc) => sc.split(";")[0]).join("; ");
}

function getSetCookies(headers: Headers): string[] {
  const anyHeaders = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === "function") return anyHeaders.getSetCookie();
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

async function fetchFreshAuth(): Promise<YahooAuth> {
  const cookieRes = await yahooFetch("https://fc.yahoo.com", {}, FETCH_TIMEOUT_MS);
  const cookie = parseCookieHeader(getSetCookies(cookieRes.headers));
  if (!cookie) throw new Error("failed to obtain Yahoo session cookie");

  const crumbRes = await yahooFetch(
    "https://query2.finance.yahoo.com/v1/test/getcrumb",
    { Cookie: cookie },
    FETCH_TIMEOUT_MS
  );
  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.includes("<html")) throw new Error("failed to obtain Yahoo crumb");

  return { cookie, crumb, fetchedAt: Date.now() };
}

export async function getYahooAuth(forceRefresh = false): Promise<YahooAuth> {
  const staleByVolume = requestsSinceRefresh >= REFRESH_AFTER_REQUESTS;
  if (!forceRefresh && !staleByVolume && cached && Date.now() - cached.fetchedAt < TTL_MS) {
    requestsSinceRefresh++;
    return cached;
  }
  // forceRefresh(401検知)でも既に進行中のリフレッシュがあればそれに相乗りする。バッチスキャンでは
  // 複数銘柄が同時に401を検知しがちで、以前はここが!forceRefreshの時しか効かず、各リクエストが
  // 個別にfc.yahoo.com+getcrumbを叩く「サンダリングハード」が起きて一時的な失敗の連鎖(特定の
  // 銘柄群だけ財務データが軒並み欠落する)につながっていた。
  if (pending) return pending;

  // 無効と判明した(または劣化が疑われる)crumbを、この直後に来る他の同時呼び出しが
  // 再利用しないよう先に無効化しておく。
  cached = null;
  requestsSinceRefresh = 0;
  pending = fetchFreshAuth()
    .then((auth) => {
      cached = auth;
      return auth;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}
