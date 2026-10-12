# ConvFlow Meta App
## Multi-Tenant Facebook / Instagram / WhatsApp Connections

ConvFlow owns **one Meta App**. Any business that signs up can connect their own Facebook Page, Instagram Professional account, and (later) WhatsApp Business Account through this single app.

---

## 1. Why One App?

- Meta requires a registered app for messaging webhooks and tokens.
- Managing one app is far simpler than asking every customer to create their own.
- ConvFlow becomes the “platform” that receives webhooks and routes them to the correct tenant by `page_id` / Instagram-scoped ID.

---

## 2. Required Permissions

Request these in the Meta App Dashboard (and during OAuth):

**Messenger / Pages**
- `pages_messaging`
- `pages_manage_metadata`
- `pages_read_engagement`
- `pages_show_list`

**Instagram**
- `instagram_basic`
- `instagram_manage_messages`
- `pages_read_engagement` (needed for IG linked to a Page)

**WhatsApp (Cloud API – future)**
- `whatsapp_business_management`
- `whatsapp_business_messaging`

**Business**
- `business_management`

---

## 3. OAuth Flow (per tenant)

1. Owner clicks “Connect Instagram / Messenger” in Onboarding or Dashboard.
2. Backend generates the Meta OAuth URL using ConvFlow’s App ID + redirect URI.
3. User logs into Facebook and selects the Page(s) / IG account they want to grant.
4. Meta redirects back to `/api/onboarding/connect/meta/callback` with a `code`.
5. Backend exchanges `code` for a short-lived user token → exchanges for long-lived Page Access Token(s).
6. For each granted Page / IG account:
   - Store in `ChannelConnection` (encrypted token).
   - Subscribe the Page to ConvFlow’s webhook fields (`messages`, `messaging_postbacks`, etc.).
7. Return success to the frontend / Onboarding Agent.

---

## 4. Webhook Handling

Single endpoint, e.g. `POST /webhook/meta`

```ts
// Pseudo
const body = req.body;
for (const entry of body.entry) {
  const pageId = entry.id;
  const connection = await findChannelConnection({ channel: 'messenger' | 'instagram', externalId: pageId });
  if (!connection) continue; // unknown page

  const tenant = await getTenant(connection.companySlug);
  for (const event of entry.messaging || entry.standby || []) {
    const normalized = normalizeMetaEvent(event, connection);
    await handleInbound(normalized, tenant);   // same path as WhatsApp
  }
}
```

Always verify `X-Hub-Signature-256` using the App Secret.

---

## 5. Token Storage & Refresh

- Store long-lived Page tokens encrypted.
- Meta long-lived Page tokens do not expire as long as the user does not revoke and the app stays in good standing.
- Still implement a background job that periodically checks token validity and notifies the tenant if revoked.

---

## 6. Dashboard / Onboarding UX

- “Connect Facebook / Instagram” button → starts OAuth.
- After success, show the connected Page name + IG handle.
- Allow disconnect (unsubscribe webhook + delete `ChannelConnection`).

---

## 7. WhatsApp Note

Today ConvFlow uses **OpenWA** (self-hosted).  
Later we can add official WhatsApp Cloud API support through the same Meta App. The `ChannelConnection` model already supports `channel = 'whatsapp_cloud'`.

---

## 8. Environment Variables

```
META_APP_ID=
META_APP_SECRET=
META_WEBHOOK_VERIFY_TOKEN=
META_REDIRECT_URI=https://bots.ivarse.com/api/onboarding/connect/meta/callback
```

---

*This document is the source of truth for the multi-tenant Meta integration.*
