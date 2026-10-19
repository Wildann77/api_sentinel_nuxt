/**
 * Sanitasi Nilai Kolom Ekspor CSV (Anti-Formula Injection & RFC 4180 Quoting)
 * Sesuai spesifikasi ARCH §5.4.
 *
 * 1. Netralisasi formula injection: jika kolom teks diawali [=+\-@\t\r], tambahkan prefix single quote (').
 * 2. Kolom angka (isNumericColumn = true) tidak diberi prefix kutip tunggal.
 * 3. Quoting RFC 4180: jika string mengandung koma, kutip dua, newline, atau CR,
 *    seluruh string dibungkus kutip dua dan karakter kutip dua di-escape ganda ("").
 */
export function sanitizeCsvValue(value: unknown, isNumericColumn = false): string {
  if (value === null || value === undefined) {
    return "";
  }

  let str = String(value);

  // Jika kolom teks dan diawali karakter formula spreadsheet
  if (!isNumericColumn && /^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`; // Netralisasi dengan prefix single quote
  }

  // Quoting jika mengandung koma, kutip dua, newline, atau carriage return
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export const CsvSanitizer = {
  sanitize: sanitizeCsvValue,
} as const;
export type CsvSanitizer = typeof CsvSanitizer;
