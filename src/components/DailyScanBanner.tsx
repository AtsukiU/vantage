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
          className="flex w-full items-center gap-2 rounded-xl border border-[#e2dfd2] px-3 py-2 text-left text-[11.5px] font-semibold text-[#6c6656] transition hover:border-[#c9962f] hover:text-[#c9962f] disabled:opacity-60"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#c9962f]" />
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
        <div className="rounded-xl border border-[#e2dfd2] px-3 py-2">
          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#c9962f]">
            <Rocket size={13} strokeWidth={2.25} />
            スキャン中({doneCount}/2市場) {pct}%
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#f0efe6]">
            <div className="h-full rounded-full bg-[#c9962f] transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      );
    }

    return (
      <button
        onClick={() => handleStart(false)}
        disabled={starting}
        className={`${GLASS_BTN_PRIMARY} flex w-full items-center justify-center gap-1.5 text-[12px]`}
      >
        <Rocket size={14} strokeWidth={2.25} />
        {starting ? "開始しています…" : "本日のスキャン開始"}
      </button>
    );
  }

  if (bothDone) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-[#e2dfd2] bg-white/70 px-4 py-2 text-[11.5px] text-[#6c6656]">
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#c9962f]" />
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
          <Rocket size={16} strokeWidth={2.25} className="text-[#c9962f]" />
          <h2 className="text-[13px] font-extrabold text-[#1c1b18]">今日の取引の準備中…</h2>
        </div>
        <p className="mt-1 text-xs text-[#6c6656]">
          日本株・米国株をスキャン中です({doneCount}/2市場完了)。他のタブに移動しても処理は続きます。
        </p>
        <div className="mt-2.5">
          <div className="mb-1 flex justify-between text-[11px] text-[#6c6656]">
            <span>全体: {progress.done} / {progress.total}銘柄</span>
            <span>{progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#f0efe6]">
            <div
              className="h-full rounded-full bg-[#c9962f] transition-all"
              style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${GLASS_CARD} mb-4`}>
      <div className="flex items-center gap-2">
        <Rocket size={16} strokeWidth={2.25} className="text-[#c9962f]" />
        <h2 className="text-[13px] font-extrabold text-[#1c1b18]">今日の取引を始めますか?</h2>
      </div>
      <p className="mt-1 text-xs text-[#6c6656]">
        東証プライム(約1,550銘柄)とS&amp;P500(約500銘柄)をフルスキャンして「本日の注目銘柄」を更新します。運用アドバイザータブの判断材料もこれを基にします。実行には1〜3分程度かかります。
      </p>
      <button onClick={() => handleStart(false)} disabled={starting} className={`${GLASS_BTN_PRIMARY} mt-3`}>
        {starting ? "開始しています…" : "日本株・米国株をスキャン開始"}
      </button>
    </div>
  );
}
