import type {
  ChangePasswordRequestDto,
  TelegramSettingsResponseDto,
  TestTelegramNotificationRequestDto,
  UpdateTelegramSettingsRequestDto,
} from "@sentinel/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { apiFetch } from "../utils/api-client.js";

export function useTelegramSettingsQuery() {
  return useQuery<TelegramSettingsResponseDto>({
    queryKey: ["settings", "telegram"],
    queryFn: () => apiFetch<TelegramSettingsResponseDto>("/api/settings/telegram"),
  });
}

export function useUpdateTelegramSettingsMutation() {
  const queryClient = useQueryClient();

  return useMutation<TelegramSettingsResponseDto, Error, UpdateTelegramSettingsRequestDto>({
    mutationFn: (body) =>
      apiFetch<TelegramSettingsResponseDto>("/api/settings/telegram", {
        method: "PUT",
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings", "telegram"] });
    },
  });
}

export interface TestTelegramResponse {
  success: boolean;
  message: string;
}

export function useTestTelegramPingMutation() {
  return useMutation<TestTelegramResponse, Error, TestTelegramNotificationRequestDto | undefined>({
    mutationFn: (body) =>
      apiFetch<TestTelegramResponse>("/api/settings/telegram/test", {
        method: "POST",
        body: body ?? {},
      }),
  });
}

export function useChangePasswordMutation() {
  return useMutation<{ success: boolean }, Error, ChangePasswordRequestDto>({
    mutationFn: (body) =>
      apiFetch<{ success: boolean }>("/api/settings/account/password", {
        method: "PUT",
        body,
      }),
  });
}
