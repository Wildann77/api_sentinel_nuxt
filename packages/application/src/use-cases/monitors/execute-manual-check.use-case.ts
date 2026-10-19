import type { CheckDetailDto } from "@sentinel/contracts";
import { type AuthConfig, TriggerType } from "@sentinel/domain";
import type {
  ExecuteManualCheckCommand,
  ExecuteManualCheckUseCase,
} from "../../ports/in/check.use-cases.js";
import { type CipherPort, formatMonitorAad } from "../../ports/out/cipher.port.js";
import type { ClockPort } from "../../ports/out/clock.port.js";
import type { IdGeneratorPort } from "../../ports/out/id-generator.port.js";
import type {
  CheckResultRepositoryPort,
  MonitorRepositoryPort,
  UnitOfWorkPort,
} from "../../ports/out/index.js";
import type { LoggerPort } from "../../ports/out/logger.port.js";
import type { NetworkProbePort } from "../../ports/out/network-probe.port.js";
import { ProbeCheckOrchestrator } from "../../services/probe-check-orchestrator.js";

export class ExecuteManualCheck implements ExecuteManualCheckUseCase {
  private readonly orchestrator: ProbeCheckOrchestrator;

  constructor(
    private readonly monitorRepository: MonitorRepositoryPort,
    private readonly checkResultRepository: CheckResultRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly cipher: CipherPort,
    clock: ClockPort,
    private readonly idGenerator: IdGeneratorPort,
    private readonly logger: LoggerPort,
    networkProbe: NetworkProbePort,
    orchestrator?: ProbeCheckOrchestrator,
  ) {
    this.orchestrator =
      orchestrator ?? new ProbeCheckOrchestrator(networkProbe, clock, idGenerator);
  }

  public async execute(command: ExecuteManualCheckCommand): Promise<CheckDetailDto> {
    const monitor = await this.monitorRepository.findById(command.monitorId);
    if (!monitor) {
      throw new Error(`Monitor with ID '${command.monitorId}' not found.`);
    }

    let customHeaders: Record<string, string> | undefined;
    let requestBody: string | undefined;
    let authConfig: AuthConfig | null = null;

    try {
      const idStr = monitor.id.toString();
      if (monitor.encryptedHeaders) {
        const aad = formatMonitorAad(idStr, "headers");
        const decrypted = await this.cipher.decrypt(monitor.encryptedHeaders.value, aad);
        customHeaders = JSON.parse(decrypted);
      }
      if (monitor.encryptedBody) {
        const aad = formatMonitorAad(idStr, "body");
        requestBody = await this.cipher.decrypt(monitor.encryptedBody.value, aad);
      }
      if (monitor.encryptedAuthConfig) {
        const aad = formatMonitorAad(idStr, "authConfig");
        const decrypted = await this.cipher.decrypt(monitor.encryptedAuthConfig.value, aad);
        authConfig = JSON.parse(decrypted);
      }
    } catch (error) {
      this.logger.error("Failed to decrypt monitor secrets for manual check probe", {
        monitorId: command.monitorId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const orchestration = await this.orchestrator.execute({
      monitorId: monitor.id,
      url: monitor.url.toString(),
      method: monitor.method,
      headers: customHeaders,
      body: requestBody,
      authConfig,
      timeoutMs: monitor.timeoutMs,
      assertionRules: monitor.assertionRules,
      triggerType: TriggerType.MANUAL,
      correlationId: this.idGenerator.generate(),
    });

    const { checkResult, probeResult, assertionResult } = orchestration;

    // Simpan hasil pemeriksaan manual dalam transaksi tunggal tanpa mengubah status insiden / counter (D-13)
    await this.unitOfWork.runInTransaction(async (tx) => {
      const lockedMonitor = await this.monitorRepository.lockForUpdate(command.monitorId, tx);
      if (!lockedMonitor) {
        this.logger.warn("Monitor deleted before lock acquired for manual check", {
          monitorId: command.monitorId,
        });
        return;
      }

      await this.checkResultRepository.save(checkResult, tx);
    });

    const isSuccess = checkResult.isSuccess;

    return {
      id: checkResult.id.toString(),
      monitorId: checkResult.monitorId.toString(),
      status: isSuccess ? "UP" : "DOWN",
      statusCode: checkResult.statusCode,
      latencyMs: checkResult.durationMs,
      failureCategory: checkResult.failureCategory,
      failureReason: checkResult.sanitizedDiagnostic,
      triggerType: "MANUAL",
      scheduledFor: null,
      startedAt: checkResult.startedAt.toISOString(),
      finishedAt: checkResult.finishedAt.toISOString(),
      correlationId: checkResult.correlationId,
      executedAt: checkResult.startedAt.toISOString(),
      diagnostics: {
        pinnedIp: probeResult.pinnedIp,
        dnsDurationMs: probeResult.dnsDurationMs,
        connectDurationMs: probeResult.connectDurationMs,
        tlsDurationMs: probeResult.tlsDurationMs,
        firstByteDurationMs: probeResult.firstByteDurationMs,
        requestHeaders: {},
        responseHeaders: probeResult.headers ?? {},
        responseBodySnippet: probeResult.bodySnippet ?? null,
        assertionResults: (assertionResult?.results ?? []).map((r) => ({
          type: r.ruleType,
          property: r.target,
          operator: r.operator,
          expectedValue: r.expected,
          actualValue: r.actual,
          passed: r.status === "PASS",
          message: r.message,
        })),
      },
    };
  }
}
