import type { IncidentDto } from "@sentinel/contracts";
import { ValidationException } from "@sentinel/domain";
import { defineEventHandler, getRouterParam } from "h3";
import { getContainer } from "../../utils/container.js";

export default defineEventHandler(async (event): Promise<IncidentDto> => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw new ValidationException("ID insiden wajib disertakan.", [
      { name: "id", reason: "Identitas insiden wajib diisi." },
    ]);
  }

  const container = getContainer();
  return container.getIncidentUseCase.execute(id);
});
