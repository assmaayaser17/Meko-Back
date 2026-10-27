/** All money is integer piasters (1 EGP = 100 piasters). */

export const egp = (pounds: number) => Math.round(pounds * 100);

/** Percentage of an amount, rounded UP to a whole pound so the customer never sees piasters. */
export function percentOfRoundedUp(amount: number, percent: number): number {
  const raw = (amount * percent) / 100;
  return Math.ceil(raw / 100) * 100;
}

/** Shape sent to the frontend: raw piasters plus a display value in pounds. */
export function money(piasters: number) {
  return { piasters, egp: piasters / 100 };
}
