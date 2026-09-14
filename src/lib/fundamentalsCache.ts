import fs from "fs";
import path from "path";
import { getJson, setJson, isKvConfigured } from "./kv";

// 財務諸表・自己資本比率・配当履歴・インサイダー動向など、四半期〜年単位でしか実質的に
// 変わらない「遅い」データをディスクに永続キャッシュする。本日の注目銘柄フルスキャンは
// 同じ約2,050銘柄を毎日評価するが、これらの値は前日からほぼ変わらないため、キャッシュ
// できれば2日目以降のスキャンで実際のYahoo Financeへの問い合わせ数を大きく減らせる
// (価格・テクニカル・相対力など本当に毎日変わる値は対象外で、常に新しく取得する)。
// スキャンの並列数(dailyScreenStore.tsのCONCURRENCY)を上げてYahoo側のレート制限に
// 近づくのではなく、そもそも同じデータを毎日取り直さないようにする狙い。
// プロセス内メモリではなくディスクにするのは、開発サーバーの再起動をまたいでも
// 効果が続くようにするため。

const CACHE_FILE = path.join(process.cwd(), ".data", "fundamentals-cache.json");
const KV_KEY = "fundamentals-cache";

interface Entry<T> {
  data: T;
  fetchedAt: number;
}

let store: Record<string, Entry<unknown>> | null = null;
// load()が複数同時に呼ばれても実際の読み込み(Redis/fs)は1回だけになるよう、
// 進行中のロードをPromiseとして共有する(Redis化に伴いload()が非同期になったため、
// 元のfs同期読み込み+モジュール内シングルトンと同じ「1回だけ読む」性質を保つ必要がある)。
let loadPromise: Promise<Record<string, Entry<unknown>>> | null = null;

async function load(): Promise<Record<string, Entry<unknown>>> {
  if (store) return store;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        if (isKvConfigured()) {
          return (await getJson<Record<string, Entry<unknown>>>(KV_KEY)) ?? {};
        }
        return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8")) as Record<string, Entry<unknown>>;
      } catch {
        return {};
      }
    })();
  }
  store = await loadPromise;
  return store;
}

// 銘柄1つずつ書き込むと2,050回のI/Oが発生するため、短時間まとめて1回だけ保存する。
let saveTimer: NodeJS.Timeout | null = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    (async () => {
      try {
        if (isKvConfigured()) {
          await setJson(KV_KEY, store);
          return;
        }
        fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
        fs.writeFileSync(CACHE_FILE, JSON.stringify(store));
      } catch (e) {
        console.error("Failed to persist fundamentals cache", e);
      }
    })();
  }, 2000);
}

export async function cachedFundamental<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const s = await load();
  const hit = s[key] as Entry<T> | undefined;
  if (hit && Date.now() - hit.fetchedAt < ttlMs) return hit.data;

  const data = await fetcher();
  s[key] = { data, fetchedAt: Date.now() };
  scheduleSave();
  return data;
}
