import { GetMonitorMetricsQuerySchema, type MonitorMetricsDto } from "@sentinel/contracts";
import { ValidationException } from "@sentinel/domain";
import { defineEventHandler, getQuery, getRouterParam } from "h3";
import { getContainer } from "../../../utils/container.js";

export default defineEventHandler(async (event): Promise<MonitorMetricsDto> => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw new ValidationException("ID monitor wajib disertakan.", [
      { name: "id", reason: "Identitas monitor wajib diisi." },
    ]);
  }

  const query = getQuery(event);
  const parseResult = GetMonitorMetricsQuerySchema.safeParse(query);

  if (!parseResult.success) {
    const issues = parseResult.error.issues;
    throw new ValidationException(
      issues[0]?.message ?? "Parameter rentang metrik tidak valid.",
      issues.map((i) => ({
        name: i.path.join("."),
        reason: i.message,
      })),
    );
  }

  const container = getContainer();
  return container.getMonitorMetricsUseCase.execute({
    monitorId: id,
    range: parseResult.data.range,
  });
});
