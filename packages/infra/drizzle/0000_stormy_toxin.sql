CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('PENDING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."failure_category" AS ENUM('DNS_RESOLUTION_FAILED', 'SSRF_BLOCKED', 'CONNECTION_REFUSED', 'CONNECTION_TIMEOUT', 'TLS_HANDSHAKE_FAILED', 'HTTP_STATUS_MISMATCH', 'RESPONSE_SIZE_EXCEEDED', 'HEADER_ASSERTION_FAILED', 'BODY_JSON_INVALID', 'BODY_ASSERTION_FAILED', 'REDIRECT_NOT_ALLOWED', 'EXECUTION_ABORTED');--> statement-breakpoint
CREATE TYPE "public"."health_status" AS ENUM('UNKNOWN', 'UP', 'DEGRADED', 'DOWN', 'PAUSED');--> statement-breakpoint
CREATE TYPE "public"."http_method" AS ENUM('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD');--> statement-breakpoint
CREATE TYPE "public"."trigger_type" AS ENUM('SCHEDULED', 'MANUAL');--> statement-breakpoint
CREATE TABLE "monitors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"url" text NOT NULL,
	"method" "http_method" DEFAULT 'GET' NOT NULL,
	"encrypted_headers" text,
	"header_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"encrypted_body" text,
	"encrypted_auth_config" text,
	"assertion_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"interval_seconds" integer DEFAULT 300 NOT NULL,
	"timeout_ms" integer DEFAULT 10000 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"health_status" "health_status" DEFAULT 'UNKNOWN' NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"consecutive_successes" integer DEFAULT 0 NOT NULL,
	"current_incident_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"last_checked_at" timestamp with time zone,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_monitor_interval" CHECK (interval_seconds >= 60 AND interval_seconds <= 86400),
	CONSTRAINT "chk_monitor_timeout" CHECK (timeout_ms >= 1000 AND timeout_ms <= 30000)
);--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"monitor_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recovered_at" timestamp with time zone,
	"duration_seconds" integer,
	"cause_category" "failure_category" NOT NULL,
	"initial_error_message" text NOT NULL,
	"failure_count" integer DEFAULT 1 NOT NULL,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "monitors" ADD CONSTRAINT "fk_monitors_current_incident" FOREIGN KEY ("current_incident_id") REFERENCES "public"."incidents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "check_results" (
	"id" uuid NOT NULL,
	"monitor_id" uuid NOT NULL,
	"incident_id" uuid,
	"trigger_type" "trigger_type" DEFAULT 'SCHEDULED' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer NOT NULL,
	"is_success" boolean NOT NULL,
	"status_code" integer,
	"failure_category" "failure_category",
	"pinned_ip" varchar(45),
	"assertion_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"diagnostics" jsonb,
	"sanitized_diagnostic" text,
	"correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "check_results_id_executed_at_pk" PRIMARY KEY("id","executed_at")
) PARTITION BY RANGE ("executed_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "check_results_default" PARTITION OF "check_results" DEFAULT;--> statement-breakpoint
CREATE TABLE "monitor_metrics_hourly" (
	"monitor_id" uuid NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"total_checks" integer NOT NULL,
	"success_checks" integer NOT NULL,
	"avg_latency_ms" integer NOT NULL,
	"p95_latency_ms" integer NOT NULL,
	"p99_latency_ms" integer NOT NULL,
	CONSTRAINT "monitor_metrics_hourly_monitor_id_bucket_pk" PRIMARY KEY("monitor_id","bucket")
);--> statement-breakpoint
CREATE TABLE "notification_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"channel" varchar(50) DEFAULT 'TELEGRAM' NOT NULL,
	"chat_id" varchar(100) NOT NULL,
	"encrypted_bot_token" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_configs_channel_unique" UNIQUE("channel")
);--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"incident_id" uuid NOT NULL,
	"channel" varchar(50) DEFAULT 'TELEGRAM' NOT NULL,
	"notification_type" varchar(50) NOT NULL,
	"status" "delivery_status" DEFAULT 'PENDING' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"safe_error_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"points" integer DEFAULT 1 NOT NULL,
	"expire_at" timestamp with time zone NOT NULL
);--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" varchar(100) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);--> statement-breakpoint
CREATE TABLE "worker_heartbeats" (
	"worker_id" varchar(100) PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"running_jobs" integer DEFAULT 0 NOT NULL
);--> statement-breakpoint
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_metrics_hourly" ADD CONSTRAINT "monitor_metrics_hourly_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_check_results_metrics" ON "check_results" USING btree ("monitor_id","executed_at" DESC NULLS LAST) INCLUDE ("is_success","duration_ms","status_code","trigger_type");--> statement-breakpoint
CREATE INDEX "idx_check_results_incident" ON "check_results" USING btree ("incident_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_incidents_one_open" ON "incidents" USING btree ("monitor_id") WHERE is_resolved = false;--> statement-breakpoint
CREATE INDEX "idx_incidents_monitor_id" ON "incidents" USING btree ("monitor_id");--> statement-breakpoint
CREATE INDEX "idx_monitors_due" ON "monitors" USING btree ("next_run_at") WHERE is_active = true;--> statement-breakpoint
CREATE INDEX "idx_notification_deliveries_incident" ON "notification_deliveries" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "idx_notification_deliveries_status" ON "notification_deliveries" USING btree ("status") WHERE status = 'PENDING';--> statement-breakpoint
CREATE INDEX "idx_rate_limits_expire" ON "rate_limits" USING btree ("expire_at");--> statement-breakpoint
CREATE INDEX "idx_sessions_idle_expires" ON "sessions" USING btree ("idle_expires_at");--> statement-breakpoint
CREATE INDEX "idx_sessions_abs_expires" ON "sessions" USING btree ("absolute_expires_at");--> statement-breakpoint
CREATE INDEX "idx_sessions_user_id" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_single_owner_guard" ON "users" USING btree ((true));--> statement-breakpoint
CREATE OR REPLACE FUNCTION ensure_check_results_partitions(p_months_ahead INT DEFAULT 2)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_month TIMESTAMPTZ := DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_table_name TEXT;
  v_created_partitions JSONB := '[]'::jsonb;
  v_i INT;
BEGIN
  FOR v_i IN 0..p_months_ahead LOOP
    v_start := v_current_month + (v_i || ' month')::INTERVAL;
    v_end := v_start + '1 month'::INTERVAL;
    v_table_name := 'check_results_y' || TO_CHAR(v_start, 'YYYY') || 'm' || TO_CHAR(v_start, 'MM');

    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_table_name
    ) THEN
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF check_results FOR VALUES FROM (%L) TO (%L);',
        v_table_name,
        TO_CHAR(v_start, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        TO_CHAR(v_end, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      );
      v_created_partitions := v_created_partitions || to_jsonb(v_table_name);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'ok',
    'created', v_created_partitions
  );
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION purge_expired_check_results(
  p_retention_days INT DEFAULT 90,
  p_rollup_retention_days INT DEFAULT 400
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_cutoff TIMESTAMPTZ := CURRENT_TIMESTAMP AT TIME ZONE 'UTC' - (p_retention_days || ' days')::INTERVAL;
  v_rollup_cutoff TIMESTAMPTZ := CURRENT_TIMESTAMP AT TIME ZONE 'UTC' - (p_rollup_retention_days || ' days')::INTERVAL;
  v_row RECORD;
  v_match TEXT[];
  v_part_year INT;
  v_part_month INT;
  v_part_end TIMESTAMPTZ;
  v_dropped_partitions JSONB := '[]'::jsonb;
  v_default_deleted INT := 0;
  v_rollup_deleted INT := 0;
BEGIN
  FOR v_row IN (
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'check_results'
      AND c.relname ~ '^check_results_y[0-9]{4}m[0-9]{2}$'
  ) LOOP
    v_match := regexp_match(v_row.relname, '^check_results_y([0-9]{4})m([0-9]{2})$');
    IF v_match IS NOT NULL THEN
      v_part_year := v_match[1]::INT;
      v_part_month := v_match[2]::INT;
      v_part_end := MAKE_TIMESTAMPTZ(v_part_year, v_part_month, 1, 0, 0, 0, 'UTC') + '1 month'::INTERVAL;

      IF v_part_end <= v_cutoff THEN
        EXECUTE format('DROP TABLE IF EXISTS %I;', v_row.relname);
        v_dropped_partitions := v_dropped_partitions || to_jsonb(v_row.relname);
      END IF;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'check_results_default'
  ) THEN
    WITH deleted AS (
      DELETE FROM check_results_default
      WHERE executed_at < v_cutoff
      RETURNING 1
    )
    SELECT COUNT(*) INTO v_default_deleted FROM deleted;
  END IF;

  WITH deleted_rollups AS (
    DELETE FROM monitor_metrics_hourly
    WHERE bucket < v_rollup_cutoff
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_rollup_deleted FROM deleted_rollups;

  RETURN jsonb_build_object(
    'status', 'ok',
    'dropped_partitions', v_dropped_partitions,
    'default_rows_deleted', v_default_deleted,
    'rollup_rows_deleted', v_rollup_deleted
  );
END;
$$;--> statement-breakpoint
SELECT ensure_check_results_partitions(2);