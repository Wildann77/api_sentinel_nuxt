import {
  type AssertionEngineResult,
  type AssertionRule,
  type AuthConfig,
  CheckResult,
  evaluateAssertions,
  FailureCategory,
  type TriggerType,
  UUIDv7,
} from "@sentinel/domain";
import type { ClockPort } from "../ports/out/clock.port.js";
import type { IdGeneratorPort } from "../ports/out/id-generator.port.js";
import type { NetworkProbePort, ProbeResult } from "../ports/out/network-probe.port.js";
import type { TelemetryPort } from "../ports/out/telemetry.port.js";

export interface ExecuteProbeCheckCommand {
  readonly monitorId: UUIDv7;
  readonly url: string;
  readonly method: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly authConfig?: AuthConfig | null;
  readonly timeoutMs: number;
  readonly assertionRules: readonly AssertionRule[];
  readonly triggerType: TriggerType;
  readonly scheduledFor?: Date | null;
  readonly incidentId?: UUIDv7 | null;
  readonly correlationId?: string;
}

export interface ProbeCheckOrchestrationResult {
  readonly checkResult: CheckResult;
  readonly probeResult: ProbeResult;
  readonly assertionResult?: AssertionEngineResult;
}

export class ProbeCheckOrchestrator {
  constructor(
    private readonly probe: NetworkProbePort,
    private readonly clock: ClockPort,
    private readonly idGenerator: IdGeneratorPort,
    private readonly telemetry?: TelemetryPort,
  ) {}

  public async execute(command: ExecuteProbeCheckCommand): Promise<ProbeCheckOrchestrationResult> {
    const startedAt = this.clock.now();

    const needsResponseBody = command.assertionRules.some(
      (rule) => rule.type === "body-json" || rule.type.includes("body"),
    );

    const probeResult = await this.probe.probe({
      url: command.url,
      method: command.method,
      headers: command.headers,
      body: command.body,
      authConfig: command.authConfig,
      timeoutMs: command.timeoutMs,
      needsResponseBody,
    });

    const finishedAt = this.clock.now();

    if (this.telemetry) {
      if (probeResult.dnsDurationMs !== null) {
        this.telemetry.recordSpan({
          name: "probe.dns_lookup",
          durationMs: probeResult.dnsDurationMs,
        });
      }
      if (probeResult.connectDurationMs !== null) {
        this.telemetry.recordSpan({
          name: "probe.tcp_connect",
          durationMs: probeResult.connectDurationMs,
        });
      }
      if (probeResult.tlsDurationMs !== null) {
        this.telemetry.recordSpan({
          name: "probe.tls_handshake",
          durationMs: probeResult.tlsDurationMs,
        });
      }
      if (probeResult.durationMs !== null) {
        const transferDurationMs = Math.max(
          0,
          probeResult.durationMs -
            ((probeResult.connectDurationMs ?? 0) + (probeResult.tlsDurationMs ?? 0)),
        );
        this.telemetry.recordSpan({
          name: "probe.response_transfer",
          durationMs: transferDurationMs,
        });
      }
    }

    const checkId = UUIDv7.fromString(this.idGenerator.generate());
    const correlationId = command.correlationId?.trim() || checkId.toString();

    // Skenario 1: Probe jaringan/SSRF/timeout gagal sebelum/saat respons
    if (probeResult.errorCategory !== null) {
      const checkResult = CheckResult.create({
        id: checkId,
        monitorId: command.monitorId,
        incidentId: command.incidentId ?? null,
        triggerType: command.triggerType,
        scheduledFor: command.scheduledFor ?? null,
        startedAt,
        finishedAt,
        durationMs: probeResult.durationMs,
        isSuccess: false,
        statusCode: probeResult.statusCode,
        failureCategory: probeResult.errorCategory,
        assertionResults: [],
        diagnostic: probeResult.errorMessage,
        correlationId,
        pinnedIp: probeResult.pinnedIp,
      });

      return {
        checkResult,
        probeResult,
      };
    }

    // Skenario 2: Respons HTTP diterima, evaluasi assertions (PRD §4.5 langkah 9)
    const assertionStart = this.clock.now().getTime();
    const assertionResult = evaluateAssertions(command.assertionRules, {
      statusCode: probeResult.statusCode ?? 200,
      headers: probeResult.headers,
      bodyText: probeResult.bodySnippet,
    });
    const assertionDurationMs = Math.max(0, this.clock.now().getTime() - assertionStart);
    this.telemetry?.recordSpan({
      name: "assertion.evaluation",
      durationMs: assertionDurationMs,
      attributes: { passed: assertionResult.passed },
    });

    const isSuccess = assertionResult.passed;
    const failureCategory = isSuccess
      ? null
      : (assertionResult.failureCategory ?? FailureCategory.HTTP_STATUS_MISMATCH);
    const diagnostic = isSuccess
      ? null
      : (assertionResult.failureReason ?? "Assertion evaluasi respons gagal.");

    const checkResult = CheckResult.create({
      id: checkId,
      monitorId: command.monitorId,
      incidentId: command.incidentId ?? null,
      triggerType: command.triggerType,
      scheduledFor: command.scheduledFor ?? null,
      startedAt,
      finishedAt,
      durationMs: probeResult.durationMs,
      isSuccess,
      statusCode: probeResult.statusCode,
      failureCategory,
      assertionResults: assertionResult.results,
      diagnostic,
      correlationId,
      pinnedIp: probeResult.pinnedIp,
    });

    return {
      checkResult,
      probeResult,
      assertionResult,
    };
  }
}
