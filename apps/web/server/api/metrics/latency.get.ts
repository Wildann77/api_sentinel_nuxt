import {
  type CompositeLatencyMetricsDto,
  GetCompositeLatencyQuerySchema,
} from "@sentinel/contracts";
import { ValidationException } from "@sentinel/domain";
import { defineEventHandler, getQuery } from "h3";
import { getContainer } from "../../utils/container.js";

export default defineEventHandler(async (event): Promise<CompositeLatencyMetricsDto> => {
  const query = getQuery(event);
  const parseResult = GetCompositeLatencyQuerySchema.safeParse(query);

  if (!parseResult.success) {
    const issues = parseResult.error.issues;
    throw new ValidationException(
      issues[0]?.message ?? "Parameter rentang latensi komposit tidak valid.",
      issues.map((i) => ({
        name: i.path.join("."),
        reason: i.message,
      })),
    );
  }

  const container = getContainer();
  return container.getCompositeLatencyMetricsUseCase.execute({
    range: parseResult.data.range,
  });
});
