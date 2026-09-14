// 公開デプロイ時の簡易パスワードゲートで使う共有ロジック(proxy.ts / api/login両方から参照)。
// APP_PASSWORD環境変数が未設定ならゲート自体が無効になる(ローカル開発時に必須にしないため)。

import crypto from "node:crypto";

export const AUTH_COOKIE_NAME = "vantage_session";
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180日

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// Cookieには平文パスワードではなくハッシュ値を入れる(漏洩時に元のパスワードが直接わからないように)。
export function expectedAuthCookieValue(): string | null {
  const password = process.env.APP_PASSWORD;
  return password ? hashPassword(password) : null;
}

export function isCorrectPassword(input: string): boolean {
  const expected = expectedAuthCookieValue();
  if (!expected) return false;
  const inputHash = hashPassword(input);
  const a = Buffer.from(inputHash, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
