import {
  DiagnosticSanitizer,
  EntityNotFoundException,
  sanitizeCsvValue,
  UUIDv7,
  ValidationException,
} from "@sentinel/domain";
import type {
  StreamCsvReportCommand,
  StreamCsvReportUseCase,
} from "../../ports/in/report.use-cases.js";
import type { CheckResultRepositoryPort } from "../../ports/out/check-result-repository.port.js";
import type { IncidentRepositoryPort } from "../../ports/out/incident-repository.port.js";
import type { MonitorRepositoryPort } from "../../ports/out/monitor-repository.port.js";

export class StreamCsvReport implements StreamCsvReportUseCase {
  constructor(
    private readonly checkResultRepository: CheckResultRepositoryPort,
    private readonly incidentRepository: IncidentRepositoryPort,
    private readonly monitorRepository: MonitorRepositoryPort,
  ) {}

  public async execute(command: StreamCsvReportCommand): Promise<AsyncIterable<string>> {
    const fromDate = new Date(command.query.from);
    const toDate = new Date(command.query.to);

    if (fromDate.getTime() > toDate.getTime()) {
      throw new ValidationException(
        "Rentang waktu tidak valid: parameter 'from' tidak boleh lebih besar dari 'to'",
        [{ name: "from", reason: "Harus lebih kecil atau sama dengan to" }],
      );
    }

    const monitorMap = new Map<string, string>();
    if (command.query.monitorId) {
      const monitor = await this.monitorRepository.findById(command.query.monitorId);
      if (!monitor) {
        throw new EntityNotFoundException(
          `Monitor dengan ID '${command.query.monitorId}' tidak ditemukan.`,
        );
      }
      monitorMap.set(monitor.id.toString(), monitor.name);
    } else {
      const allMonitors = await this.monitorRepository.findAll();
      for (const m of allMonitors) {
        monitorMap.set(m.id.toString(), m.name);
      }
    }

    if (command.query.type === "checks") {
      return this.streamChecks(fromDate, toDate, command.query.monitorId, monitorMap);
    }

    return this.streamIncidents(fromDate, toDate, command.query.monitorId, monitorMap);
  }

  private async getMonitorName(idStr: string, monitorMap: Map<string, string>): Promise<string> {
    const cached = monitorMap.get(idStr);
    if (cached) {
      return cached;
    }
    const monitor = await this.monitorRepository.findById(idStr);
    const name = monitor ? monitor.name : idStr;
    monitorMap.set(idStr, name);
    return name;
  }

  private async *streamChecks(
    from: Date,
    to: Date,
    monitorId?: string,
    monitorMap: Map<string, string> = new Map(),
  ): AsyncIterable<string> {
    yield "timestamp,monitor_name,status,status_code,latency_ms,failure_category,failure_reason,trigger_type\r\n";

    const filter = {
      from,
      to,
      ...(monitorId ? { monitorId: UUIDv7.fromString(monitorId) } : {}),
    };

    const checks = this.checkResultRepository.streamChecks(filter);

    for await (const check of checks) {
      const idStr = check.monitorId.toString();
      const rawMonitorName = await this.getMonitorName(idStr, monitorMap);

      const timestamp = sanitizeCsvValue(check.startedAt.toISOString(), false);
      const monitorName = sanitizeCsvValue(rawMonitorName, false);
      const status = sanitizeCsvValue(check.isSuccess ? "UP" : "DOWN", false);
      const statusCode = sanitizeCsvValue(
        check.statusCode !== null && check.statusCode !== undefined ? check.statusCode : "",
        true,
      );
      const latencyMs = sanitizeCsvValue(
        check.durationMs !== null && check.durationMs !== undefined ? check.durationMs : "",
        true,
      );
      const failureCategory = sanitizeCsvValue(check.failureCategory ?? "", false);
      const sanitizedReason = check.sanitizedDiagnostic
        ? DiagnosticSanitizer.sanitize(check.sanitizedDiagnostic)
        : "";
      const failureReason = sanitizeCsvValue(sanitizedReason ?? "", false);
      const triggerType = sanitizeCsvValue(check.triggerType ?? "AUTOMATIC", false);

      yield `${timestamp},${monitorName},${status},${statusCode},${latencyMs},${failureCategory},${failureReason},${triggerType}\r\n`;
    }
  }

  private async *streamIncidents(
    from: Date,
    to: Date,
    monitorId?: string,
    monitorMap: Map<string, string> = new Map(),
  ): AsyncIterable<string> {
    yield "started_at,resolved_at,duration_seconds,monitor_name,status,failure_category,failure_reason\r\n";

    const filter = {
      from,
      to,
      ...(monitorId ? { monitorId: UUIDv7.fromString(monitorId) } : {}),
    };

    const incidents = this.incidentRepository.streamIncidents(filter);

    for await (const incident of incidents) {
      const idStr = incident.monitorId.toString();
      const rawMonitorName = await this.getMonitorName(idStr, monitorMap);

      const startedAt = sanitizeCsvValue(incident.startedAt.toISOString(), false);
      const resolvedAt = sanitizeCsvValue(
        incident.recoveredAt ? incident.recoveredAt.toISOString() : "",
        false,
      );
      const durationSeconds = sanitizeCsvValue(
        incident.durationSeconds !== null && incident.durationSeconds !== undefined
          ? incident.durationSeconds
          : "",
        true,
      );
      const monitorName = sanitizeCsvValue(rawMonitorName, false);
      const status = sanitizeCsvValue(incident.isResolved ? "RESOLVED" : "OPEN", false);
      const failureCategory = sanitizeCsvValue(incident.causeCategory ?? "", false);
      const sanitizedReason = incident.initialErrorMessage
        ? DiagnosticSanitizer.sanitize(incident.initialErrorMessage)
        : "";
      const failureReason = sanitizeCsvValue(sanitizedReason ?? "", false);

      yield `${startedAt},${resolvedAt},${durationSeconds},${monitorName},${status},${failureCategory},${failureReason}\r\n`;
    }
  }
}
