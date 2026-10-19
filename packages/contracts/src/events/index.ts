import { z } from "zod";
import { HealthStatusSchema } from "../enums.js";
import { UuidSchema } from "../schemas/common.js";

export const CheckCompletedEventSchema = z.object({
  event: z.literal("CHECK_COMPLETED"),
  monitorId: UuidSchema,
  status: HealthStatusSchema,
  durationMs: z.number().nullable(),
  executedAt: z.string(),
});
export type CheckCompletedEventDto = z.infer<typeof CheckCompletedEventSchema>;

export const IncidentTransitionTypeSchema = z.enum(["OPENED", "RECOVERED"]);
export type IncidentTransitionType = z.infer<typeof IncidentTransitionTypeSchema>;

export const IncidentTransitionEventSchema = z.object({
  event: z.literal("INCIDENT_TRANSITION"),
  monitorId: UuidSchema,
  incidentId: UuidSchema,
  type: IncidentTransitionTypeSchema,
  healthStatus: HealthStatusSchema,
  timestamp: z.string(),
});
export type IncidentTransitionEventDto = z.infer<typeof IncidentTransitionEventSchema>;

export const WebSocketEventSchema = z.discriminatedUnion("event", [
  CheckCompletedEventSchema,
  IncidentTransitionEventSchema,
]);
export type WebSocketEventDto = z.infer<typeof WebSocketEventSchema>;

export const WebSocketPongEventSchema = z.object({
  event: z.literal("pong"),
  timestamp: z.string(),
});
export type WebSocketPongEventDto = z.infer<typeof WebSocketPongEventSchema>;

export const WebSocketServerMessageSchema = z.union([
  WebSocketEventSchema,
  WebSocketPongEventSchema,
]);
export type WebSocketServerMessageDto = z.infer<typeof WebSocketServerMessageSchema>;

export const WebSocketSubscribeMessageSchema = z.object({
  action: z.literal("subscribe"),
  monitorId: UuidSchema.optional(),
});
export type WebSocketSubscribeMessageDto = z.infer<typeof WebSocketSubscribeMessageSchema>;

export const WebSocketUnsubscribeMessageSchema = z.object({
  action: z.literal("unsubscribe"),
  monitorId: UuidSchema.optional(),
});
export type WebSocketUnsubscribeMessageDto = z.infer<typeof WebSocketUnsubscribeMessageSchema>;

export const WebSocketPingMessageSchema = z.object({
  action: z.literal("ping"),
});
export type WebSocketPingMessageDto = z.infer<typeof WebSocketPingMessageSchema>;

export const WebSocketClientMessageSchema = z.discriminatedUnion("action", [
  WebSocketSubscribeMessageSchema,
  WebSocketUnsubscribeMessageSchema,
  WebSocketPingMessageSchema,
]);
export type WebSocketClientMessageDto = z.infer<typeof WebSocketClientMessageSchema>;

export const SentinelNotifyPayloadSchema = z.object({
  channel: z.string(),
  event: z.string(),
  data: z.record(z.string(), z.unknown()),
  emittedAt: z.string(),
});
export type SentinelNotifyPayloadDto = z.infer<typeof SentinelNotifyPayloadSchema>;
