import type { Balance, Bucket } from "@/lib/leave-balance";

/**
 * Weergave van het verlofsaldo (alleen wat getoond wordt; de berekening staat in leave-balance.ts).
 *
 * Per tegoed van jaar Y:
 * - over op 31 december Y = tegoed − wat in Y is opgenomen of ingepland;
 * - is dat ≤ 0, dan is het tegoed op in Y: geen verwachting op 30 juni en geen "vervalt";
 * - is het > 0, dan "gebruikt in Y+1": wat er van dit tegoed in 1 januari t/m 30 juni Y+1 wordt opgenomen
 *   of is ingepland, en pas daarna wat er na 30 juni vervalt (alleen als dat > 0 is).
 */

export type BucketView = {
  bucket: Bucket;
  total: number;
  /** In het jaar zelf. */
  inYear: { taken: number; planned: number };
  /** Over op 31 december van het eigen jaar; null als het jaar nog moet beginnen. */
  endOfYear: number | null;
  /** Tegoed is in het eigen jaar al op (of negatief). */
  usedUp: boolean;
  /** Gebruikt in het jaar erna (t/m 30 juni), alleen als er op 31 december nog iets over was. */
  nextYear: { year: number; taken: number; planned: number; of: number } | null;
  /** Verwacht te vervallen na 30 juni (of al vervallen bij een verlopen tegoed); 0 = niets. */
  expires: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function bucketView(b: Bucket): BucketView {
  const total = r2(b.hours + (b.adjustment ?? 0));
  const usage = (year: number) => b.usage.find((u) => u.year === year) ?? { year, taken: 0, planned: 0 };
  const own = usage(b.year);
  const next = usage(b.year + 1);
  const endOfYear = b.future ? null : r2(total - own.taken - own.planned);
  const usedUp = endOfYear !== null && endOfYear <= 0;
  const nextYear = endOfYear !== null && endOfYear > 0 ? { year: b.year + 1, taken: next.taken, planned: next.planned, of: endOfYear } : null;
  const expires = usedUp || b.future ? 0 : b.expired ? r2(Math.max(0, b.lost)) : r2(Math.max(0, b.forecastRemaining));
  return { bucket: b, total, inYear: { taken: own.taken, planned: own.planned }, endOfYear, usedUp, nextYear, expires };
}

export type BalanceView = {
  year: number;
  /** Verwacht over op 31 december van dit jaar (alle tegoeden samen, zoals berekend). */
  yearEnd: number;
  /** Het tegoed van dit jaar is eind dit jaar op (of er is geen tegoed voor dit jaar en het saldo is ≤ 0). */
  usedUpThisYear: boolean;
  /** Tegoed van dit jaar dat in het volgende jaar wordt gebruikt (alleen als er eind dit jaar iets over is). */
  nextYear: BucketView["nextYear"];
  /** Wat er bij de eerstvolgende vervaldatum naar verwachting vervalt (alleen > 0). */
  expires: { hours: number; dateISO: string } | null;
  /** Tegoed van volgend jaar, als dat er al is (geldt vanaf 1 januari). */
  nextBucket: { year: number; total: number } | null;
  buckets: BucketView[];
};

export function balanceView(balance: Balance, todayISO: string): BalanceView {
  const year = Number(todayISO.slice(0, 4));
  const buckets = balance.buckets.map(bucketView);
  const current = buckets.find((v) => v.bucket.year === year);
  const nextB = buckets.find((v) => v.bucket.year === year + 1);
  const expiringHours = balance.expiring?.forecastHours ?? 0;
  return {
    year,
    yearEnd: balance.forecastYearEnd,
    usedUpThisYear: current ? current.usedUp : balance.forecastYearEnd <= 0,
    nextYear: current?.nextYear ?? null,
    expires: balance.expiring && expiringHours > 0 ? { hours: expiringHours, dateISO: balance.expiring.dateISO } : null,
    nextBucket: nextB ? { year: nextB.bucket.year, total: nextB.total } : null,
    buckets,
  };
}
