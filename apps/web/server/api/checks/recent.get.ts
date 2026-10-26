import { RecentChecksQuerySchema, type RecentChecksResponseDto } from "@sentinel/contracts";
import { ValidationException } from "@sentinel/domain";
import { defineEventHandler, getQuery } from "h3";
import { getContainer } from "../../utils/container.js";

export default defineEventHandler(async (event): Promise<RecentChecksResponseDto> => {
  const query = getQuery(event);
  const parseResult = RecentChecksQuerySchema.safeParse(query);

  if (!parseResult.success) {
    const issues = parseResult.error.issues;
    throw new ValidationException(
      issues[0]?.message ?? "Parameter recent checks tidak valid.",
      issues.map((i) => ({
        name: i.path.join("."),
        reason: i.message,
      })),
    );
  }

  const container = getContainer();
  const checks = await container.getRecentChecksQuery.execute({
    limit: parseResult.data.limit,
  });

  return {
    data: [...checks],
  };
});
