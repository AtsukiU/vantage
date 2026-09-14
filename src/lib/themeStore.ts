"use client";

// 設定タブで切り替える見た目のテーマ(アクセントカラー・ページ背景・ヒーロー強調色・
// 背景の光暈のみを差し替える。本文の文字色・境界線・カード面の中間グレーは全テーマ共通)。
// globals.cssの [data-theme="..."] と対応させる。

import { loadLocal, saveLocal } from "./localStore";

export type ThemeId = "gold" | "green" | "orange" | "yellow" | "cyan";

export interface ThemeDef {
  id: ThemeId;
  label: string;
  description: string;
  accent: string;
  accentHover: string;
  accentStrong: string;
  hero: string;
  background: string;
  glow: string;
  // ダッシュボードの単色4段階トーン(濃→淡)。globals.cssの--tone-1..4と対応。
  tones: [string, string, string, string];
}

export const THEMES: ThemeDef[] = [
  {
    id: "cyan",
    label: "シアン",
    description: "モダンなwebapp風の既定テーマ。単色シアンの濃淡で情報を整理。",
    accent: "#0891b2",
    accentHover: "#077288",
    accentStrong: "#066a85",
    hero: "#066a85",
    background: "#eef3f5",
    glow: "#4fb3cf",
    tones: ["#066a85", "#0891b2", "#4fb3cf", "#c3e6f0"],
  },
  {
    id: "gold",
    label: "ゴールド",
    description: "VANTAGE従来のテーマ。温かみのあるクリーム×ゴールド。",
    accent: "#c9962f",
    accentHover: "#ab7d24",
    accentStrong: "#cf9a4c",
    hero: "#d9662c",
    background: "#f2ead2",
    glow: "#f5c84c",
    tones: ["#8a6318", "#c9962f", "#dfb567", "#f3ddb0"],
  },
  {
    id: "green",
    label: "グリーン",
    description: "落ち着いたセージグリーン×アイボリー。",
    accent: "#6b8f66",
    accentHover: "#557350",
    accentStrong: "#3d5540",
    hero: "#3d5540",
    background: "#f1efe6",
    glow: "#a9c19f",
    tones: ["#3d5540", "#6b8f66", "#97b391", "#cfe0ca"],
  },
  {
    id: "orange",
    label: "オレンジ",
    description: "鮮やかなオレンジ×ニュートラルグレー。",
    accent: "#ee5a2b",
    accentHover: "#d54a1f",
    accentStrong: "#b8441a",
    hero: "#ee5a2b",
    background: "#ececec",
    glow: "#f2a37a",
    tones: ["#b8441a", "#ee5a2b", "#f38a5f", "#fbd0bb"],
  },
  {
    id: "yellow",
    label: "イエロー",
    description: "マスタードイエロー×ペールクリーム。",
    accent: "#e0b23c",
    accentHover: "#c79a2e",
    accentStrong: "#a67e1f",
    hero: "#e0b23c",
    background: "#f7f1de",
    glow: "#f2d98a",
    tones: ["#a67e1f", "#e0b23c", "#ecc873", "#f7e6b8"],
  },
];

const STORAGE_KEY = "stockapp.theme.v1";
const DEFAULT_THEME: ThemeId = "cyan";

export function themeDef(id: ThemeId): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export async function loadTheme(): Promise<ThemeId> {
  const value = await loadLocal<ThemeId>(STORAGE_KEY, DEFAULT_THEME);
  return THEMES.some((t) => t.id === value) ? value : DEFAULT_THEME;
}

export async function saveTheme(id: ThemeId): Promise<void> {
  await saveLocal(STORAGE_KEY, id);
}

// <html data-theme="..."> とアドレスバーの色(meta[name=theme-color])に反映する。
// data-theme="gold"(既定)はglobals.cssの:rootそのものなので属性自体は省略しても良いが、
// 明示しておくことで「どのテーマが今適用されているか」をDOM上からも判別しやすくする。
export function applyThemeToDocument(id: ThemeId): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = id;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", themeDef(id).accent);
}
