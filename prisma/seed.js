// Seed pricing zones + default for a shop.
//
// Shop scoping: rows are keyed by shop domain, which isn't known until the app
// is installed. Set SEED_SHOP to your dev store domain before running:
//
//   SEED_SHOP=your-store.myshopify.com npm run seed
//
// For the demo you can instead click "Load sample zones" on the admin Pricing
// page, which seeds the *current* shop from the session (no env needed).
//
// All prices are in MINOR UNITS (cents). 1499 == $14.99.

/* eslint-env node */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SHOP = process.env.SEED_SHOP || "example.myshopify.com";

// The three required test ZIPs (75028 / 10001 / 90210 -> 1499 / 1699 / 1799)
// plus extra zones so the ZIP3 "nearest" fallback is visibly working.
export const SAMPLE_ZONES = [
  { zoneLabel: "DFW Metro", zip3: "750", price: 1499 }, // 75028
  { zoneLabel: "New York City", zip3: "100", price: 1699 }, // 10001
  { zoneLabel: "Los Angeles", zip3: "902", price: 1799 }, // 90210
  { zoneLabel: "Chicago", zip3: "606", price: 1599 },
  { zoneLabel: "Houston", zip3: "770", price: 1549 },
  { zoneLabel: "Miami", zip3: "331", price: 1649 },
  { zoneLabel: "Seattle", zip3: "981", price: 1749 },
];

export const SAMPLE_DEFAULT = { price: 1499, currency: "USD" };

async function main() {
  for (const z of SAMPLE_ZONES) {
    await prisma.pricingRule.upsert({
      where: { shop_zip3: { shop: SHOP, zip3: z.zip3 } },
      create: { shop: SHOP, ...z, currency: "USD" },
      update: { zoneLabel: z.zoneLabel, price: z.price, currency: "USD" },
    });
  }
  await prisma.pricingDefault.upsert({
    where: { shop: SHOP },
    create: { shop: SHOP, ...SAMPLE_DEFAULT },
    update: SAMPLE_DEFAULT,
  });
  console.log(
    `Seeded ${SAMPLE_ZONES.length} zones + default for ${SHOP}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
