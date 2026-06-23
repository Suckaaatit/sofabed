# ZIP-Code Dynamic Pricing — Shopify App

A Shopify app that shows shoppers a **location-based price** on the product page.
The shopper enters a ZIP code, clicks **Check Price**, and the price updates —
resolved by a configurable, server-side rules engine and proxied securely
through Shopify (no CORS, signed requests).

Built the Shopify-native way: **App Proxy** + **Theme App Extension** on the
official React Router 7 app template. Not a hacked `theme.liquid`.

---

## 1. Architecture

```
Storefront (theme app extension / app block on the product page)
   │   shopper types ZIP, clicks "Check Price"
   │   fetch("/apps/pricing/estimate?zip=...&variant=...")   ← relative, same-origin
   ▼
Shopify App Proxy   (adds shop, timestamp, signature; strips cookies)
   │   proxies /apps/pricing/*  →  this app's /proxy/*
   ▼
App backend (React Router 7, running on the Shopify CLI dev tunnel)
   │   1. authenticate.public.appProxy(request)   ← verifies HMAC signature (401 if bad)
   │   2. validate ZIP (5 digits) server-side
   │   3. rules engine: ZIP → ZIP3 → zone → price  (Prisma/SQLite, with fallback)
   │   4. log the lookup (analytics)
   │   5. return JSON { price, currency, zone, served, match }
   ▼
Storefront renders the price, updates the result element, and attaches
ZIP + quoted price to the cart as line-item properties.
```

**Why App Proxy (not a direct API call):** the storefront calls
`https://<store>.myshopify.com/apps/pricing/...`, which Shopify proxies to this
app over the shop's own domain. Same-origin → **no CORS**, and Shopify **signs**
every request so the backend can prove it came from the storefront. The
template's `authenticate.public.appProxy` verifies that signature for us.

**Why a Theme App Extension (not editing `theme.liquid`):** the merchant drops
the widget onto the product page from the theme editor; it survives theme
updates and is the production-grade approach. Editing `theme.liquid` directly is
what the median candidate does and reads as exactly that.

---

## 2. Stack

| Layer        | Choice                                                                 |
| ------------ | --------------------------------------------------------------------- |
| App          | Shopify App Template — **React Router 7** (Remix merged into RR)       |
| Storefront   | **Theme App Extension** (app block) — `extensions/zip-price-block`     |
| Backend      | App's own RR routes (`/proxy/estimate`), reached through the App Proxy |
| Data         | **Prisma + SQLite** (pricing rules, default, lookup analytics)         |
| Admin UI     | Polaris web components (embedded app): pricing CRUD + analytics        |
| Run / deploy | `shopify app dev` (CLI provisions tunnel + installs on the dev store)  |

---

## 3. How to run (the live demo)

