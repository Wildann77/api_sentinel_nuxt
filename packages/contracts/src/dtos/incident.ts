import type { z } from "zod";
import type { IncidentSchema, NotificationDeliverySummarySchema } from "../schemas/incident.js";

export type NotificationDeliverySummaryDto = z.infer<typeof NotificationDeliverySummarySchema>;
export type IncidentDto = z.infer<typeof IncidentSchema>;
