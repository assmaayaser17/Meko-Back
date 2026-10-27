import { randomInt } from 'crypto';

// No 0/O, 1/I/L — easy to read and type from a WhatsApp message.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Random, non-sequential order code like MK-7Q4X29 (31^6 ≈ 887M combinations). */
export function generateOrderCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `MK-${s}`;
}

/** Accepts "mk7q4x29", "MK-7Q4X29", " mk 7q4x29 " … and returns the canonical form. */
export function normalizeOrderCode(input: string): string | null {
  const s = (input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = s.startsWith('MK') ? s.slice(2) : s;
  if (!new RegExp(`^[${ALPHABET}]{6}$`).test(body)) return null;
  return `MK-${body}`;
}
