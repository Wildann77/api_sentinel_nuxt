import {
  type AssertionExecutionResult,
  CheckResult,
  type FailureCategory,
  type TriggerType,
  UUIDv7,
} from "@sentinel/domain";
import type { CheckResultInsert, CheckResultSelect } from "../../db/schema/index.js";

export const CheckResultMapper = {
  toDomain(row: CheckResultSelect): CheckResult {
    const assertionResults = Array.isArray(row.assertionResults)
      ? (row.assertionResults as unknown as AssertionExecutionResult[])
      : [];

    return new CheckResult({
      id: UUIDv7.fromString(row.id),
      monitorId: UUIDv7.fromString(row.monitorId),
      incidentId: row.incidentId ? UUIDv7.fromString(row.incidentId) : null,
      triggerType: row.triggerType as TriggerType,
      scheduledFor: row.scheduledFor,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt ?? row.startedAt,
      durationMs: row.durationMs,
      isSuccess: row.isSuccess,
      statusCode: row.statusCode,
      failureCategory: (row.failureCategory as FailureCategory | null) ?? null,
      assertionResults,
      diagnostic: row.sanitizedDiagnostic,
      correlationId: row.correlationId ? row.correlationId.toString() : row.id,
      pinnedIp: row.pinnedIp,
    });
  },

  toInsert(checkResult: CheckResult): CheckResultInsert {
    return {
      id: checkResult.id.toString(),
      monitorId: checkResult.monitorId.toString(),
      incidentId: checkResult.incidentId ? checkResult.incidentId.toString() : null,
      triggerType: checkResult.triggerType,
      scheduledFor: checkResult.scheduledFor,
      startedAt: checkResult.startedAt,
      finishedAt: checkResult.finishedAt,
      executedAt: checkResult.startedAt,
      durationMs: checkResult.durationMs ?? 0,
      isSuccess: checkResult.isSuccess,
      statusCode: checkResult.statusCode,
      failureCategory: checkResult.failureCategory,
      pinnedIp: checkResult.pinnedIp,
      assertionResults: [...checkResult.assertionResults],
      sanitizedDiagnostic: checkResult.sanitizedDiagnostic,
      correlationId: UUIDv7.isValid(checkResult.correlationId)
        ? checkResult.correlationId
        : checkResult.id.toString(),
      createdAt: new Date(),
    };
  },
};
