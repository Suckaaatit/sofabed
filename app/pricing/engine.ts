// Pure pricing logic — no Prisma, no Shopify, no I/O. Deterministic and unit
// testable. The server layer (rules.server.ts) loads zones from the database
// and hands them to `resolvePrice`.
//
// Design note (P1.1): we key zones by ZIP3 (first three digits of the ZIP) so
// that *any* ZIP resolves to a sensible price — not just the three test ZIPs.
// Unknown ZIPs fall back to the nearest zone (by ZIP3 numeric distance) and,
// failing that, to the shop's default price. We never throw on a bad lookup.

export interface Zone {
  zoneLabel: string;
  zip3: string;
  price: number; // minor units (cents)
  currency: string;
}

export interface Fallback {
  price: number; // minor units (cents)
  currency: string;
}

export type MatchKind = "exact" | "nearest" | "default";

export interface PriceResult {
  price: number; // minor units (cents)
  currency: string;
  zone: string; // human label of the zone used (or "Default")
  zip3: string;
  served: boolean; // true if we have a zone (exact/nearest) for this ZIP
  match: MatchKind;
}

// How close (in ZIP3 numeric distance) a zone must be to count as "nearby".
// 750 vs 752 -> distance 2 (still DFW-ish); 750 vs 900 -> distance 150 (not).
// Tunable; kept conservative so "we don't ship there yet" stays meaningful.
export const NEAREST_THRESHOLD = 25;

const ZIP_RE = /^\d{5}$/;

/** Returns the 5-digit ZIP if valid, else null. Trims surrounding space. */
export function normalizeZip(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const zip = String(raw).trim();
  return ZIP_RE.test(zip) ? zip : null;
}

/** First three digits of a validated 5-digit ZIP. */
export function zip3Of(zip: string): string {
  return zip.slice(0, 3);
}

/**
 * Resolve a price for a ZIP given the shop's zones and default.
 *
 * Order: exact ZIP3 match -> nearest zone within NEAREST_THRESHOLD -> default.
 * `served` is true only for exact/nearest matches; a default match means we
 * have no zone for this area ("we don't ship there yet"), but we still return
 * the default price so the storefront can show *something* if it chooses.
 */
export function resolvePrice(
  zip: string,
  zones: Zone[],
  fallback: Fallback,
): PriceResult {
  const zip3 = zip3Of(zip);

  // 1. Exact ZIP3 match.
  const exact = zones.find((z) => z.zip3 === zip3);
  if (exact) {
    return {
      price: exact.price,
      currency: exact.currency,
      zone: exact.zoneLabel,
      zip3,
      served: true,
      match: "exact",
    };
  }

  // 2. Nearest zone by ZIP3 numeric distance, if within threshold.
  if (zones.length > 0) {
    const target = Number(zip3);
    let best: Zone | null = null;
    let bestDist = Infinity;
    for (const z of zones) {
      const dist = Math.abs(Number(z.zip3) - target);
      if (dist < bestDist) {
        bestDist = dist;
        best = z;
      }
    }
    if (best && bestDist <= NEAREST_THRESHOLD) {
      return {
        price: best.price,
        currency: best.currency,
        zone: best.zoneLabel,
        zip3,
        served: true,
        match: "nearest",
      };
    }
  }

  // 3. Default — we don't have a zone for this area.
  return {
    price: fallback.price,
    currency: fallback.currency,
    zone: "Default",
    zip3,
    served: false,
    match: "default",
  };
}

/** Format minor units (cents) as a localized currency string for display. */
export function formatPrice(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}
