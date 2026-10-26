import os from "node:os";
import {
  DispatchNotification,
  ExecuteScheduledCheck,
  type ExecuteScheduledCheckUseCase,
} from "@sentinel/application";

import {
  createDrizzleDb,
  createPgBoss,
  createPgPool,
  DrizzleCheckResultRepository,
  type DrizzleDatabase,
  DrizzleHeartbeatRepository,
  DrizzleIncidentRepository,
  DrizzleMetricsRepository,
  DrizzleMonitorRepository,
  DrizzleNotificationConfigRepository,
  DrizzleNotificationDeliveryRepository,
  DrizzleSessionRepository,
  DrizzleUnitOfWorkAdapter,
  type Env,
  LibsodiumAeadCipherAdapter,
  NodeHttpSsrfProbeAdapter,
  OtelTelemetryAdapter,
  type PgBoss,
  PgBossQueueAdapter,
  type PgPool,
  PinoLoggerAdapter,
  PostgresRateLimiterAdapter,
  parseKeyring,
  SystemClockAdapter,
  sql,
  TelegramBotNotificationAdapter,
  UuidV7GeneratorAdapter,
  validateEnv,
} from "@sentinel/infra";
import { WorkerHeartbeatService } from "./heartbeat.js";
import { WorkerHttpServer } from "./http-server.js";
import { MaintenanceJobHandler } from "./jobs/maintenance.job.js";
import { NotificationJobHandler } from "./jobs/notification.job.js";
import { ProbeCheckJobHandler } from "./jobs/probe-check.job.js";
import { WorkerScheduler } from "./scheduler.js";

export interface WorkerContainer {
  readonly env: Env;
  readonly workerId: string;
  readonly isInitialized: boolean;
  readonly pool: PgPool;
  readonly db: DrizzleDatabase;
  readonly logger: PinoLoggerAdapter;
  readonly clock: SystemClockAdapter;
  readonly idGenerator: UuidV7GeneratorAdapter;
  readonly cipher: LibsodiumAeadCipherAdapter;
  readonly unitOfWork: DrizzleUnitOfWorkAdapter;
  readonly boss: PgBoss;
  readonly queuePort: PgBossQueueAdapter;
  readonly networkProbe: NodeHttpSsrfProbeAdapter;
  readonly notificationPort: TelegramBotNotificationAdapter;
  readonly telemetry: OtelTelemetryAdapter;

  // Repositories
  readonly monitorRepository: DrizzleMonitorRepository;
  readonly checkResultRepository: DrizzleCheckResultRepository;
  readonly incidentRepository: DrizzleIncidentRepository;
  readonly metricsRepository: DrizzleMetricsRepository;
  readonly notificationConfigRepository: DrizzleNotificationConfigRepository;
  readonly notificationDeliveryRepository: DrizzleNotificationDeliveryRepository;
  readonly heartbeatRepository: DrizzleHeartbeatRepository;
  readonly sessionRepository: DrizzleSessionRepository;
  readonly rateLimiter: PostgresRateLimiterAdapter;

  // Use Cases
  readonly executeScheduledCheckUseCase: ExecuteScheduledCheckUseCase;
  readonly dispatchNotificationUseCase: DispatchNotification;

  // Services & Handlers
  readonly heartbeatService: WorkerHeartbeatService;
  readonly scheduler: WorkerScheduler;
  readonly httpServer: WorkerHttpServer;
  readonly probeCheckJobHandler: ProbeCheckJobHandler;
  readonly notificationJobHandler: NotificationJobHandler;
  readonly maintenanceJobHandler: MaintenanceJobHandler;

  getJobLagSeconds(): number;
  start(): Promise<void>;
  dispose(): Promise<void>;
}

let workerContainerInstance: WorkerContainer | null = null;

