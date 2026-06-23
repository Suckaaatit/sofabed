// Quick deterministic checks for the pricing engine. Run with:
//   node --experimental-strip-types app/pricing/engine.test.ts
// (Node 24 strips TS types natively.) Not a full test framework — just enough
// to prove the three required ZIPs and the fallback behave per spec.

import { resolvePrice, normalizeZip, type Zone } from "./engine.ts";

const zones: Zone[] = [
  { zoneLabel: "DFW Metro", zip3: "750", price: 1499, currency: "USD" },
  { zoneLabel: "New York City", zip3: "100", price: 1699, currency: "USD" },
  { zoneLabel: "Los Angeles", zip3: "902", price: 1799, currency: "USD" },
];
const fallback = { price: 1499, currency: "USD" };

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) {
    console.log("   got :", JSON.stringify(got));
    console.log("   want:", JSON.stringify(want));
    failures++;
  }
}

// Validation
check("normalizeZip valid", normalizeZip("75028"), "75028");
check("normalizeZip trims", normalizeZip(" 75028 "), "75028");
check("normalizeZip too short", normalizeZip("750"), null);
check("normalizeZip non-numeric", normalizeZip("7502a"), null);

// The three required test ZIPs -> three distinct prices (exact ZIP3 match)
check("75028 -> 1499 DFW", pick(resolvePrice("75028", zones, fallback)), {
  price: 1499,
  zone: "DFW Metro",
  served: true,
  match: "exact",
});
check("10001 -> 1699 NYC", pick(resolvePrice("10001", zones, fallback)), {
  price: 1699,
  zone: "New York City",
  served: true,
  match: "exact",
});
check("90210 -> 1799 LA", pick(resolvePrice("90210", zones, fallback)), {
  price: 1799,
  zone: "Los Angeles",
  served: true,
  match: "exact",
});

// Nearest fallback: 75201 (zip3 752) is 2 away from 750 -> DFW, served
check("75201 -> nearest DFW", pick(resolvePrice("75201", zones, fallback)), {
  price: 1499,
  zone: "DFW Metro",
  served: true,
  match: "nearest",
});

// Far-away ZIP with no nearby zone -> default, not served
check("30301 -> default", pick(resolvePrice("30301", zones, fallback)), {
  price: 1499,
  zone: "Default",
  served: false,
  match: "default",
});

function pick(r: ReturnType<typeof resolvePrice>) {
  return { price: r.price, zone: r.zone, served: r.served, match: r.match };
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
