"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GLASS_BTN_PRIMARY, GLASS_CARD } from "@/lib/glassStyles";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "ログインに失敗しました");
        return;
      }
      const next = searchParams.get("next") || "/";
      router.replace(next);
      router.refresh();
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--background)] px-4">
      <form
        onSubmit={handleSubmit}
        className={`${GLASS_CARD} w-full max-w-sm space-y-4`}
      >
        <div className="space-y-1 text-center">
          <p className="text-lg font-bold text-[var(--foreground)]">VANTAGE</p>
          <p className="text-xs text-[var(--text-secondary)]">
            パスワードを入力してください
          </p>
        </div>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="パスワード"
          className="w-full rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
        />
        {error && <p className="text-center text-xs text-[var(--status-danger)]">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !password}
          className={`${GLASS_BTN_PRIMARY} w-full`}
        >
          {submitting ? "確認中..." : "ログイン"}
        </button>
      </form>
    </div>
  );
}
