"use client";

import { useEffect, useState } from "react";
import { GlassPageShell } from "../GlassPageShell";
import { GLASS_CARD } from "@/lib/glassStyles";
import { THEMES, loadTheme, saveTheme, applyThemeToDocument, type ThemeId } from "@/lib/themeStore";
import { loadMode, saveMode, applyModeToDocument, type ThemeMode } from "@/lib/modeStore";
import { Check, Palette, Sun, Moon, Monitor } from "lucide-react";

const MODES: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "ライト", icon: Sun },
  { id: "dark", label: "ダーク", icon: Moon },
  { id: "system", label: "システムに合わせる", icon: Monitor },
];

// 「設定」タブ: テーマ(アクセントカラー5色)とライト/ダーク/システムの切り替えを持つ。
// どちらも独立した軸で、組み合わせて使える(例: グリーンテーマ×ダーク)。
// 選択はこのブラウザのlocalStorageに保存し、次回起動時もlayout.tsxの初期化スクリプトで
// フラッシュ無しに復元する(themeStore.ts / modeStore.ts参照)。
export function SettingsTab({ hidden }: { hidden: boolean }) {
  const [current, setCurrent] = useState<ThemeId | null>(null);
  const [mode, setMode] = useState<ThemeMode | null>(null);

  useEffect(() => {
    if (hidden || current != null) return;
    loadTheme().then(setCurrent);
  }, [hidden, current]);

  useEffect(() => {
    if (hidden || mode != null) return;
    loadMode().then(setMode);
  }, [hidden, mode]);

  function selectTheme(id: ThemeId) {
    setCurrent(id);
    saveTheme(id);
    applyThemeToDocument(id);
  }

  function selectMode(id: ThemeMode) {
    setMode(id);
    saveMode(id);
    applyModeToDocument(id);
  }

  return (
    <section hidden={hidden} className="h-full">
      <GlassPageShell>
        <div className={`${GLASS_CARD} mb-3 sm:mb-4`}>
          <div className="flex items-center gap-2">
            <Palette size={16} strokeWidth={2.25} className="text-[var(--accent)]" />
            <h2 className="text-[12.5px] font-extrabold text-[var(--foreground)]">設定</h2>
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">アプリの見た目のテーマを切り替えられます。この端末のブラウザにのみ保存されます。</p>
        </div>

        <div className={`${GLASS_CARD} mb-3 sm:mb-4`}>
          <h3 className="mb-3 text-[12.5px] font-extrabold text-[var(--foreground)]">明るさ</h3>
          <div className="grid grid-cols-3 gap-3">
            {MODES.map((m) => {
              const isActive = mode === m.id;
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  onClick={() => selectMode(m.id)}
                  className="flex flex-col items-center gap-1.5 rounded-[16px] border p-3 text-center transition"
                  style={{
                    borderColor: isActive ? "var(--accent)" : "var(--border-subtle)",
                    background: isActive ? "var(--fill-pill)" : "transparent",
                  }}
                >
                  <Icon size={18} strokeWidth={2.25} style={{ color: isActive ? "var(--accent)" : "var(--text-secondary)" }} />
                  <span className="text-[11px] font-bold" style={{ color: isActive ? "var(--foreground)" : "var(--text-secondary)" }}>
                    {m.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={`${GLASS_CARD}`}>
          <h3 className="mb-3 text-[12.5px] font-extrabold text-[var(--foreground)]">テーマ</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {THEMES.map((t) => {
              const isActive = current === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => selectTheme(t.id)}
                  className="group relative overflow-hidden rounded-[16px] border p-3 text-left transition"
                  style={{
                    borderColor: isActive ? t.accent : "var(--border-subtle)",
                    boxShadow: isActive ? `0 0 0 2px ${t.accent}33` : undefined,
                  }}
                >
                  <div
                    className="relative mb-2.5 h-16 w-full overflow-hidden rounded-[10px] border border-black/5"
                    style={{ background: t.background }}
                  >
                    <span className="absolute right-2 top-2 h-3.5 w-3.5 rounded-full" style={{ background: t.hero }} />
                    <span className="absolute bottom-2 left-2 h-6 w-14 rounded-full" style={{ background: t.accent }} />
                    <span className="absolute bottom-2 left-[68px] h-6 w-8 rounded-md bg-white/70" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-bold text-[var(--foreground)]">{t.label}</span>
                    {isActive && (
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white" style={{ background: t.accent }}>
                        <Check size={10} strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">{t.description}</p>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
            切り替わるのはアクセントカラー・ページ背景・強調色のみです。本文の文字色や境界線などの中間トーンは全テーマ共通です。
          </p>
        </div>
      </GlassPageShell>
    </section>
  );
}
