<script setup lang="ts">
import {
  type AssertionOperator,
  type AssertionRuleInputDto,
  type AuthConfigInputDto,
  type CheckDetailDto,
  FORBIDDEN_REQUEST_HEADERS,
  type HttpMethod,
  type MonitorResponseDto,
  type TestMonitorConfigRequestDto,
} from "@sentinel/contracts";
import { computed, reactive, ref, watch } from "vue";
import {
  useCreateMonitorMutation,
  useTestMonitorConfigMutation,
  useUpdateMonitorMutation,
} from "../composables/use-monitors.js";
import { parseProblemDetails } from "../utils/api-client.js";
import type { ProblemDetailsError } from "./ProblemAlert.vue";

const props = withDefaults(
  defineProps<{
    mode: "create" | "edit";
    initialData?: MonitorResponseDto | null;
    loading?: boolean;
  }>(),
  {
    initialData: null,
    loading: false,
  },
);

const emit = defineEmits<{
  (e: "saved", monitor: MonitorResponseDto): void;
  (e: "cancel"): void;
}>();

const router = useRouter();
const toast = useToast();

const createMutation = useCreateMonitorMutation();
const updateMutation = useUpdateMonitorMutation();
const testProbeMutation = useTestMonitorConfigMutation();

// Active tab state
const activeTab = ref<string>("target");

const tabItems = [
  { label: "[01: TARGET & SCHEDULE]", value: "target", slot: "target" },
  { label: "[02: HEADERS & AUTHENTICATION]", value: "headers", slot: "headers" },
  { label: "[03: RESPONSE ASSERTIONS]", value: "assertions", slot: "assertions" },
];

// HTTP Method options
const methodOptions = [
  { label: "GET", value: "GET" },
  { label: "POST", value: "POST" },
  { label: "PUT", value: "PUT" },
  { label: "PATCH", value: "PATCH" },
  { label: "DELETE", value: "DELETE" },
  { label: "HEAD", value: "HEAD" },
];

// Interval options
const intervalOptions = [
  { label: "1 MENIT (60s)", value: 60 },
  { label: "5 MENIT (300s)", value: 300 },
  { label: "15 MENIT (900s)", value: 900 },
  { label: "30 MENIT (1800s)", value: 1800 },
  { label: "1 JAM (3600s)", value: 3600 },
  { label: "6 JAM (21600s)", value: 21600 },
  { label: "12 JAM (43200s)", value: 43200 },
  { label: "24 JAM (86400s)", value: 86400 },
];

// Auth Type options
const authTypeOptions = [
  { label: "[NONE] Tanpa Autentikasi", value: "NONE" },
  { label: "[BEARER] Bearer Token (Authorization)", value: "BEARER" },
  { label: "[BASIC] Basic Auth (Username & Password)", value: "BASIC" },
  { label: "[API_KEY] API Key (Custom Header)", value: "API_KEY" },
  { label: "[CUSTOM_HEADER] Header Kredensial Khusus", value: "CUSTOM_HEADER" },
];

// Operator options
const statusOperatorOptions = [
  { label: "EQUALS (Harus Sama)", value: "equals" },
  { label: "NOT_EQUALS (Tidak Boleh Sama)", value: "not_equals" },
];

const headerOperatorOptions = [
  { label: "EXISTS (Header Ada)", value: "exists" },
  { label: "EQUALS (Nilai Persis Sama)", value: "equals" },
  { label: "CONTAINS (Mengandung Substring)", value: "contains" },
];

const jsonPathOperatorOptions = [
  { label: "EXISTS (Path Ada di JSON)", value: "exists" },
  { label: "EQUALS (Nilai Sama)", value: "equals" },
  { label: "NOT_EQUALS (Nilai Berbeda)", value: "not_equals" },
  { label: "CONTAINS (Array/String Mengandung)", value: "contains" },
];

interface HeaderRow {
  id: string;
  key: string;
  value: string;
}

interface AdditionalRule {
  id: string;
  type: "header" | "body-json";
  target: string;
  operator: AssertionOperator;
  expectedValue: string;
}

// Form state
const form = reactive({
  // Tab 01
  name: "",
  method: "GET" as HttpMethod,
  url: "",
  intervalSeconds: 60,
  timeoutMs: 10000,

  // Tab 02
  authType: "NONE" as "NONE" | "BEARER" | "BASIC" | "API_KEY" | "CUSTOM_HEADER",
  bearerToken: "",
  basicUsername: "",
  basicPassword: "",
  apiKeyHeaderName: "",
  apiKeyValue: "",
  customAuthHeaders: [] as HeaderRow[],
  isEditingSecret: false,
  customHeaders: [] as HeaderRow[],
  body: "",
  hasExistingBody: false,
  isEditingBody: false,

  // Tab 03
  statusExpected: "200",
  statusOperator: "equals" as "equals" | "not_equals",
  additionalRules: [] as AdditionalRule[],
});

// OCC Conflict State
const conflictError = ref<string | null>(null);
const submissionError = ref<ProblemDetailsError | null>(null);

// Probe Result Modal State
const isProbeModalOpen = ref(false);
const probeResult = ref<CheckDetailDto | null>(null);