export function buildWorkerContainer(
  rawEnv: Record<string, unknown> = process.env,
  options: { workerId?: string } = {},
): WorkerContainer {
  const env = validateEnv(rawEnv);
  const workerId =
    options.workerId ??
    (typeof rawEnv.WORKER_ID === "string" && rawEnv.WORKER_ID.trim() !== ""
      ? rawEnv.WORKER_ID.trim()
      : `worker-${os.hostname()}-${process.pid}`);

  const pool = createPgPool({
    connectionString: env.DATABASE_URL,
    applicationName: "api_sentinel_worker",
  });
  const db = createDrizzleDb(pool);

  const logger = new PinoLoggerAdapter({ level: env.LOG_LEVEL });
  const clock = new SystemClockAdapter();
  const idGenerator = new UuidV7GeneratorAdapter();
  const cipher = new LibsodiumAeadCipherAdapter(parseKeyring(env.APP_KEYRING));
  const unitOfWork = new DrizzleUnitOfWorkAdapter(db);

  const monitorRepository = new DrizzleMonitorRepository(db);
  const checkResultRepository = new DrizzleCheckResultRepository(db);
  const incidentRepository = new DrizzleIncidentRepository(db);
  const metricsRepository = new DrizzleMetricsRepository(db);
  const notificationConfigRepository = new DrizzleNotificationConfigRepository(db);
  const notificationDeliveryRepository = new DrizzleNotificationDeliveryRepository(db);
  const heartbeatRepository = new DrizzleHeartbeatRepository(db);
  const sessionRepository = new DrizzleSessionRepository(db);
  const rateLimiter = new PostgresRateLimiterAdapter(db, clock);

  const boss = createPgBoss({
    connectionString: env.DATABASE_URL,
    applicationName: "api_sentinel_worker_boss",
  });
  const queuePort = new PgBossQueueAdapter(boss);

  const networkProbe = new NodeHttpSsrfProbeAdapter();

  const maintenanceJobHandler = new MaintenanceJobHandler({
    boss,
    db,
    pool,
    rateLimiter,
    sessionRepository,
    logger,
  });

  const telemetry = new OtelTelemetryAdapter();

  const executeScheduledCheckUseCase = new ExecuteScheduledCheck(
    monitorRepository,
    checkResultRepository,
    incidentRepository,
    notificationDeliveryRepository,
    unitOfWork,
    networkProbe,
    cipher,
    queuePort,
    idGenerator,
    clock,
    logger,
    undefined,
    telemetry,
  );

  const notificationPort = new TelegramBotNotificationAdapter({
    baseUrl: env.TELEGRAM_API_BASE_URL,
  });

  const dispatchNotificationUseCase = new DispatchNotification(
    notificationConfigRepository,
    incidentRepository,
    monitorRepository,
    notificationDeliveryRepository,
    notificationPort,
    cipher,
    clock,
    logger,
    idGenerator,
  );

  const notificationJobHandler = new NotificationJobHandler(
    boss,
    dispatchNotificationUseCase,
    logger,
  );

  let currentJobLagSeconds = 0;
  let runningProbeJobs = 0;

  const probeCheckJobHandler = new ProbeCheckJobHandler(
    boss,
    executeScheduledCheckUseCase,
    logger,
    {
      concurrency: 20,
      onLagMeasured: (lag) => {
        currentJobLagSeconds = lag;
      },
      onJobStarted: () => {
        runningProbeJobs += 1;
      },
      onJobFinished: () => {
        runningProbeJobs = Math.max(0, runningProbeJobs - 1);
      },
    },
  );

  const heartbeatService = new WorkerHeartbeatService(heartbeatRepository, logger, workerId, {
    intervalSeconds: env.HEARTBEAT_INTERVAL_SECONDS,
  });

  const scheduler = new WorkerScheduler(monitorRepository, unitOfWork, queuePort, logger, {
    clock,
  });

  const checkHealth = async (): Promise<boolean> => {
    try {
      await db.execute(sql`SELECT 1`);
      return true;
    } catch {
      return false;
    }
  };

  const httpServer = new WorkerHttpServer({
    port: env.WORKER_PORT,
    workerId,
    getHeartbeatEpoch: () => heartbeatService.getLastHeartbeatEpoch(),
    getRunningJobs: () => heartbeatService.getRunningJobs() + runningProbeJobs,
    getJobLagSeconds: () => currentJobLagSeconds,
    checkHealth,
    logger,
  });

  let initialized = false;

  const container: WorkerContainer = {
    env,
    workerId,
    get isInitialized() {
      return initialized;
    },
    pool,
    db,
    logger,
    clock,
    idGenerator,
    cipher,
    unitOfWork,
    boss,
    queuePort,
    networkProbe,
    notificationPort,
    telemetry,

    monitorRepository,
    checkResultRepository,
    incidentRepository,
    metricsRepository,
    notificationConfigRepository,
    notificationDeliveryRepository,
    heartbeatRepository,
    sessionRepository,
    rateLimiter,

    executeScheduledCheckUseCase,
    dispatchNotificationUseCase,

    heartbeatService,
    scheduler,
    httpServer,
    probeCheckJobHandler,
    notificationJobHandler,
    maintenanceJobHandler,

    getJobLagSeconds() {
      return currentJobLagSeconds;
    },

    async start() {
      if (initialized) {
        return;
      }

      logger.info("Starting worker container...", { workerId });

      await boss.start();

      await boss.createQueue("probe:check", { policy: "stately", deadLetter: "dlq" });
      await boss.createQueue("notification:send", { policy: "stately", deadLetter: "dlq" });
      await boss.createQueue("maintenance", { policy: "standard" });
      await boss.createQueue("dlq", { policy: "standard" });

      await probeCheckJobHandler.register();
      await notificationJobHandler.register();
      await maintenanceJobHandler.register();

      heartbeatService.start();
      scheduler.start();
      await httpServer.start();

      initialized = true;
      logger.info("Worker container started successfully", { workerId, port: env.WORKER_PORT });
    },

    async dispose() {
      if (!initialized) {
        await pool.end();
        return;
      }

      logger.info("Stopping worker container gracefully...", { workerId });

      await scheduler.stop();
      await heartbeatService.stop();
      await httpServer.stop();

      try {
        await boss.stop({ graceful: true, timeout: 10000 });
      } catch (err) {
        logger.warn("Error while stopping pg-boss", { err: String(err) });
      }

      await pool.end();
      initialized = false;
      logger.info("Worker container stopped", { workerId });
    },
  };

  return container;
}

export function getWorkerContainer(
  rawEnv: Record<string, unknown> = process.env,
  options: { workerId?: string } = {},
): WorkerContainer {
  if (!workerContainerInstance) {
    workerContainerInstance = buildWorkerContainer(rawEnv, options);
  }
  return workerContainerInstance;
}

export async function resetWorkerContainer(): Promise<void> {
  if (workerContainerInstance) {
    await workerContainerInstance.dispose();
    workerContainerInstance = null;
  }
}
