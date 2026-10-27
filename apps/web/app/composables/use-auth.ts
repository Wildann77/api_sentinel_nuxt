import type {
  LoginRequestDto,
  LoginResponseDto,
  MeResponseDto,
  UserSummaryDto,
} from "@sentinel/contracts";
import { computed } from "vue";
import { useSentinelSocket } from "./use-sentinel-socket.js";

export function useAuth() {
  const user = useState<UserSummaryDto | null>("sentinel_auth_user", () => null);
  const isAuthenticated = useState<boolean>("sentinel_auth_authenticated", () => false);
  const isInitialized = useState<boolean>("sentinel_auth_initialized", () => false);
  const isLoggingIn = useState<boolean>("sentinel_auth_loading", () => false);

  async function fetchMe(): Promise<MeResponseDto> {
    try {
      const res = await $fetch<MeResponseDto>("/api/auth/me", {
        method: "GET",
        headers: {
          accept: "application/json",
        },
      });

      if (res.authenticated && res.user) {
        user.value = res.user;
        isAuthenticated.value = true;
      } else {
        user.value = null;
        isAuthenticated.value = false;
      }
      isInitialized.value = true;
      return res;
    } catch {
      user.value = null;
      isAuthenticated.value = false;
      isInitialized.value = true;
      return { authenticated: false, user: null };
    }
  }

  async function login(credentials: LoginRequestDto): Promise<LoginResponseDto> {
    isLoggingIn.value = true;
    try {
      const res = await $fetch<LoginResponseDto>("/api/auth/login", {
        method: "POST",
        body: credentials,
      });

      if (res.user) {
        user.value = res.user;
        isAuthenticated.value = true;
        isInitialized.value = true;
      }
      return res;
    } finally {
      isLoggingIn.value = false;
    }
  }

  async function logout(): Promise<void> {
    try {
      await $fetch("/api/auth/logout", {
        method: "POST",
      });
    } catch {
      // Ignore network errors on logout
    } finally {
      user.value = null;
      isAuthenticated.value = false;
      isInitialized.value = true;
      try {
        useSentinelSocket().disconnect();
      } catch {
        // Safe fallback
      }
      await navigateTo("/login");
    }
  }

  return {
    user: computed(() => user.value),
    isAuthenticated: computed(() => isAuthenticated.value),
    isInitialized: computed(() => isInitialized.value),
    isLoggingIn: computed(() => isLoggingIn.value),
    fetchMe,
    login,
    logout,
  };
}
