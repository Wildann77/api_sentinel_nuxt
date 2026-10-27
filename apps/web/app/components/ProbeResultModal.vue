<script setup lang="ts">
import type { CheckDetailDto } from "@sentinel/contracts";
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    result: CheckDetailDto | null;
    targetName?: string;
    targetUrl?: string;
  }>(),
  {
    targetName: "Target Endpoint",
    targetUrl: "",
  },
);

const emit = defineEmits<(e: "update:open", value: boolean) => void>();

const isSuccess = computed<boolean>(() => {
  return props.result?.status === "UP";
});

const passCount = computed<number>(() => {
  const list = props.result?.diagnostics?.assertionResults ?? [];
  return list.filter((r) => r.passed).length;
});

const totalAssertions = computed<number>(() => {
  return props.result?.diagnostics?.assertionResults?.length ?? 0;
});

function handleClose(): void {
  emit("update:open", false);
}
</script>

<template>
  <UModal
    :open="open"
    :title="`[DRY-RUN PROBE: ${targetName.toUpperCase()}]`"
    description="Hasil eksekusi langsung probe jaringan ke target tanpa mencatat ke database produksi."
    :ui="{
      content: 'font-mono bg-surface border border-hairline max-w-2xl rounded-none shadow-none',
      header: 'border-b border-hairline px-4 py-3 bg-canvas-subtle',
      body: 'p-4 max-h-[75vh] overflow-y-auto space-y-4',
      footer: 'border-t border-hairline px-4 py-3 bg-canvas-subtle flex justify-end gap-2',
    }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div v-if="result" class="space-y-4">
        <!-- Target Info & Status Bar -->
        <div class="p-3 border border-hairline bg-canvas flex flex-wrap items-center justify-between gap-3 text-xs">
          <div>
            <div class="text-[10px] text-text-muted uppercase font-semibold">TARGET URL</div>
            <div class="text-text-primary font-mono truncate max-w-md font-semibold">
              {{ targetUrl || '-' }}
            </div>
          </div>
          <div class="flex items-center gap-2">
            <StatusBadge :status="result.status" />
            <span
              v-if="result.statusCode"
              class="px-2 py-0.5 border text-xs font-bold"
              :class="result.statusCode >= 200 && result.statusCode < 300
                ? 'border-status-operational-border bg-status-operational-bg text-status-operational'
                : 'border-status-down-border bg-status-down-bg text-status-down'"
            >
              HTTP {{ result.statusCode }}
            </span>
          </div>
        </div>

        <!-- Telemetry Summary Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
          <div class="p-2 border border-hairline bg-canvas-subtle">
            <span class="text-[10px] text-text-secondary uppercase block">LATENCY</span>
            <span class="text-text-primary font-bold text-sm">
              {{ result.latencyMs !== null ? `${result.latencyMs}ms` : 'N/A' }}
            </span>
          </div>
          <div class="p-2 border border-hairline bg-canvas-subtle">
            <span class="text-[10px] text-text-secondary uppercase block">PINNED IP</span>
            <span class="text-text-primary font-semibold truncate block">
              {{ result.diagnostics.pinnedIp || 'None' }}
            </span>
          </div>
          <div class="p-2 border border-hairline bg-canvas-subtle">
            <span class="text-[10px] text-text-secondary uppercase block">ASSERTIONS</span>
            <span
              class="font-bold text-sm"
              :class="passCount === totalAssertions && totalAssertions > 0 ? 'text-status-operational' : (totalAssertions > 0 ? 'text-status-down' : 'text-text-secondary')"
            >
              {{ passCount }}/{{ totalAssertions }} PASS
            </span>
          </div>
          <div class="p-2 border border-hairline bg-canvas-subtle">
            <span class="text-[10px] text-text-secondary uppercase block">TIMING TTFB</span>
            <span class="text-text-primary font-semibold">
              {{ result.diagnostics.firstByteDurationMs !== null ? `${result.diagnostics.firstByteDurationMs}ms` : '-' }}
            </span>
          </div>
        </div>

        <!-- Failure Alert (if any) -->
        <div
          v-if="result.failureReason || result.failureCategory"
          class="p-3 border border-status-down-border bg-status-down-bg text-status-down text-xs rounded-none leading-relaxed"
        >
          <div class="font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <span>[! PROBE FAILED: {{ result.failureCategory }}]</span>
          </div>
          <div class="text-text-primary font-mono text-[11px]">
            {{ result.failureReason || 'Pemeriksaan gagal memenuhi kriteria kontrak.' }}
          </div>
        </div>

        <!-- Assertions Checklist -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs font-semibold text-text-secondary uppercase tracking-wider">
            <span>[EVALUASI ASSERTION RULES]</span>
            <span class="text-[11px] text-text-muted">
              {{ totalAssertions === 0 ? 'Tidak ada assertion rule' : `${passCount} dari ${totalAssertions} rule lolos` }}
            </span>
          </div>

          <div v-if="result.diagnostics.assertionResults.length === 0" class="p-3 border border-dashed border-hairline text-center text-text-muted text-xs">
            Tidak ada assertion rule yang dikonfigurasi untuk monitor ini.
          </div>

          <div v-else class="space-y-1.5">
            <div
              v-for="(rule, idx) in result.diagnostics.assertionResults"
              :key="idx"
              class="p-2.5 border text-xs font-mono flex items-start justify-between gap-3"
              :class="rule.passed ? 'border-status-operational-border/60 bg-status-operational-bg/30' : 'border-status-down-border/60 bg-status-down-bg/30'"
            >
              <div class="space-y-1 flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span
                    class="px-1.5 py-0.2 text-[10px] font-bold border uppercase tracking-wider"
                    :class="rule.passed
                      ? 'border-status-operational-border bg-status-operational text-text-inverse'
                      : 'border-status-down-border bg-status-down text-text-inverse'"
                  >
                    {{ rule.passed ? 'PASS' : 'FAIL' }}
                  </span>
                  <span class="text-text-secondary uppercase font-semibold text-[11px]">
                    [{{ rule.type }}]
                  </span>
                  <span v-if="rule.property" class="text-text-primary font-bold truncate">
                    {{ rule.property }}
                  </span>
                </div>

                <div class="text-[11px] text-text-muted flex items-center gap-2 flex-wrap">
                  <span>Operator: <span class="text-text-primary uppercase font-bold">{{ rule.operator }}</span></span>
                  <span v-if="rule.expectedValue !== undefined">Harapan: <span class="text-text-primary">{{ String(rule.expectedValue) }}</span></span>
                  <span v-if="rule.actualValue !== undefined">Diterima: <span :class="rule.passed ? 'text-status-operational' : 'text-status-down'">{{ String(rule.actualValue) }}</span></span>
                </div>

                <div v-if="rule.message && !rule.passed" class="text-[11px] text-status-down italic">
                  Alasan: {{ rule.message }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Response Headers (Sanitized) -->
        <div v-if="result.diagnostics.responseHeaders && Object.keys(result.diagnostics.responseHeaders).length > 0">
          <div class="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            [RESPONSE HEADERS DITERIMA]
          </div>
          <div class="p-2.5 bg-canvas border border-hairline font-mono text-[11px] max-h-36 overflow-y-auto space-y-1 select-text">
            <div
              v-for="(val, header) in result.diagnostics.responseHeaders"
              :key="header"
              class="flex items-start gap-2"
            >
              <span class="text-text-secondary uppercase font-medium">{{ header }}:</span>
              <span class="text-text-primary font-mono truncate">{{ val }}</span>
            </div>
          </div>
        </div>

        <!-- Response Body Snippet -->
        <div v-if="result.diagnostics.responseBodySnippet">
          <div class="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            [RESPONSE BODY SNIPPET (MAX 5KB)]
          </div>
          <JsonViewer
            :data="result.diagnostics.responseBodySnippet"
            title="SNIPPET RESPON"
            max-height="180px"
          />
        </div>
      </div>

      <div v-else class="text-center py-8 text-text-muted text-xs">
        Data hasil probe tidak tersedia.
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-end w-full">
        <BracketButton
          label="TUTUP"
          variant="outline"
          @click="handleClose"
        />
      </div>
    </template>
  </UModal>
</template>
