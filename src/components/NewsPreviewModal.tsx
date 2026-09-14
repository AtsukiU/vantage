"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, ExternalLink } from "lucide-react";
import type { NewsItem } from "@/lib/news";
import { relativeTimeJa, formatClock } from "@/lib/format";
import { GLASS_BTN_PRIMARY, GLASS_BTN_GHOST } from "@/lib/glassStyles";

interface ExtractResponse {
  success: boolean;
  title?: string;
  byline?: string | null;
  contentHtml?: string;
  error?: string;
}

// ニュース一覧でリンクを直接踏んで外部タブへ飛ばす代わりに、本文をその場で抽出して
// アプリ内で読めるようにするモーダル。抽出に失敗した場合(ペイウォール・ボット対策など)は
// タイトル・概要だけを見せ、「元記事を読む」の外部リンクにフォールバックする。
export function NewsPreviewModal({
  item,
  title,
  description,
  onClose,
}: {
  item: NewsItem;
  title: string;
  description: string | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<"loading" | "success" | "failed">("loading");
  const [contentHtml, setContentHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/news/extract?url=${encodeURIComponent(item.link)}`)
      .then((r) => r.json())
      .then((data: ExtractResponse) => {
        if (cancelled) return;
        if (data.success && data.contentHtml) {
          setContentHtml(data.contentHtml);
          setState("success");
        } else {
          setState("failed");
        }
      })
      .catch(() => {
        if (!cancelled) setState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [item.link]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 4 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-[var(--border-subtle)] p-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 text-[11px] text-[var(--text-muted)]">
              {item.source} ・ <span title={formatClock(item.pubDate)}>{relativeTimeJa(item.pubDate)}</span>
            </div>
            <button
              onClick={onClose}
              aria-label="閉じる"
              className="shrink-0 rounded-full p-1 text-[var(--text-muted)] transition hover:bg-[var(--fill-pill)] hover:text-[var(--foreground)]"
            >
              <X size={18} strokeWidth={2.25} />
            </button>
          </div>
          <h3 className="mt-2 text-[15px] font-bold leading-snug text-[var(--foreground)]">{title}</h3>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 pt-4">
          {state === "loading" && <p className="text-[13px] text-[var(--text-muted)]">本文を読み込み中…</p>}

          {state === "success" && contentHtml && (
            <div
              className="text-[13px] leading-relaxed text-[var(--foreground)] [&_a]:text-[var(--accent)] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--border-subtle)] [&_blockquote]:pl-3 [&_blockquote]:text-[var(--text-secondary)] [&_h1]:mt-4 [&_h1]:text-[15px] [&_h1]:font-bold [&_h2]:mt-4 [&_h2]:text-[15px] [&_h2]:font-bold [&_h3]:mt-3 [&_h3]:text-[13px] [&_h3]:font-bold [&_img]:my-3 [&_img]:rounded-[10px] [&_li]:ml-4 [&_ol]:my-2 [&_ol]:list-decimal [&_p]:mt-3 [&_p:first-child]:mt-0 [&_ul]:my-2 [&_ul]:list-disc"
              dangerouslySetInnerHTML={{ __html: contentHtml }}
            />
          )}

          {state === "failed" && (
            <div>
              {description && <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">{description}</p>}
              <p className="mt-3 text-[11px] text-[var(--text-muted)]">
                本文の自動取得に失敗しました(サイト側の制限などが原因の可能性があります)。元記事でご確認ください。
              </p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-[var(--border-subtle)] p-4">
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className={`${GLASS_BTN_PRIMARY} inline-flex items-center gap-1.5`}
          >
            元記事を開く
            <ExternalLink size={13} strokeWidth={2.25} />
          </a>
          <button onClick={onClose} className={GLASS_BTN_GHOST}>
            閉じる
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
