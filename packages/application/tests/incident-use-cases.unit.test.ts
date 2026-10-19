import {
  CheckResult,
  EntityNotFoundException,
  FailureCategory,
  HealthStatus,
  HttpMethod,
  Incident,
  Monitor,
  TriggerType,
  UUIDv7,
  ValidationException,
} from "@sentinel/domain";
import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryCheckResultRepository,
  InMemoryIncidentRepository,
  InMemoryMonitorRepository,
  InMemoryNotificationDeliveryRepository,
} from "../src/test-doubles/index.js";
import { GetIncident } from "../src/use-cases/incidents/get-incident.use-case.js";
import { ListIncidents } from "../src/use-cases/incidents/list-incidents.use-case.js";

describe("Incident Use Cases (P10.1)", () => {
  let incidentRepo: InMemoryIncidentRepository;
  let monitorRepo: InMemoryMonitorRepository;
  let notificationDeliveryRepo: InMemoryNotificationDeliveryRepository;
  let checkResultRepo: InMemoryCheckResultRepository;
  let listIncidents: ListIncidents;
  let getIncident: GetIncident;

  const monitorId = new UUIDv7("018f0000-0000-7000-8000-000000000001");
  const incidentId1 = new UUIDv7("018f0000-0000-7000-8000-000000000010");
  const incidentId2 = new UUIDv7("018f0000-0000-7000-8000-000000000020");

  beforeEach(async () => {
    incidentRepo = new InMemoryIncidentRepository();
    monitorRepo = new InMemoryMonitorRepository();
    notificationDeliveryRepo = new InMemoryNotificationDeliveryRepository();
    checkResultRepo = new InMemoryCheckResultRepository();

    listIncidents = new ListIncidents(incidentRepo, monitorRepo, notificationDeliveryRepo);
    getIncident = new GetIncident(
      incidentRepo,
      monitorRepo,
      notificationDeliveryRepo,
      checkResultRepo,
    );

    // Seed monitor
    const monitor = new Monitor({
      id: monitorId,
      name: "Payment Gateway",
      url: "https://api.payment.internal/health",
      method: HttpMethod.GET,
      assertionRules: [],
      consecutiveFailures: 3,
      consecutiveSuccesses: 0,
      healthStatus: HealthStatus.DOWN,
      isActive: true,
      intervalSeconds: 60,
      timeoutMs: 5000,
      currentIncidentId: incidentId1,
      createdAt: new Date("2026-10-24T00:00:00Z"),
      updatedAt: new Date("2026-10-24T00:00:00Z"),
    });
    await monitorRepo.save(monitor);

    // Seed open incident 1
    const inc1 = Incident.open(
      incidentId1,
      monitorId,
      FailureCategory.HTTP_STATUS_MISMATCH,
      "Expected 200, received 502",
      new Date("2026-10-24T01:00:00Z"),
    );
    await incidentRepo.save(inc1);

    // Seed resolved incident 2
    const inc2 = Incident.open(
      incidentId2,
      monitorId,
      FailureCategory.TIMEOUT,
      "Gateway Timeout 504",
      new Date("2026-10-23T10:00:00Z"),
    );
    inc2.resolve(new Date("2026-10-23T10:15:00Z"));
    await incidentRepo.save(inc2);

    // Seed notification deliveries
    await notificationDeliveryRepo.save({
      id: "deliv-1",
      incidentId: incidentId1.toString(),
      channel: "TELEGRAM",
      status: "SENT",
      attemptCount: 1,
      lastAttemptAt: new Date("2026-10-24T01:00:05Z"),
      lastError: null,
      createdAt: new Date("2026-10-24T01:00:01Z"),
    });

    // Seed checks for incident 1
    await checkResultRepo.save(
      new CheckResult({
        id: new UUIDv7("018f0000-0000-7000-8000-000000000101"),
        monitorId,
        incidentId: incidentId1,
        triggerType: TriggerType.SCHEDULED,
        scheduledFor: new Date("2026-10-24T01:00:00Z"),
        startedAt: new Date("2026-10-24T01:00:00.100Z"),
        finishedAt: new Date("2026-10-24T01:00:00.500Z"),
        durationMs: 400,
        isSuccess: false,
        statusCode: 502,
        failureCategory: FailureCategory.HTTP_STATUS_MISMATCH,
        assertionResults: [],
        correlationId: "corr-101",
        pinnedIp: "10.0.0.1",
      }),
    );
  });

  describe("ListIncidents", () => {
    it("returns all incidents ordered with monitor name and derived status", async () => {
      const page = await listIncidents.execute();

      expect(page.data).toHaveLength(2);
      expect(page.pagination.limit).toBe(50);
      expect(page.pagination.hasMore).toBe(false);

      const openItem = page.data.find((i) => i.id === incidentId1.toString());
      expect(openItem).toBeDefined();
      expect(openItem?.monitorName).toBe("Payment Gateway");
      expect(openItem?.status).toBe("OPEN");
      expect(openItem?.notificationDeliveries).toHaveLength(1);
      expect(openItem?.notificationDeliveries[0]?.status).toBe("SENT");

      const resolvedItem = page.data.find((i) => i.id === incidentId2.toString());
      expect(resolvedItem).toBeDefined();
      expect(resolvedItem?.status).toBe("RESOLVED");
      expect(resolvedItem?.durationSeconds).toBe(900);
    });

    it("filters open incidents when isOpen=true", async () => {
      const page = await listIncidents.execute({ isOpen: true });

      expect(page.data).toHaveLength(1);
      expect(page.data[0]?.id).toBe(incidentId1.toString());
      expect(page.data[0]?.status).toBe("OPEN");
    });

    it("filters resolved incidents when isOpen=false", async () => {
      const page = await listIncidents.execute({ isOpen: false });

      expect(page.data).toHaveLength(1);
      expect(page.data[0]?.id).toBe(incidentId2.toString());
      expect(page.data[0]?.status).toBe("RESOLVED");
    });

    it("derives RECOVERING status when monitor consecutiveSuccesses is 1 on open incident", async () => {
      // Update monitor to have 1 consecutive success
      const mon = await monitorRepo.findById(monitorId);
      if (mon) {
        mon.consecutiveSuccesses = 1;
        await monitorRepo.update(mon);
      }

      const page = await listIncidents.execute({ isOpen: true });
      expect(page.data[0]?.status).toBe("RECOVERING");
    });
  });

  describe("GetIncident", () => {
    it("returns incident details with checks and deliveries", async () => {
      const item = await getIncident.execute(incidentId1.toString());

      expect(item.id).toBe(incidentId1.toString());
      expect(item.monitorName).toBe("Payment Gateway");
      expect(item.status).toBe("OPEN");
      expect(item.notificationDeliveries).toHaveLength(1);
      expect(item.checks).toHaveLength(1);
      expect(item.checks[0]?.statusCode).toBe(502);
    });

    it("throws EntityNotFoundException when incident does not exist", async () => {
      await expect(getIncident.execute("018f0000-0000-7000-8000-999999999999")).rejects.toThrow(
        EntityNotFoundException,
      );
    });

    it("throws ValidationException when ID is empty or invalid", async () => {
      await expect(getIncident.execute("")).rejects.toThrow(ValidationException);
    });
  });
});
