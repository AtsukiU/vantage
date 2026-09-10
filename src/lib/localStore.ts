"use client";

// 各*Store.tsが使う共通ヘルパー: このブラウザのlocalStorageだけに保存する(端末をまたいだ
// 同期はしない、ローカル専用運用)。Promiseを返す非同期関数にしているのは、以前サーバー同期
// ありだった頃の呼び出し側(await loadX() / saveX().then(...))をそのまま使えるようにするため。

export async function loadLocal<T>(key: string, fallback: T): Promise<T> {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function saveLocal(key: string, value: unknown): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 容量超過等は無視
  }
}
