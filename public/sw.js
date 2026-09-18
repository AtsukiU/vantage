// 最小限のService Worker。目的は「PWAとしてインストール可能にする」ことだけ
// (Chromeはインストール導線(アドレスバーのインストールアイコン等)を出す条件の一つとして、
// fetchイベントを処理するService Workerの登録を要求する)。
// 株価・本日の注目銘柄・運用アドバイザーの判断など、このアプリのデータは頻繁に変わるため、
// 意図的にキャッシュ戦略は持たない。誤って古いデータを返してしまう事故を避けるため、
// 全リクエストは素通りでそのままネットワークへ流す。

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
