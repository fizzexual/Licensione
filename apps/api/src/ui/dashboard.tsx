import { BINDING_TYPES, LICENSE_STATUSES, PRODUCT_TYPES } from "@licensione/shared";
import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { raw } from "hono/html";
import type { FC } from "hono/jsx";
import { db } from "../db";
import type { HonoEnv } from "../env";
import { constantTimeEqual } from "../lib/crypto";
import { ADMIN_COOKIE, dashboardAuth } from "../middleware/adminAuth";
import { listActivations, releaseActivation, resetActivations } from "../services/activations";
import { addBlacklist, listBlacklist, removeBlacklist } from "../services/blacklist";
import { createCustomer, getCustomer, listCustomers } from "../services/customers";
import {
  deleteLicense,
  getLicenseDetail,
  issueBatch,
  issueLicense,
  listLicenses,
  setLicenseStatus,
} from "../services/licenses";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  rotateProductSecret,
} from "../services/products";
import { overview, recentValidations } from "../services/stats";
import { Badge, Layout, PageHead, badgeKind } from "./layout";
import { CSS } from "./styles";

export const dashboard = new Hono<HonoEnv>();
dashboard.use("*", dashboardAuth);

/* -------------------------------- helpers --------------------------------- */

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const optStr = (v: unknown): string | undefined => (str(v) === "" ? undefined : str(v));
const intOr = (v: unknown, fallback?: number): number | undefined => {
  const n = Number(str(v));
  return Number.isFinite(n) && str(v) !== "" ? n : fallback;
};
const isOn = (v: unknown): boolean => v === "on" || v === "true";

function fmt(epoch: number | null | undefined): string {
  if (!epoch) return "—";
  return `${new Date(epoch * 1000).toISOString().slice(0, 16).replace("T", " ")}Z`;
}
const expiry = (e: number): string => (e === 0 ? "Perpetual" : fmt(e));
const shortFp = (fp: string | null): string => (fp ? `${fp.slice(0, 12)}…` : "—");

const StatCard: FC<{ label: string; value: number | string; sub?: string }> = ({
  label,
  value,
  sub,
}) => (
  <div class="card stat">
    <div class="label">{label}</div>
    <div class="value">{value}</div>
    {sub ? <div class="sub">{sub}</div> : null}
  </div>
);

/* --------------------------------- login ---------------------------------- */

const LoginPage: FC<{ error?: boolean }> = ({ error }) => (
  <>
    {raw("<!DOCTYPE html>")}
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Sign in · Licensione</title>
        <style>{raw(CSS)}</style>
      </head>
      <body>
        <div style="min-height:100vh;display:grid;place-items:center;padding:24px">
          <div class="card" style="width:100%;max-width:380px">
            <div class="brand" style="margin-bottom:18px">
              <span class="brand-mark">L</span> Licensione
            </div>
            <h2>Admin sign in</h2>
            {error ? <p style="color:var(--bad);margin-top:-6px">Invalid token.</p> : null}
            <form method="post" action="/admin/login">
              <label>Admin token</label>
              <input name="token" type="password" autofocus required placeholder="ADMIN_TOKEN" />
              <button class="btn btn-primary" type="submit" style="width:100%;margin-top:14px">
                Sign in
              </button>
            </form>
            <p class="faint" style="margin-top:16px;font-size:12px">
              In production this page sits behind Cloudflare Access; the token is the local
              fallback.
            </p>
          </div>
        </div>
      </body>
    </html>
  </>
);

dashboard.get("/login", (c) => c.html(<LoginPage error={c.req.query("error") === "1"} />));

dashboard.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const token = str(body.token);
  if (token && c.env.ADMIN_TOKEN && constantTimeEqual(token, c.env.ADMIN_TOKEN)) {
    setCookie(c, ADMIN_COOKIE, token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: new URL(c.req.url).protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return c.redirect("/admin");
  }
  return c.redirect("/admin/login?error=1");
});

