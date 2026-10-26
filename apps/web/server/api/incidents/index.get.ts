import { ListIncidentsQuerySchema, type PaginatedIncidentsResponseDto } from "@sentinel/contracts";
import { ValidationException } from "@sentinel/domain";
import { defineEventHandler, getQuery } from "h3";
import { getContainer } from "../../utils/container.js";

export default defineEventHandler(async (event): Promise<PaginatedIncidentsResponseDto> => {
  const query = getQuery(event);
  const parseResult = ListIncidentsQuerySchema.safeParse(query);

  if (!parseResult.success) {
    const issues = parseResult.error.issues;
    throw new ValidationException(
      issues[0]?.message ?? "Parameter pencarian insiden tidak valid.",
      issues.map((i) => ({
        name: i.path.join("."),
        reason: i.message,
      })),
    );
  }

  const container = getContainer();
  const filter = parseResult.data;

  return container.listIncidentsUseCase.execute({
    monitorId: filter.monitorId,
    isOpen: filter.isOpen,
    limit: filter.limit,
    cursor: filter.cursor,
  });
});
