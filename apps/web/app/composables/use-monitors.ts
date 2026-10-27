import type {
  CheckDetailDto,
  CreateMonitorRequestDto,
  CursorPageDto,
  ListMonitorsQueryDto,
  MonitorResponseDto,
  TestMonitorConfigRequestDto,
  UpdateMonitorRequestDto,
} from "@sentinel/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { apiFetch } from "../utils/api-client.js";

export function useMonitorsQuery(filters?: MaybeRefOrGetter<ListMonitorsQueryDto | undefined>) {
  const resolvedFilters = computed<ListMonitorsQueryDto>(
    () => (toValue(filters) ?? {}) as ListMonitorsQueryDto,
  );

  return useQuery<CursorPageDto<MonitorResponseDto>>({
    queryKey: computed(() => ["monitors", "list", resolvedFilters.value]),
    queryFn: () => {
      const q = resolvedFilters.value;
      const params: Record<string, string | number | boolean> = {};
      if (q.cursor) params.cursor = q.cursor;
      if (q.limit !== undefined) params.limit = q.limit;
      if (q.status) params.status = q.status;
      if (q.search) params.search = q.search;
      if (q.isActive !== undefined) params.isActive = q.isActive;

      return apiFetch<CursorPageDto<MonitorResponseDto>>("/api/monitors", {
        method: "GET",
        query: params,
      });
    },
  });
}

export function useMonitorQuery(id: MaybeRefOrGetter<string>) {
  const resolvedId = computed(() => toValue(id));

  return useQuery<MonitorResponseDto>({
    queryKey: computed(() => ["monitors", "detail", resolvedId.value]),
    queryFn: () => apiFetch<MonitorResponseDto>(`/api/monitors/${resolvedId.value}`),
    enabled: computed(() => Boolean(resolvedId.value)),
  });
}

export function useCreateMonitorMutation() {
  const queryClient = useQueryClient();

  return useMutation<MonitorResponseDto, Error, CreateMonitorRequestDto>({
    mutationFn: (body) =>
      apiFetch<MonitorResponseDto>("/api/monitors", {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["monitors"] });
      void queryClient.invalidateQueries({ queryKey: ["metrics"] });
    },
  });
}

export function useUpdateMonitorMutation() {
  const queryClient = useQueryClient();

  return useMutation<MonitorResponseDto, Error, { id: string; body: UpdateMonitorRequestDto }>({
    mutationFn: ({ id, body }) =>
      apiFetch<MonitorResponseDto>(`/api/monitors/${id}`, {
        method: "PATCH",
        body,
      }),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ["monitors"] });
      void queryClient.invalidateQueries({ queryKey: ["monitors", "detail", id] });
    },
  });
}

export function useDeleteMonitorMutation() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, string>({
    mutationFn: (id) =>
      apiFetch<{ success: boolean }>(`/api/monitors/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["monitors"] });
      void queryClient.invalidateQueries({ queryKey: ["metrics"] });
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
    },
  });
}

export function usePauseMonitorMutation() {
  const queryClient = useQueryClient();

  return useMutation<MonitorResponseDto, Error, string>({
    mutationFn: (id) =>
      apiFetch<MonitorResponseDto>(`/api/monitors/${id}/pause`, {
        method: "POST",
      }),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: ["monitors"] });
      void queryClient.invalidateQueries({ queryKey: ["monitors", "detail", id] });
    },
  });
}

export function useResumeMonitorMutation() {
  const queryClient = useQueryClient();

  return useMutation<MonitorResponseDto, Error, string>({
    mutationFn: (id) =>
      apiFetch<MonitorResponseDto>(`/api/monitors/${id}/resume`, {
        method: "POST",
      }),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: ["monitors"] });
      void queryClient.invalidateQueries({ queryKey: ["monitors", "detail", id] });
    },
  });
}

export interface TriggerCheckResult {
  accepted: boolean;
  jobId: string;
  monitorId: string;
  timestamp: string;
}

export function useTriggerCheckMutation() {
  const queryClient = useQueryClient();

  return useMutation<TriggerCheckResult, Error, string>({
    mutationFn: (id) =>
      apiFetch<TriggerCheckResult>(`/api/monitors/${id}/check`, {
        method: "POST",
      }),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: ["monitors", "detail", id] });
      void queryClient.invalidateQueries({ queryKey: ["monitors", "checks", id] });
    },
  });
}

export function useTestMonitorConfigMutation() {
  return useMutation<CheckDetailDto, Error, TestMonitorConfigRequestDto>({
    mutationFn: (body) =>
      apiFetch<CheckDetailDto>("/api/monitors/test", {
        method: "POST",
        body,
      }),
  });
}