dashboard.get("/logout", (c) => {
  deleteCookie(c, ADMIN_COOKIE, { path: "/" });
  return c.redirect("/admin/login");
});

/* -------------------------------- overview -------------------------------- */

dashboard.get("/", async (c) => {
  const o = await overview(db(c.env));
  return c.html(
    <Layout title="Overview" active="/admin">
      <PageHead title="Overview" subtitle="Your licensing at a glance." />
      <div class="stat-grid">
        <StatCard label="Active seats" value={o.activeSeats} />
        <StatCard
          label="Licenses"
          value={o.licensesTotal}
          sub={`${o.licensesByStatus.active ?? 0} active`}
        />
        <StatCard label="Products" value={o.products} />
        <StatCard label="Customers" value={o.customers} />
        <StatCard label="Validations · 24h" value={o.validations24h} />
      </div>
      <div class="split">
        <div class="card">
          <h2>Recent validations</h2>
          {o.recent.length === 0 ? (
            <div class="empty">No validations yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Result</th>
                  <th>Key</th>
                  <th>Product</th>
                </tr>
              </thead>
              <tbody>
                {o.recent.map((v) => (
                  <tr>
                    <td class="muted">{fmt(v.at)}</td>
                    <td>
                      <Badge kind={badgeKind(v.result)}>{v.result}</Badge>
                    </td>
                    <td class="key">{v.licenseKey ?? "—"}</td>
                    <td class="muted">{v.productId ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div class="card">
          <h2>Results · 24h</h2>
          {Object.keys(o.resultBreakdown24h).length === 0 ? (
            <div class="empty">Quiet so far.</div>
          ) : (
            <div style="display:flex;flex-direction:column;gap:10px">
              {Object.entries(o.resultBreakdown24h).map(([result, n]) => (
                <div class="row" style="justify-content:space-between">
                  <Badge kind={badgeKind(result)}>{result}</Badge>
                  <span class="mono">{n}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>,
  );
});

/* -------------------------------- products -------------------------------- */

dashboard.get("/products", async (c) => {
  const products = await listProducts(db(c.env));
  return c.html(
    <Layout title="Products" active="/admin/products">
      <PageHead
        title="Products"
        subtitle="Everything you license — plugins, sites, apps, physical units."
      />
      <div class="card">
        <h2>New product</h2>
        <form method="post" action="/admin/products">
          <div class="form-grid">
            <div class="field">
              <label>Name</label>
              <input name="name" required placeholder="My Plugin" />
            </div>
            <div class="field">
              <label>Type</label>
              <select name="type">
                {PRODUCT_TYPES.map((t) => (
                  <option value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div class="field">
              <label>Binding</label>
              <select name="bindingType">
                <option value="">auto</option>
                {BINDING_TYPES.map((t) => (
                  <option value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div class="field">
              <label>Key prefix</label>
              <input name="keyPrefix" value="LIC" />
            </div>
            <div class="field">
              <label>Default seats</label>
              <input name="defaultMaxActivations" type="number" value="1" min="1" />
            </div>
            <div class="field">
              <label>Duration (days, 0=perpetual)</label>
              <input name="defaultDurationDays" type="number" value="0" min="0" />
            </div>
            <div class="field">
              <label>Strict proof-of-possession</label>
              <select name="strictPop">
                <option value="">off</option>
                <option value="on">on</option>
              </select>
            </div>
            <div class="field">
              <label>Enforce attestation</label>
              <select name="enforceAttestation">
                <option value="">off</option>
                <option value="on">on</option>
              </select>
            </div>
            <div class="field">
              <button class="btn btn-primary" type="submit">
                Create product
              </button>
            </div>
          </div>
        </form>
      </div>

      <div class="card section-gap">
        <h2>{products.length} product(s)</h2>
        {products.length === 0 ? (
          <div class="empty">No products yet — create one above.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Type</th>
                <th>Binding</th>
                <th>Seats</th>
                <th>Security</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr>
                  <td>{p.name}</td>
                  <td class="mono">{p.id}</td>
                  <td>
                    <Badge>{p.type}</Badge>
                  </td>
                  <td class="muted">{p.bindingType}</td>
                  <td class="muted">{p.defaultMaxActivations}</td>
                  <td class="chip-row">
                    {p.strictPop ? <Badge kind="info">pop</Badge> : null}
                    {p.enforceAttestation ? <Badge kind="info">attest</Badge> : null}
                    {p.coreKey ? <Badge kind="info">core</Badge> : null}
                    {p.status !== "active" ? <Badge kind="warn">{p.status}</Badge> : null}
                  </td>
                  <td>
                    <a class="btn btn-sm" href={`/admin/products/${p.id}`}>
                      Open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>,
  );
});

dashboard.post("/products", async (c) => {
  const body = await c.req.parseBody();
  await createProduct(db(c.env), {
    name: str(body.name) || "Untitled",
    type: (optStr(body.type) as (typeof PRODUCT_TYPES)[number]) ?? "generic",
    bindingType: optStr(body.bindingType) as (typeof BINDING_TYPES)[number] | undefined,
    keyPrefix: optStr(body.keyPrefix),
    defaultMaxActivations: intOr(body.defaultMaxActivations, 1),
    defaultDurationDays: intOr(body.defaultDurationDays, 0),
    strictPop: isOn(body.strictPop),
    enforceAttestation: isOn(body.enforceAttestation),
  });
  return c.redirect("/admin/products");
});

dashboard.get("/products/:id", async (c) => {
  const database = db(c.env);
  const product = await getProduct(database, c.req.param("id"));
  if (!product) return c.notFound();
  const licenses = await listLicenses(database, { productId: product.id, limit: 25 });
  const base = new URL(c.req.url).origin;
  const snippet = `POST ${base}/v1/validate
Content-Type: application/json
${"x-licensione-signature"}: <hmac-sha256(body, requestSecret)>

{
  "key": "${product.keyPrefix}-XXXX-XXXX-XXXX-XXXX",
  "product": "${product.id}",
  "fingerprint": "<stable install id>",
  "nonce": "<random>",
  "timestamp": <epoch seconds>
}`;
  return c.html(
    <Layout title={product.name} active="/admin/products">
      <PageHead title={product.name} subtitle={`Product · ${product.type}`}>
        <form class="inline-form" method="post" action={`/admin/products/${product.id}/rotate`}>
          <button class="btn btn-sm" type="submit">
            Rotate secret
          </button>
        </form>
        <form
          class="inline-form"
          method="post"
          action={`/admin/products/${product.id}/delete`}
          onsubmit="return confirm('Delete this product? Its licenses remain but lose their product.')"
        >
          <button class="btn btn-sm btn-danger" type="submit">
            Delete
          </button>
        </form>
      </PageHead>

      <div class="split">
        <div class="card">
          <h2>Integration</h2>
          <p class="muted" style="margin-top:-6px">
            Clients sign each request body with the product's request secret (HMAC-SHA256, hex) and
            verify the returned verdict against your Ed25519 public key.
          </p>
          <pre class="code">{snippet}</pre>
        </div>
        <div class="card">
          <h2>Configuration</h2>
          <dl class="kv">
            <dt>Slug</dt>
            <dd class="mono">{product.id}</dd>
            <dt>Binding</dt>
            <dd>{product.bindingType}</dd>
            <dt>Default seats</dt>
            <dd>{product.defaultMaxActivations}</dd>
            <dt>Duration</dt>
            <dd>
              {product.defaultDurationDays === 0 ? "Perpetual" : `${product.defaultDurationDays}d`}
            </dd>
            <dt>Strict pop</dt>
            <dd>{product.strictPop ? "on" : "off"}</dd>
            <dt>Attestation</dt>
            <dd>{product.enforceAttestation ? "enforced" : "off"}</dd>
            <dt>Encrypted core</dt>
            <dd>{product.coreKey ? "enabled" : "off"}</dd>
            <dt>Request secret</dt>
            <dd class="mono" style="word-break:break-all">
              {product.requestSecret}
            </dd>
          </dl>
        </div>
      </div>

      <div class="card section-gap">
        <h2>Recent licenses</h2>
        {licenses.length === 0 ? (
          <div class="empty">No licenses for this product yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Status</th>
                <th>Seats</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {licenses.map((l) => (
                <tr>
                  <td>
                    <a class="key" href={`/admin/licenses/${encodeURIComponent(l.key)}`}>
                      {l.key}
                    </a>
                  </td>
                  <td>
                    <Badge kind={badgeKind(l.status)}>{l.status}</Badge>
                  </td>
                  <td class="muted">{l.maxActivations}</td>
                  <td class="muted">{expiry(l.expiresAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>,
  );
});

dashboard.post("/products/:id/rotate", async (c) => {
  await rotateProductSecret(db(c.env), c.req.param("id"));
  return c.redirect(`/admin/products/${c.req.param("id")}`);
});

dashboard.post("/products/:id/delete", async (c) => {
  await deleteProduct(db(c.env), c.req.param("id"));
  return c.redirect("/admin/products");
});

/* -------------------------------- licenses -------------------------------- */

dashboard.get("/licenses", async (c) => {
  const database = db(c.env);
  const q = c.req.query();
  const [products, licenses] = await Promise.all([
    listProducts(database),
    listLicenses(database, {
      productId: optStr(q.product),
      status: optStr(q.status),
      q: optStr(q.q),
      limit: 100,
    }),
  ]);
  return c.html(
    <Layout title="Licenses" active="/admin/licenses">
      <PageHead title="Licenses" subtitle="Issue, search, and manage keys across every product." />

      {products.length === 0 ? (
        <div class="card">
          <div class="empty">Create a product first, then you can issue licenses.</div>
        </div>
      ) : (
        <div class="card">
          <h2>Issue license(s)</h2>
          <form method="post" action="/admin/licenses">
            <div class="form-grid">
              <div class="field">
                <label>Product</label>
                <select name="product" required>
                  {products.map((p) => (
                    <option value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div class="field">
                <label>Quantity</label>
                <input name="count" type="number" value="1" min="1" max="1000" />
              </div>
              <div class="field">
                <label>Seats</label>
                <input name="maxActivations" type="number" placeholder="product default" min="1" />
              </div>
              <div class="field">
                <label>Duration (days)</label>
                <input name="durationDays" type="number" placeholder="product default" min="0" />
              </div>
              <div class="field">
                <label>Plan</label>
                <input name="plan" placeholder="standard" />
              </div>
              <div class="field">
                <label>Watermark / buyer ref</label>
                <input name="watermark" placeholder="optional" />
              </div>
              <div class="field">
                <button class="btn btn-primary" type="submit">
                  Issue
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div class="card section-gap">
        <form method="get" action="/admin/licenses" class="form-grid" style="margin-bottom:18px">
          <div class="field">
            <label>Search key</label>
            <input name="q" value={optStr(q.q) ?? ""} placeholder="LIC-…" />
          </div>
          <div class="field">
            <label>Product</label>
            <select name="product">
              <option value="">all</option>
              {products.map((p) => (
                <option value={p.id} selected={q.product === p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div class="field">
            <label>Status</label>
            <select name="status">
              <option value="">all</option>
              {LICENSE_STATUSES.map((s) => (
                <option value={s} selected={q.status === s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div class="field">
            <button class="btn" type="submit">
              Filter
            </button>
          </div>
        </form>

        {licenses.length === 0 ? (
          <div class="empty">No licenses match.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Product</th>
                <th>Status</th>
                <th>Seats</th>
                <th>Expires</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {licenses.map((l) => (
                <tr>
                  <td>
                    <a class="key" href={`/admin/licenses/${encodeURIComponent(l.key)}`}>
                      {l.key}
                    </a>
                  </td>
                  <td class="muted">{l.productId}</td>
                  <td>
                    <Badge kind={badgeKind(l.status)}>{l.status}</Badge>
                  </td>
                  <td class="muted">{l.maxActivations}</td>
                  <td class="muted">{expiry(l.expiresAt)}</td>
                  <td class="muted">{fmt(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>,
  );
});

dashboard.post("/licenses", async (c) => {
  const database = db(c.env);
  const body = await c.req.parseBody();
  const product = await getProduct(database, str(body.product));
  if (!product) return c.redirect("/admin/licenses");
  const input = {
    plan: optStr(body.plan),
    maxActivations: intOr(body.maxActivations),
    durationDays: intOr(body.durationDays),
    watermark: optStr(body.watermark) ?? null,
    issuedBy: "dashboard",
  };
  const count = intOr(body.count, 1) ?? 1;
  if (count > 1) {
    await issueBatch(database, product, count, input);
    return c.redirect(`/admin/licenses?product=${product.id}`);
  }
  const license = await issueLicense(database, product, input);
  return c.redirect(`/admin/licenses/${encodeURIComponent(license.key)}`);
});

dashboard.get("/licenses/:key", async (c) => {
  const detail = await getLicenseDetail(db(c.env), c.req.param("key"));
  if (!detail) return c.notFound();
  const { license, product, customer, activations } = detail;
  return c.html(
    <Layout title="License" active="/admin/licenses">
      <PageHead
        title={license.key}
        subtitle={`${product?.name ?? license.productId} · ${license.plan}`}
      >
        {(["active", "suspended", "revoked"] as const).map((s) => (
          <form
            class="inline-form"
            method="post"
            action={`/admin/licenses/${encodeURIComponent(license.key)}/status`}
          >
            <input type="hidden" name="status" value={s} />
            <button class="btn btn-sm" type="submit" disabled={license.status === s}>
              {s === "active" ? "Activate" : s === "suspended" ? "Suspend" : "Revoke"}
            </button>
          </form>
        ))}
      </PageHead>

      <div class="split">
        <div class="card">
          <h2>Details</h2>
          <dl class="kv">
            <dt>Status</dt>
            <dd>
              <Badge kind={badgeKind(license.status)}>{license.status}</Badge>
            </dd>
            <dt>Product</dt>
            <dd class="mono">{license.productId}</dd>
            <dt>Plan</dt>
            <dd>{license.plan}</dd>
            <dt>Seats</dt>
            <dd>
              {activations.filter((a) => a.status === "active").length} / {license.maxActivations}
            </dd>
            <dt>Expires</dt>
            <dd>{expiry(license.expiresAt)}</dd>
            <dt>Customer</dt>
            <dd>{customer ? (customer.email ?? customer.name ?? customer.id) : "—"}</dd>
            <dt>Watermark</dt>
            <dd class="mono">{license.watermark ?? "—"}</dd>
            <dt>Created</dt>
            <dd>{fmt(license.createdAt)}</dd>
          </dl>
        </div>
        <div class="card">
          <h2>Actions</h2>
          <div style="display:flex;flex-direction:column;gap:12px">
            <form method="post" action={`/admin/licenses/${encodeURIComponent(license.key)}/reset`}>
              <button class="btn" type="submit" style="width:100%">
                Reset all seats
              </button>
            </form>
            <form
              method="post"
              action={`/admin/licenses/${encodeURIComponent(license.key)}/delete`}
              onsubmit="return confirm('Delete this license and its activations?')"
            >
              <button class="btn btn-danger" type="submit" style="width:100%">
                Delete license
              </button>
            </form>
          </div>
        </div>
      </div>

      <div class="card section-gap">
        <h2>Activations</h2>
        {activations.length === 0 ? (
          <div class="empty">No activations yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Type</th>
                <th>Fingerprint</th>
                <th>IP</th>
                <th>Last seen</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {activations.map((a) => (
                <tr>
                  <td>{a.label ?? "—"}</td>
                  <td class="muted">{a.type}</td>
                  <td class="mono">{shortFp(a.fingerprint)}</td>
                  <td class="muted">{a.ip ?? "—"}</td>
                  <td class="muted">{fmt(a.lastSeen)}</td>
                  <td>
                    <Badge kind={badgeKind(a.status)}>{a.status}</Badge>
                  </td>
                  <td>
                    {a.status === "active" ? (
                      <form
                        class="inline-form"
                        method="post"
                        action={`/admin/activations/${a.id}/release`}
                      >
                        <button class="btn btn-sm" type="submit">
                          Release
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>,
  );
});

dashboard.post("/licenses/:key/status", async (c) => {
  const body = await c.req.parseBody();
  const status = str(body.status) as (typeof LICENSE_STATUSES)[number];
  if ((LICENSE_STATUSES as readonly string[]).includes(status)) {
    await setLicenseStatus(db(c.env), c.req.param("key"), status);
  }
  return c.redirect(`/admin/licenses/${encodeURIComponent(c.req.param("key"))}`);
});

dashboard.post("/licenses/:key/reset", async (c) => {
  await resetActivations(db(c.env), c.req.param("key"));
  return c.redirect(`/admin/licenses/${encodeURIComponent(c.req.param("key"))}`);
});

dashboard.post("/licenses/:key/delete", async (c) => {
  await deleteLicense(db(c.env), c.req.param("key"));
  return c.redirect("/admin/licenses");
});

dashboard.post("/activations/:id/release", async (c) => {
  await releaseActivation(db(c.env), c.req.param("id"));
  return c.redirect(c.req.header("referer") ?? "/admin/licenses");
});

/* ------------------------------- customers -------------------------------- */

dashboard.get("/customers", async (c) => {
  const customers = await listCustomers(db(c.env));
  return c.html(
    <Layout title="Customers" active="/admin/customers">
      <PageHead title="Customers" subtitle="Buyers and their licenses." />
      <div class="card">
        <h2>New customer</h2>
        <form method="post" action="/admin/customers">
          <div class="form-grid">
            <div class="field">
              <label>Email</label>
              <input name="email" type="email" placeholder="buyer@example.com" />
            </div>
            <div class="field">
              <label>Name</label>
              <input name="name" placeholder="optional" />
            </div>
            <div class="field">
              <label>External ref</label>
              <input name="externalRef" placeholder="marketplace id" />
            </div>
            <div class="field">
              <button class="btn btn-primary" type="submit">
                Add customer
              </button>
            </div>
          </div>
        </form>
      </div>
      <div class="card section-gap">
        <h2>{customers.length} customer(s)</h2>
        {customers.length === 0 ? (
          <div class="empty">No customers yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>External ref</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((cust) => (
                <tr>
                  <td>
                    <a href={`/admin/customers/${cust.id}`}>{cust.email ?? "—"}</a>
                  </td>
                  <td class="muted">{cust.name ?? "—"}</td>
                  <td class="mono">{cust.externalRef ?? "—"}</td>
                  <td class="muted">{fmt(cust.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>,
  );
});

dashboard.post("/customers", async (c) => {
  const body = await c.req.parseBody();
  await createCustomer(db(c.env), {
    email: optStr(body.email) ?? null,
    name: optStr(body.name) ?? null,
    externalRef: optStr(body.externalRef) ?? null,
  });
  return c.redirect("/admin/customers");
});

dashboard.get("/customers/:id", async (c) => {
  const database = db(c.env);
  const customer = await getCustomer(database, c.req.param("id"));
  if (!customer) return c.notFound();
  const licenses = await listLicenses(database, { customerId: customer.id });
  return c.html(
    <Layout title="Customer" active="/admin/customers">
      <PageHead title={customer.email ?? customer.name ?? customer.id} subtitle="Customer" />
      <div class="card">
        <h2>Licenses</h2>
        {licenses.length === 0 ? (
          <div class="empty">No licenses linked.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Product</th>
                <th>Status</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {licenses.map((l) => (
                <tr>
                  <td>
                    <a class="key" href={`/admin/licenses/${encodeURIComponent(l.key)}`}>
                      {l.key}
                    </a>
                  </td>
                  <td class="muted">{l.productId}</td>
                  <td>
                    <Badge kind={badgeKind(l.status)}>{l.status}</Badge>
                  </td>
                  <td class="muted">{expiry(l.expiresAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>,
  );
});

/* ------------------------------- blacklist -------------------------------- */

dashboard.get("/blacklist", async (c) => {
  const entries = await listBlacklist(db(c.env));
  return c.html(
    <Layout title="Blacklist" active="/admin/blacklist">
      <PageHead title="Blacklist" subtitle="Hard denies by key, IP, fingerprint, or customer." />
      <div class="card">
        <h2>Add entry</h2>
        <form method="post" action="/admin/blacklist">
          <div class="form-grid">
            <div class="field">
              <label>Kind</label>
              <select name="kind">
                <option value="key">key</option>
                <option value="ip">ip</option>
                <option value="fingerprint">fingerprint</option>
                <option value="customer">customer</option>
              </select>
            </div>
            <div class="field">
              <label>Value</label>
              <input name="value" required placeholder="LIC-… / 1.2.3.4 / hash / cus_…" />
            </div>
            <div class="field">
              <label>Reason</label>
              <input name="reason" placeholder="leaked" />
            </div>
            <div class="field">
              <button class="btn btn-primary" type="submit">
                Ban
              </button>
            </div>
          </div>
        </form>
      </div>
      <div class="card section-gap">
        <h2>{entries.length} entr(ies)</h2>
        {entries.length === 0 ? (
          <div class="empty">Nothing banned.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Kind</th>
                <th>Value</th>
                <th>Reason</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr>
                  <td>
                    <Badge kind="bad">{e.kind}</Badge>
                  </td>
                  <td class="mono" style="word-break:break-all">
                    {e.value}
                  </td>
                  <td class="muted">{e.reason ?? "—"}</td>
                  <td class="muted">{fmt(e.at)}</td>
                  <td>
                    <form class="inline-form" method="post" action="/admin/blacklist/remove">
                      <input type="hidden" name="kind" value={e.kind} />
                      <input type="hidden" name="value" value={e.value} />
                      <button class="btn btn-sm" type="submit">
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>,
  );
});

dashboard.post("/blacklist", async (c) => {
  const body = await c.req.parseBody();
  const kind = str(body.kind);
  const value = str(body.value);
  if (["key", "ip", "fingerprint", "customer"].includes(kind) && value) {
    await addBlacklist(
      db(c.env),
      kind as "key" | "ip" | "fingerprint" | "customer",
      value,
      optStr(body.reason),
    );
  }
  return c.redirect("/admin/blacklist");
});

dashboard.post("/blacklist/remove", async (c) => {
  const body = await c.req.parseBody();
  await removeBlacklist(db(c.env), str(body.kind), str(body.value));
  return c.redirect("/admin/blacklist");
});

/* ------------------------------- telemetry -------------------------------- */

dashboard.get("/telemetry", async (c) => {
  const rows = await recentValidations(db(c.env), 200);
  return c.html(
    <Layout title="Telemetry" active="/admin/telemetry">
      <PageHead title="Telemetry" subtitle="The last 200 validation attempts." />
      <div class="card">
        {rows.length === 0 ? (
          <div class="empty">No validations recorded yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Result</th>
                <th>Key</th>
                <th>Product</th>
                <th>Fingerprint</th>
                <th>IP</th>
                <th>Version</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr>
                  <td class="muted">{fmt(v.at)}</td>
                  <td>
                    <Badge kind={badgeKind(v.result)}>{v.result}</Badge>
                  </td>
                  <td class="key">{v.licenseKey ?? "—"}</td>
                  <td class="muted">{v.productId ?? "—"}</td>
                  <td class="mono">{shortFp(v.fingerprint)}</td>
                  <td class="muted">{v.ip ?? "—"}</td>
                  <td class="muted">{v.version ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>,
  );
});
