import { ValidationException } from "@sentinel/domain";
import { defineEventHandler, getRouterParam, setResponseStatus } from "h3";
import { getContainer } from "../../../utils/container.js";

export default defineEventHandler(async (event): Promise<null> => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw new ValidationException("ID monitor wajib disertakan.", [
      { name: "id", reason: "Identitas monitor wajib diisi." },
    ]);
  }

  const container = getContainer();
  await container.deleteMonitorUseCase.execute(id);

  setResponseStatus(event, 204);
  return null;
});
