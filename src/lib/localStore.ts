"use client";

// 各*Store.tsが使う共通ヘルパー。
// loadLocal/saveLocal: このブラウザのlocalStorageだけに保存する(端末をまたいだ同期はしない)。
// テーマ・明暗モードのような「端末ごとの見た目の好み」はこちらを使う。
// loadSynced/saveSynced: /api/store/[key] 経由でUpstash Redisにも保存し、複数ブラウザ/端末で
// 同じデータが見えるようにする。保有銘柄・ウォッチリストなど「ユーザー本人のデータ」はこちら。
// Redis未設定(ローカル開発でUpstashアカウントを持っていない場合)は自動的にlocalStorageのみの
// 従来動作にフォールバックする。Promiseを返す非同期関数にしているのは、以前サーバー同期ありだった
// 頃の呼び出し側(await loadX() / saveX().then(...))をそのまま使えるようにするため。

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

// localKey: 従来通りlocalStorageに使うキー(各ストアの既存STORAGE_KEYをそのまま渡す)。
// syncKey: /api/store/[key] のURL部分に使う短い名前(サーバー側ALLOWED_KEYSと対応)。
export async function loadSynced<T>(localKey: string, syncKey: string, fallback: T): Promise<T> {
  const local = await loadLocal<T>(localKey, fallback);
  if (typeof window === "undefined") return local;
  try {
    const res = await fetch(`/api/store/${syncKey}`, { cache: "no-store" });
    if (!res.ok) return local;
    const json = (await res.json()) as { value: T | null; configured: boolean };
    if (!json.configured) return local; // Upstash未設定 → localStorageのみで運用
    if (json.value !== null && json.value !== undefined) {
      // サーバー側に既にデータがある → そちらを正としてlocalStorageにもミラーしておく
      // (次回オフライン時や読み込み失敗時のフォールバックとして残す)。
      void saveLocal(localKey, json.value);
      return json.value;
    }
    // サーバー側は設定済みだが空(このユーザーが同期を使うのが初めて) → ローカルの既存データを
    // 一度だけ押し上げる。これによりlocalStorageにあった実データが消えることなく引き継がれる。
    void fetch(`/api/store/${syncKey}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(local),
    }).catch(() => {});
    return local;
  } catch {
    return local;
  }
}

export async function saveSynced(localKey: string, syncKey: string, value: unknown): Promise<void> {
  await saveLocal(localKey, value);
  if (typeof window === "undefined") return;
  try {
    await fetch(`/api/store/${syncKey}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
  } catch {
    // オフライン等で失敗してもlocalStorageには保存済みなので致命的ではない
  }
}
