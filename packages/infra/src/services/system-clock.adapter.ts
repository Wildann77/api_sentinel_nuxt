import type { ClockPort } from "@sentinel/application";

/**
 * SystemClockAdapter implements ClockPort providing current system time.
 */
export class SystemClockAdapter implements ClockPort {
  public now(): Date {
    return new Date();
  }
}
