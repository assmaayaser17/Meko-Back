/**
 * WhatsApp "click to chat" links (phase 1 — no WhatsApp Business API needed).
 * The order code is pre-filled so the team knows who is talking without asking.
 */
export function whatsappLink(brandNumber: string, text: string) {
  const digits = brandNumber.replace(/[^\d]/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export const customerToBrandMessage = (orderCode: string) =>
  `أهلاً MEKO، عايزة أتكلم معاكم بخصوص تصميم طلبي رقم ${orderCode}`;
