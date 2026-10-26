import { initTelemetry, shutdownTelemetry } from "@sentinel/infra";
import type { NitroApp } from "nitropack";

export default function (nitroApp: NitroApp): void {
  void initTelemetry({ serviceName: "api-sentinel-web" });

  nitroApp.hooks.hook("close", async () => {
    await shutdownTelemetry();
  });
}
