import {
  AuthenticateUser,
  ChangeOwnerPassword,
  CreateMonitor,
  DeleteMonitor,
  ExecuteManualCheck,
  GetCheckDetailUseCase,
  GetCompositeLatency,
  GetIncident,
  GetMetricsSummary,
  GetMonitor,
  GetMonitorMetrics,
  GetRecentChecksUseCase,
  GetTelegramSettings,
  ListChecksUseCase,
  ListIncidents,
  ListMonitors,
  PauseMonitor,
  type QueuePort,
  ResumeMonitor,
  RevokeSession,
  StreamCsvReport,
  TestMonitorConfig,
  TestTelegramNotification,
  UpdateMonitor,
  UpdateTelegramSettings,
  ValidateSession,
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
  DrizzleUserRepository,
  type Env,
  LibsodiumAeadCipherAdapter,
  NodeArgon2HasherAdapter,
  NodeHttpSsrfProbeAdapter,
  type PgBoss,
  PgBossQueueAdapter,
  PgListenNotifyAdapter,
  PinoLoggerAdapter,
  PostgresRateLimiterAdapter,
  parseKeyring,
  SystemClockAdapter,
  TelegramBotNotificationAdapter,
  UuidV7GeneratorAdapter,
  validateEnv,
} from "@sentinel/infra";
import type pg from "pg";

export interface WebContainer {
  readonly env: Env;
  readonly pool: pg.Pool;
  readonly db: DrizzleDatabase;
  readonly logger: PinoLoggerAdapter;
  readonly clock: SystemClockAdapter;
  readonly idGenerator: UuidV7GeneratorAdapter;
  readonly cipher: LibsodiumAeadCipherAdapter;
  readonly passwordHasher: NodeArgon2HasherAdapter;
  readonly rateLimiter: PostgresRateLimiterAdapter;
  readonly unitOfWork: DrizzleUnitOfWorkAdapter;
  readonly queuePort: QueuePort;
  readonly boss: PgBoss;
  readonly pubSub: PgListenNotifyAdapter;
  readonly notificationPort: TelegramBotNotificationAdapter;

  // Repositories
  readonly userRepository: DrizzleUserRepository;
  readonly sessionRepository: DrizzleSessionRepository;
  readonly monitorRepository: DrizzleMonitorRepository;
  readonly checkResultRepository: DrizzleCheckResultRepository;
  readonly incidentRepository: DrizzleIncidentRepository;
  readonly metricsRepository: DrizzleMetricsRepository;
  readonly notificationConfigRepository: DrizzleNotificationConfigRepository;
  readonly notificationDeliveryRepository: DrizzleNotificationDeliveryRepository;
  readonly heartbeatRepository: DrizzleHeartbeatRepository;

  // Auth Use Cases
  readonly authenticateUserUseCase: AuthenticateUser;
  readonly validateSessionUseCase: ValidateSession;
  readonly revokeSessionUseCase: RevokeSession;
  readonly changeOwnerPasswordUseCase: ChangeOwnerPassword;

  // Monitor Use Cases
  readonly createMonitorUseCase: CreateMonitor;
  readonly updateMonitorUseCase: UpdateMonitor;
  readonly deleteMonitorUseCase: DeleteMonitor;
  readonly pauseMonitorUseCase: PauseMonitor;
  readonly resumeMonitorUseCase: ResumeMonitor;
  readonly getMonitorUseCase: GetMonitor;
  readonly listMonitorsUseCase: ListMonitors;
  readonly testMonitorConfigUseCase: TestMonitorConfig;
  readonly executeManualCheckUseCase: ExecuteManualCheck;

  // Check Use Cases
  readonly listChecksQuery: ListChecksUseCase;
  readonly getCheckDetailQuery: GetCheckDetailUseCase;
  readonly getRecentChecksQuery: GetRecentChecksUseCase;

