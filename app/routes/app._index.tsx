import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  listRules,
  getDefault,
  createRule,
  updateRule,
  deleteRule,
  upsertDefault,
  seedSampleZones,
} from "../pricing/rules.server";
import { formatPrice } from "../pricing/engine";

// Convert a dollars string ("14.99") to integer cents (1499). null if invalid.
function dollarsToCents(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const [rules, def] = await Promise.all([listRules(shop), getDefault(shop)]);
  return { shop, rules, def };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  try {
    if (intent === "seed") {
      await seedSampleZones(shop);
      return { ok: true, message: "Loaded sample zones." };
    }

    if (intent === "delete") {
      await deleteRule(shop, String(form.get("id")));
      return { ok: true, message: "Zone deleted." };
    }

    if (intent === "default") {
      const price = dollarsToCents(form.get("price"));
      if (price == null) return { ok: false, error: "Enter a valid price." };
      await upsertDefault(shop, price, "USD");
      return { ok: true, message: "Default price updated." };
    }

    if (intent === "create" || intent === "update") {
      const zoneLabel = String(form.get("zoneLabel") || "").trim();
      const zip3 = String(form.get("zip3") || "").trim();
      const price = dollarsToCents(form.get("price"));

      if (!zoneLabel) return { ok: false, error: "Zone label is required." };
      if (!/^\d{3}$/.test(zip3))
        return { ok: false, error: "ZIP3 must be exactly 3 digits." };
      if (price == null) return { ok: false, error: "Enter a valid price." };

      if (intent === "create") {
        await createRule({ shop, zoneLabel, zip3, price });
        return { ok: true, message: `Zone "${zoneLabel}" added.` };
      }
      await updateRule({
        id: String(form.get("id")),
        shop,
        zoneLabel,
        zip3,
        price,
      });
      return { ok: true, message: `Zone "${zoneLabel}" updated.` };
    }

    return { ok: false, error: "Unknown action." };
  } catch {
    // Most likely a duplicate zip3 for this shop (unique constraint).
    return {
      ok: false,
      error: "Could not save. That ZIP3 may already have a zone.",
    };
  }
};

type Rule = Awaited<ReturnType<typeof listRules>>[number];
type ActionData = { ok?: boolean; message?: string; error?: string };

