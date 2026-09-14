import { NextRequest, NextResponse } from "next/server";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";

export const revalidate = 0;

// ニュース記事のURLを渡すと、本文だけを抽出して返す。外部サイトへ離脱せずアプリ内で
// 読めるようにするためのエンドポイント(サーバー側でfetchするのでCORSの制約を受けない)。
// ペイウォール・ボット対策のあるサイトでは抽出に失敗することがあり、その場合は
// success:falseを返す(呼び出し側は「元記事を読む」の外部リンクへフォールバックする)。
//
// 見出し・段落・箇条書きなどの構造(改行の再現)を保つため、プレーンテキストではなく
// Readabilityが返すHTML(article.content)をそのままではなく、DOMPurifyでサニタイズして
// 返す(script/iframe/on*属性などを除去し、外部HTMLをそのままdangerouslySetInnerHTMLしても
// 安全な状態にする)。

interface ExtractResult {
  success: boolean;
  title?: string;
  byline?: string | null;
  contentHtml?: string;
  error?: string;
}

export async function GET(req: NextRequest): Promise<NextResponse<ExtractResult>> {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ success: false, error: "urlが指定されていません" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("invalid protocol");
  } catch {
    return NextResponse.json({ success: false, error: "urlが不正です" }, { status: 400 });
  }

  try {
    const res = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return NextResponse.json({ success: false, error: `記事の取得に失敗しました(${res.status})` });
    }
    const html = await res.text();
    const dom = new JSDOM(html, { url: parsed.toString() });
    const article = new Readability(dom.window.document).parse();
    if (!article || !article.textContent || article.textContent.trim().length < 200 || !article.content) {
      return NextResponse.json({ success: false, error: "本文を抽出できませんでした" });
    }

    const purify = DOMPurify(new JSDOM("").window as unknown as Window & typeof globalThis);
    const contentHtml = purify.sanitize(article.content, {
      ALLOWED_TAGS: ["p", "h1", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "strong", "em", "b", "i", "br", "a", "figure", "figcaption", "img"],
      ALLOWED_ATTR: ["href", "src", "alt"],
    });

    return NextResponse.json({
      success: true,
      title: article.title ?? undefined,
      byline: article.byline ?? null,
      contentHtml,
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "記事の取得に失敗しました" });
  }
}
