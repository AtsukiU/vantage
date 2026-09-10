"use client";

// 英語テキストの一括翻訳(/api/translate)を呼ぶクライアント側ヘルパー。
// APIキー未設定・通信失敗時は原文をそのまま返す(呼び出し側で分岐不要)。
export async function translateTexts(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];
  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts }),
    });
    if (!res.ok) return texts;
    const json = await res.json();
    return Array.isArray(json.translations) && json.translations.length === texts.length ? json.translations : texts;
  } catch {
    return texts;
  }
}

// text[]をユニーク化して翻訳し、原文→訳文のMapを返す(同じ文字列を何度も送らないための補助)。
export async function translateUnique(texts: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(texts.filter((t) => t.trim().length > 0)));
  if (unique.length === 0) return new Map();
  const translated = await translateTexts(unique);
  const map = new Map<string, string>();
  unique.forEach((orig, i) => map.set(orig, translated[i] ?? orig));
  return map;
}
