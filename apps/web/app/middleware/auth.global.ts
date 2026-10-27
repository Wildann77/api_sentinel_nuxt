import { defineNuxtRouteMiddleware, navigateTo } from "#app";
import { useAuth } from "../composables/use-auth.js";

export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuth();

  // Initialize auth state on first navigation (SSR or client hydration)
  if (!auth.isInitialized.value) {
    await auth.fetchMe();
  }

  const isAuth = auth.isAuthenticated.value;
  const isLoginPage = to.path === "/login";

  if (!isAuth && !isLoginPage) {
    return navigateTo("/login");
  }

  if (isAuth && isLoginPage) {
    return navigateTo("/dashboard");
  }
});