// Sync initial data if editing
function populateFromInitialData(data: MonitorResponseDto): void {
  form.name = data.name;
  form.method = data.method;
  form.url = data.url;
  form.intervalSeconds = data.intervalSeconds;
  form.timeoutMs = data.timeoutMs;
  form.authType = data.authType;

  // Masked secret setup for edit mode
  if (data.authType !== "NONE") {
    form.isEditingSecret = false;
    form.bearerToken = "••••••••";
    form.basicPassword = "••••••••";
    form.apiKeyValue = "••••••••";
  }

  // Flag existing encrypted body in edit mode
  if (data.hasCustomBody) {
    form.hasExistingBody = true;
    form.isEditingBody = false;
  }

  // Populate custom headers placeholder from headerKeys
  if (data.headerKeys && data.headerKeys.length > 0 && form.customHeaders.length === 0) {
    form.customHeaders = data.headerKeys.map((key, i) => ({
      id: `hdr-init-${i}`,
      key,
      value: "••••••••",
    }));
  }

  // Populate assertions
  if (data.assertions && data.assertions.length > 0) {
    const statusRule = data.assertions.find((r) => r.type === "status");
    if (statusRule) {
      form.statusOperator = (statusRule.operator as "equals" | "not_equals") || "equals";
      const expected = statusRule.expected ?? statusRule.expectedValue;
      if (Array.isArray(expected)) {
        form.statusExpected = expected.join(", ");
      } else if (expected !== undefined) {
        form.statusExpected = String(expected);
      }
    }

    form.additionalRules = data.assertions
      .filter((r) => r.type !== "status")
      .map((r, i) => ({
        id: `rule-${Date.now()}-${i}`,
        type: r.type as "header" | "body-json",
        target: r.target || r.property || "",
        operator: (r.operator as AssertionOperator) || "equals",
        expectedValue:
          r.expected !== undefined
            ? String(r.expected)
            : r.expectedValue !== undefined
              ? String(r.expectedValue)
              : "",
      }));
  }
}

watch(
  () => props.initialData,
  (data) => {
    if (data && props.mode === "edit") {
      populateFromInitialData(data);
    }
  },
  { immediate: true },
);

// Method check for payload body
const supportsBody = computed<boolean>(() => {
  return ["POST", "PUT", "PATCH"].includes(form.method);
});

// Total assertion count limit (max 10)
const totalAssertionRulesCount = computed<number>(() => {
  let count = 0;
  if (form.statusExpected.trim().length > 0) {
    count += 1;
  }
  count += form.additionalRules.length;
  return count;
});

const isAssertionLimitExceeded = computed<boolean>(() => {
  return totalAssertionRulesCount.value > 10;
});

// Check for forbidden headers
const forbiddenHeadersDetected = computed<string[]>(() => {
  const detected: string[] = [];
  for (const h of form.customHeaders) {
    const keyLower = h.key.trim().toLowerCase();
    if (
      FORBIDDEN_REQUEST_HEADERS.includes(keyLower as (typeof FORBIDDEN_REQUEST_HEADERS)[number])
    ) {
      detected.push(h.key.trim());
    }
  }
  return detected;
});

// Add / Remove Headers
function addCustomHeaderRow(): void {
  form.customHeaders.push({
    id: `hdr-${Date.now()}-${Math.random()}`,
    key: "",
    value: "",
  });
}

function removeCustomHeaderRow(index: number): void {
  form.customHeaders.splice(index, 1);
}

// Add / Remove Custom Auth Headers
function addCustomAuthHeaderRow(): void {
  form.customAuthHeaders.push({
    id: `cauth-${Date.now()}-${Math.random()}`,
    key: "",
    value: "",
  });
}

function removeCustomAuthHeaderRow(index: number): void {
  form.customAuthHeaders.splice(index, 1);
}

// Add / Remove Additional Assertion Rules
function addAssertionRule(type: "header" | "body-json"): void {
  if (totalAssertionRulesCount.value >= 10) {
    toast.add({
      title: "[BATAS ASSERTION TERCAPAI]",
      description: "Maksimal 10 assertion rule per monitor.",
      color: "warning",
    });
    return;
  }

  form.additionalRules.push({
    id: `rule-${Date.now()}-${Math.random()}`,
    type,
    target: type === "header" ? "content-type" : "$.status",
    operator: type === "header" ? "contains" : "equals",
    expectedValue: type === "header" ? "application/json" : "ok",
  });
}

function removeAssertionRule(index: number): void {
  form.additionalRules.splice(index, 1);
}

// Build clean assertions array
function buildAssertionsPayload(): AssertionRuleInputDto[] {
  const rules: AssertionRuleInputDto[] = [];

  // 1. Status rule
  if (form.statusExpected.trim().length > 0) {
    const parts = form.statusExpected
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const numericValues = parts.map((s) => Number.parseInt(s, 10)).filter((n) => !Number.isNaN(n));

    if (numericValues.length === 1) {
      rules.push({
        type: "status",
        operator: form.statusOperator,
        expected: numericValues[0],
      });
    } else if (numericValues.length > 1) {
      rules.push({
        type: "status",
        operator: form.statusOperator,
        expected: numericValues,
      });
    }
  }

  // 2. Additional rules
  for (const r of form.additionalRules) {
    if (!r.target.trim()) continue;

    let expectedValue: string | number | boolean | undefined = r.expectedValue.trim();
    if (r.type === "body-json") {
      if (expectedValue === "true") expectedValue = true;
      else if (expectedValue === "false") expectedValue = false;
      else if (!Number.isNaN(Number(expectedValue)) && expectedValue !== "") {
        expectedValue = Number(expectedValue);
      }
    } else if (r.operator === "exists") {
      expectedValue = undefined;
    }

    rules.push({
      type: r.type,
      target: r.target.trim(),
      operator: r.operator,
      expected: expectedValue,
    });
  }

  return rules;
}

