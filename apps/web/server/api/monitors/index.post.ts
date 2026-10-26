import type { MonitorResponseDto } from "@sentinel/contracts";
import { defineEventHandler, readBody, setResponseStatus } from "h3";
import { getContainer } from "../../utils/container.js";

export default defineEventHandler(async (event): Promise<MonitorResponseDto> => {
  const body = await readBody(event);
  const container = getContainer();

  const created = await container.createMonitorUseCase.execute({
    request: body ?? {},
  });

  setResponseStatus(event, 201);
  return created;
});
