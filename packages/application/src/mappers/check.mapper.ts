import type {
  AssertionResultDto,
  CheckDetailDto,
  CheckDiagnosticsDto,
  CheckResultDto,
} from "@sentinel/contracts";
import type { CheckResult } from "@sentinel/domain";

export interface CheckDetailMapperOptions {
  readonly dnsDurationMs?: number | null;
  readonly connectDurationMs?: number | null;
  readonly tlsDurationMs?: number | null;
  readonly firstByteDurationMs?: number | null;
  readonly requestHeaders?: Record<string, string>;
  readonly responseHeaders?: Record<string, string>;
  readonly responseBodySnippet?: string | null;
}

export function toCheckResultDto(checkResult: CheckResult): CheckResultDto {
  return {
    id: checkResult.id.toString(),
    monitorId: checkResult.monitorId.toString(),
    status: checkResult.isSuccess ? "UP" : "DOWN",
    statusCode: checkResult.statusCode,
    latencyMs: checkResult.durationMs,
    failureCategory: checkResult.failureCategory,
    failureReason: checkResult.sanitizedDiagnostic,
    triggerType: checkResult.triggerType,
    scheduledFor: checkResult.scheduledFor ? checkResult.scheduledFor.toISOString() : null,
    startedAt: checkResult.startedAt.toISOString(),
    finishedAt: checkResult.finishedAt.toISOString(),
    correlationId: checkResult.correlationId,
    executedAt: checkResult.startedAt.toISOString(),
  };
}

export function toCheckDetailDto(
  checkResult: CheckResult,
  extra: CheckDetailMapperOptions = {},
): CheckDetailDto {
  const base = toCheckResultDto(checkResult);

  const assertionResults: AssertionResultDto[] = checkResult.assertionResults.map((ar) => ({
    type: ar.ruleType,
    property: ar.target,
    operator: ar.operator,
    expectedValue: ar.expected,
    actualValue: ar.actual,
    passed: ar.status === "PASS",
    message: ar.message,
  }));

  const diagnostics: CheckDiagnosticsDto = {
    pinnedIp: checkResult.pinnedIp,
    dnsDurationMs: extra.dnsDurationMs ?? null,
    connectDurationMs: extra.connectDurationMs ?? null,
    tlsDurationMs: extra.tlsDurationMs ?? null,
    firstByteDurationMs: extra.firstByteDurationMs ?? null,
    requestHeaders: extra.requestHeaders ?? {},
    responseHeaders: extra.responseHeaders ?? {},
    responseBodySnippet: extra.responseBodySnippet ?? null,
    assertionResults,
  };

  return {
    ...base,
    diagnostics,
  };
}
