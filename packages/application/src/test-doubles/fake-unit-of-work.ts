import type { UnitOfWorkPort } from "../ports/out/unit-of-work.port.js";

export class FakeUnitOfWork implements UnitOfWorkPort {
  public transactionCount = 0;
  public committedCount = 0;
  public rolledBackCount = 0;
  public simulateRollback = false;

  public async runInTransaction<T>(work: (tx: unknown) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    const txId = `tx_${this.transactionCount}`;
    const tx = { txId };

    if (this.simulateRollback) {
      this.rolledBackCount += 1;
      throw new Error("Simulated transaction rollback exception in FakeUnitOfWork");
    }

    try {
      const result = await work(tx);
      this.committedCount += 1;
      return result;
    } catch (error) {
      this.rolledBackCount += 1;
      throw error;
    }
  }

  public readonly notifications: Array<{ channel: string; payload: string; tx: unknown }> = [];

  public async notify(tx: unknown, channel: string, payload: string): Promise<void> {
    this.notifications.push({ tx, channel, payload });
  }

  public reset(): void {
    this.transactionCount = 0;
    this.committedCount = 0;
    this.rolledBackCount = 0;
    this.simulateRollback = false;
    this.notifications.length = 0;
  }
}
