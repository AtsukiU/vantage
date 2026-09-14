"use client";

import { useEffect } from "react";
import { loadMode, applyModeToDocument } from "@/lib/modeStore";

// ThemeInit(アクセントカラー)と同じ仕組みで、保存済みのライト/ダーク/システム設定を
// マウント時に<html data-mode>へ反映する。
export function ModeInit() {
  useEffect(() => {
    loadMode().then(applyModeToDocument);
  }, []);
  return null;
}
