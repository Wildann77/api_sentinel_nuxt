import type { CursorPageDto, IncidentDto, ListIncidentsQueryDto } from "@sentinel/contracts";
import { useQuery } from "@tanstack/vue-query";
import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { apiFetch } from "../utils/api-client.js";

export function useIncidentsQuery(filters?: MaybeRefOrGetter<ListIncidentsQueryDto | undefined>) {
  const resolvedFilters = computed<ListIncidentsQueryDto>(
    () => (toValue(filters) ?? {}) as ListIncidentsQueryDto,
  );

  return useQuery<CursorPageDto<IncidentDto>>({
    queryKey: computed(() => ["incidents", "list", resolvedFilters.value]),
    queryFn: () => {
      const q = resolvedFilters.value;
      const query: Record<string, string | number | boolean> = {};
      if (q.cursor) query.cursor = q.cursor;
      if (q.limit !== undefined) query.limit = q.limit;
      if (q.monitorId) query.monitorId = q.monitorId;
      if (q.isOpen !== undefined) query.isOpen = q.isOpen;

      return apiFetch<CursorPageDto<IncidentDto>>("/api/incidents", {
        method: "GET",
        query,
      });
    },
  });
}

export function useIncidentQuery(id: MaybeRefOrGetter<string>) {
  const resolvedId = computed(() => toValue(id));

  return useQuery<IncidentDto>({
    queryKey: computed(() => ["incidents", "detail", resolvedId.value]),
    queryFn: () => apiFetch<IncidentDto>(`/api/incidents/${resolvedId.value}`),
    enabled: computed(() => Boolean(resolvedId.value)),
  });
}
