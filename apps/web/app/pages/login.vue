<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute, useRouter } from "#app";
import type { ProblemDetailsError } from "../components/ProblemAlert.vue";
import { useAuth } from "../composables/use-auth.js";
import { parseProblemDetails } from "../utils/api-client.js";

definePageMeta({
  layout: "login",
});

const auth = useAuth();
const route = useRoute();
const router = useRouter();

const username = ref("");
const password = ref("");
const showPassword = ref(false);
const isSubmitting = ref(false);
const errorDetails = ref<ProblemDetailsError | null>(null);

watch([username, password], () => {
  if (errorDetails.value) {
    errorDetails.value = null;
  }
});

async function handleLogin(): Promise<void> {
  const trimmedUser = username.value.trim();
  if (!trimmedUser || !password.value) return;

  isSubmitting.value = true;
  errorDetails.value = null;

  try {
    await auth.login({
      username: trimmedUser,
      password: password.value,
    });
    const redirect =
      typeof route.query.redirect === "string" && route.query.redirect.startsWith("/")
        ? route.query.redirect
        : "/dashboard";
    await router.push(redirect);
  } catch (err: unknown) {
    const parsed = parseProblemDetails(err, "/api/auth/login");
    errorDetails.value = parsed;
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="w-full max-w-[380px] border border-hairline bg-surface p-6 font-mono text-xs select-none shadow-none">
    <!-- Header Badge -->
    <div class="text-xs font-bold uppercase tracking-wider text-text-primary mb-4 pb-2 border-b border-hairline flex items-center justify-between">
      <span>[SENTINEL::AUTH_GATE]</span>
      <span class="text-text-muted text-[10px]">v1.0</span>
    </div>

    <!-- Error Alert Display -->
    <ProblemAlert
      v-if="errorDetails"
      :error="errorDetails"
      class="mb-4"
      @dismiss="errorDetails = null"
    />

    <!-- Login Form -->
    <form @submit.prevent="handleLogin" class="space-y-4">
      <div>
        <label for="login-username" class="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
          USER_IDENTIFIER:
        </label>
        <input
          id="login-username"
          v-model="username"
          type="text"
          name="username"
          autocomplete="username"
          required
          placeholder="sentinel_admin"
          :disabled="isSubmitting"
          class="w-full font-mono text-xs bg-canvas text-text-primary border border-hairline px-3 py-2 outline-none focus:border-brand-accent transition-colors disabled:opacity-50"
        />
      </div>

      <div>
        <div class="flex items-center justify-between mb-1">
          <label for="login-password" class="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
            ACCESS_TOKEN / SECRET:
          </label>
          <button
            type="button"
            class="text-[10px] text-text-muted hover:text-text-secondary cursor-pointer select-none"
            @click="showPassword = !showPassword"
          >
            [{{ showPassword ? "HIDE" : "SHOW" }}]
          </button>
        </div>
        <input
          id="login-password"
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          name="password"
          autocomplete="current-password"
          required
          placeholder="••••••••••••"
          :disabled="isSubmitting"
          class="w-full font-mono text-xs bg-canvas text-text-primary border border-hairline px-3 py-2 outline-none focus:border-brand-accent transition-colors disabled:opacity-50"
        />
      </div>

      <div class="pt-2">
        <BracketButton
          label="ENTER SYSTEM"
          type="submit"
          variant="solid"
          class="w-full justify-center"
          :disabled="isSubmitting || !username.trim() || !password"
          :loading="isSubmitting"
        />
      </div>
    </form>
  </div>
</template>
