import type { HealthStatus } from "@sentinel/contracts";

export type PresentationHealthStatus =
  | "[OPERATIONAL]"
  | "[RECOVERING]"
  | "[DEGRADED]"
  | "[DOWN]"
  | "[PAUSED]"
  | "[UNKNOWN]";

export function toPresentationHealthStatus(
  healthStatus: HealthStatus | string,
  consecutiveSuccesses = 0,
): PresentationHealthStatus {
  if (healthStatus === "DOWN" && consecutiveSuccesses === 1) {
    return "[RECOVERING]";
  }

  switch (healthStatus) {
    case "UP":
      return "[OPERATIONAL]";
    case "DEGRADED":
      return "[DEGRADED]";
    case "DOWN":
      return "[DOWN]";
    case "PAUSED":
      return "[PAUSED]";
    default:
      return "[UNKNOWN]";
  }
}

export function getHealthStatusColorToken(presentationStatus: PresentationHealthStatus): string {
  switch (presentationStatus) {
    case "[OPERATIONAL]":
      return "status-operational";
    case "[RECOVERING]":
      return "status-recovering";
    case "[DEGRADED]":
      return "status-degraded";
    case "[DOWN]":
      return "status-down";
    case "[PAUSED]":
      return "status-paused";
    default:
      return "neutral";
  }
}