// Build custom headers dictionary
function buildCustomHeadersPayload(): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  for (const row of form.customHeaders) {
    const key = row.key.trim();
    if (key.length > 0) {
      headers[key] = row.value;
    }
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

// Build auth payload
function buildAuthPayload(): AuthConfigInputDto | undefined {
  if (form.authType === "NONE") {
    return { type: "NONE" };
  }

  if (form.authType === "BEARER") {
    const token =
      props.mode === "edit" && !form.isEditingSecret && form.bearerToken === "••••••••"
        ? "__SENTINEL_UNCHANGED__"
        : form.bearerToken.trim();
    return {
      type: "BEARER",
      token,
    };
  }

  if (form.authType === "BASIC") {
    const password =
      props.mode === "edit" && !form.isEditingSecret && form.basicPassword === "••••••••"
        ? "__SENTINEL_UNCHANGED__"
        : form.basicPassword;
    return {
      type: "BASIC",
      username: form.basicUsername.trim(),
      password,
    };
  }

  if (form.authType === "API_KEY") {
    const apiKey =
      props.mode === "edit" && !form.isEditingSecret && form.apiKeyValue === "••••••••"
        ? "__SENTINEL_UNCHANGED__"
        : form.apiKeyValue.trim();
    return {
      type: "API_KEY",
      headerName: form.apiKeyHeaderName.trim(),
      apiKey,
    };
  }

  if (form.authType === "CUSTOM_HEADER") {
    const headers: Record<string, string> = {};
    for (const row of form.customAuthHeaders) {
      if (row.key.trim()) {
        headers[row.key.trim()] = row.value;
      }
    }
    return {
      type: "CUSTOM_HEADER",
      headers,
    };
  }

  return undefined;
}

// Build payload for dry-run probe
function buildProbePayload(): TestMonitorConfigRequestDto {
  return {
    url: form.url.trim(),
    method: form.method,
    timeoutMs: Number(form.timeoutMs) || 10000,
    assertions: buildAssertionsPayload(),
    auth: buildAuthPayload(),
    customHeaders: buildCustomHeadersPayload(),
    body: supportsBody.value && form.body.trim().length > 0 ? form.body.trim() : null,
  };
}

// Execute dry-run probe
async function handleRunProbe(): Promise<void> {
  submissionError.value = null;

  if (!form.url.trim()) {
    toast.add({
      title: "[URL BELUM DIISI]",
      description: "Target URL wajib diisi sebelum menjalankan probe.",
      color: "warning",
    });
    activeTab.value = "target";
    return;
  }

  try {
    const payload = buildProbePayload();
    const result = await testProbeMutation.mutateAsync(payload);
    probeResult.value = result;
    isProbeModalOpen.value = true;
  } catch (err: unknown) {
    const problem = parseProblemDetails(err);
    submissionError.value = {
      title: "PROBE TEST FAILED",
      status: problem.status || 400,
      detail: problem.detail || "Gagal mengeksekusi test probe ke server target.",
      invalidParams: problem.invalidParams,
    };
    toast.add({
      title: "[PROBE DRY-RUN GAGAL]",
      description: problem.detail || "Terjadi kesalahan.",
      color: "error",
    });
  }
}

// Submit create or update
async function handleSubmit(): Promise<void> {
  submissionError.value = null;
  conflictError.value = null;

  // Basic validation checks
  if (!form.name.trim()) {
    submissionError.value = {
      title: "VALIDATION_FAILED",
      detail: "Nama monitor wajib diisi.",
    };
    activeTab.value = "target";
    return;
  }

  if (!form.url.trim()) {
    submissionError.value = {
      title: "VALIDATION_FAILED",
      detail: "Target URL monitor wajib diisi.",
    };
    activeTab.value = "target";
    return;
  }

  if (forbiddenHeadersDetected.value.length > 0) {
    submissionError.value = {
      title: "FORBIDDEN_HEADERS",
      detail: `Header "${forbiddenHeadersDetected.value.join(", ")}" dilarang untuk dikonfigurasi (kebijakan hop-by-hop).`,
    };
    activeTab.value = "headers";
    return;
  }

  if (isAssertionLimitExceeded.value) {
    submissionError.value = {
      title: "ASSERTION_LIMIT_EXCEEDED",
      detail: "Jumlah assertion rule melampaui batas maksimum (10 aturan).",
    };
    activeTab.value = "assertions";
    return;
  }

  const assertions = buildAssertionsPayload();
  const customHeaders = buildCustomHeadersPayload();
  const auth = buildAuthPayload();
  let body: string | null = null;
  if (supportsBody.value) {
    if (props.mode === "edit" && form.hasExistingBody && !form.isEditingBody) {
      body = "__SENTINEL_UNCHANGED__";
    } else if (form.body.trim().length > 0) {
      body = form.body.trim();
    }
  }

  if (props.mode === "create") {
    try {
      const created = await createMutation.mutateAsync({
        name: form.name.trim(),
        url: form.url.trim(),
        method: form.method,
        intervalSeconds: Number(form.intervalSeconds),
        timeoutMs: Number(form.timeoutMs),
        assertions,
        auth,
        customHeaders,
        body,
      });

      toast.add({
        title: `[MONITOR DIBUAT: ${created.name}]`,
        description: "Monitor berhasil didaftarkan dan diaktifkan.",
        color: "success",
      });

      emit("saved", created);
      await router.push("/dashboard/monitors");
    } catch (err: unknown) {
      handleSubmissionError(err);
    }
  } else {
    // Mode EDIT
    if (!props.initialData?.id) return;

    try {
      const updated = await updateMutation.mutateAsync({
        id: props.initialData.id,
        body: {
          name: form.name.trim(),
          url: form.url.trim(),
          method: form.method,
          intervalSeconds: Number(form.intervalSeconds),
          timeoutMs: Number(form.timeoutMs),
          assertions,
          auth,
          customHeaders,
          body,
          version: props.initialData.version,
        },
      });

      toast.add({
        title: `[MONITOR DIPERBARUI: ${updated.name}]`,
        description: "Perubahan konfigurasi berhasil disimpan.",
        color: "success",
      });

      emit("saved", updated);
      await router.push("/dashboard/monitors");
    } catch (err: unknown) {
      handleSubmissionError(err);
    }
  }
}

function handleSubmissionError(err: unknown): void {
  const problem = parseProblemDetails(err);
  if (problem.status === 409) {
    conflictError.value =
      problem.detail ||
      "Konflik konkurensi versi (OCC mismatch). Data monitor telah diubah oleh sesi lain. Harap muat ulang data terbaru.";
    return;
  }

  submissionError.value = {
    title: problem.title || "GAGAL MENYIMPAN MONITOR",
    status: problem.status || 400,
    detail: problem.detail || "Terjadi kesalahan saat validasi form.",
    invalidParams: problem.invalidParams,
  };
}

function handleCancel(): void {
  emit("cancel");
  router.push("/dashboard/monitors");
}

function handleReloadAfterConflict(): void {
  window.location.reload();
}
</script>

<template>
  <div class="space-y-6 pb-24">
    <!-- Top Error Alerts -->
    <ProblemAlert
      v-if="submissionError"
      :error="submissionError"
      @dismiss="submissionError = null"
    />

    <!-- OCC Conflict Alert -->
    <div
      v-if="conflictError"
      class="border border-status-down-border bg-status-down-bg text-status-down p-4 font-mono text-xs rounded-none space-y-3"
      role="alert"
    >
      <div class="font-bold uppercase tracking-wider flex items-center gap-2">
        <span>[! OCC CONFLICT MISMATCH: HTTP 409]</span>
      </div>
      <p class="text-text-primary text-[11px] leading-relaxed">
        {{ conflictError }}
      </p>
      <div class="flex items-center gap-2 pt-2 border-t border-status-down-border/40">
        <BracketButton
          label="MUAT ULANG DATA SEKARANG"
          variant="danger"
          size="xs"
          @click="handleReloadAfterConflict"
        />
        <BracketButton
          label="BATAL"
          variant="outline"
          size="xs"
          @click="handleCancel"
        />
      </div>
    </div>

    <!-- Stepped Monospace Tabs -->
    <UTabs
      v-model="activeTab"
      :items="tabItems"
      class="w-full"
      :unmount-on-hide="false"
      :ui="{
        root: 'w-full',
        list: 'border-b border-hairline bg-surface p-0 rounded-none gap-0',
        trigger: 'font-mono text-xs font-semibold py-2.5 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-brand-accent data-[state=active]:text-brand-accent data-[state=active]:bg-canvas-subtle hover:bg-surface-hover text-text-secondary transition-colors cursor-pointer',
        indicator: 'hidden',
        content: 'pt-6 focus:outline-none',
      }"
    >
      <!-- TAB 01: TARGET & SCHEDULE -->
      <template #target>
        <div class="space-y-5 bg-surface border border-hairline p-4 sm:p-6 rounded-none">
          <div class="border-b border-hairline pb-3">
            <h2 class="text-xs font-bold text-text-primary uppercase tracking-wider">
              [01: IDENTITAS TARGET & JADWAL PEMERIKSAAN]
            </h2>
            <p class="text-[11px] text-text-secondary mt-1">
              Tentukan URL tujuan, metode HTTP, frekuensi pengecekan otomatis, dan batas waktu timeout.
            </p>
          </div>

          <!-- Monitor Name -->
          <div>
            <label class="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
              NAMA MONITOR <span class="text-status-down">*</span>
            </label>
            <UInput
              v-model="form.name"
              placeholder="Contoh: Production Auth API Health"
              maxlength="100"
              class="w-full font-mono text-xs"
              :ui="{
                base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline focus:border-brand-accent rounded-none',
              }"
            />
            <div class="flex justify-between text-[10px] text-text-muted mt-1">
              <span>Wajib, representasi nama layanan pada dashboard dan notifikasi.</span>
              <span>{{ form.name.length }} / 100 Karakter</span>
            </div>
          </div>

          <!-- HTTP Method & Target URL Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <!-- Method -->
            <div class="sm:col-span-1">
              <label class="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                METODE HTTP
              </label>
              <USelect
                v-model="form.method"
                :items="methodOptions"
                class="w-full font-mono text-xs"
                :ui="{
                  base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline rounded-none',
                }"
              />
            </div>

            <!-- URL -->
            <div class="sm:col-span-3">
              <label class="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                TARGET URL <span class="text-status-down">*</span>
              </label>
              <UInput
                v-model="form.url"
                placeholder="https://api.example.com/health"
                class="w-full font-mono text-xs"
                :ui="{
                  base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline focus:border-brand-accent rounded-none',
                }"
              />
              <div class="text-[10px] text-text-muted mt-1">
                Protokol wajib <code class="text-brand-accent">http://</code> atau <code class="text-brand-accent">https://</code>. Dilindungi SSRF guard (melarang localhost & RFC 1918).
              </div>
            </div>
          </div>

          <!-- Interval & Timeout Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-hairline">
            <!-- Interval -->
            <div>
              <label class="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                INTERVAL PEMERIKSAAN
              </label>
              <USelect
                v-model="form.intervalSeconds"
                :items="intervalOptions"
                class="w-full font-mono text-xs"
                :ui="{
                  base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline rounded-none',
                }"
              />
              <div class="text-[10px] text-text-muted mt-1">
                Jadwal eksekusi otomatis oleh daemon worker terpisah.
              </div>
            </div>

            <!-- Timeout -->
            <div>
              <label class="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                TIMEOUT REQUEST (MS)
              </label>
              <UInput
                v-model.number="form.timeoutMs"
                type="number"
                min="1000"
                max="30000"
                step="500"
                class="w-full font-mono text-xs"
                :ui="{
                  base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline focus:border-brand-accent rounded-none',
                }"
              />
              <div class="text-[10px] text-text-muted mt-1">
                Batas toleransi latensi target (1.000 ms – 30.000 ms, default 10.000 ms).
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- TAB 02: HEADERS & AUTHENTICATION -->
      <template #headers>
        <div class="space-y-6 bg-surface border border-hairline p-4 sm:p-6 rounded-none">
          <div class="border-b border-hairline pb-3">
            <h2 class="text-xs font-bold text-text-primary uppercase tracking-wider">
              [02: HEADERS, KREDENSIAL ZERO-LEAK & REQUEST BODY]
            </h2>
            <p class="text-[11px] text-text-secondary mt-1">
              Konfigurasi autentikasi target, enkripsi rahasia aman di database, custom header, dan payload request JSON.
            </p>
          </div>

          <!-- Zero-Leak Protocol Notice Banner -->
          <div class="p-3 border border-brand-accent/40 bg-brand-accent/5 text-xs text-text-primary rounded-none flex items-start gap-2.5">
            <span class="text-brand-accent font-bold">&gt;</span>
            <div class="space-y-0.5 text-[11px]">
              <div class="font-bold text-brand-accent uppercase tracking-wider">
                [ZERO-LEAK PROTOCOL: XCHACHA20-POLY1305 ENCRYPTION]
              </div>
              <p class="text-text-secondary leading-relaxed">
                Seluruh token, password, dan header kredensial dienkripsi dengan authenticated data (AAD) sebelum disimpan ke PostgreSQL. Server tidak pernah mengekspos kembali plaintext ke client.
              </p>
            </div>
          </div>

          <!-- Authentication Scheme -->
          <div class="space-y-3">
            <label class="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
              SKEMA AUTENTIKASI TARGET
            </label>
            <USelect
              v-model="form.authType"
              :items="authTypeOptions"
              class="w-full sm:max-w-md font-mono text-xs"
              :ui="{
                base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline rounded-none',
              }"
            />

            <!-- BEARER TOKEN -->
            <div v-if="form.authType === 'BEARER'" class="p-3 border border-hairline bg-canvas-subtle space-y-2 max-w-xl">
              <div class="flex items-center justify-between">
                <label class="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                  BEARER TOKEN
                </label>
                <button
                  v-if="mode === 'edit' && !form.isEditingSecret"
                  type="button"
                  class="text-[10px] text-brand-accent hover:underline font-mono cursor-pointer"
                  @click="form.isEditingSecret = true; form.bearerToken = ''"
                >
                  [UBAH TOKEN RAHASIA]
                </button>
              </div>

              <div class="flex items-center gap-2">
                <UInput
                  v-model="form.bearerToken"
                  :type="mode === 'edit' && !form.isEditingSecret ? 'text' : 'password'"
                  :readonly="mode === 'edit' && !form.isEditingSecret"
                  placeholder="Ketik Bearer token baru..."
                  class="w-full font-mono text-xs"
                  :ui="{
                    base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline focus:border-brand-accent rounded-none',
                  }"
                />
              </div>
              <div class="text-[10px] text-text-muted">
                {{ mode === 'edit' && !form.isEditingSecret ? 'Rahasia tersimpan terenkripsi. Nilai tidak dikirim ulang ke browser.' : 'Token akan disematkan pada header Authorization: Bearer <token>.' }}
              </div>
            </div>

            <!-- BASIC AUTH -->
            <div v-if="form.authType === 'BASIC'" class="p-3 border border-hairline bg-canvas-subtle space-y-3 max-w-xl">
              <div>
                <label class="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
                  BASIC AUTH USERNAME
                </label>
                <UInput
                  v-model="form.basicUsername"
                  placeholder="Username API..."
                  class="w-full font-mono text-xs"
                  :ui="{
                    base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline focus:border-brand-accent rounded-none',
                  }"
                />
              </div>

              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                    BASIC AUTH PASSWORD
                  </label>
                  <button
                    v-if="mode === 'edit' && !form.isEditingSecret"
                    type="button"
                    class="text-[10px] text-brand-accent hover:underline font-mono cursor-pointer"
                    @click="form.isEditingSecret = true; form.basicPassword = ''"
                  >
                    [UBAH PASSWORD RAHASIA]
                  </button>
                </div>
                <UInput
                  v-model="form.basicPassword"
                  :type="mode === 'edit' && !form.isEditingSecret ? 'text' : 'password'"
                  :readonly="mode === 'edit' && !form.isEditingSecret"
                  placeholder="Password API..."
                  class="w-full font-mono text-xs"
                  :ui="{
                    base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline focus:border-brand-accent rounded-none',
                  }"
                />
              </div>
            </div>

            <!-- API KEY -->
            <div v-if="form.authType === 'API_KEY'" class="p-3 border border-hairline bg-canvas-subtle space-y-3 max-w-xl">
              <div>
                <label class="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
                  NAMA HEADER API KEY
                </label>
                <UInput
                  v-model="form.apiKeyHeaderName"
                  placeholder="Contoh: X-API-Key atau X-Consumer-Key"
                  class="w-full font-mono text-xs"
                  :ui="{
                    base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline focus:border-brand-accent rounded-none',
                  }"
                />
              </div>

              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                    NILAI API KEY
                  </label>
                  <button
                    v-if="mode === 'edit' && !form.isEditingSecret"
                    type="button"
                    class="text-[10px] text-brand-accent hover:underline font-mono cursor-pointer"
                    @click="form.isEditingSecret = true; form.apiKeyValue = ''"
                  >
                    [UBAH API KEY RAHASIA]
                  </button>
                </div>
                <UInput
                  v-model="form.apiKeyValue"
                  :type="mode === 'edit' && !form.isEditingSecret ? 'text' : 'password'"
                  :readonly="mode === 'edit' && !form.isEditingSecret"
                  placeholder="Nilai rahasia API Key..."
                  class="w-full font-mono text-xs"
                  :ui="{
                    base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline focus:border-brand-accent rounded-none',
                  }"
                />
              </div>
            </div>

            <!-- CUSTOM AUTH HEADER -->
            <div v-if="form.authType === 'CUSTOM_HEADER'" class="p-3 border border-hairline bg-canvas-subtle space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                  HEADER AUTENTIKASI KHUSUS
                </span>
                <BracketButton
                  label="+ TAMBAH HEADER AUTH"
                  variant="outline"
                  size="xs"
                  @click="addCustomAuthHeaderRow"
                />
              </div>

              <div v-if="form.customAuthHeaders.length === 0" class="text-text-muted text-[11px] italic">
                Belum ada header auth khusus. Klik tombol di atas untuk menambahkan.
              </div>

              <div v-for="(h, idx) in form.customAuthHeaders" :key="h.id" class="flex items-center gap-2">
                <UInput
                  v-model="h.key"
                  placeholder="Nama Header (misal: X-Secret)"
                  class="w-1/2 font-mono text-xs"
                  :ui="{
                    base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline rounded-none',
                  }"
                />
                <UInput
                  v-model="h.value"
                  placeholder="Nilai Kredensial"
                  class="w-1/2 font-mono text-xs"
                  :ui="{
                    base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline rounded-none',
                  }"
                />
                <BracketButton
                  icon="i-lucide-trash-2"
                  variant="danger"
                  size="xs"
                  @click="removeCustomAuthHeaderRow(idx)"
                />
              </div>
            </div>
          </div>

          <!-- Custom Request Headers Builder -->
          <div class="space-y-3 pt-4 border-t border-hairline">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label class="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  CUSTOM REQUEST HEADERS
                </label>
                <div class="text-[10px] text-text-muted mt-0.5">
                  Header tambahan yang disertakan pada setiap probe request (header hop-by-hop dilarang).
                </div>
              </div>
              <BracketButton
                label="+ BARIS HEADER"
                variant="outline"
                size="xs"
                @click="addCustomHeaderRow"
              />
            </div>

            <!-- Forbidden Headers Alert -->
            <div
              v-if="forbiddenHeadersDetected.length > 0"
              class="p-2.5 border border-status-down-border bg-status-down-bg text-status-down text-[11px] font-mono leading-relaxed"
            >
              [! PERINGATAN HOP-BY-HOP]: Header <span class="font-bold underline">{{ forbiddenHeadersDetected.join(", ") }}</span> dilarang oleh RFC HTTP demi integritas koneksi.
            </div>

            <div v-if="form.customHeaders.length === 0" class="p-3 border border-dashed border-hairline text-center text-text-muted text-[11px]">
              Tidak ada custom header. Request akan menggunakan header standar client.
            </div>

            <div v-else class="space-y-2">
              <div
                v-for="(row, idx) in form.customHeaders"
                :key="row.id"
                class="flex items-center gap-2"
              >
                <UInput
                  v-model="row.key"
                  placeholder="Header (e.g. Accept, User-Agent)"
                  class="w-1/2 font-mono text-xs"
                  :ui="{
                    base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline focus:border-brand-accent rounded-none',
                  }"
                />
                <UInput
                  v-model="row.value"
                  placeholder="Value (e.g. application/json)"
                  class="w-1/2 font-mono text-xs"
                  :ui="{
                    base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline focus:border-brand-accent rounded-none',
                  }"
                />
                <BracketButton
                  icon="i-lucide-trash-2"
                  variant="danger"
                  size="xs"
                  @click="removeCustomHeaderRow(idx)"
                />
              </div>
            </div>
          </div>

          <!-- Request Body JSON (only for POST/PUT/PATCH) -->
          <div v-if="supportsBody" class="space-y-2 pt-4 border-t border-hairline">
            <div class="flex items-center justify-between">
              <label class="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
                REQUEST BODY JSON (MAKS 64 KB)
              </label>
              <span class="text-[10px] text-text-muted">
                Metode {{ form.method }}
              </span>
            </div>

            <!-- Existing Secret / Encrypted Body Notice in Edit Mode -->
            <div
              v-if="mode === 'edit' && form.hasExistingBody && !form.isEditingBody"
              class="p-3 border border-hairline bg-canvas-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <div class="text-[11px] font-mono text-text-secondary flex items-center gap-2">
                <span class="text-brand-accent font-bold">&gt;</span>
                <span>[PAYLOAD BODY JSON TERENKRIPSI ZERO-LEAK TERSIMPAN]</span>
              </div>
              <button
                type="button"
                class="text-[11px] text-brand-accent hover:underline font-mono cursor-pointer uppercase self-start sm:self-auto"
                @click="form.isEditingBody = true; form.body = ''"
              >
                [UBAH / TIMPA REQUEST BODY]
              </button>
            </div>

            <div v-else class="space-y-1">
              <div
                v-if="mode === 'edit' && form.hasExistingBody && form.isEditingBody"
                class="flex justify-between items-center text-[10px] text-brand-accent font-mono mb-1"
              >
                <span>[MEMASUKKAN PAYLOAD BODY BARU]</span>
                <button
                  type="button"
                  class="text-text-muted hover:text-text-primary underline cursor-pointer"
                  @click="form.isEditingBody = false; form.body = ''"
                >
                  [BATAL UBAH BODY]
                </button>
              </div>
              <UTextarea
                v-model="form.body"
                placeholder='{\n  "status": "ping",\n  "service": "api-sentinel"\n}'
                :rows="5"
                class="w-full font-mono text-xs"
                :ui="{
                  base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline focus:border-brand-accent rounded-none leading-relaxed',
                }"
              />
            </div>

            <div class="text-[10px] text-text-muted">
              Payload akan dikirim persis dengan encoding UTF-8 dan dienkripsi saat disimpan ke database.
            </div>
          </div>
        </div>
      </template>

      <!-- TAB 03: RESPONSE ASSERTIONS -->
      <template #assertions>
        <div class="space-y-6 bg-surface border border-hairline p-4 sm:p-6 rounded-none">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-hairline pb-3">
            <div>
              <h2 class="text-xs font-bold text-text-primary uppercase tracking-wider">
                [03: RESPONSE ASSERTIONS & VALIDASI KONTRAK]
              </h2>
              <p class="text-[11px] text-text-secondary mt-1">
                Aturan evaluasi validitas respons target. Seluruh aturan harus terpenuhi agar pemeriksaan berstatus UP (Operational).
              </p>
            </div>
            <div class="flex items-center gap-2">
              <UBadge
                :color="isAssertionLimitExceeded ? 'error' : 'neutral'"
                variant="outline"
                size="sm"
                class="font-mono text-[10px]"
              >
                [ATURAN: {{ totalAssertionRulesCount }} / 10 MAKS]
              </UBadge>
            </div>
          </div>

          <!-- Expected HTTP Status (Dedicated Section sesuai D-15) -->
          <div class="p-3 sm:p-4 border border-hairline bg-canvas-subtle space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-brand-accent font-bold">&gt;</span>
                <span class="text-xs font-bold text-text-primary uppercase tracking-wider">
                  HTTP STATUS CODE CHECK (WAJIB)
                </span>
              </div>
              <UBadge color="primary" variant="subtle" size="xs">
                RULE #01
              </UBadge>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="block text-[11px] font-semibold text-text-secondary uppercase mb-1">
                  OPERATOR PERBANDINGAN
                </label>
                <USelect
                  v-model="form.statusOperator"
                  :items="statusOperatorOptions"
                  class="w-full font-mono text-xs"
                  :ui="{
                    base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline rounded-none',
                  }"
                />
              </div>

              <div class="sm:col-span-2">
                <label class="block text-[11px] font-semibold text-text-secondary uppercase mb-1">
                  KODE STATUS YANG DIHARAPKAN
                </label>
                <UInput
                  v-model="form.statusExpected"
                  placeholder="200 atau daftar koma: 200, 201, 204"
                  class="w-full font-mono text-xs"
                  :ui="{
                    base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline focus:border-brand-accent rounded-none',
                  }"
                />
                <div class="text-[10px] text-text-muted mt-1">
                  Masukkan kode tunggal (<code class="text-brand-accent">200</code>) atau daftar kode dipisah koma (<code class="text-brand-accent">200, 204</code>) sesuai D-15.
                </div>
              </div>
            </div>
          </div>

          <!-- Additional Rules Builder -->
          <div class="space-y-4 pt-2">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label class="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  ATURAN VALIDASI TAMBAHAN (HEADER & JSONPATH BODY)
                </label>
                <p class="text-[10px] text-text-muted mt-0.5">
                  Evaluasi parser AST aman murni tanpa fungsi <code class="text-status-down">eval()</code>. Maksimal total 10 aturan.
                </p>
              </div>

              <div class="flex items-center gap-2">
                <BracketButton
                  label="+ ASSERTION HEADER"
                  variant="outline"
                  size="xs"
                  :disabled="totalAssertionRulesCount >= 10"
                  @click="addAssertionRule('header')"
                />
                <BracketButton
                  label="+ ASSERTION JSONPATH"
                  variant="outline"
                  size="xs"
                  :disabled="totalAssertionRulesCount >= 10"
                  @click="addAssertionRule('body-json')"
                />
              </div>
            </div>

            <div v-if="form.additionalRules.length === 0" class="p-4 border border-dashed border-hairline text-center text-text-muted text-xs">
              Belum ada aturan validasi tambahan. Hanya status HTTP yang akan dievaluasi.
            </div>

            <!-- List of Additional Rules -->
            <div v-else class="space-y-3">
              <div
                v-for="(rule, idx) in form.additionalRules"
                :key="rule.id"
                class="p-3 border border-hairline bg-canvas space-y-2.5 rounded-none"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="text-text-muted font-mono text-xs">#{{ idx + 2 }}</span>
                    <UBadge
                      :color="rule.type === 'header' ? 'neutral' : 'primary'"
                      variant="subtle"
                      size="xs"
                    >
                      {{ rule.type === 'header' ? 'RESPONSE HEADER' : 'BODY JSONPATH' }}
                    </UBadge>
                  </div>
                  <BracketButton
                    icon="i-lucide-trash-2"
                    variant="danger"
                    size="xs"
                    @click="removeAssertionRule(idx)"
                  />
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <!-- Target / Property -->
                  <div>
                    <label class="block text-[10px] font-semibold text-text-secondary uppercase mb-1">
                      {{ rule.type === 'header' ? 'NAMA HEADER' : 'EXPRESSION JSONPATH' }}
                    </label>
                    <UInput
                      v-model="rule.target"
                      :placeholder="rule.type === 'header' ? 'content-type' : '$.status atau $.data.id'"
                      maxlength="100"
                      class="w-full font-mono text-xs"
                      :ui="{
                        base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline focus:border-brand-accent rounded-none',
                      }"
                    />
                  </div>

                  <!-- Operator -->
                  <div>
                    <label class="block text-[10px] font-semibold text-text-secondary uppercase mb-1">
                      OPERATOR
                    </label>
                    <USelect
                      v-model="rule.operator"
                      :items="rule.type === 'header' ? headerOperatorOptions : jsonPathOperatorOptions"
                      class="w-full font-mono text-xs"
                      :ui="{
                        base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline rounded-none',
                      }"
                    />
                  </div>

                  <!-- Expected Value -->
                  <div>
                    <label class="block text-[10px] font-semibold text-text-secondary uppercase mb-1">
                      NILAI YANG DIHARAPKAN
                    </label>
                    <UInput
                      v-model="rule.expectedValue"
                      :disabled="rule.operator === 'exists'"
                      :placeholder="rule.operator === 'exists' ? '(Tidak memerlukan nilai)' : 'Nilai harapan...'"
                      class="w-full font-mono text-xs"
                      :ui="{
                        base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline focus:border-brand-accent rounded-none',
                      }"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </UTabs>

    <!-- Sticky Footer Action Bar -->
    <div
      class="fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur border-t border-hairline py-3 px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg"
    >
      <!-- Left: Test Probe Trigger -->
      <div class="flex items-center gap-3 w-full sm:w-auto">
        <BracketButton
          label="> RUN TEST PROBE SEKARANG"
          variant="solid"
          :loading="testProbeMutation.isPending.value"
          :disabled="props.loading || createMutation.isPending.value || updateMutation.isPending.value"
          @click="handleRunProbe"
        />
        <span class="text-[11px] text-text-muted hidden md:inline font-mono">
          Uji coba langsung ke target tanpa menunggu jadwal cron.
        </span>
      </div>

      <!-- Right: Cancel & Save Actions -->
      <div class="flex items-center justify-end gap-3 w-full sm:w-auto">
        <BracketButton
          label="BATAL"
          variant="outline"
          :disabled="createMutation.isPending.value || updateMutation.isPending.value"
          @click="handleCancel"
        />

        <BracketButton
          :label="mode === 'create' ? 'SIMPAN & AKTIFKAN MONITOR' : 'SIMPAN PERUBAHAN'"
          variant="solid"
          :loading="createMutation.isPending.value || updateMutation.isPending.value"
          :disabled="isAssertionLimitExceeded || forbiddenHeadersDetected.length > 0"
          @click="handleSubmit"
        />
      </div>
    </div>

    <!-- Dry-Run Probe Result Modal -->
    <ProbeResultModal
      v-model:open="isProbeModalOpen"
      :result="probeResult"
      :target-name="form.name || 'Dry-run Target'"
      :target-url="form.url"
    />
  </div>
</template>
