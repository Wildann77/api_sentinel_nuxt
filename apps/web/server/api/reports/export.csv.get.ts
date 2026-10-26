import { ReportExportQuerySchema } from "@sentinel/contracts";
import { ValidationException } from "@sentinel/domain";
import { defineEventHandler, getQuery, sendIterable, setResponseHeaders } from "h3";
import { getContainer } from "../../utils/container.js";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const parseResult = ReportExportQuerySchema.safeParse(query);

  if (!parseResult.success) {
    const issues = parseResult.error.issues;
    throw new ValidationException(
      issues[0]?.message ?? "Parameter ekspor CSV tidak valid.",
      issues.map((i) => ({
        name: i.path.join("."),
        reason: i.message,
      })),
    );
  }

  const container = getContainer();
  const stream = await container.streamCsvReportUseCase.execute({
    query: parseResult.data,
  });

  const datePrefix = new Date().toISOString().slice(0, 10);
  const filename = `report-${parseResult.data.type}-${datePrefix}.csv`;

  setResponseHeaders(event, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });

  return sendIterable(event, stream);
});
