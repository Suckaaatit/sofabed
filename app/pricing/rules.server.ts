// Prisma reads/writes for pricing rules + the per-shop default price.
// Server-only (".server" suffix keeps it out of the client bundle).

import prisma from "../db.server";
import type { Zone, Fallback } from "./engine";

// Used when a shop has not configured a default yet. Matches the P0 spec's
// implicit base price; merchants override it from the admin UI.
const HARD_DEFAULT: Fallback = { price: 1499, currency: "USD" };

/** All pricing zones for a shop, shaped for the engine. */
export async function getZones(shop: string): Promise<Zone[]> {
  const rules = await prisma.pricingRule.findMany({
    where: { shop },
    orderBy: { zip3: "asc" },
  });
  return rules.map((r) => ({
    zoneLabel: r.zoneLabel,
    zip3: r.zip3,
    price: r.price,
    currency: r.currency,
  }));
}

/** Full rule rows (with ids/timestamps) for the admin CRUD table. */
export async function listRules(shop: string) {
  return prisma.pricingRule.findMany({
    where: { shop },
    orderBy: { zip3: "asc" },
  });
}

/** The shop's default/fallback price, or the hard default if unset. */
export async function getDefault(shop: string): Promise<Fallback> {
  const row = await prisma.pricingDefault.findUnique({ where: { shop } });
  return row
    ? { price: row.price, currency: row.currency }
    : { ...HARD_DEFAULT };
}

export async function upsertDefault(
  shop: string,
  price: number,
  currency = "USD",
) {
  return prisma.pricingDefault.upsert({
    where: { shop },
    create: { shop, price, currency },
    update: { price, currency },
  });
}

export async function createRule(input: {
  shop: string;
  zoneLabel: string;
  zip3: string;
  price: number;
  currency?: string;
}) {
  return prisma.pricingRule.create({
    data: {
      shop: input.shop,
      zoneLabel: input.zoneLabel,
      zip3: input.zip3,
      price: input.price,
      currency: input.currency ?? "USD",
    },
  });
}

export async function updateRule(input: {
  id: string;
  shop: string;
  zoneLabel: string;
  zip3: string;
  price: number;
  currency?: string;
}) {
  // Scope the update by shop so one shop can't edit another's rule.
  return prisma.pricingRule.updateMany({
    where: { id: input.id, shop: input.shop },
    data: {
      zoneLabel: input.zoneLabel,
      zip3: input.zip3,
      price: input.price,
      currency: input.currency ?? "USD",
    },
  });
}

export async function deleteRule(shop: string, id: string) {
  return prisma.pricingRule.deleteMany({ where: { id, shop } });
}

// Sample data for the demo. Mirrors prisma/seed.js. The three required test
// ZIPs plus extra zones so the ZIP3 "nearest" fallback is visibly working.
const SAMPLE_ZONES = [
  { zoneLabel: "DFW Metro", zip3: "750", price: 1499 }, // 75028
  { zoneLabel: "New York City", zip3: "100", price: 1699 }, // 10001
  { zoneLabel: "Los Angeles", zip3: "902", price: 1799 }, // 90210
  { zoneLabel: "Chicago", zip3: "606", price: 1599 },
  { zoneLabel: "Houston", zip3: "770", price: 1549 },
  { zoneLabel: "Miami", zip3: "331", price: 1649 },
  { zoneLabel: "Seattle", zip3: "981", price: 1749 },
];

/** Seed the three test ZIPs + extras + default for the current shop. */
export async function seedSampleZones(shop: string) {
  for (const z of SAMPLE_ZONES) {
    await prisma.pricingRule.upsert({
      where: { shop_zip3: { shop, zip3: z.zip3 } },
      create: { shop, ...z, currency: "USD" },
      update: { zoneLabel: z.zoneLabel, price: z.price, currency: "USD" },
    });
  }
  await upsertDefault(shop, 1499, "USD");
}
