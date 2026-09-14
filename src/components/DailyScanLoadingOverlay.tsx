"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DailyScreenState, ScreenMarket } from "@/lib/dailyScreenStore";
import { Rocket, X } from "lucide-react";

const POLL_MS = 3000;
const TIP_MS = 3800;
const MARKETS: ScreenMarket[] = ["jp", "us"];

const TIPS = [
  "ミネルヴィニのトレンドテンプレートは、8つの条件をすべて満たした銘柄だけを高スコアにします。",
  "CANSLIMは急成長株を見つけるための7つの評価軸をまとめた投資フレームワークです。",
  "投資委員会はファンダメンタル・テクニカル・センチメントなど複数の役割の合議でスコアを出します。",
  "東証プライム約1,550銘柄・S&P500約500銘柄をフルスキャンしています。数分かかります。",
  "スキャンが終わると「本日の注目銘柄」タブで最新のランキングが見られるようになります。",
  "運用アドバイザーの売買判断も、このスキャン結果を基に計算されています。",
];

type Status = Record<ScreenMarket, DailyScreenState | null>;

// アプリを開いた時点で本日分のスキャンがまだなら自動で開始し、完了するまでゲームの
// ロード画面のような全画面ポップアップ(進捗バー+豆知識のローテーション)を出す。
// サイドバーの手動スキャンボタン(DailyScanBanner)とは別の入口として、「開けば
// 勝手に始まっている」体験にする。既に完了/実行中なら何もしない(二重開始は
// dailyScreenStore側で防がれる)。ユーザーがバックグラウンドに回す選択もできる。
export function DailyScanLoadingOverlay({ onScanComplete }: { onScanComplete?: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const pollRef = useRef<number | null>(null);
  const triedAutoStart = useRef(false);
  const wasRunning = useRef(false);

  async function fetchStatus(): Promise<Status> {
    const [jp, us] = await Promise.all(
      MARKETS.map((m) => fetch(`/api/daily-screen/status?market=${m}`, { cache: "no-store" }).then((r) => r.json()))
    );
    const next = { jp, us } as Status;
    setStatus(next);
    return next;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await fetchStatus();
      if (cancelled || triedAutoStart.current) return;
      triedAutoStart.current = true;
      const bothDone = s.jp?.status === "done" && s.us?.status === "done";
      const anyRunningAlready = s.jp?.status === "running" || s.us?.status === "running";
      if (!bothDone && !anyRunningAlready) {
        await Promise.all(MARKETS.map((m) => fetch(`/api/daily-screen/start?market=${m}`, { method: "POST" })));
        if (!cancelled) await fetchStatus();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const anyRunning = status?.jp?.status === "running" || status?.us?.status === "running";
  const bothDone = status?.jp?.status === "done" && status?.us?.status === "done";

  useEffect(() => {
    if (anyRunning) {
      wasRunning.current = true;
      pollRef.current = window.setInterval(fetchStatus, POLL_MS);
    } else {
      if (pollRef.current != null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (wasRunning.current && bothDone) onScanComplete?.();
      wasRunning.current = false;
    }
    return () => {
      if (pollRef.current != null) window.clearInterval(pollRef.current);
    };
  }, [anyRunning, bothDone, onScanComplete]);

  useEffect(() => {
    if (!anyRunning) return;
    const id = window.setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), TIP_MS);
    return () => window.clearInterval(id);
  }, [anyRunning]);

  const visible = anyRunning && !dismissed;
  const doneCount = MARKETS.filter((m) => status?.[m]?.status === "done").length;
  const progress = MARKETS.map((m) => status?.[m]).reduce(
    (acc, s) => ({ done: acc.done + (s?.progress.done ?? 0), total: acc.total + (s?.progress.total ?? 0) }),
    { done: 0, total: 0 }
  );
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="scan-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 6 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="relative w-full max-w-sm overflow-hidden rounded-[16px] border border-white/10 bg-[#14181b] p-6 text-center shadow-2xl"
          >
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {/* このオーバーレイはスキャン中だけ出る一時的なモーダルで、背景オーバーレイ自体も
                  backdrop-blur-smを使っている「読み込み画面」なので、他の常設UIとは違い
                  グロー演出はダークモードでも残す(.glow-blobクラスを付けず、常時表示のまま)。 */}
              <div className="absolute -top-20 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-[var(--accent)] opacity-25 blur-[70px]" />
            </div>
            <button
              onClick={() => setDismissed(true)}
              aria-label="閉じる"
              className="absolute right-3 top-3 rounded-full p-1 text-white/40 transition hover:bg-white/10 hover:text-white/80"
            >
              <X size={16} strokeWidth={2.25} />
            </button>

            <div className="relative">
              <div className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-[var(--accent)] opacity-20" />
                <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
                  <Rocket size={26} strokeWidth={2} className="animate-bounce text-[var(--accent)]" />
                </span>
              </div>

              <h2 className="text-[15px] font-extrabold text-white">本日の相場データを準備しています</h2>
              <p className="mt-1 text-[11px] text-white/50">
                {doneCount}/2市場完了・{progress.done}/{progress.total}銘柄
              </p>

              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full bg-[var(--accent)]"
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
              <div className="mt-1 text-right text-[11px] font-semibold text-white/50">{pct}%</div>

              <div className="mt-5 flex min-h-[56px] items-center justify-center rounded-[10px] bg-white/5 px-3 py-2.5">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={tipIndex}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.3 }}
                    className="text-[11px] leading-relaxed text-white/70"
                  >
                    <span className="font-bold text-[var(--accent)]">ヒント: </span>
                    {TIPS[tipIndex]}
                  </motion.p>
                </AnimatePresence>
              </div>

              <button
                onClick={() => setDismissed(true)}
                className="mt-4 text-[11px] font-semibold text-white/40 underline decoration-dotted transition hover:text-white/70"
              >
                バックグラウンドで続ける
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
