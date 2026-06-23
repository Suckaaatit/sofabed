// App Proxy endpoint.  Storefront calls /apps/pricing/estimate?zip=..&variant=..
// Shopify signs the request and proxies it here (/proxy/estimate). This is a
// resource route (no default export): the loader's returned object is sent as
// JSON automatically — do NOT wrap it in json() (old Remix pattern).
//
// Behavior order (strict — see Appendix A.1 of the build spec):
//   1. authenticate.public.appProxy(request)  -> verifies Shopify's HMAC; the
//      helper throws a 401 Response for unsigned/forged requests. Nothing else
//      runs until this passes. This is the security gate.
//   2. validate inputs (zip must be exactly 5 digits) server-side.
//   3. resolve price behind a single call (rules engine; P1.1 fallback).
//   4. log the lookup (analytics; P1.5).
//   5. return { price, currency, zone, served, ... } as a plain object.

import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { normalizeZip, zip3Of, resolvePrice } from "../pricing/engine";
import { getZones, getDefault } from "../pricing/rules.server";
import { logLookup } from "../pricing/analytics.server";

// --- light in-memory rate limit (P1.6) ----------------------------------
// Per-process, best-effort: protects the endpoint from a hot loop without a
// dependency. Resets on redeploy; that's acceptable for this scope.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // 1. Verify first, unconditionally. Throws 401 on a bad/missing signature.
  const { session } = await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  // Shopify appends ?shop=... to proxied requests; session.shop is the
  // authoritative source. Either way we scope all data by shop.
  const shop = session?.shop ?? url.searchParams.get("shop") ?? "unknown";

  // Rate limit per shop. (Cookies are stripped by the proxy, so we key by shop.)
  if (rateLimited(shop)) {
    return Response.json(
      { error: "rate_limited", served: false },
      { status: 429 },
    );
  }

  // 2. Validate inputs server-side. Malformed ZIPs never reach the engine.
  const rawZip = url.searchParams.get("zip");
  const variant = url.searchParams.get("variant");
  const zip = normalizeZip(rawZip);
  if (!zip) {
    return Response.json(
      { error: "invalid_zip", served: false },
      { status: 400 },
    );
  }

  // 3. Resolve the price (single call; swaps P0 map for P1.1 engine cleanly).
  const [zones, fallback] = await Promise.all([
    getZones(shop),
    getDefault(shop),
  ]);
  const result = resolvePrice(zip, zones, fallback);

  // 4. Log the lookup for analytics (don't let logging failures break pricing).
  try {
    await logLookup({
      shop,
      zip,
      zip3: zip3Of(zip),
      zone: result.zone,
      variantId: variant,
      price: result.price,
      served: result.served,
      match: result.match,
    });
  } catch {
    // swallow — analytics is best-effort
  }

  // 5. Return a plain object (React Router serializes it to JSON).
  return {
    price: result.price, // minor units (cents)
    currency: result.currency,
    zone: result.zone,
    zip3: result.zip3,
    served: result.served,
    match: result.match,
  };
};
