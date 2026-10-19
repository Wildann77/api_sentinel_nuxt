import type { CheckDetailDto } from "@sentinel/contracts";
import { EntityNotFoundException, UUIDv7, ValidationException } from "@sentinel/domain";
import { toCheckDetailDto } from "../../mappers/check.mapper.js";
import type { GetCheckDetailQuery } from "../../ports/in/check.use-cases.js";
import type { CheckResultRepositoryPort } from "../../ports/out/check-result-repository.port.js";

export class GetCheckDetailUseCase implements GetCheckDetailQuery {
  constructor(private readonly checkResultRepository: CheckResultRepositoryPort) {}

  public async execute(checkId: string): Promise<CheckDetailDto> {
    if (!checkId || !UUIDv7.isValid(checkId)) {
      throw new ValidationException("ID check result tidak valid", [
        { name: "checkId", reason: "Format UUID check tidak valid." },
      ]);
    }

    const checkResult = await this.checkResultRepository.findById(checkId);
    if (!checkResult) {
      throw new EntityNotFoundException(`CheckResult dengan ID '${checkId}' tidak ditemukan.`);
    }

    return toCheckDetailDto(checkResult);
  }
}