export default function PricingRules() {
  const { rules, def, shop } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const busy = fetcher.state !== "idle";

  return (
    <s-page heading="ZIP pricing rules">
      <s-button
        slot="primary-action"
        onClick={() => fetcher.submit({ intent: "seed" }, { method: "POST" })}
        {...(busy ? { loading: true } : {})}
      >
        Load sample zones
      </s-button>

      {fetcher.data?.message && (
        <s-banner tone="success">{fetcher.data.message}</s-banner>
      )}
      {fetcher.data?.error && (
        <s-banner tone="critical">{fetcher.data.error}</s-banner>
      )}

      <s-section heading="Zones">
        <s-paragraph>
          Each zone maps the first 3 digits of a ZIP (the “ZIP3”) to a price.
          Any ZIP that doesn’t match a zone falls back to the nearest zone, then
          to your default price — so every shopper gets a sensible number.
        </s-paragraph>

        {rules.length === 0 ? (
          <s-paragraph>
            No zones yet. Click <strong>Load sample zones</strong> to add the
            three test ZIPs (75028, 10001, 90210) plus a few extras.
          </s-paragraph>
        ) : (
          <div style={{ marginTop: "0.5rem" }}>
            <div style={{ ...rowStyle, fontSize: "0.8rem", fontWeight: 600 }}>
              <span style={colZone}>Zone</span>
              <span style={colZip}>ZIP3</span>
              <span style={colPrice}>Price (USD)</span>
              <span style={colActions} />
            </div>
            {rules.map((r) => (
              <RuleRow key={r.id} rule={r} fetcher={fetcher} busy={busy} />
            ))}
          </div>
        )}
      </s-section>

      <s-section heading="Add a zone">
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="create" />
          <div style={formRowStyle}>
            <Field label="Zone label" name="zoneLabel" placeholder="DFW Metro" />
            <Field
              label="ZIP3 (first 3 digits)"
              name="zip3"
              placeholder="750"
              maxLength={3}
              inputMode="numeric"
            />
            <Field
              label="Price (USD)"
              name="price"
              placeholder="14.99"
              inputMode="decimal"
            />
            <button type="submit" style={primaryBtn} disabled={busy}>
              Add zone
            </button>
          </div>
        </fetcher.Form>
      </s-section>

      <s-section slot="aside" heading="Default price">
        <s-paragraph>
          Used when a ZIP has no matching or nearby zone (“we don’t ship there
          yet”). Currently{" "}
          <strong>{formatPrice(def.price, def.currency)}</strong>.
        </s-paragraph>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="default" />
          <div
            style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}
          >
            <Field
              label="Default price (USD)"
              name="price"
              placeholder={(def.price / 100).toFixed(2)}
              inputMode="decimal"
            />
            <button type="submit" style={primaryBtn} disabled={busy}>
              Save
            </button>
          </div>
        </fetcher.Form>
      </s-section>

      <s-section slot="aside" heading="Store">
        <s-paragraph>
          <s-text>Shop: </s-text>
          <code>{shop}</code>
        </s-paragraph>
        <s-paragraph>
          The storefront widget calls <code>/apps/pricing/estimate</code>{" "}
          through the app proxy.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

function RuleRow({
  rule,
  fetcher,
  busy,
}: {
  rule: Rule;
  fetcher: ReturnType<typeof useFetcher<ActionData>>;
  busy: boolean;
}) {
  return (
    <div style={rowStyle}>
      <fetcher.Form method="post" style={rowFormStyle}>
        <input type="hidden" name="intent" value="update" />
        <input type="hidden" name="id" value={rule.id} />
        <input
          name="zoneLabel"
          defaultValue={rule.zoneLabel}
          style={{ ...cellInput, ...colZone }}
        />
        <input
          name="zip3"
          defaultValue={rule.zip3}
          maxLength={3}
          inputMode="numeric"
          style={{ ...cellInput, ...colZip }}
        />
        <input
          name="price"
          defaultValue={(rule.price / 100).toFixed(2)}
          inputMode="decimal"
          style={{ ...cellInput, ...colPrice }}
        />
        <span style={{ ...colActions, display: "flex", gap: "0.4rem" }}>
          <button type="submit" style={secondaryBtn} disabled={busy}>
            Save
          </button>
        </span>
      </fetcher.Form>
      <button
        type="button"
        style={dangerBtn}
        disabled={busy}
        onClick={() =>
          fetcher.submit({ intent: "delete", id: rule.id }, { method: "POST" })
        }
      >
        Delete
      </button>
    </div>
  );
}

// --- small presentational helpers ---------------------------------------

function Field({
  label,
  name,
  placeholder,
  maxLength,
  inputMode,
}: {
  label: string;
  name: string;
  placeholder?: string;
  maxLength?: number;
  inputMode?: "numeric" | "decimal" | "text";
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>{label}</span>
      <input
        name={name}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={inputMode}
        style={fieldInput}
      />
    </label>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  alignItems: "center",
  padding: "0.4rem 0",
  borderBottom: "1px solid #e1e3e5",
};
const rowFormStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  alignItems: "center",
  flex: 1,
};
const colZone: React.CSSProperties = { flex: "2 1 8rem" };
const colZip: React.CSSProperties = { flex: "0 0 4rem", width: "4rem" };
const colPrice: React.CSSProperties = { flex: "0 0 6rem", width: "6rem" };
const colActions: React.CSSProperties = { flex: "0 0 5rem" };

const formRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.75rem",
  flexWrap: "wrap",
  alignItems: "flex-end",
};
const fieldInput: React.CSSProperties = {
  padding: "0.45rem 0.6rem",
  border: "1px solid #8c9196",
  borderRadius: "6px",
  font: "inherit",
};
const cellInput: React.CSSProperties = {
  padding: "0.3rem 0.45rem",
  border: "1px solid #c9cccf",
  borderRadius: "5px",
  font: "inherit",
};
const baseBtn: React.CSSProperties = {
  padding: "0.45rem 0.9rem",
  borderRadius: "6px",
  font: "inherit",
  fontWeight: 600,
  cursor: "pointer",
  border: "1px solid transparent",
};
const primaryBtn: React.CSSProperties = {
  ...baseBtn,
  background: "#111",
  color: "#fff",
};
const secondaryBtn: React.CSSProperties = {
  ...baseBtn,
  background: "#f6f6f7",
  border: "1px solid #8c9196",
};
const dangerBtn: React.CSSProperties = {
  ...baseBtn,
  background: "#fff",
  border: "1px solid #b3261e",
  color: "#b3261e",
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
