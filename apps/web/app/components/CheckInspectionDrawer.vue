<script setup lang="ts">
import { computed } from "vue";
import { useCheckDetailQuery } from "../composables/use-checks.js";

const props = withDefaults(
  defineProps<{
    open: boolean;
    checkId: string | null;
  }>(),
  {
    checkId: null,
  },
);

const emit = defineEmits<(e: "update:open", value: boolean) => void>();

const checkIdRef = computed(() => props.checkId || "");
const { data: detail, isLoading, error } = useCheckDetailQuery(checkIdRef);

const isSuccess = computed<boolean>(() => {
  return detail.value?.status === "UP";
});

const formattedBodySnippet = computed<string>(() => {
  const raw = detail.value?.diagnostics?.responseBodySnippet;
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
});

function handleClose(): void {
  emit("update:open", false);
}
</script>

<template>
  <USlideover
    :open="open"
    title="[INSPEKSI DETAIL PEMERIKSAAN PROBE]"
    description="Audit jejak jaringan, diagnostik latensi, header HTTP tersanitasi, dan evaluasi assertion."
    side="right"
    :ui="{
      content: 'font-mono bg-canvas-subtle border-l border-hairline w-full sm:max-w-[480px] rounded-none shadow-none',
      header: 'border-b border-hairline px-4 py-3 bg-surface text-text-primary',
      body: 'p-4 overflow-y-auto space-y-5 text-xs',
      footer: 'border-t border-hairline px-4 py-3 bg-surface flex justify-end gap-2',
    }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <!-- Loading State -->
      <div v-if="isLoading" class="p-4 space-y-3">
        <div class="text-xs text-text-muted animate-pulse font-mono">
          [MEMUAT DATA DIAGNOSTIK PROBE...]
        </div>
        <SkeletonRows :count="6" />
      </div>

      <!-- Error State -->
      <div
        v-else-if="error"
        class="p-3 border border-status-down-border bg-status-down-bg text-status-down text-xs"
      >
        [GAGAL MEMUAT DETAIL]: {{ error.message || 'Tidak dapat mengambil detail probe.' }}
      </div>

      <!-- Detail Content -->
      <div v-else-if="detail" class="space-y-5">
        <!-- Status Bar -->
        <div class="p-3 border border-hairline bg-surface space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-text-muted uppercase font-semibold">HASIL PEMERIKSAAN</span>
            <span class="text-[10px] text-text-muted">
              <UtcTime :value="detail.executedAt || detail.finishedAt" />
            </span>
          </div>

          <div class="flex items-center gap-2">
            <span
              class="px-2 py-0.5 text-xs font-bold border rounded-none uppercase"
              :class="[
                isSuccess
                  ? 'border-status-operational-border bg-status-operational-bg text-status-operational'
                  : 'border-status-down-border bg-status-down-bg text-status-down',
              ]"
            >
              [{{ isSuccess ? 'PASS: OPERATIONAL' : 'FAIL: GAGAL' }}]
            </span>

            <span
              v-if="detail.statusCode"
              class="px-1.5 py-0.5 text-xs font-mono font-bold border border-hairline bg-canvas text-text-primary"
            >
              HTTP {{ detail.statusCode }}
            </span>

            <span class="text-xs text-brand-accent font-semibold ml-auto">
              {{ detail.latencyMs !== null ? `${detail.latencyMs} ms` : 'N/A' }}
            </span>
          </div>

          <!-- Failure Category Badge -->
          <div v-if="detail.failureCategory" class="pt-2 border-t border-hairline">
            <div class="text-[10px] text-text-muted uppercase font-semibold mb-1">
              KATEGORI KEGAGALAN RESMI
            </div>
            <div class="p-1.5 border border-status-down-border bg-status-down-bg text-status-down text-[11px] font-bold">
              [{{ detail.failureCategory }}]
            </div>
            <div v-if="detail.failureReason" class="text-[11px] text-text-secondary mt-1">
              {{ detail.failureReason }}
            </div>
          </div>
        </div>

        <!-- Network & Timing Grid -->
        <div class="space-y-2">
          <div class="text-[10px] font-bold text-text-muted uppercase tracking-wider">
            [TELEMETRI JARINGAN & SOCKET PINNING]
          </div>
          <div class="grid grid-cols-2 gap-2 text-[11px]">
            <div class="p-2 border border-hairline bg-surface">
              <div class="text-[10px] text-text-muted uppercase">SOCKET PINNED IP</div>
              <div class="font-bold text-text-primary truncate mt-0.5">
                {{ detail.diagnostics?.pinnedIp || 'None (Direct)' }}
              </div>
            </div>

            <div class="p-2 border border-hairline bg-surface">
              <div class="text-[10px] text-text-muted uppercase">TRIGGER TYPE</div>
              <div class="font-bold text-text-primary mt-0.5">
                {{ detail.triggerType }}
              </div>
            </div>

            <div class="p-2 border border-hairline bg-surface">
              <div class="text-[10px] text-text-muted uppercase">DNS DURATION</div>
              <div class="font-semibold text-text-secondary mt-0.5">
                {{ detail.diagnostics?.dnsDurationMs !== null && detail.diagnostics?.dnsDurationMs !== undefined ? `${detail.diagnostics.dnsDurationMs} ms` : '-' }}
              </div>
            </div>

            <div class="p-2 border border-hairline bg-surface">
              <div class="text-[10px] text-text-muted uppercase">CONNECT DURATION</div>
              <div class="font-semibold text-text-secondary mt-0.5">
                {{ detail.diagnostics?.connectDurationMs !== null && detail.diagnostics?.connectDurationMs !== undefined ? `${detail.diagnostics.connectDurationMs} ms` : '-' }}
              </div>
            </div>

            <div class="p-2 border border-hairline bg-surface">
              <div class="text-[10px] text-text-muted uppercase">TLS HANDSHAKE</div>
              <div class="font-semibold text-text-secondary mt-0.5">
                {{ detail.diagnostics?.tlsDurationMs !== null && detail.diagnostics?.tlsDurationMs !== undefined ? `${detail.diagnostics.tlsDurationMs} ms` : '-' }}
              </div>
            </div>

            <div class="p-2 border border-hairline bg-surface">
              <div class="text-[10px] text-text-muted uppercase">TIME TO FIRST BYTE (TTFB)</div>
              <div class="font-semibold text-text-secondary mt-0.5">
                {{ detail.diagnostics?.firstByteDurationMs !== null && detail.diagnostics?.firstByteDurationMs !== undefined ? `${detail.diagnostics.firstByteDurationMs} ms` : '-' }}
              </div>
            </div>
          </div>
        </div>

        <!-- Assertion Evaluation Checklist -->
        <div class="space-y-2">
          <div class="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center justify-between">
            <span>[EVALUASI ASSERTIONS]</span>
            <span class="text-text-secondary">
              {{ (detail.diagnostics?.assertionResults ?? []).filter(r => r.passed).length }} / {{ (detail.diagnostics?.assertionResults ?? []).length }} LULUS
            </span>
          </div>

          <div
            v-if="!detail.diagnostics?.assertionResults || detail.diagnostics.assertionResults.length === 0"
            class="p-2.5 border border-dashed border-hairline text-text-muted text-[11px] text-center"
          >
            Tidak ada assertion rule tambahan yang dievaluasi.
          </div>

          <div v-else class="space-y-1.5">
            <div
              v-for="(rule, idx) in detail.diagnostics.assertionResults"
              :key="idx"
              class="p-2.5 border text-xs"
              :class="[
                rule.passed
                  ? 'border-status-operational-border/60 bg-status-operational-bg/30 text-text-primary'
                  : 'border-status-down-border bg-status-down-bg/60 text-text-primary',
              ]"
            >
              <div class="flex items-center justify-between mb-1">
                <span class="font-bold text-[11px] uppercase">
                  [{{ rule.type }}]: {{ rule.property || '-' }}
                </span>
                <span
                  class="font-bold text-[10px] px-1 py-0.2 border"
                  :class="[
                    rule.passed
                      ? 'border-status-operational-border text-status-operational bg-status-operational-bg'
                      : 'border-status-down-border text-status-down bg-status-down-bg',
                  ]"
                >
                  {{ rule.passed ? '[PASS]' : '[FAIL]' }}
                </span>
              </div>

              <div class="text-[10px] text-text-muted font-mono space-y-0.5">
                <div>Operator: <span class="text-text-secondary">{{ rule.operator }}</span></div>
                <div v-if="rule.expectedValue !== undefined">
                  Expected: <span class="text-brand-accent">{{ String(rule.expectedValue) }}</span>
                </div>
                <div v-if="rule.actualValue !== undefined">
                  Actual: <span :class="rule.passed ? 'text-text-secondary' : 'text-status-down font-bold'">{{ String(rule.actualValue) }}</span>
                </div>
                <div v-if="rule.message" class="text-status-down text-[10px] italic mt-1">
                  {{ rule.message }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- HTTP Request Headers (Sanitized) -->
        <div class="space-y-2">
          <div class="text-[10px] font-bold text-text-muted uppercase tracking-wider">
            [HTTP REQUEST HEADERS (TERLEGALISIR & DISANITASI)]
          </div>
          <div
            v-if="!detail.diagnostics?.requestHeaders || Object.keys(detail.diagnostics.requestHeaders).length === 0"
            class="p-2.5 border border-dashed border-hairline text-text-muted text-[11px] text-center"
          >
            Header default standar probe (tanpa custom headers).
          </div>
          <div v-else class="p-2 border border-hairline bg-surface max-h-40 overflow-y-auto space-y-1 text-[11px]">
            <div
              v-for="(val, key) in detail.diagnostics.requestHeaders"
              :key="key"
              class="flex justify-between items-start gap-2 border-b border-hairline/40 pb-1 last:border-0 last:pb-0"
            >
              <span class="text-text-muted font-mono font-semibold">{{ key }}:</span>
              <span class="text-text-primary font-mono text-right truncate max-w-[240px]">{{ val }}</span>
            </div>
          </div>
        </div>

        <!-- HTTP Response Headers -->
        <div class="space-y-2">
          <div class="text-[10px] font-bold text-text-muted uppercase tracking-wider">
            [HTTP RESPONSE HEADERS]
          </div>
          <div
            v-if="!detail.diagnostics?.responseHeaders || Object.keys(detail.diagnostics.responseHeaders).length === 0"
            class="p-2.5 border border-dashed border-hairline text-text-muted text-[11px] text-center"
          >
            Tidak ada header respons terekam.
          </div>
          <div v-else class="p-2 border border-hairline bg-surface max-h-40 overflow-y-auto space-y-1 text-[11px]">
            <div
              v-for="(val, key) in detail.diagnostics.responseHeaders"
              :key="key"
              class="flex justify-between items-start gap-2 border-b border-hairline/40 pb-1 last:border-0 last:pb-0"
            >
              <span class="text-text-muted font-mono font-semibold">{{ key }}:</span>
              <span class="text-text-primary font-mono text-right truncate max-w-[240px]">{{ val }}</span>
            </div>
          </div>
        </div>

        <!-- Response Body Snippet (max 5 KB) -->
        <div class="space-y-2">
          <div class="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center justify-between">
            <span>[CUPLIKAN RESPONSE BODY (MAKS 5 KB)]</span>
            <span class="text-text-muted text-[10px]">
              {{ detail.diagnostics?.responseBodySnippet ? `${detail.diagnostics.responseBodySnippet.length} B` : '0 B' }}
            </span>
          </div>

          <div
            v-if="!formattedBodySnippet"
            class="p-2.5 border border-dashed border-hairline text-text-muted text-[11px] text-center"
          >
            Tidak ada body respons (atau body diabaikan / kosong).
          </div>
          <pre
            v-else
            class="p-3 border border-hairline bg-canvas text-text-primary font-mono text-[11px] max-h-56 overflow-auto leading-relaxed whitespace-pre-wrap break-all"
          >{{ formattedBodySnippet }}</pre>
        </div>
      </div>
    </template>

    <template #footer>
      <BracketButton
        label="TUTUP"
        variant="outline"
        size="xs"
        @click="handleClose"
      />
    </template>
  </USlideover>
</template>
