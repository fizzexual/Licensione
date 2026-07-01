# API reference

Base URL is your deployed Worker (e.g. `https://api.example.com`). All bodies are JSON.

## Public

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | — | service banner |
| GET | `/v1/health` | — | health + protocol version + signing key id |
| POST | `/v1/validate` | product HMAC header | validate + first-seen activation → signed verdict |
| POST | `/v1/deactivate` | product HMAC header | release a seat |
| POST | `/v1/claim` | — | register a physical unit's serial |
| POST | `/v1/webhook/:provider` | webhook HMAC header | auto-issue on purchase (idempotent per `event_id`) |

Request/response shapes: [`integrations/README.md`](../integrations/README.md).

The webhook expects `x-licensione-webhook: <hex HMAC-SHA256 of the body, keyed by WEBHOOK_SECRET>` and
a body like:

```jsonc
{ "event_id": "order_123", "product": "my-plugin",
  "buyer": { "ref": "polymart:42", "email": "b@x.com", "name": "B" },
  "plan": "pro", "maxActivations": 3, "durationDays": 365 }
```

## Admin

Under `/v1/admin` — behind Cloudflare Access, or `Authorization: Bearer <ADMIN_TOKEN>`.

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/v1/admin/products` | list / create products |
| GET/PATCH/DELETE | `/v1/admin/products/:id` | read / update / delete |
| POST | `/v1/admin/products/:id/rotate-secret` | rotate request secret |
| GET | `/v1/admin/licenses?product=&status=&q=&customer=` | search licenses |
| POST | `/v1/admin/licenses` | issue one (or `count` for a batch) |
| GET/PATCH/DELETE | `/v1/admin/licenses/:key` | detail / update / delete |
| POST | `/v1/admin/licenses/:key/status` | `{ "status": "active|suspended|revoked" }` |
| GET/POST | `/v1/admin/customers` | list / create |
| GET | `/v1/admin/customers/:id` | detail + their licenses |
| GET | `/v1/admin/activations?key=` | seats for a license |
| POST | `/v1/admin/activations/:id/release` | release a seat |
| DELETE | `/v1/admin/activations/:id` | delete a seat |
| POST | `/v1/admin/activations/reset` | `{ "key": "LIC-…" }` — free all seats |
| GET/POST/DELETE | `/v1/admin/blacklist` | list / add / remove |
| GET | `/v1/admin/stats/overview` | dashboard counters |
| GET | `/v1/admin/stats/telemetry?limit=` | recent validations |
| GET | `/v1/admin/stats/signing-key` | current `kid` + public key |

Every response is a JSON envelope: `{ "ok": true, ... }` or `{ "ok": false, "error": "…" }`.

## Dashboard

`/admin` — the same admin capabilities as a server-rendered UI, behind the same gate.

## Example: issue a license

```bash
curl -X POST "$API/v1/admin/licenses" \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"product":"my-plugin","plan":"pro","maxActivations":2,"durationDays":365}'
```
