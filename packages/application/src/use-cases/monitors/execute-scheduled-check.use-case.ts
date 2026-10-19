import {
  type AuthConfig,
  CheckResult,
  type DomainEvent,
  FailureCategory,
  Incident,
  IncidentFailureCountIncrementedDomainEvent,
  IncidentOpenedDomainEvent,
  IncidentRecoveredDomainEvent,
  TriggerType,
  UUIDv7,
} from "@sentinel/domain";
import type {
  ExecuteScheduledCheckCommand,
  ExecuteScheduledCheckResult,
  ExecuteScheduledCheckUseCase,
} from "../../ports/in/check.use-cases.js";
import type { CheckResultRepositoryPort } from "../../ports/out/check-result-repository.port.js";
import type { CipherPort } from "../../ports/out/cipher.port.js";
import { formatMonitorAad } from "../../ports/out/cipher.port.js";
import type { ClockPort } from "../../ports/out/clock.port.js";
import type { IdGeneratorPort } from "../../ports/out/id-generator.port.js";
import type { IncidentRepositoryPort } from "../../ports/out/incident-repository.port.js";
import type { LoggerPort } from "../../ports/out/logger.port.js";
import type { MonitorRepositoryPort } from "../../ports/out/monitor-repository.port.js";
import type { NetworkProbePort } from "../../ports/out/network-probe.port.js";
import type { NotificationDeliveryRepositoryPort } from "../../ports/out/notification-delivery-repository.port.js";
import type { QueuePort } from "../../ports/out/queue.port.js";
import type { TelemetryPort } from "../../ports/out/telemetry.port.js";
import type { UnitOfWorkPort } from "../../ports/out/unit-of-work.port.js";
import {
  type ProbeCheckOrchestrationResult,
  ProbeCheckOrchestrator,
} from "../../services/probe-check-orchestrator.js";

export class ExecuteScheduledCheck implements ExecuteScheduledCheckUseCase {
  private readonly orchestrator: ProbeCheckOrchestrator;

  constructor(
    private readonly monitorRepository: MonitorRepositoryPort,
    private readonly checkResultRepository: CheckResultRepositoryPort,
    private readonly incidentRepository: IncidentRepositoryPort,
    private readonly notificationDeliveryRepository: NotificationDeliveryRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
    networkProbe: NetworkProbePort,
    private readonly cipher: CipherPort,
    private readonly queue: QueuePort,
    private readonly idGenerator: IdGeneratorPort,
    private readonly clock: ClockPort,
    private readonly logger: LoggerPort,
    orchestrator?: ProbeCheckOrchestrator,
    telemetry?: TelemetryPort,
  ) {
    this.orchestrator =
      orchestrator ?? new ProbeCheckOrchestrator(networkProbe, clock, idGenerator, telemetry);
  }

