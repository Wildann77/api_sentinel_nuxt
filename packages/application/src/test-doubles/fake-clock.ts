import type { ClockPort } from "../ports/out/clock.port.js";

export class FakeClock implements ClockPort {
  private currentTime: Date;

  constructor(initialTime: Date | string = new Date("2026-10-23T12:00:00.000Z")) {
    this.currentTime =
      typeof initialTime === "string" ? new Date(initialTime) : new Date(initialTime);
  }

  public now(): Date {
    return new Date(this.currentTime.getTime());
  }

  public setTime(time: Date | string | number): void {
    this.currentTime = new Date(time);
  }

  public advanceMs(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }

  public advance(ms: number): void {
    this.advanceMs(ms);
  }

  public advanceSeconds(seconds: number): void {
    this.advanceMs(seconds * 1000);
  }
}
