import type { CheckDetailDto } from "@sentinel/contracts";
import { ValidationException } from "@sentinel/domain";
import { defineEventHandler, getRouterParam } from "h3";
import { getContainer } from "../../utils/container.js";

export default defineEventHandler(async (event): Promise<CheckDetailDto> => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw new ValidationException("ID check wajib disertakan.", [
      { name: "id", reason: "Identitas check result wajib diisi." },
    ]);
  }

  const container = getContainer();
  return container.getCheckDetailQuery.execute(id);
});