> Prerequisites: Node ≥ 20.19, a [Shopify Partner account](https://partners.shopify.com),
> and a free development store with one product (at least one variant).

```bash
# 1. Install deps (already done if you cloned a built copy)
npm install

# 2. Set up the database (creates SQLite + tables)
npm run setup        # prisma generate + migrate deploy
# optional: seed sample zones for a specific shop from the CLI
#   SEED_SHOP=your-store.myshopify.com npm run seed

# 3. Start the app — the CLI logs you in, creates a tunnel, and installs it
npm run dev          # = shopify app dev
#   press P to open the app, then install on your dev store
```

Then, **in the dev store admin**:

1. Open the app → **Pricing rules** → click **Load sample zones**
   (adds 75028→$14.99, 10001→$16.99, 90210→$17.99 + extra zones).
2. **Online Store → Themes → Customize → Product template.**
3. Add a block / section → **Apps → ZIP Price Check** → place it near the price → **Save**.
   ⚠️ This step is required — the widget is invisible until the block is added.
4. View the product page, enter a ZIP, click **Check Price**.

### Test the three ZIPs

| ZIP     | Zone           | Price   |
| ------- | -------------- | ------- |
| `75028` | DFW Metro      | $14.99  |
| `10001` | New York City  | $16.99  |
| `90210` | Los Angeles    | $17.99  |

Re-entering a ZIP updates the price without a reload. An unknown ZIP returns the
nearest zone, or the default price flagged as "we don't ship there yet."

---

## 4. What's built (tiers)

**P0 — Core (the literal brief)**
- App Proxy configured in `shopify.app.toml` (`/apps/pricing/*` → `/proxy/*`).
- `/proxy/estimate` endpoint: verify signature → validate → resolve → log → JSON.
- Theme app extension app block: ZIP input + Check Price + live price render.
- Three test ZIPs → three prices, re-entry updates.

**P1 — Differentiators**
- **Real rules engine with graceful fallback** (`app/pricing/engine.ts`): keyed
  by ZIP3 so *any* ZIP resolves — exact zone → nearest zone → default. Never 500s.
- **Admin-configurable pricing** (`app/routes/app._index.tsx`): merchants
  create/edit/delete zones and the default price from a Polaris page — no
  developer needed. Rules live in Prisma, not a hardcoded switch.
- **HMAC verification done right**: `authenticate.public.appProxy` verifies the
  App Proxy signature (note: App Proxy concatenates params **without** a `&`
  delimiter, unlike OAuth HMAC — easy to get wrong by hand; we use the helper).
  Unsigned/forged requests get 401 before any pricing logic runs.
- **Cart line-item properties** (`assets/zip-price.js`): a successful lookup
  attaches `Quoted ZIP` + `Quoted Price` to the product form, so the selection
  follows into the cart/order. (See *Honest limits* — this is a display estimate,
  not a checkout-price override.)
- **Lookup analytics + dashboard** (`app/routes/app.analytics.tsx`): every
  lookup is logged; the dashboard shows totals, most-requested ZIP3s/zones, and
  recent lookups. This is demand-by-geography — the saleable data.
- **UX states + input hygiene**: loading spinner, client + server ZIP
  validation, out-of-zone message, debounce, per-ZIP response cache, and a light
  in-memory rate limit on the endpoint.

---

## 5. Honest limits (and the production path)

- **Displayed price ≠ checkout price.** Shopify owns the real price. This app
  shows an *estimate* and attaches it as a cart **line-item property**. Truly
  overriding the charged price requires **Shopify Functions** (cart transform /
  discount), and Shopify **Scripts** need **Plus** — out of scope for this demo.
  We do not claim to change the checkout price.
- **Tunnel URL changes** each `shopify app dev` unless reserved; the App Proxy
  `url` in `shopify.app.toml` must match the current tunnel or the proxy 404s.
- **`prefix`/`subpath` are immutable** after install — set before first install.
- **SQLite + in-memory rate limit** are per-instance; fine for a demo, not for
  multi-instance production.

---

## 6. Productization & monetization

This is the MVP of a **destination-based dynamic pricing / shipping-quote app**.
The configurable rules engine + analytics is the saleable core: merchants set
zone pricing without a developer, and the lookup data shows them where demand
concentrates by geography.

Natural next steps:
- Live **carrier-rate** integration (real shipping quotes by ZIP).
- **Shopify Functions** for true checkout pricing (the production boundary above).
- Per-collection / per-variant rules and bulk ZIP-range import.
- A tiered **SaaS** pricing model (free tier + paid analytics/automation).

Built in hours with an AI coding agent against an unfamiliar platform — which is
the point.

---

## 7. Repo map

```
app/
  routes/
    proxy.estimate.tsx     # App Proxy endpoint: verify → validate → resolve → log → JSON
    app._index.tsx         # Admin: pricing rules CRUD (Polaris) + default price
    app.analytics.tsx      # Admin: lookup dashboard
    app.tsx                # Embedded app shell + NavMenu
  pricing/
    engine.ts              # pure: zip → zip3 → zone → price, with fallback
    engine.test.ts         # deterministic checks (npm test)
    rules.server.ts        # Prisma reads/writes for rules + default + sample seed
    analytics.server.ts    # log + aggregate lookups
extensions/
  zip-price-block/         # theme app extension (app block)
    blocks/zip_price.liquid
    assets/zip-price.js
    assets/zip-price.css
    locales/en.default.json
    shopify.extension.toml
prisma/
  schema.prisma            # Session + PricingRule + PricingDefault + LookupEvent
  seed.js                  # test ZIPs + extra zones (SEED_SHOP env)
shopify.app.toml           # [app_proxy] config
```

**Units:** all `price` values are stored in **minor units (cents)**. `1499` = `$14.99`.

---

## 8. Verify-it-works checklist (P0)

- [ ] `https://<store>.myshopify.com/apps/pricing/estimate?zip=75028&variant=<id>` returns the right JSON.
- [ ] A request with a tampered/missing `signature` is rejected (401).
- [ ] All three test ZIPs render three different prices on the live product page.
- [ ] Re-entering a ZIP updates the displayed price without a reload.
- [ ] An invalid ZIP shows the validation state, not a crash or a stale price.

Local logic is covered by `npm test` (engine: exact / nearest / default / validation).
