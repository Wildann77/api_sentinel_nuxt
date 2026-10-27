<script setup lang="ts">
import { computed, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    targetName: string;
    title?: string;
    description?: string;
    loading?: boolean;
  }>(),
  {
    title: "KONFIRMASI PENGHAPUSAN DESTRUKTIF",
    description:
      "Tindakan ini permanen dan tidak dapat dibatalkan. Seluruh riwayat check dan insiden terkait akan dihapus secara kaskade.",
    loading: false,
  },
);

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "confirm"): void;
  (e: "cancel"): void;
}>();

const typedInput = ref("");

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      typedInput.value = "";
    }
  },
);

const isMatch = computed<boolean>(() => {
  return typedInput.value.trim() === props.targetName.trim();
});

function handleClose(): void {
  emit("update:open", false);
  emit("cancel");
}

function handleConfirm(): void {
  if (!isMatch.value || props.loading) return;
  emit("confirm");
}
</script>

<template>
  <UModal
    :open="open"
    :title="title"
    :description="description"
    :ui="{
      content: 'font-mono bg-surface border border-status-down-border max-w-lg rounded-none',
      header: 'border-b border-hairline px-4 py-3 bg-canvas-subtle',
      body: 'p-4',
      footer: 'border-t border-hairline px-4 py-3 bg-canvas-subtle flex justify-end gap-2',
    }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="space-y-4">
        <div class="p-3 border border-status-down-border/50 bg-status-down-bg text-status-down text-xs rounded-none leading-relaxed">
          <div class="font-bold uppercase tracking-wider mb-1">[PERINGATAN SISTEM]</div>
          <div>{{ description }}</div>
        </div>

        <div>
          <label class="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            Ketik <span class="text-text-primary bg-surface-elevated px-1 py-0.5 border border-hairline font-bold">{{ targetName }}</span> untuk konfirmasi:
          </label>
          <UInput
            v-model="typedInput"
            placeholder="Ketik persis nama target..."
            autofocus
            class="w-full font-mono text-xs"
            :ui="{
              base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline focus:border-status-down rounded-none',
            }"
            @keydown.enter="handleConfirm"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-2 w-full">
        <BracketButton
          label="BATAL"
          variant="outline"
          :disabled="loading"
          @click="handleClose"
        />
        <BracketButton
          label="HAPUS PERMANEN"
          variant="danger"
          :disabled="!isMatch || loading"
          :loading="loading"
          @click="handleConfirm"
        />
      </div>
    </template>
  </UModal>
</template>
