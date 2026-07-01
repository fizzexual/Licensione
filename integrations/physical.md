# Physical product

Each unit gets its own key (the **serial**), printed on the unit or encoded in a QR code. Claiming
registers the unit — a warranty record and a one-time activation.

**Fingerprint:** the serial itself. Binding type `serial`, one seat per unit.

## 1. Generate a batch

Create a `physical` product, then bulk-issue one license per unit:

- Dashboard → **Licenses** → pick the product, set **Quantity** to the batch size, **Issue**.
- Or the API:
  ```bash
  curl -X POST "$API/v1/admin/licenses" -H "authorization: Bearer $ADMIN_TOKEN" \
    -H 'content-type: application/json' \
    -d '{"product":"my-gadget","count":500,"maxActivations":1}'
  ```

Export the returned keys and turn each into a QR code that opens your claim page, e.g.
`https://claim.example.com/?serial=LIC-…&product=my-gadget`.

## 2. Claim page

A tiny public page collects the buyer's details and POSTs the claim — no signature required, because
the serial is the secret:

```js
await fetch(`${API}/v1/claim`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    serial: params.get("serial"),
    product: params.get("product"),
    email: form.email.value,
    name: form.name.value,
  }),
});
// result: "claimed" (first time) or "already-claimed" (unit already registered)
```

A second claim on the same unit returns `already-claimed` rather than consuming another seat, so the
warranty registration is idempotent. Revoke a serial from the dashboard to invalidate a unit (theft,
RMA, counterfeit).