  // Metrics Use Cases
  readonly getMetricsSummaryUseCase: GetMetricsSummary;
  readonly getMonitorMetricsUseCase: GetMonitorMetrics;
  readonly getCompositeLatencyMetricsUseCase: GetCompositeLatency;

  // Incident Use Cases
  readonly getIncidentUseCase: GetIncident;
  readonly listIncidentsUseCase: ListIncidents;

  // Report Use Cases
  readonly streamCsvReportUseCase: StreamCsvReport;

  // Settings Use Cases
  readonly getTelegramSettingsQuery: GetTelegramSettings;
  readonly updateTelegramSettingsUseCase: UpdateTelegramSettings;
  readonly testTelegramNotificationUseCase: TestTelegramNotification;

  dispose(): Promise<void>;
}

let containerInstance: WebContainer | null = null;

export function buildWebContainer(rawEnv: Record<string, unknown> = process.env): WebContainer {
  const env = validateEnv(rawEnv);

  const pool = createPgPool({
    connectionString: env.DATABASE_URL,
    applicationName: "api_sentinel_web",
  });
  const db = createDrizzleDb(pool);

  const logger = new PinoLoggerAdapter({ level: env.LOG_LEVEL });
  const clock = new SystemClockAdapter();
  const idGenerator = new UuidV7GeneratorAdapter();
  const cipher = new LibsodiumAeadCipherAdapter(parseKeyring(env.APP_KEYRING));
  const passwordHasher = new NodeArgon2HasherAdapter();
  const rateLimiter = new PostgresRateLimiterAdapter(db, clock);
  const unitOfWork = new DrizzleUnitOfWorkAdapter(db);
  const pubSub = new PgListenNotifyAdapter({
    pool,
    connectionConfig: {
      connectionString: env.DATABASE_URL,
      applicationName: "api_sentinel_web_listen",
    },
  });

  const userRepository = new DrizzleUserRepository(db);
  const sessionRepository = new DrizzleSessionRepository(db);
  const monitorRepository = new DrizzleMonitorRepository(db);
  const checkResultRepository = new DrizzleCheckResultRepository(db);
  const incidentRepository = new DrizzleIncidentRepository(db);
  const metricsRepository = new DrizzleMetricsRepository(db);
  const notificationConfigRepository = new DrizzleNotificationConfigRepository(db);
  const notificationDeliveryRepository = new DrizzleNotificationDeliveryRepository(db);
  const heartbeatRepository = new DrizzleHeartbeatRepository(db);

  const boss = createPgBoss({
    connectionString: env.DATABASE_URL,
    applicationName: "api_sentinel_web_boss",
  });
  const queuePort = new PgBossQueueAdapter(boss);

  const authenticateUserUseCase = new AuthenticateUser(
    userRepository,
    sessionRepository,
    passwordHasher,
    rateLimiter,
    clock,
    env.SESSION_SECRET,
  );

  const validateSessionUseCase = new ValidateSession(
    userRepository,
    sessionRepository,
    clock,
    env.SESSION_SECRET,
  );

  const revokeSessionUseCase = new RevokeSession(sessionRepository, env.SESSION_SECRET);

  const changeOwnerPasswordUseCase = new ChangeOwnerPassword(
    userRepository,
    sessionRepository,
    passwordHasher,
    clock,
    env.SESSION_SECRET,
    unitOfWork,
  );

  const createMonitorUseCase = new CreateMonitor(monitorRepository, cipher, clock, idGenerator);

  const updateMonitorUseCase = new UpdateMonitor(monitorRepository, cipher, clock);

  const deleteMonitorUseCase = new DeleteMonitor(monitorRepository, queuePort);

  const pauseMonitorUseCase = new PauseMonitor(monitorRepository, queuePort);

  const resumeMonitorUseCase = new ResumeMonitor(monitorRepository, clock);

  const getMonitorUseCase = new GetMonitor(monitorRepository);

  const listMonitorsUseCase = new ListMonitors(monitorRepository, checkResultRepository);

  const networkProbe = new NodeHttpSsrfProbeAdapter();

  const testMonitorConfigUseCase = new TestMonitorConfig(networkProbe, clock, idGenerator);

  const executeManualCheckUseCase = new ExecuteManualCheck(
    monitorRepository,
    checkResultRepository,
    unitOfWork,
    cipher,
    clock,
    idGenerator,
    logger,
    networkProbe,
  );

  const listChecksQuery = new ListChecksUseCase(checkResultRepository, monitorRepository);
  const getCheckDetailQuery = new GetCheckDetailUseCase(checkResultRepository);
  const getRecentChecksQuery = new GetRecentChecksUseCase(checkResultRepository);

  const getMetricsSummaryUseCase = new GetMetricsSummary(metricsRepository);
  const getMonitorMetricsUseCase = new GetMonitorMetrics(metricsRepository, monitorRepository);
  const getCompositeLatencyMetricsUseCase = new GetCompositeLatency(metricsRepository);

  const getIncidentUseCase = new GetIncident(
    incidentRepository,
    monitorRepository,
    notificationDeliveryRepository,
    checkResultRepository,
  );

  const listIncidentsUseCase = new ListIncidents(
    incidentRepository,
    monitorRepository,
    notificationDeliveryRepository,
  );

  const notificationPort = new TelegramBotNotificationAdapter({
    baseUrl: env.TELEGRAM_API_BASE_URL,
  });

  const getTelegramSettingsQuery = new GetTelegramSettings(notificationConfigRepository);
  const updateTelegramSettingsUseCase = new UpdateTelegramSettings(
    notificationConfigRepository,
    cipher,
    clock,
    idGenerator,
    logger,
  );
  const testTelegramNotificationUseCase = new TestTelegramNotification(
    notificationConfigRepository,
    notificationPort,
    cipher,
    logger,
  );

  const streamCsvReportUseCase = new StreamCsvReport(
    checkResultRepository,
    incidentRepository,
    monitorRepository,
  );

  return {
    env,
    pool,
    db,
    logger,
    clock,
    idGenerator,
    cipher,
    passwordHasher,
    rateLimiter,
    unitOfWork,
    queuePort,
    boss,
    pubSub,
    notificationPort,

    userRepository,
    sessionRepository,
    monitorRepository,
    checkResultRepository,
    incidentRepository,
    metricsRepository,
    notificationConfigRepository,
    notificationDeliveryRepository,
    heartbeatRepository,

    authenticateUserUseCase,
    validateSessionUseCase,
    revokeSessionUseCase,
    changeOwnerPasswordUseCase,

    createMonitorUseCase,
    updateMonitorUseCase,
    deleteMonitorUseCase,
    pauseMonitorUseCase,
    resumeMonitorUseCase,
    getMonitorUseCase,
    listMonitorsUseCase,
    testMonitorConfigUseCase,
    executeManualCheckUseCase,

    listChecksQuery,
    getCheckDetailQuery,
    getRecentChecksQuery,

    getMetricsSummaryUseCase,
    getMonitorMetricsUseCase,
    getCompositeLatencyMetricsUseCase,

    getIncidentUseCase,
    listIncidentsUseCase,

    streamCsvReportUseCase,

    getTelegramSettingsQuery,
    updateTelegramSettingsUseCase,
    testTelegramNotificationUseCase,

    async dispose(): Promise<void> {
      try {
        await pubSub.close();
      } catch {
        // Ignore
      }
      try {
        await boss.stop({ graceful: true, timeout: 2000 });
      } catch {
        // Ignore if boss was not started
      }
      await pool.end();
    },
  };
}

export function getContainer(rawEnv: Record<string, unknown> = process.env): WebContainer {
  if (!containerInstance) {
    containerInstance = buildWebContainer(rawEnv);
  }
  return containerInstance;
}

export async function resetContainer(): Promise<void> {
  if (containerInstance) {
    await containerInstance.dispose();
    containerInstance = null;
  }
}
