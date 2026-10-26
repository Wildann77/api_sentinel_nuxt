import { ListChecksQuerySchema, type PaginatedChecksResponseDto } from "@sentinel/contracts";
import { ValidationException } from "@sentinel/domain";
import { defineEventHandler, getQuery, getRouterParam } from "h3";
import { getContainer } from "../../../utils/container.js";

export default defineEventHandler(async (event): Promise<PaginatedChecksResponseDto> => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw new ValidationException("ID monitor wajib disertakan.", [
      { name: "id", reason: "Identitas monitor wajib diisi." },
    ]);
  }

  const query = getQuery(event);
  const parseResult = ListChecksQuerySchema.safeParse(query);

  if (!parseResult.success) {
    const issues = parseResult.error.issues;
    throw new ValidationException(
      issues[0]?.message ?? "Parameter pencarian riwayat tidak valid.",
      issues.map((i) => ({
        name: i.path.join("."),
        reason: i.message,
      })),
    );
  }

  const container = getContainer();
  const filter = parseResult.data;

  return container.listChecksQuery.execute({
    monitorId: id,
    limit: filter.limit,
    cursor: filter.cursor,
    from: filter.from,
    to: filter.to,
  });
});
