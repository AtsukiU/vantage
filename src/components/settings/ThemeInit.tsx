"use client";

import { useEffect } from "react";
import { loadTheme, applyThemeToDocument } from "@/lib/themeStore";

// マウント時に保存済みテーマを<html data-theme>へ反映する。beforeInteractiveスクリプトで
// SSR前に反映する方式も試したが、data-theme属性のハイドレーション不整合が解消できなかったため、
// 通常のuseEffect(ハイドレーション後に実行される)に倒した。トレードオフとして、保存済みテーマが
// ゴールド以外の場合はリロード直後の一瞬だけゴールトが見えてから切り替わる(フラッシュ)。
export function ThemeInit() {
  useEffect(() => {
    loadTheme().then(applyThemeToDocument);
  }, []);
  return null;
}
