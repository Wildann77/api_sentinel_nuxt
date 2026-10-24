import { z } from "zod";
import { UuidSchema } from "./common.js";

export const ReportTypeSchema = z.enum(["checks", "incidents"]);
export type ReportType = z.infer<typeof ReportTypeSchema>;

export const ReportExportQuerySchema = z.object({
  type: ReportTypeSchema,
  monitorId: UuidSchema.optional(),
  from: z.string().datetime({ message: "Parameter from harus berupa ISO-8601 UTC datetime" }),
  to: z.string().datetime({ message: "Parameter to harus berupa ISO-8601 UTC datetime" }),
});
