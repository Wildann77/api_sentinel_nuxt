export function formatUptimePercentage(uptime: number | null, decimals = 2): string {
  if (uptime === null || uptime === undefined) {
    return "N/A";
  }
  return `${uptime.toFixed(decimals)}%`;
}

export function formatLatency(latencyMs: number | null): string {
  if (latencyMs === null || latencyMs === undefined) {
    return "N/A";
  }
  return `${Math.round(latencyMs)}ms`;
}

export function formatDowntimeDuration(durationSeconds: number | null): string {
  if (durationSeconds === null || durationSeconds === undefined) {
    return "N/A";
  }

  const seconds = Math.max(0, Math.floor(durationSeconds));
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes.toString().padStart(2, "0")}m ${remainingSeconds.toString().padStart(2, "0")}s`;
}

export function formatDowntimeStopwatch(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  return [hrs, mins, secs].map((v) => v.toString().padStart(2, "0")).join(":");
}
