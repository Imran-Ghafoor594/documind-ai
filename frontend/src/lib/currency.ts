import type { CurrencySummary } from "../api";

/** Which currency to show first: the one the user picked, else their default, else the one with the most records. */
export function pickCurrency(list: CurrencySummary[], picked: string | null, preferred: string): CurrencySummary | undefined {
  return list.find((c) => c.currency === picked) ?? list.find((c) => c.currency === preferred)
    ?? [...list].sort((a, b) => b.count - a.count)[0];
}
