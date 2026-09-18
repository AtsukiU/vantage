"use client";

import { useEffect } from "react";

// PWAとしてインストール可能にするため、最小限のService Worker(public/sw.js)を登録する。
// Chromeはインストール導線(アドレスバーのインストールアイコンや「アプリをインストール」
// メニュー)を出す条件の一つとして、fetchイベントを処理するService Workerの登録を要求するため
// (マニフェストだけでは出ないことがある)。
export function ServiceWorkerInit() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 登録に失敗してもアプリ自体は通常のWebページとして動くので無視する
    });
  }, []);
  return null;
}
