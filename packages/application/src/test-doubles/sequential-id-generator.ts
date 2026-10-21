import type { IdGeneratorPort } from "../ports/out/id-generator.port.js";

export class SequentialIdGenerator implements IdGeneratorPort {
  private counter: number;
  private queuedIds: string[] = [];
  private readonly prefix: string;

  constructor(prefix = "018f0000-0000-7000-8000-", initialCounter = 1) {
    this.prefix = prefix;
    this.counter = initialCounter;
  }

  public generate(): string {
    const nextQueued = this.queuedIds.shift();
    if (nextQueued) {
      return nextQueued;
    }

    const paddedCounter = this.counter.toString(16).padStart(12, "0");
    this.counter += 1;
    return `${this.prefix}${paddedCounter}`;
  }

  public queueIds(...ids: string[]): void {
    this.queuedIds.push(...ids);
  }

  public reset(counter = 1): void {
    this.counter = counter;
    this.queuedIds = [];
  }
}
