import type { z } from "zod";
import type {
  IncidentSchema,
  IncidentStatusSchema,
  ListIncidentsQuerySchema,
  NotificationDeliverySummarySchema,
  PaginatedIncidentsResponseSchema,
} from "../schemas/incident.js";

export type NotificationDeliverySummaryDto = z.infer<typeof NotificationDeliverySummarySchema>;
export type IncidentDto = z.infer<typeof IncidentSchema>;
export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;
export type ListIncidentsQueryDto = z.infer<typeof ListIncidentsQuerySchema>;
export type PaginatedIncidentsResponseDto = z.infer<typeof PaginatedIncidentsResponseSchema>;
