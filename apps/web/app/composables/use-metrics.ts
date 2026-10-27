import type {
  CompositeLatencyMetricsDto,
  GetCompositeLatencyQueryDto,
  GetMonitorMetricsQueryDto,
  MetricsSummaryDto,
  MonitorMetricsDto,
} from "@sentinel/contracts";
import { useQuery } from "@tanstack/vue-query";
import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { apiFetch } from "../utils/api-client.js";

export function useGlobalMetricsQuery() {
  return useQuery<MetricsSummaryDto>({
    queryKey: ["metrics", "summary"],
    queryFn: () => apiFetch<MetricsSummaryDto>("/api/metrics/summary"),
  });
}

export function useCompositeLatencyQuery(
  range: MaybeRefOrGetter<GetCompositeLatencyQueryDto["range"]> = "24h",
) {
  const resolvedRange = computed(() => toValue(range));

  return useQuery<CompositeLatencyMetricsDto>({
    queryKey: computed(() => ["metrics", "latency", resolvedRange.value]),
    queryFn: () =>
      apiFetch<CompositeLatencyMetricsDto>("/api/metrics/latency", {
        method: "GET",
        query: { range: resolvedRange.value },
      }),
  });
}

export function useMonitorMetricsQuery(
  monitorId: MaybeRefOrGetter<string>,
  options?: MaybeRefOrGetter<GetMonitorMetricsQueryDto | undefined>,
) {
  const resolvedId = computed(() => toValue(monitorId));
  const resolvedOptions = computed<GetMonitorMetricsQueryDto>(
    () => (toValue(options) ?? { range: "24h" }) as GetMonitorMetricsQueryDto,
  );

  return useQuery<MonitorMetricsDto>({
    queryKey: computed(() => ["metrics", "monitor", resolvedId.value, resolvedOptions.value]),
    queryFn: () => {
      const q = resolvedOptions.value;
      const query: Record<string, string> = {};
      if (q.range) query.range = q.range;

      return apiFetch<MonitorMetricsDto>(`/api/monitors/${resolvedId.value}/metrics`, {
        method: "GET",
        query,
      });
    },
    enabled: computed(() => Boolean(resolvedId.value)),
  });
}
