import { ListMonitorsQuerySchema, type PaginatedMonitorsResponseDto } from "@sentinel/contracts";
import { ValidationException } from "@sentinel/domain";
import { defineEventHandler, getQuery } from "h3";
import { getContainer } from "../../utils/container.js";

export default defineEventHandler(async (event): Promise<PaginatedMonitorsResponseDto> => {
  const query = getQuery(event);
  const parseResult = ListMonitorsQuerySchema.safeParse(query);

  if (!parseResult.success) {
    const issues = parseResult.error.issues;
    throw new ValidationException(
      issues[0]?.message ?? "Parameter pencarian tidak valid.",
      issues.map((i) => ({
        name: i.path.join("."),
        reason: i.message,
      })),
    );
  }

  const container = getContainer();
  const filter = parseResult.data;

  const result = await container.listMonitorsUseCase.execute({
    status: filter.status,
    search: filter.search,
    isActive: filter.isActive,
    limit: filter.limit,
    cursor: filter.cursor,
  });

  return {
    data: [...result.items],
    pagination: {
      limit: result.limit,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor ?? null,
    },
  };
});
