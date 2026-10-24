import type { z } from "zod";
import type { ReportExportQuerySchema } from "../schemas/reports.js";

export type ReportExportQueryDto = z.infer<typeof ReportExportQuerySchema>;
