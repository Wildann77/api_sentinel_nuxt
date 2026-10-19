import type { CheckResultDto } from "@sentinel/contracts";
import { toCheckResultDto } from "../../mappers/check.mapper.js";
import type {
  GetRecentChecksFilter,
  GetRecentChecksQuery,
} from "../../ports/in/check.use-cases.js";
import type { CheckResultRepositoryPort } from "../../ports/out/check-result-repository.port.js";

export class GetRecentChecksUseCase implements GetRecentChecksQuery {
  constructor(private readonly checkResultRepository: CheckResultRepositoryPort) {}

  public async execute(filter?: GetRecentChecksFilter): Promise<readonly CheckResultDto[]> {
    const limit = Math.min(Math.max(1, filter?.limit ?? 10), 50);
    const results = await this.checkResultRepository.findRecent(limit);
    return results.map((c) => toCheckResultDto(c));
  }
}
