import type { MetricsSummaryDto } from "@sentinel/contracts";
import { defineEventHandler } from "h3";
import { getContainer } from "../../utils/container.js";

export default defineEventHandler(async (): Promise<MetricsSummaryDto> => {
  const container = getContainer();
  return container.getMetricsSummaryUseCase.execute();
});
