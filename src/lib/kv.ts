import { Redis } from "@upstash/redis";

// Upstash Redis(REST API)の薄いラッパー。環境変数UPSTASH_REDIS_REST_URL /
// UPSTASH_REDIS_REST_TOKENが無い場合は例外を投げず、呼び出し元がローカル開発時に
// fs/localStorageへフォールバックできるようにする(ローカルでnpm run devする時に
// Upstashアカウントを必須にしないため)。

let client: Redis | null | undefined;

function getClient(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}

export function isKvConfigured(): boolean {
  return getClient() !== null;
}

export async function getJson<T>(key: string): Promise<T | null> {
  const c = getClient();
  if (!c) return null;
  const value = await c.get<T>(key);
  return value ?? null;
}

export async function setJson(key: string, value: unknown): Promise<void> {
  const c = getClient();
  if (!c) return;
  await c.set(key, value);
}
