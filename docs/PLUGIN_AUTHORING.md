# Building a ConvFlow Plugin

A ConvFlow plugin is a **declarative manifest** — a single JSON object that
describes how to call an external system over HTTP. No code runs inside the
ConvFlow engine; the platform's guarded HTTP runner executes your manifest.
This makes plugins language-agnostic, safe in a multi-tenant environment, and
**installable at runtime without a redeploy**.

- **The plugin is global** — one manifest, available to every tenant.
- **Credentials are per-tenant** — each tenant supplies their own secrets.
- **Live option lists are per-tenant** — dropdowns (e.g. record types) are
  fetched from *that tenant's* connected system when a flow is being built.

---

## 1. Manifest shape

```jsonc
{
  "id": "shopify",                  // lowercase [a-z0-9_-], unique
  "name": "Shopify",                // shown in the builder + admin console
  "description": "Create and read Shopify records.",

  // How each tenant's credentials are obtained (see §2).
  "credentials": {
    "source": "stored",
    "fields": [
      { "key": "storeUrl", "label": "Store URL" },
      { "key": "token",    "label": "Admin API token", "secret": true }
    ]
  },

  // Optional: live, per-tenant option lists used by inputs of type "doctype" (§4).
  "dynamicOptions": {
    "collections": {
      "verb": "GET",
      "url": "{creds.storeUrl}/admin/api/2024-01/custom_collections.json",
      "headers": { "X-Shopify-Access-Token": "{creds.token}" },
      "itemsPath": "custom_collections",   // dot-path to the array in the response
      "labelKey": "title",                  // field used as the option label
      "valueKey": "id"                      // field used as the option value
    }
  },

  // The actions a flow can invoke (§3).
  "actions": [
    {
      "id": "create_customer",
      "label": "Create Customer",
      "verb": "POST",
      "url": "{creds.storeUrl}/admin/api/2024-01/customers.json",
      "headers": { "X-Shopify-Access-Token": "{creds.token}" },
      "bodyFrom": "fields",
      "inputs": [
        { "key": "fields", "label": "Field mapping", "type": "fieldmap", "required": true }
      ]
    }
  ]
}
```

---

## 2. Credentials (`credentials`)

Two sources:

| Source | Meaning |
|--------|---------|
| `"stored"` | The tenant enters credentials, stored **encrypted** per tenant. You declare the `fields` (mark secrets with `"secret": true`). |
| `"erpnext_connection"` | Reuse the tenant's existing ERPNext connection. (Built-in convenience; most third-party plugins use `stored`.) |

> **Note:** the per-tenant credential-entry UI for `stored` plugins is on the
> roadmap. Today, `stored` manifests validate and install, and their credentials
> are supplied programmatically. `erpnext_connection` plugins work end-to-end now.

Credential values are available in templates as `{creds.<key>}`.

---

## 3. Actions (`actions[]`)

Each action is one HTTP call.

| Field | Required | Notes |
|-------|----------|-------|
| `id` | ✓ | unique within the plugin |
| `label` | ✓ | shown in the builder |
| `verb` | ✓ | `GET` \| `POST` \| `PUT` \| `DELETE` |
| `url` | ✓ | template (see tokens below) |
| `headers` | | object of templated header values |
| `bodyFrom` | | `"fields"` sends the mapped field object as the JSON body; `"none"` (default) sends no body |
| `inputs` | ✓ | what the flow builder collects (§4) |

### Template tokens

Usable in `url`, `headers`, and field-mapping values:

| Token | Resolves to |
|-------|-------------|
| `{creds.KEY}` | a per-tenant credential value |
| `{input.KEY}` | a value the flow author entered for an action input |
| `{answers.KEY}` | an answer collected from the customer in the flow (label-preferred) |
| `{name}` | the customer's name |
| `{phone}` | the customer's phone number |

---

## 4. Inputs (`inputs[]`)

What the flow author fills in when they add your action to a node.

| `type` | Renders as | Stored value |
|--------|-----------|--------------|
| `text` | text box (accepts tokens) | string |
| `doctype` | **live dropdown** populated from a `dynamicOptions` provider (set `"optionsFrom": "<key>"`) | string |
| `fieldmap` | key → value rows; values accept tokens like `{answers.name}` | object |

Example inputs for a "create record" action:

```jsonc
"inputs": [
  { "key": "collection", "label": "Collection", "type": "doctype", "optionsFrom": "collections", "required": true },
  { "key": "fields",     "label": "Field mapping", "type": "fieldmap", "required": true,
    "help": "Map API fields to flow answers, e.g. email → {answers.email}" }
]
```

At runtime the engine builds the request:
`bodyFrom: "fields"` → the `fields` map's values are token-interpolated and sent as the JSON body.

---

## 5. Using the action in a flow

In the Flow Builder, on any node: **Actions → Add action → Plugin (connected system)**, then choose the plugin, the action (verb), fill the inputs, and optionally:

- **Save response to** an answer key (captures the response back into the conversation; makes the call *blocking*).
- **Response JSON path** (e.g. `data.id`) to pluck one value from the response.
- **Wait for this to finish** (blocking) — otherwise the action runs in the background so a slow endpoint never delays the customer's next message.

---

## 6. Installing a plugin (no redeploy)

**Super Admin → Plugins → Install Plugin**, paste the manifest JSON, and click Install. It is validated, stored in the database, and hot-loaded into the running registry immediately.

Programmatic install (same effect):

```bash
curl -X POST https://<host>/platform/admin/plugins \
  -H "Authorization: Bearer <super-admin-JWT>" \
  -H "Content-Type: application/json" \
  -d '{ "manifest": { ...your manifest... }, "version": "1.0.0" }'
```

Manage:

- `GET    /platform/admin/plugins` — list (built-ins + installed)
- `PATCH  /platform/admin/plugins/:pluginId` — `{ "enabled": false }` to disable
- `DELETE /platform/admin/plugins/:pluginId` — uninstall

Built-in plugins (e.g. `erpnext`) are always enabled and cannot be uninstalled.

---

## 7. Security & limits

- **SSRF-guarded:** all outbound calls block private/loopback/link-local/metadata
  hosts. Your target system must be reachable at a public hostname.
- **Timeout:** every call is aborted after 15s.
- **No code execution:** manifests are data. For logic beyond HTTP templating,
  point an action at your own hosted endpoint (webhook-style) and put the logic there.
- **Multi-instance:** the registry is refreshed on install and at startup. If you
  run multiple API instances, restart or trigger a refresh on each after install.

---

## 8. Validation checklist

Install rejects a manifest unless:

- `id` is lowercase `[a-z0-9_-]` and unique (not a built-in id)
- `name` is present
- `credentials.source` is `stored` (with a `fields[]` array) or `erpnext_connection`
- `actions` is non-empty; each action has a unique `id`, a `label`, a valid `verb`,
  a `url`, and an `inputs[]` array
- every input has a `key` and a valid `type`; a `doctype` input has `optionsFrom`
- each `dynamicOptions` entry has `verb`, `url`, `itemsPath`, `labelKey`, `valueKey`
