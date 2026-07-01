import { raw } from "hono/html";
import type { Child, FC } from "hono/jsx";
import { CSS } from "./styles";

const NAV = [
  { href: "/admin", label: "Overview", icon: "▦" },
  { href: "/admin/products", label: "Products", icon: "◈" },
  { href: "/admin/licenses", label: "Licenses", icon: "⬡" },
  { href: "/admin/customers", label: "Customers", icon: "◉" },
  { href: "/admin/blacklist", label: "Blacklist", icon: "⊘" },
  { href: "/admin/telemetry", label: "Telemetry", icon: "≋" },
];

export const Layout: FC<{ title: string; active: string; children?: Child }> = ({
  title,
  active,
  children,
}) => (
  <>
    {raw("<!DOCTYPE html>")}
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title} · Licensione</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Azeret+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <style>{raw(CSS)}</style>
      </head>
      <body>
        <div class="app">
          <aside class="sidebar">
            <div class="brand">
              <span class="brand-mark">L</span> Licensione
            </div>
            <nav>
              {NAV.map((n) => (
                <a class={`nav-item${active === n.href ? " active" : ""}`} href={n.href}>
                  <span class="nav-icon">{n.icon}</span>
                  {n.label}
                </a>
              ))}
            </nav>
            <div class="sidebar-foot">
              <a class="nav-item" href="/admin/logout">
                <span class="nav-icon">⏻</span>Sign out
              </a>
              <div style="padding:8px 12px">v0.1 · edge-signed verdicts</div>
            </div>
          </aside>
          <main class="main">{children}</main>
        </div>
      </body>
    </html>
  </>
);

export const PageHead: FC<{ title: string; subtitle?: string; children?: Child }> = ({
  title,
  subtitle,
  children,
}) => (
  <div class="page-head">
    <div>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
    {children ? <div class="row">{children}</div> : null}
  </div>
);

export const Badge: FC<{ kind?: string; children?: Child }> = ({ kind, children }) => (
  <span class={`badge badge-${kind ?? "muted"}`}>{children}</span>
);

/** Maps a status/result string to a badge colour. */
export function badgeKind(value: string): string {
  switch (value) {
    case "active":
    case "valid":
    case "claimed":
    case "released":
      return "ok";
    case "revoked":
    case "blacklisted":
    case "bad-signature":
    case "unknown-key":
    case "product-mismatch":
    case "attestation-failed":
    case "seat-limit":
    case "error":
      return "bad";
    case "suspended":
    case "expired":
    case "replay":
    case "inactive":
      return "warn";
    default:
      return "muted";
  }
}
