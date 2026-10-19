export function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

export function formatUtcDateTime(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
}

export function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  if (safeSeconds < 60) {
    return `${safeSeconds} detik`;
  }
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSecs = safeSeconds % 60;
  if (minutes < 60) {
    return remainingSecs > 0 ? `${minutes} menit ${remainingSecs} detik` : `${minutes} menit`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return remainingMins > 0 ? `${hours} jam ${remainingMins} menit` : `${hours} jam`;
}

export function formatIncidentOpenedMessage(data: {
  readonly monitorName: string;
  readonly cause: string;
  readonly openedAt: Date;
}): string {
  return [
    "*API Sentinel — INSIDEN TERBUKA*",
    "",
    `*Monitor:* ${escapeMarkdownV2(data.monitorName)}`,
    "*Status:* DOWN",
    `*Penyebab:* ${escapeMarkdownV2(data.cause)}`,
    `*Waktu mulai:* ${escapeMarkdownV2(formatUtcDateTime(data.openedAt))}`,
  ].join("\n");
}

export function formatIncidentRecoveredMessage(data: {
  readonly monitorName: string;
  readonly openedAt: Date;
  readonly recoveredAt: Date;
  readonly durationSeconds?: number | null;
}): string {
  const durationText = formatDuration(
    data.durationSeconds ??
      Math.max(0, Math.floor((data.recoveredAt.getTime() - data.openedAt.getTime()) / 1000)),
  );

  return [
    "*API Sentinel — INSIDEN DIPULIHKAN*",
    "",
    `*Monitor:* ${escapeMarkdownV2(data.monitorName)}`,
    "*Status:* UP",
    `*Waktu mulai:* ${escapeMarkdownV2(formatUtcDateTime(data.openedAt))}`,
    `*Waktu pulih:* ${escapeMarkdownV2(formatUtcDateTime(data.recoveredAt))}`,
    `*Durasi:* ${escapeMarkdownV2(durationText)}`,
  ].join("\n");
}
