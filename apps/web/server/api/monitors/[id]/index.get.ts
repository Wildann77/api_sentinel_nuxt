import type { MonitorResponseDto } from "@sentinel/contracts";
import { ValidationException } from "@sentinel/domain";
import { defineEventHandler, getRouterParam } from "h3";
import { getContainer } from "../../../utils/container.js";

export default defineEventHandler(async (event): Promise<MonitorResponseDto> => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw new ValidationException("ID monitor wajib disertakan.", [
      { name: "id", reason: "Identitas monitor wajib diisi." },
    ]);
  }

  const container = getContainer();
  return container.getMonitorUseCase.execute(id);
});
