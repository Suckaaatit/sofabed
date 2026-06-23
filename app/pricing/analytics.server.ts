// Lookup analytics — log every storefront price check and aggregate it for the
// admin dashboard. This is the "monetize the solution" layer (P1.5): the raw
// lookup stream shows merchants where demand concentrates by geography.

import prisma from "../db.server";

export interface LogInput {
  shop: string;
  zip: string;
  zip3: string;
  zone?: string | null;
  variantId?: string | null;
  price?: number | null;
  served: boolean;
  match?: string | null;
}

export async function logLookup(input: LogInput) {
  return prisma.lookupEvent.create({
    data: {
      shop: input.shop,
      zip: input.zip,
      zip3: input.zip3,
      zone: input.zone ?? null,
      variantId: input.variantId ?? null,
      price: input.price ?? null,
      served: input.served,
      match: input.match ?? null,
    },
  });
}

export async function recentLookups(shop: string, limit = 25) {
  return prisma.lookupEvent.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function summary(shop: string) {
  const [total, served] = await Promise.all([
    prisma.lookupEvent.count({ where: { shop } }),
    prisma.lookupEvent.count({ where: { shop, served: true } }),
  ]);
  const unserved = total - served;
  return { total, served, unserved };
}

/** Most-requested ZIP3s (demand by geography). */
export async function topZips(shop: string, limit = 10) {
  const rows = await prisma.lookupEvent.groupBy({
    by: ["zip3"],
    where: { shop },
    _count: { zip3: true },
    orderBy: { _count: { zip3: "desc" } },
    take: limit,
  });
  return rows.map((r) => ({ zip3: r.zip3, count: r._count.zip3 }));
}

/** Most-requested zones (null zones excluded). */
export async function topZones(shop: string, limit = 10) {
  const rows = await prisma.lookupEvent.groupBy({
    by: ["zone"],
    where: { shop, zone: { not: null } },
    _count: { zone: true },
    orderBy: { _count: { zone: "desc" } },
    take: limit,
  });
  return rows.map((r) => ({ zone: r.zone as string, count: r._count.zone }));
}
