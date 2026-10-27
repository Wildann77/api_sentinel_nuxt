<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useMonitorsQuery } from "../../../composables/use-monitors.js";
import {
  useChangePasswordMutation,
  useTelegramSettingsQuery,
  useTestTelegramPingMutation,
  useUpdateTelegramSettingsMutation,
} from "../../../composables/use-settings.js";

definePageMeta({
  layout: "default",
});

const toast = useToast();

// 1. Telegram Integration Section
const {
  data: telegramSettings,
  isLoading: isTelegramLoading,
  refetch: refetchTelegram,
} = useTelegramSettingsQuery();

const updateTelegramMutation = useUpdateTelegramSettingsMutation();
const testPingMutation = useTestTelegramPingMutation();

const telegramForm = reactive({
  botToken: "",
  chatId: "",
});

const showBotToken = ref(false);

watch(
  telegramSettings,
  (settings) => {
    if (settings?.chatId) {
      telegramForm.chatId = settings.chatId;
    }
  },
  { immediate: true },
);

const isTelegramConfigured = computed(() => Boolean(telegramSettings.value?.configured));

async function handleTestPing(): Promise<void> {
  const payload: { botToken?: string; chatId?: string } = {};
  if (telegramForm.botToken.trim()) {
    payload.botToken = telegramForm.botToken.trim();
  }
  if (telegramForm.chatId.trim()) {
    payload.chatId = telegramForm.chatId.trim();
  }

  try {
    const res = await testPingMutation.mutateAsync(payload);
    toast.add({
      title: "[TEST PING BERHASIL]",
      description: res.message || "Pesan uji coba terkirim ke Telegram.",
      color: "success",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal mengirim pesan uji coba.";
    toast.add({
      title: "[TEST PING GAGAL]",
      description: message,
      color: "error",
    });
  }
}

async function handleSaveTelegram(): Promise<void> {
  if (!telegramForm.botToken.trim()) {
    toast.add({
      title: "[VALIDASI GAGAL]",
      description: "Bot token Telegram wajib diisi.",
      color: "error",
    });
    return;
  }
  if (!telegramForm.chatId.trim()) {
    toast.add({
      title: "[VALIDASI GAGAL]",
      description: "Chat ID Telegram wajib diisi.",
      color: "error",
    });
    return;
  }

  try {
    await updateTelegramMutation.mutateAsync({
      botToken: telegramForm.botToken.trim(),
      chatId: telegramForm.chatId.trim(),
    });
    telegramForm.botToken = "";
    await refetchTelegram();
    toast.add({
      title: "[KONFIGURASI DISIMPAN]",
      description: "Pengaturan Telegram tersimpan aman di Secret Vault (AES/Libsodium AEAD).",
      color: "success",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal menyimpan konfigurasi Telegram.";
    toast.add({
      title: "[SIMPAN GAGAL]",
      description: message,
      color: "error",
    });
  }
}

// 2. Owner Password Section
const changePasswordMutation = useChangePasswordMutation();

const passwordForm = reactive({
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
});

const showCurrentPassword = ref(false);
const showNewPassword = ref(false);

async function handleChangePassword(): Promise<void> {
  if (!passwordForm.currentPassword) {
    toast.add({
      title: "[VALIDASI GAGAL]",
      description: "Password saat ini wajib diisi.",
      color: "error",
    });
    return;
  }
  if (passwordForm.newPassword.length < 8) {
    toast.add({
      title: "[VALIDASI GAGAL]",
      description: "Password baru minimal 8 karakter.",
      color: "error",
    });
    return;
  }
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    toast.add({
      title: "[VALIDASI GAGAL]",
      description: "Konfirmasi password baru tidak cocok.",
      color: "error",
    });
    return;
  }

  try {
    await changePasswordMutation.mutateAsync({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
    passwordForm.currentPassword = "";
    passwordForm.newPassword = "";
    passwordForm.confirmPassword = "";
    toast.add({
      title: "[PASSWORD DIPERBARUI]",
      description: "Kredensial pemilik aplikasi berhasil diperbarui menggunakan Argon2id.",
      color: "success",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal memperbarui password.";
    toast.add({
      title: "[GAGAL UBAH PASSWORD]",
      description: message,
      color: "error",
    });
  }
}

// 3. CSV Report Export Section
const { data: monitorsPage } = useMonitorsQuery({ limit: 100 });
const monitorsList = computed(() => monitorsPage.value?.data ?? []);

const exportMonitorOptions = computed(() => {
  const options = [{ label: "[SEMUA MONITOR]", value: "ALL" }];
  for (const m of monitorsList.value) {
    options.push({
      label: `[${m.name}]`,
      value: m.id,
    });
  }
  return options;
});

const exportPresetOptions = [
  { label: "[RENTANG: 24 JAM TERAKHIR]", value: "24H" },
  { label: "[RENTANG: 7 HARI TERAKHIR]", value: "7D" },
  { label: "[RENTANG: 30 HARI TERAKHIR]", value: "30D" },
  { label: "[RENTANG: KUSTOM]", value: "CUSTOM" },
];

const selectedExportMonitor = ref<string>("ALL");
const selectedExportRange = ref<string>("24H");
const customFrom = ref<string>("");
const customTo = ref<string>("");

function resolveExportRange(): { from: string; to: string } {
  const end = new Date();
  if (selectedExportRange.value === "24H") {
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  if (selectedExportRange.value === "7D") {
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  if (selectedExportRange.value === "30D") {
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  const start = customFrom.value
    ? new Date(customFrom.value)
    : new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const finish = customTo.value ? new Date(customTo.value) : end;
  return { from: start.toISOString(), to: finish.toISOString() };
}

function handleDownloadCsv(type: "checks" | "incidents"): void {
  const { from, to } = resolveExportRange();
  const params = new URLSearchParams({
    type,
    from,
    to,
  });
  if (selectedExportMonitor.value && selectedExportMonitor.value !== "ALL") {
    params.set("monitorId", selectedExportMonitor.value);
  }

  const downloadUrl = `/api/reports/export.csv?${params.toString()}`;
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.setAttribute("download", `report-${type}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  toast.add({
    title: "[EKSPOR DIMULAI]",
    description: `Mengunduh stream CSV ${type === "checks" ? "riwayat pemeriksaan" : "riwayat insiden"}...`,
    color: "success",
  });
}
</script>

<template>
  <div class="space-y-6 font-mono">
    <!-- Header Section -->
    <div class="border-b border-hairline pb-4">
      <div class="flex items-center gap-2">
        <span class="text-brand-accent font-bold">&gt;</span>
        <h1 class="text-sm sm:text-base font-bold tracking-wider text-text-primary uppercase">
          [04: SYSTEM SETTINGS & INTEGRATIONS]
        </h1>
      </div>
      <p class="text-xs text-text-secondary mt-1">
        Konfigurasi integrasi notifikasi Telegram, manajemen kredensial pemilik, dan ekspor laporan telemetri CSV.
      </p>
    </div>

    <!-- 1. Telegram Notification Integration Section -->
    <section class="border border-hairline bg-surface p-4 sm:p-5 space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-hairline pb-3">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-brand-accent font-bold">#</span>
            <h2 class="text-xs sm:text-sm font-bold text-text-primary uppercase tracking-wider">
              INTEGRASI NOTIFIKASI TELEGRAM
            </h2>
          </div>
          <p class="text-[11px] text-text-muted mt-0.5">
            Menerima peringatan saat insiden terbuka dan tertutup langsung ke chat bot Telegram.
          </p>
        </div>

        <div class="flex items-center gap-2 self-start sm:self-auto">
          <span
            class="text-[10px] font-bold px-2 py-0.5 rounded-xs border uppercase select-none"
            :class="[
              isTelegramConfigured
                ? 'text-status-operational bg-status-operational-bg border-status-operational-border'
                : 'text-text-muted bg-canvas border-hairline',
            ]"
          >
            [{{ isTelegramConfigured ? 'TERHUBUNG' : 'BELUM DIHUBUNGKAN' }}]
          </span>
          <span v-if="telegramSettings?.updatedAt" class="text-[10px] text-text-muted">
            Update: <UtcTime :value="telegramSettings.updatedAt" />
          </span>
        </div>
      </div>

      <!-- Zero-Spam Policy Notice (DES §5.7 & PRD §4.15) -->
      <div class="p-3 border border-brand-accent-dim bg-brand-accent-dim/20 text-xs space-y-1 rounded-xs">
        <div class="flex items-center gap-1.5 text-brand-accent font-bold text-[11px]">
          <span class="i-lucide-shield-alert" aria-hidden="true" />
          <span>KEBIJAKAN ZERO-SPAM</span>
        </div>
        <p class="text-[11px] text-text-secondary leading-relaxed">
          Bot hanya mengirim pesan ketika insiden dibuka (setelah 3x kegagalan beruntun) dan ketika insiden tertutup (setelah 2x sukses beruntun). Kegagalan berulang selama insiden aktif tidak akan menimbulkan spam notifikasi.
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
        <!-- Bot Token Input -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <label class="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
              TELEGRAM BOT TOKEN <span class="text-status-down">*</span>
            </label>
            <button
              type="button"
              class="text-[10px] text-text-muted hover:text-text-primary cursor-pointer select-none"
              @click="showBotToken = !showBotToken"
            >
              [{{ showBotToken ? 'SEMBUNYIKAN' : 'TAMPILKAN' }}]
            </button>
          </div>

          <UInput
            v-model="telegramForm.botToken"
            :type="showBotToken ? 'text' : 'password'"
            :placeholder="isTelegramConfigured ? '•••••••••••••••••••••••••••••• (TERKONFIGURASI)' : 'Contoh: 123456789:AA...'"
            class="w-full font-mono text-xs"
            :ui="{
              base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline focus:border-brand-accent rounded-none',
            }"
          />
          <p class="text-[10px] text-text-muted">
            Token disimpan dengan enkripsi Libsodium AEAD (XChaCha20-Poly1305) dan tidak pernah dibocorkan ke log/client.
          </p>
        </div>

        <!-- Chat ID Input -->
        <div class="space-y-1.5">
          <label class="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
            TARGET CHAT ID <span class="text-status-down">*</span>
          </label>
          <UInput
            v-model="telegramForm.chatId"
            placeholder="Contoh: -1001234567890 atau ID pribadi"
            class="w-full font-mono text-xs"
            :ui="{
              base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline focus:border-brand-accent rounded-none',
            }"
          />
          <p class="text-[10px] text-text-muted">
            ID tujuan bot (channel, grup, atau chat perorangan). Awali dengan tanda minus (-) untuk supergroup/channel.
          </p>
        </div>
      </div>

      <!-- Telegram Action Buttons -->
      <div class="flex flex-wrap items-center gap-3 pt-2 border-t border-hairline justify-end">
        <BracketButton
          label="TEST PING BOT"
          icon="i-lucide-send"
          variant="outline"
          size="sm"
          :loading="testPingMutation.isPending.value"
          @click="handleTestPing"
        />
        <BracketButton
          label="SIMPAN KONFIGURASI TELEGRAM"
          icon="i-lucide-save"
          variant="solid"
          size="sm"
          :loading="updateTelegramMutation.isPending.value"
          @click="handleSaveTelegram"
        />
      </div>
    </section>

    <!-- 2. Owner Account Credentials Section (DES §5.7 & US 26) -->
    <section class="border border-hairline bg-surface p-4 sm:p-5 space-y-4">
      <div class="border-b border-hairline pb-3">
        <div class="flex items-center gap-2">
          <span class="text-brand-accent font-bold">#</span>
          <h2 class="text-xs sm:text-sm font-bold text-text-primary uppercase tracking-wider">
            KREDENSIAL AKUN PEMILIK
          </h2>
        </div>
        <p class="text-[11px] text-text-muted mt-0.5">
          Perbarui kata sandi akun administrator sentinel. Di-hash menggunakan Argon2id berkeamanan tinggi.
        </p>
      </div>

      <form class="space-y-4" @submit.prevent="handleChangePassword">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- Current Password -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <label class="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
                PASSWORD SAAT INI <span class="text-status-down">*</span>
              </label>
              <button
                type="button"
                class="text-[10px] text-text-muted hover:text-text-primary cursor-pointer select-none"
                @click="showCurrentPassword = !showCurrentPassword"
              >
                [{{ showCurrentPassword ? 'SEMBUNYIKAN' : 'TAMPILKAN' }}]
              </button>
            </div>
            <UInput
              v-model="passwordForm.currentPassword"
              :type="showCurrentPassword ? 'text' : 'password'"
              placeholder="Masukkan password lama..."
              class="w-full font-mono text-xs"
              :ui="{
                base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline focus:border-brand-accent rounded-none',
              }"
            />
          </div>

          <!-- New Password -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <label class="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
                PASSWORD BARU <span class="text-status-down">*</span>
              </label>
              <button
                type="button"
                class="text-[10px] text-text-muted hover:text-text-primary cursor-pointer select-none"
                @click="showNewPassword = !showNewPassword"
              >
                [{{ showNewPassword ? 'SEMBUNYIKAN' : 'TAMPILKAN' }}]
              </button>
            </div>
            <UInput
              v-model="passwordForm.newPassword"
              :type="showNewPassword ? 'text' : 'password'"
              placeholder="Minimal 8 karakter..."
              class="w-full font-mono text-xs"
              :ui="{
                base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline focus:border-brand-accent rounded-none',
              }"
            />
          </div>

          <!-- Confirm New Password -->
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
              KONFIRMASI PASSWORD BARU <span class="text-status-down">*</span>
            </label>
            <UInput
              v-model="passwordForm.confirmPassword"
              type="password"
              placeholder="Ulangi password baru..."
              class="w-full font-mono text-xs"
              :ui="{
                base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline focus:border-brand-accent rounded-none',
              }"
            />
          </div>
        </div>

        <div class="flex items-center justify-between pt-2 border-t border-hairline">
          <p class="text-[10px] text-text-muted">
            Verifikasi password lama wajib dilakukan untuk mencegah pengambilalihan akun tanpa izin.
          </p>
          <BracketButton
            type="submit"
            label="UBAH PASSWORD PEMILIK"
            icon="i-lucide-key-round"
            variant="solid"
            size="sm"
            :loading="changePasswordMutation.isPending.value"
          />
        </div>
      </form>
    </section>

    <!-- 3. Telemetry CSV Export Section (DES §5.7, US 30, ARCH §5.4 & §9.3) -->
    <section class="border border-hairline bg-surface p-4 sm:p-5 space-y-4">
      <div class="border-b border-hairline pb-3">
        <div class="flex items-center gap-2">
          <span class="text-brand-accent font-bold">#</span>
          <h2 class="text-xs sm:text-sm font-bold text-text-primary uppercase tracking-wider">
            EKSPOR DATA TELEMETRI & LAPORAN CSV
          </h2>
        </div>
        <p class="text-[11px] text-text-muted mt-0.5">
          Unduh riwayat audit pemeriksaan probe dan rekapitulasi insiden gangguan dalam format CSV standar RFC 4180.
        </p>
      </div>

      <!-- Formula Injection Sanitization Guard Notice -->
      <div class="p-3 border border-hairline bg-canvas text-xs space-y-1 rounded-xs">
        <div class="flex items-center gap-1.5 text-text-secondary font-bold text-[11px]">
          <span class="i-lucide-file-spreadsheet" aria-hidden="true" />
          <span>KEAMANAN EKSPOR: SANITASI FORMULA INJECTION & STREAMING CURSOR</span>
        </div>
        <p class="text-[10px] text-text-muted leading-relaxed">
          Semua sel CSV yang diawali karakter =, +, -, atau @ otomatis disanitasi dengan kutip tunggal (') untuk mencegah eksekusi formula jahat pada Microsoft Excel / Google Sheets. Data dialirkan via chunked response Nitro untuk mencegah pemborosan memori.
        </p>
      </div>

      <!-- Filter Controls for Export -->
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
        <!-- Monitor Filter -->
        <div class="space-y-1.5">
          <label class="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
            FILTER MONITOR
          </label>
          <USelect
            v-model="selectedExportMonitor"
            :items="exportMonitorOptions"
            class="w-full font-mono text-xs"
            :ui="{
              base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline rounded-none',
            }"
          />
        </div>

        <!-- Range Filter -->
        <div class="space-y-1.5">
          <label class="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
            RENTANG WAKTU
          </label>
          <USelect
            v-model="selectedExportRange"
            :items="exportPresetOptions"
            class="w-full font-mono text-xs"
            :ui="{
              base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline rounded-none',
            }"
          />
        </div>

        <!-- Custom From (if custom range selected) -->
        <div v-if="selectedExportRange === 'CUSTOM'" class="space-y-1.5">
          <label class="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
            DARI (TANGGAL MULAI)
          </label>
          <UInput
            v-model="customFrom"
            type="datetime-local"
            class="w-full font-mono text-xs"
            :ui="{
              base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline rounded-none',
            }"
          />
        </div>

        <!-- Custom To (if custom range selected) -->
        <div v-if="selectedExportRange === 'CUSTOM'" class="space-y-1.5">
          <label class="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
            SAMPAI (TANGGAL SELESAI)
          </label>
          <UInput
            v-model="customTo"
            type="datetime-local"
            class="w-full font-mono text-xs"
            :ui="{
              base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline rounded-none',
            }"
          />
        </div>
      </div>

      <!-- Export Buttons -->
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-3 border-t border-hairline">
        <BracketButton
          label="DOWNLOAD CSV RIWAYAT PEMERIKSAAN"
          icon="i-lucide-download"
          variant="outline"
          size="sm"
          @click="handleDownloadCsv('checks')"
        />
        <BracketButton
          label="DOWNLOAD CSV RIWAYAT INSIDEN"
          icon="i-lucide-download"
          variant="solid"
          size="sm"
          @click="handleDownloadCsv('incidents')"
        />
      </div>
    </section>
  </div>
</template>
