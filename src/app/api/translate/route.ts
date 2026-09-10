import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const revalidate = 0;

// 英語の記事タイトル・概要・企業紹介文などを日本語に一括翻訳する共通エンドポイント。
// 銘柄名・ティッカーなどの固有名詞は呼び出し側で翻訳対象に含めないこと(このAPIは
// 渡された文字列をそのまま訳す)。同一プロセス内で同じ原文を再度送っても課金しないよう、
// メモリ内キャッシュ(原文→訳文)を持つ(開発サーバーを再起動するとリセットされる簡易キャッシュ)。
// ANTHROPIC_API_KEYが未設定の場合は、翻訳せず原文をそのまま返す(グレースフルデグレード)。

const MODEL = process.env.CLAUDE_COMMITTEE_MODEL ?? "claude-haiku-4-5";
const MAX_TEXTS = 120;
const cache = new Map<string, string>();

interface TranslateRequestBody {
  texts: string[];
}

export async function POST(req: NextRequest) {
  let body: TranslateRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }

  const texts = Array.isArray(body.texts) ? body.texts.slice(0, MAX_TEXTS) : [];
  if (texts.length === 0) return NextResponse.json({ translations: [] });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // APIキー未設定時は原文のままフォールバック(呼び出し側は原文表示を続ける)。
    return NextResponse.json({ translations: texts, translated: false });
  }

  const uncachedIndices: number[] = [];
  const uncachedTexts: string[] = [];
  texts.forEach((t, i) => {
    if (!cache.has(t)) {
      uncachedIndices.push(i);
      uncachedTexts.push(t);
    }
  });

  if (uncachedTexts.length > 0) {
    try {
      const client = new Anthropic({ apiKey });
      const prompt = `以下はニュース記事の見出しや概要、企業紹介文などの英文リストです(JSON配列)。各要素を自然な日本語に翻訳してください。固有名詞(企業名・人名・ティッカーシンボル)は無理に訳さず原語のまま残して構いません。入力と同じ順序・同じ件数のJSON配列だけを出力してください(前後の説明文やコードフェンスは付けない)。

${JSON.stringify(uncachedTexts)}`;

      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });
      const textBlock = message.content.find((b) => b.type === "text");
      if (textBlock && textBlock.type === "text") {
        const cleaned = textBlock.text.trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
        const translated = JSON.parse(cleaned) as string[];
        if (Array.isArray(translated) && translated.length === uncachedTexts.length) {
          uncachedTexts.forEach((orig, i) => cache.set(orig, translated[i] ?? orig));
        }
      }
    } catch (error) {
      console.error("Failed to translate texts", error);
      // 失敗した分は原文のままキャッシュせず返す(呼び出し側は原文が混ざったまま表示)。
    }
  }

  const translations = texts.map((t) => cache.get(t) ?? t);
  return NextResponse.json({ translations, translated: true });
}
