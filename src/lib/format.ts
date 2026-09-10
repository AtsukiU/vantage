export function relativeTimeJa(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.round(diffMs / 60000);

  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}時間前`;

  const days = Math.round(hours / 24);
  return `${days}日前`;
}

export function formatClock(isoDate: string): string {
  return new Date(isoDate).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
