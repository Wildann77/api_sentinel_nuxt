import { EntityNotFoundException, ValidationException } from "@sentinel/domain";
import { generateTraceparent } from "@sentinel/infra";
import { defineEventHandler, getRouterParam, setResponseStatus } from "h3";
import { getContainer } from "../../../utils/container.js";

export interface ManualCheckQueuedResponseDto {
  readonly checkId: string;
  readonly message: string;
}

export default defineEventHandler(async (event): Promise<ManualCheckQueuedResponseDto> => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw new ValidationException("ID monitor wajib disertakan.", [
      { name: "id", reason: "Identitas monitor wajib diisi." },
    ]);
  }

  const container = getContainer();
  const user = event.context.user;

  // Rate Limiting Tier 2 (ARCH §5.3.5): 20 req/menit per user, 1 req/10 detik per monitor ID
  if (user?.id) {
    await container.rateLimiter.consumeTier2UserCheck(user.id);
  }
  await container.rateLimiter.consumeTier2MonitorCheck(id);

  // Verifikasi monitor eksis
  const monitor = await container.monitorRepository.findById(id);
  if (!monitor) {
    throw new EntityNotFoundException("Monitor", id);
  }

  const checkId = container.idGenerator.generate();
  const traceparent = generateTraceparent();

  // Enqueue prioritas tinggi ke pg-boss (ARCH §6.3.A, §7.1.B, D-13, ARCH §9.5.A)
  // Catatan pg-boss v12: regex ^[\w.\-/]+$ menolak tanda ':', nama diubah ke 'probe_check'
  await container.boss.send(
    "probe:check",
    {
      monitorId: id,
      checkId,
      triggerType: "MANUAL",
      __traceparent: traceparent,
      scheduledFor: container.clock.now().toISOString(),
    },
    { priority: 10, singletonKey: id },
  );

  setResponseStatus(event, 202);

  return {
    checkId,
    jobId: checkId,
    message: "Pemeriksaan manual monitor berhasil dijadwalkan.",
  };
});