  public async execute(
    command: ExecuteScheduledCheckCommand,
  ): Promise<ExecuteScheduledCheckResult> {
    const monitor = await this.monitorRepository.findById(command.monitorId);
    if (!monitor?.isActive) {
      this.logger.info("Probe check skipped: monitor not found or inactive", {
        monitorId: command.monitorId,
        exists: Boolean(monitor),
        isActive: monitor?.isActive,
      });

      return {
        status: "SKIPPED",
        reason: !monitor ? "Monitor not found" : "Monitor is paused or inactive",
      };
    }

    let customHeaders: Record<string, string> | undefined;
    let requestBody: string | undefined;
    let authConfig: AuthConfig | null = null;
    let secretDecryptionError: string | null = null;

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
      secretDecryptionError = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to decrypt monitor secrets for probe", {
        monitorId: command.monitorId,
        error: secretDecryptionError,
      });
    }

    const triggerType =
      command.triggerType === "MANUAL" ? TriggerType.MANUAL : TriggerType.SCHEDULED;

    const scheduledForDate = command.scheduledFor
      ? command.scheduledFor instanceof Date
        ? command.scheduledFor
        : new Date(command.scheduledFor)
      : null;

    let probeOrchestration: ProbeCheckOrchestrationResult;

    if (secretDecryptionError) {
      const checkId = UUIDv7.fromString(command.checkId ?? this.idGenerator.generate());
      const startedAt = this.clock.now();
      const checkResult = CheckResult.create({
        id: checkId,
        monitorId: monitor.id,
        incidentId: monitor.currentIncidentId,
        triggerType,
        scheduledFor: scheduledForDate,
        startedAt,
        finishedAt: startedAt,
        durationMs: null,
        isSuccess: false,
        statusCode: null,
        failureCategory: FailureCategory.EXECUTION_ABORTED,
        assertionResults: [],
        diagnostic: `Secret decryption failed: ${secretDecryptionError}`,
        correlationId: command.traceparent ?? command.correlationId ?? checkId.toString(),
        pinnedIp: null,
      });
      probeOrchestration = {
        checkResult,
        probeResult: {
          statusCode: null,
          headers: {},
          bodySnippet: null,
          durationMs: null,
          dnsDurationMs: null,
          connectDurationMs: null,
          tlsDurationMs: null,
          firstByteDurationMs: null,
          pinnedIp: null,
          errorCategory: FailureCategory.EXECUTION_ABORTED,
          errorMessage: secretDecryptionError,
        },
      };
    } else {
      try {
        probeOrchestration = await this.orchestrator.execute({
          monitorId: monitor.id,
          url: monitor.url.toString(),
          method: monitor.method,
          headers: customHeaders,
          body: requestBody,
          authConfig,
          timeoutMs: monitor.timeoutMs,
          assertionRules: monitor.assertionRules,
          triggerType,
          scheduledFor: scheduledForDate,
          incidentId: monitor.currentIncidentId,
          correlationId: command.traceparent ?? command.correlationId ?? undefined,
        });
      } catch (unexpectedError) {
        const checkId = UUIDv7.fromString(command.checkId ?? this.idGenerator.generate());
        const now = this.clock.now();
        const checkResult = CheckResult.create({
          id: checkId,
          monitorId: monitor.id,
          incidentId: monitor.currentIncidentId,
          triggerType,
          scheduledFor: scheduledForDate,
          startedAt: now,
          finishedAt: now,
          durationMs: null,
          isSuccess: false,
          statusCode: null,
          failureCategory: FailureCategory.EXECUTION_ABORTED,
          assertionResults: [],
          diagnostic:
            unexpectedError instanceof Error ? unexpectedError.message : String(unexpectedError),
          correlationId: command.traceparent ?? command.correlationId ?? checkId.toString(),
          pinnedIp: null,
        });
        probeOrchestration = {
          checkResult,
          probeResult: {
            statusCode: null,
            headers: {},
            bodySnippet: null,
            durationMs: null,
            dnsDurationMs: null,
            connectDurationMs: null,
            tlsDurationMs: null,
            firstByteDurationMs: null,
            pinnedIp: null,
            errorCategory: FailureCategory.EXECUTION_ABORTED,
            errorMessage:
              unexpectedError instanceof Error ? unexpectedError.message : String(unexpectedError),
          },
        };
      }
    }

    const { checkResult } = probeOrchestration;
    let finalStatus = monitor.healthStatus;

    await this.unitOfWork.runInTransaction(async (tx) => {
      const lockedMonitor = await this.monitorRepository.lockForUpdate(command.monitorId, tx);
      if (!lockedMonitor?.isActive) {
        this.logger.warn("Monitor state changed or was deleted before lock acquired", {
          monitorId: command.monitorId,
        });

        return;
      }

      if (triggerType === TriggerType.MANUAL) {
        await this.checkResultRepository.save(checkResult, tx);
        finalStatus = lockedMonitor.healthStatus;
        return;
      }

      const candidateIncidentId = UUIDv7.fromString(this.idGenerator.generate());
      let domainEvents: DomainEvent[] = [];

      if (checkResult.isSuccess) {
        domainEvents = lockedMonitor.recordCheckSuccess(checkResult);
      } else {
        domainEvents = lockedMonitor.recordCheckFailure(checkResult, candidateIncidentId);
      }

      await this.monitorRepository.update(lockedMonitor, tx);
      finalStatus = lockedMonitor.healthStatus;

      const finalCheckResult =
        lockedMonitor.currentIncidentId !== checkResult.incidentId
          ? CheckResult.create({
              id: checkResult.id,
              monitorId: checkResult.monitorId,
              incidentId: lockedMonitor.currentIncidentId,
              triggerType: checkResult.triggerType,
              scheduledFor: checkResult.scheduledFor,
              startedAt: checkResult.startedAt,
              finishedAt: checkResult.finishedAt,
              durationMs: checkResult.durationMs,
              isSuccess: checkResult.isSuccess,
              statusCode: checkResult.statusCode,
              failureCategory: checkResult.failureCategory,
              assertionResults: checkResult.assertionResults,
              diagnostic: checkResult.sanitizedDiagnostic,
              correlationId: checkResult.correlationId,
              pinnedIp: checkResult.pinnedIp,
            })
          : checkResult;

      await this.checkResultRepository.save(finalCheckResult, tx);

      for (const event of domainEvents) {
        if (event instanceof IncidentOpenedDomainEvent) {
          const incident = Incident.open(
            event.incidentId,
            lockedMonitor.id,
            event.causeCategory,
            event.initialErrorMessage,
            event.occurredOn,
          );
          await this.incidentRepository.save(incident, tx);

          const deliveryId = this.idGenerator.generate();
          await this.notificationDeliveryRepository.save(
            {
              id: deliveryId,
              incidentId: event.incidentId.toString(),
              channel: "TELEGRAM",
              status: "PENDING",
              attemptCount: 0,
              lastAttemptAt: null,
              lastError: null,
              createdAt: this.clock.now(),
            },
            tx,
          );

          await this.queue.send(
            "notification:send",
            {
              deliveryId,
              incidentId: event.incidentId.toString(),
              monitorId: lockedMonitor.id.toString(),
              type: "OPENED",
            },
            {
              singletonKey: `${event.incidentId.toString()}:OPENED`,
              db: tx,
            },
          );

          await this.unitOfWork.notify(
            tx,
            "sentinel_events",
            JSON.stringify({
              event: "INCIDENT_TRANSITION",
              monitorId: lockedMonitor.id.toString(),
              incidentId: event.incidentId.toString(),
              type: "OPENED",
              healthStatus: "DOWN",
              timestamp: event.occurredOn.toISOString(),
            }),
          );
        } else if (event instanceof IncidentFailureCountIncrementedDomainEvent) {
          const openIncident = await this.incidentRepository.findById(event.incidentId);
          if (openIncident) {
            openIncident.registerFailure();
            await this.incidentRepository.update(openIncident, tx);
          }
        } else if (event instanceof IncidentRecoveredDomainEvent) {
          const openIncident = await this.incidentRepository.findById(event.incidentId);
          if (openIncident) {
            openIncident.resolve(event.occurredOn);
            await this.incidentRepository.update(openIncident, tx);
          }

          const deliveryId = this.idGenerator.generate();
          await this.notificationDeliveryRepository.save(
            {
              id: deliveryId,
              incidentId: event.incidentId.toString(),
              channel: "TELEGRAM",
              status: "PENDING",
              attemptCount: 0,
              lastAttemptAt: null,
              lastError: null,
              createdAt: this.clock.now(),
            },
            tx,
          );

          await this.queue.send(
            "notification:send",
            {
              deliveryId,
              incidentId: event.incidentId.toString(),
              monitorId: lockedMonitor.id.toString(),
              type: "RECOVERED",
            },
            {
              singletonKey: `${event.incidentId.toString()}:RECOVERED`,
              db: tx,
            },
          );

          await this.unitOfWork.notify(
            tx,
            "sentinel_events",
            JSON.stringify({
              event: "INCIDENT_TRANSITION",
              monitorId: lockedMonitor.id.toString(),
              incidentId: event.incidentId.toString(),
              type: "RECOVERED",
              healthStatus: "UP",
              timestamp: event.occurredOn.toISOString(),
            }),
          );
        }
      }

      await this.unitOfWork.notify(
        tx,
        "sentinel_events",
        JSON.stringify({
          event: "CHECK_COMPLETED",
          monitorId: lockedMonitor.id.toString(),
          status: lockedMonitor.healthStatus,
          durationMs: finalCheckResult.durationMs,
          executedAt: finalCheckResult.finishedAt.toISOString(),
        }),
      );
    });

    return {
      status: "EXECUTED",
      checkResultId: checkResult.id.toString(),
      isSuccess: checkResult.isSuccess,
      healthStatus: finalStatus,
      durationMs: checkResult.durationMs,
      failureCategory: checkResult.failureCategory,
    };
  }
}
