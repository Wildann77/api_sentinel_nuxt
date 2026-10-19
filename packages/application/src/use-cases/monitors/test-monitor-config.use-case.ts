import { type CheckDetailDto, TestMonitorConfigRequestSchema } from "@sentinel/contracts";
import { type AuthConfig, TriggerType, UUIDv7, ValidationException } from "@sentinel/domain";
import type {
  TestMonitorConfigCommand,
  TestMonitorConfigUseCase,
} from "../../ports/in/monitor.use-cases.js";
import type { ClockPort } from "../../ports/out/clock.port.js";
import type { IdGeneratorPort } from "../../ports/out/id-generator.port.js";
import type { NetworkProbePort } from "../../ports/out/network-probe.port.js";
import { ProbeCheckOrchestrator } from "../../services/probe-check-orchestrator.js";
import { mapAssertionRuleInput } from "./monitor-helpers.js";

export class TestMonitorConfig implements TestMonitorConfigUseCase {
  private readonly orchestrator: ProbeCheckOrchestrator;

  constructor(
    networkProbe: NetworkProbePort,
    clock: ClockPort,
    private readonly idGenerator: IdGeneratorPort,
    orchestrator?: ProbeCheckOrchestrator,
  ) {
    this.orchestrator =
      orchestrator ?? new ProbeCheckOrchestrator(networkProbe, clock, idGenerator);
  }

  public async execute(command: TestMonitorConfigCommand): Promise<CheckDetailDto> {
    const rawInput =
      "request" in command && command.request ? command.request : (command as unknown);
    const parsed = TestMonitorConfigRequestSchema.safeParse(rawInput);
    if (!parsed.success) {
      const issues = parsed.error.issues;
      throw new ValidationException(
        issues[0]?.message ?? "Validasi konfigurasi monitor uji coba gagal.",
        issues.map((i) => ({
          name: i.path.join("."),
          reason: i.message,
        })),
      );
    }

    const config = parsed.data;
    const dummyMonitorId = UUIDv7.fromString(this.idGenerator.generate());
    const assertionRules = (config.assertions ?? []).map(mapAssertionRuleInput);

    let authConfig: AuthConfig | null = null;
    if (config.auth) {
      authConfig = config.auth as unknown as AuthConfig;
    }

    const orchestration = await this.orchestrator.execute({
      monitorId: dummyMonitorId,
      url: config.url,
      method: config.method,
      headers: config.customHeaders,
      body: config.body ?? undefined,
      authConfig,
      timeoutMs: config.timeoutMs,
      assertionRules,
      triggerType: TriggerType.MANUAL,
      correlationId: this.idGenerator.generate(),
    });

    const { checkResult, probeResult, assertionResult } = orchestration;
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
