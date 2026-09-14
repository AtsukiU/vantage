"use client";

import { useEffect, useRef, useState } from "react";
import type { DailyScreenState, ScreenMarket } from "@/lib/dailyScreenStore";
import { GLASS_CARD, GLASS_BTN_PRIMARY, GLASS_BTN_GHOST } from "@/lib/glassStyles";
import { Rocket } from "lucide-react";

// アプリを開いて最初に見るニュースタブの先頭に置く、「本日の注目銘柄」フルスキャンへの
// 唯一の入口(以前は「本日の注目銘柄」タブ側にも個別の開始ボタンがあったが、二重に
// なってわかりにくいため撤去し、ここに一本化した)。運用アドバイザーの判断材料も、
// このスキャンが終わっていないと出せない。両市場とも本日分が完了していれば、
// 控えめな完了表示(+やり直し用の再スキャン)だけにして目立たせない。

const POLL_MS = 4000;
const MARKETS: ScreenMarket[] = ["jp", "us"];

type Status = Record<ScreenMarket, DailyScreenState | null>;

export function DailyScanBanner({ onStart, compact = false }: { onStart?: () => void; compact?: boolean }) {
  const [status, setStatus] = useState<Status>({ jp: null, us: null });
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<number | null>(null);

  async function fetchStatus() {
    const [jp, us] = await Promise.all(
      MARKETS.map((m) => fetch(`/api/daily-screen/status?market=${m}`, { cache: "no-store" }).then((r) => r.json()))
    );
    setStatus({ jp, us });
    return { jp, us } as Status;
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 初回マウント時に本日の状況を確認
    fetchStatus();
    return () => {
      if (pollRef.current != null) window.clearInterval(pollRef.current);
    };
  }, []);

  const anyRunning = status.jp?.status === "running" || status.us?.status === "running";
  const totalDone = (status.jp?.progress.done ?? 0) + (status.us?.progress.done ?? 0);

  // サーバー再起動などでスキャン処理そのものが死んだのに、ディスク上の"running"状態だけが
  // 残ってしまうと、進捗が二度と動かないまま固まって見える(dailyScreenStore.ts参照)。
  // ポーリングのたび進捗件数が変わっていない回数を数え、一定回数(=一定時間)動きが無ければ
  // 「固まっている」とみなしてリセット導線を出す。
  const STUCK_AFTER_POLLS = 3;
  const stuckPollsRef = useRef(0);
  const lastDoneRef = useRef<number | null>(null);
  const [isStuck, setIsStuck] = useState(false);
  useEffect(() => {
    if (!anyRunning) {
      stuckPollsRef.current = 0;
      lastDoneRef.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 実行中でなくなったらリセット表示も解除
      setIsStuck(false);
      return;
    }
    if (lastDoneRef.current === totalDone) {
      stuckPollsRef.current += 1;
    } else {
      stuckPollsRef.current = 0;
    }
    lastDoneRef.current = totalDone;
    setIsStuck(stuckPollsRef.current >= STUCK_AFTER_POLLS);
  }, [anyRunning, totalDone]);

  useEffect(() => {
    if (anyRunning) {
      pollRef.current = window.setInterval(fetchStatus, POLL_MS);
    } else if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current != null) window.clearInterval(pollRef.current);
    };
  }, [anyRunning]);

  async function handleStart(force = false) {
    setStarting(true);
    try {
      onStart?.(); // 銘柄スキャンと同時にニュースも読み直す(「起動準備」として1つにまとめる)
      await Promise.all(
        MARKETS.map((m) => fetch(`/api/daily-screen/start?market=${m}${force ? "&force=1" : ""}`, { method: "POST" }))
      );
      await fetchStatus();
    } finally {
      setStarting(false);
    }
  }

  if (status.jp === null || status.us === null) return null; // 状態確認中は何も出さない

  // status APIは日付が変わると自動的にidleへ戻すため(dailyScreenStore.ts参照)、
  // ここでの"done"は常に本日分を指す。
  const bothDone = status.jp.status === "done" && status.us.status === "done";

  if (compact) {
    if (bothDone) {
      return (
        <button
          onClick={() => handleStart(true)}
          disabled={starting}
          className="flex w-full items-center gap-2 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-left text-[11px] font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-60"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
          <span className="flex-1 truncate">{starting ? "開始しています…" : "本日分 更新済み・再スキャン"}</span>
        </button>
      );
    }

    if (anyRunning) {
      const doneCount = MARKETS.filter((m) => status[m]?.status === "done").length;
      const progress = MARKETS.map((m) => status[m]).reduce(
        (acc, s) => ({ done: acc.done + (s?.progress.done ?? 0), total: acc.total + (s?.progress.total ?? 0) }),
        { done: 0, total: 0 }
      );
      const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
      return (
        <div className="rounded-xl border border-[var(--border-subtle)] px-3 py-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--accent)]">
            <Rocket size={13} strokeWidth={2.25} />
            スキャン中({doneCount}/2市場) {pct}%
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--fill-pill)]">
            <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${pct}%` }} />
          </div>
          {isStuck && (
            <button
              onClick={() => handleStart(true)}
              disabled={starting}
              className="mt-1.5 text-[10.5px] font-semibold text-[var(--text-muted)] underline decoration-dotted hover:text-[var(--accent)] disabled:opacity-60"
            >
              進んでいない場合はリセットして再開
            </button>
          )}
        </div>
      );
    }

    return (
      <button
        onClick={() => handleStart(false)}
        disabled={starting}
        className={`${GLASS_BTN_PRIMARY} flex w-full items-center justify-center gap-1.5 text-[12.5px]`}
      >
        <Rocket size={14} strokeWidth={2.25} />
        {starting ? "開始しています…" : "本日のスキャン開始"}
      </button>
    );
  }

  if (bothDone) {
    return (
      <div className="nav-tile mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-[var(--border-subtle)] bg-white/70 px-4 py-2 text-[11px] text-[var(--text-secondary)]">
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          本日の注目銘柄は日本株・米国株ともに更新済みです(運用アドバイザータブの判断材料も最新です)
        </span>
        <button onClick={() => handleStart(true)} disabled={starting} className={`${GLASS_BTN_GHOST} shrink-0`}>
          {starting ? "開始しています…" : "再スキャン"}
        </button>
      </div>
    );
  }

  if (anyRunning) {
    const doneCount = MARKETS.filter((m) => status[m]?.status === "done").length;
    const progress = MARKETS.map((m) => status[m]).reduce(
      (acc, s) => ({ done: acc.done + (s?.progress.done ?? 0), total: acc.total + (s?.progress.total ?? 0) }),
      { done: 0, total: 0 }
    );
    return (
      <div className={`${GLASS_CARD} mb-4`}>
        <div className="flex items-center gap-2">
          <Rocket size={16} strokeWidth={2.25} className="text-[var(--accent)]" />
          <h2 className="text-[13px] font-extrabold text-[var(--foreground)]">今日の取引の準備中…</h2>
        </div>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          日本株・米国株をスキャン中です({doneCount}/2市場完了)。他のタブに移動しても処理は続きます。
        </p>
        <div className="mt-2.5">
          <div className="mb-1 flex justify-between text-[11px] text-[var(--text-secondary)]">
            <span>全体: {progress.done} / {progress.total}銘柄</span>
            <span>{progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--fill-pill)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all"
              style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
        {isStuck && (
          <div className="mt-2.5 flex items-center justify-between gap-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--fill-subtle)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
            <span>進捗が止まっているようです(サーバー再起動などが原因の可能性があります)。</span>
            <button onClick={() => handleStart(true)} disabled={starting} className={`${GLASS_BTN_GHOST} shrink-0`}>
              {starting ? "開始しています…" : "リセットして再開"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`${GLASS_CARD} mb-4`}>
      <div className="flex items-center gap-2">
        <Rocket size={16} strokeWidth={2.25} className="text-[var(--accent)]" />
        <h2 className="text-[13px] font-extrabold text-[var(--foreground)]">今日の取引を始めますか?</h2>
      </div>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        東証プライム(約1,550銘柄)とS&amp;P500(約500銘柄)をフルスキャンして「本日の注目銘柄」を更新します。運用アドバイザータブの判断材料もこれを基にします。実行には1〜3分程度かかります。
      </p>
      <button onClick={() => handleStart(false)} disabled={starting} className={`${GLASS_BTN_PRIMARY} mt-3`}>
        {starting ? "開始しています…" : "日本株・米国株をスキャン開始"}
      </button>
    </div>
  );
}
