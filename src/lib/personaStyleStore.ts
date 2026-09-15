"use client";

// 運用アドバイザーの「重視するスタイル」設定(バリュー重視/グロース重視/指定なし)。
// modeStore.tsと同じlocalStorage(+クラウド同期)パターン。選択すると、統括マネージャーの
// 合議(仮想シミュレーション・実ポートフォリオ助言の両方)から対立スタイルの運用者が除外される
// (personaRules.tsのactivePersonaIds参照)。中立の運用者は常に参加する。

import { loadLocal, saveLocal } from "./localStore";
import type { PersonaStyle } from "./personaDefs";

const STORAGE_KEY = "stockapp.personaStyle.v1";
const DEFAULT_STYLE: PersonaStyle | null = null;

export async function loadPersonaStyle(): Promise<PersonaStyle | null> {
  const value = await loadLocal<PersonaStyle | null>(STORAGE_KEY, DEFAULT_STYLE);
  return value === "value" || value === "growth" ? value : null;
}

export async function savePersonaStyle(style: PersonaStyle | null): Promise<void> {
  await saveLocal(STORAGE_KEY, style);
}
