import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  summary,
  recentLookups,
  topZips,
  topZones,
} from "../pricing/analytics.server";
import { formatPrice } from "../pricing/engine";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const [stats, recent, zips, zones] = await Promise.all([
    summary(shop),
    recentLookups(shop, 25),
    topZips(shop, 10),
    topZones(shop, 10),
  ]);
  return { stats, recent, zips, zones };
};

export default function Analytics() {
  const { stats, recent, zips, zones } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Lookup analytics">
      <s-section heading="Demand at a glance">
        <s-paragraph>
          Every storefront ZIP lookup is logged here — this is the data that
          turns the app into a product: it shows merchants where demand
          concentrates by geography.
        </s-paragraph>
        <div style={statsRow}>
          <Stat label="Total lookups" value={String(stats.total)} />
          <Stat label="In a zone (served)" value={String(stats.served)} />
          <Stat label="Out of zone" value={String(stats.unserved)} />
        </div>
      </s-section>

      <s-section heading="Most-requested ZIP3s">
        {zips.length === 0 ? (
          <s-paragraph>No lookups yet.</s-paragraph>
        ) : (
          <BarList
            items={zips.map((z) => ({ label: z.zip3, count: z.count }))}
          />
        )}
      </s-section>

      <s-section heading="Most-requested zones">
        {zones.length === 0 ? (
          <s-paragraph>No lookups yet.</s-paragraph>
        ) : (
          <BarList
            items={zones.map((z) => ({ label: z.zone, count: z.count }))}
          />
        )}
      </s-section>

      <s-section slot="aside" heading="Recent lookups">
        {recent.length === 0 ? (
          <s-paragraph>No lookups yet. Try the storefront widget.</s-paragraph>
        ) : (
          <div>
            {recent.map((e) => (
              <div key={e.id} style={recentRow}>
                <div style={{ fontWeight: 600 }}>
                  {e.zip}{" "}
                  <span style={{ fontWeight: 400, opacity: 0.7 }}>
                    {e.zone || "—"}
                  </span>
                </div>
                <div style={{ fontSize: "0.85rem", opacity: 0.75 }}>
                  {e.price != null ? formatPrice(e.price) : "—"} ·{" "}
                  {e.served ? e.match || "served" : "out of zone"}
                </div>
              </div>
            ))}
          </div>
        )}
      </s-section>
    </s-page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={statBox}>
      <div style={{ fontSize: "1.8rem", fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>{label}</div>
    </div>
  );
}

function BarList({ items }: { items: { label: string; count: number }[] }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div style={{ marginTop: "0.5rem" }}>
      {items.map((i) => (
        <div key={i.label} style={{ marginBottom: "0.4rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600 }}>{i.label}</span>
            <span style={{ opacity: 0.7 }}>{i.count}</span>
          </div>
          <div style={barTrack}>
            <div style={{ ...barFill, width: `${(i.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const statsRow: React.CSSProperties = {
  display: "flex",
  gap: "1rem",
  flexWrap: "wrap",
  marginTop: "0.5rem",
};
const statBox: React.CSSProperties = {
  flex: "1 1 8rem",
  padding: "1rem",
  border: "1px solid #e1e3e5",
  borderRadius: "8px",
  textAlign: "center",
};
const barTrack: React.CSSProperties = {
  background: "#f1f1f1",
  borderRadius: "4px",
  height: "8px",
  overflow: "hidden",
};
const barFill: React.CSSProperties = {
  background: "#111",
  height: "100%",
};
const recentRow: React.CSSProperties = {
  padding: "0.4rem 0",
  borderBottom: "1px solid #e1e3e5",
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
