import type {
  CheckDetailDto,
  CheckResultDto,
  CursorPageDto,
  ListChecksQueryDto,
  RecentChecksResponseDto,
  TestMonitorConfigRequestDto,
} from "@sentinel/contracts";
import { useMutation, useQuery } from "@tanstack/vue-query";
import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { apiFetch } from "../utils/api-client.js";

export function useMonitorChecksQuery(
  monitorId: MaybeRefOrGetter<string>,
  params?: MaybeRefOrGetter<ListChecksQueryDto | undefined>,
) {
  const resolvedId = computed(() => toValue(monitorId));
  const resolvedParams = computed<ListChecksQueryDto>(
    () => (toValue(params) ?? {}) as ListChecksQueryDto,
  );

  return useQuery<CursorPageDto<CheckResultDto>>({
    queryKey: computed(() => ["monitors", "checks", resolvedId.value, resolvedParams.value]),
    queryFn: () => {
      const q = resolvedParams.value;
      const query: Record<string, string | number> = {};
      if (q.cursor) query.cursor = q.cursor;
      if (q.limit !== undefined) query.limit = q.limit;
      if (q.from) query.from = q.from;
      if (q.to) query.to = q.to;

      return apiFetch<CursorPageDto<CheckResultDto>>(`/api/monitors/${resolvedId.value}/checks`, {
        method: "GET",
        query,
      });
    },
    enabled: computed(() => Boolean(resolvedId.value)),
  });
}

export function useCheckDetailQuery(checkId: MaybeRefOrGetter<string>) {
  const resolvedId = computed(() => toValue(checkId));

  return useQuery<CheckDetailDto>({
    queryKey: computed(() => ["checks", "detail", resolvedId.value]),
    queryFn: () => apiFetch<CheckDetailDto>(`/api/checks/${resolvedId.value}`),
    enabled: computed(() => Boolean(resolvedId.value)),
  });
}

export function useRecentChecksQuery(limit: MaybeRefOrGetter<number> = 10) {
  const resolvedLimit = computed(() => toValue(limit));

  return useQuery<RecentChecksResponseDto>({
    queryKey: computed(() => ["checks", "recent", resolvedLimit.value]),
    queryFn: () =>
      apiFetch<RecentChecksResponseDto>("/api/checks/recent", {
        method: "GET",
        query: { limit: resolvedLimit.value },
      }),
  });
}

export function useTestProbeMutation() {
  return useMutation<CheckDetailDto, Error, TestMonitorConfigRequestDto>({
    mutationFn: (body) =>
      apiFetch<CheckDetailDto>("/api/monitors/test", {
        method: "POST",
        body,
      }),
  });
}
