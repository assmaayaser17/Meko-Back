/**
 * Normalizes an Egyptian mobile number to +201XXXXXXXXX.
 * Accepts: 01012345678, 1012345678, +201012345678, 00201012345678, 201012345678,
 * with spaces/dashes, and Arabic-Indic digits (٠١٠...).
 * Returns null when it is not a valid Egyptian mobile number.
 */
export function normalizeEgyptPhone(input: string): string | null {
  if (!input) return null;
  const western = input.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  let digits = western.replace(/[^\d]/g, '');
  if (digits.startsWith('0020')) digits = digits.slice(4);
  else if (digits.startsWith('20') && digits.length === 12) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith('1')) digits = '0' + digits;
  if (!/^01[0125]\d{8}$/.test(digits)) return null;
  return '+2' + digits;
}

/** Digits only, international format, as used by wa.me links. */
export const phoneForWhatsapp = (normalized: string) => normalized.replace(/[^\d]/g, '');
