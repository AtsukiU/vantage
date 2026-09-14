"use client";

// ライト/ダーク/システム追従の切り替え。themeStore.ts(アクセントカラー5色)とは独立した軸。
// <html data-mode="..."> で切り替える(globals.cssの:root[data-mode="dark"]、および
// システム追従時は@media (prefers-color-scheme: dark)側が反応する)。
// data-mode="light"を明示的に持たせることで、システムがダークでも強制的にライトへ
// 固定できる(system選択時はdata-mode属性自体を外し、OS設定にそのまま追従させる)。

import { loadLocal, saveLocal } from "./localStore";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "stockapp.mode.v1";
const DEFAULT_MODE: ThemeMode = "system";

export async function loadMode(): Promise<ThemeMode> {
  const value = await loadLocal<ThemeMode>(STORAGE_KEY, DEFAULT_MODE);
  return value === "light" || value === "dark" || value === "system" ? value : DEFAULT_MODE;
}

export async function saveMode(mode: ThemeMode): Promise<void> {
  await saveLocal(STORAGE_KEY, mode);
}

export function applyModeToDocument(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  if (mode === "system") {
    delete document.documentElement.dataset.mode;
  } else {
    document.documentElement.dataset.mode = mode;
  }
}
