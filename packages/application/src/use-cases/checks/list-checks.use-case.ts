import type { CheckResultDto, CursorPageDto } from "@sentinel/contracts";
import { EntityNotFoundException, UUIDv7, ValidationException } from "@sentinel/domain";
import { toCheckResultDto } from "../../mappers/check.mapper.js";
import type { ListChecksFilter, ListChecksQuery } from "../../ports/in/check.use-cases.js";
import type { CheckResultRepositoryPort } from "../../ports/out/check-result-repository.port.js";
import type { MonitorRepositoryPort } from "../../ports/out/monitor-repository.port.js";

export class ListChecksUseCase implements ListChecksQuery {
  constructor(
    private readonly checkResultRepository: CheckResultRepositoryPort,
    private readonly monitorRepository: MonitorRepositoryPort,
  ) {}

  public async execute(filter: ListChecksFilter): Promise<CursorPageDto<CheckResultDto>> {
    if (!filter.monitorId || !UUIDv7.isValid(filter.monitorId)) {
      throw new ValidationException("ID monitor tidak valid", [
        { name: "monitorId", reason: "Format UUID monitor tidak valid." },
      ]);
    }

    const monitor = await this.monitorRepository.findById(filter.monitorId);
    if (!monitor) {
      throw new EntityNotFoundException(`Monitor dengan ID '${filter.monitorId}' tidak ditemukan.`);
    }

    const limit = Math.min(Math.max(1, filter.limit ?? 50), 100);
    const fromDate = filter.from ? new Date(filter.from) : undefined;
    const toDate = filter.to ? new Date(filter.to) : undefined;

    if (fromDate && Number.isNaN(fromDate.getTime())) {
      throw new ValidationException("Format waktu 'from' tidak valid", [
        { name: "from", reason: "Parameter from harus berupa tanggal yang valid." },
      ]);
    }

    if (toDate && Number.isNaN(toDate.getTime())) {
      throw new ValidationException("Format waktu 'to' tidak valid", [
        { name: "to", reason: "Parameter to harus berupa tanggal yang valid." },
      ]);
    }

    const results = await this.checkResultRepository.findByMonitorId(
      filter.monitorId,
      limit + 1,
      filter.cursor,
      fromDate,
      toDate,
    );

    const hasMore = results.length > limit;
    const pageItems = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore ? (pageItems[pageItems.length - 1]?.id.toString() ?? null) : null;

    return {
      data: pageItems.map((c) => toCheckResultDto(c)),
      pagination: {
        limit,
        hasMore,
        nextCursor,
      },
    };
  }
}
