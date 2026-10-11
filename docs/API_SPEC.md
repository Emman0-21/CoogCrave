# CoogCrave — API Specification (v1)

> **Status:** Approved at Phase 1; updated through Phase 5 · **Last updated:** 2026-10-11
> Contracts are designed before implementation. Endpoints marked **(implemented)** match the code and its tests; the rest are the designed contract for later phases. Zod schemas in `src/shared/schemas` and the route files are the source of truth for implemented endpoints.

---

## 1. Conventions

**Base path:** `/api/v1`. Auth endpoints live under `/api/auth/*` (Better Auth).

**Authentication:** session cookie set by Better Auth. Requests from the browser send it automatically (`credentials: "same-origin"`).

**Auth levels** (enforced by the route wrapper, then re-checked by service-layer policies):

| Level | Meaning |
|---|---|
| `public` | No session required |
| `user` | Signed in, email verified, not suspended |
| `courier` | `user` + courier profile `APPROVED` |
| `admin` | `user` + `role = ADMIN` |

**Requests**
- Mutations require `Content-Type: application/json` (else `415`) and a same-origin `Origin` header (else `403 FORBIDDEN`).
- Bodies are limited to 16 KB (`413`).
- Bodies are validated with strict schemas: **unknown fields are rejected** (`400`), which blocks mass-assignment attempts like sending `role` or `priceCents`.
- IDs are UUIDs; malformed IDs return `404` (not `400`) to avoid leaking validation detail on probing.

**Responses**
- Single resource: the JSON object. Lists: `{ "data": [...], "nextCursor": string | null }` with `?limit=` (default 20, max 50) and `?cursor=` (opaque).
- Money is always integer cents in fields ending in `Cents`. Currency is USD.
- Timestamps are ISO-8601 UTC strings.
- Every response carries `x-request-id`.

**Error envelope** (all non-2xx):

```json
{
  "error": {
    "code": "OFFER_UNAVAILABLE",
    "message": "This delivery was just taken by another courier.",
    "details": null,
    "requestId": "req_01J…"
  }
}
```

`details` holds field errors for `VALIDATION_ERROR` (`[{ "path": "quantity", "message": "Must be between 1 and 20" }]`) or a fresh quote for `PRICE_CHANGED`.

### Error codes

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Schema validation failed |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | `POST /orders` without a valid `Idempotency-Key` |
| 401 | `UNAUTHENTICATED` | No/expired session |
| 403 | `FORBIDDEN` | Signed in but lacks capability, or bad `Origin` |
| 403 | `EMAIL_NOT_VERIFIED`, `ACCOUNT_SUSPENDED` | Account state blocks the action |
| 403 | `COURIER_NOT_APPROVED`, `COURIER_OFFLINE` | Courier state blocks the action |
| 404 | `NOT_FOUND` | Missing **or not visible to this user** (no existence leak) |
| 409 | `INVALID_TRANSITION` | Status change not allowed by the state machine for this actor |
| 409 | `STALE_STATE` | Order changed since the client loaded it (CAS failed) — refetch |
| 409 | `OFFER_UNAVAILABLE` | Another courier accepted first, or the order left `READY_FOR_PICKUP` |
| 409 | `COURIER_HAS_ACTIVE_DELIVERY` | Courier already holds an active delivery |
| 409 | `CART_RESTAURANT_CONFLICT` | Adding an item from a different restaurant without `replaceCart: true` |
| 409 | `PRICE_CHANGED` | Client's displayed total ≠ server total; `details.quote` has the new quote |
| 409 | `ALREADY_REVIEWED`, `COURIER_APPLICATION_EXISTS` | Duplicate creation |
| 413 | `PAYLOAD_TOO_LARGE` | Body > 16 KB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Mutation without JSON content type |
| 422 | `CART_FULL` (more than 25 distinct lines), `CART_EMPTY`, `ITEM_UNAVAILABLE`, `RESTAURANT_CLOSED`, `INVALID_OPTIONS`, `BELOW_MINIMUM_SUBTOTAL`, `INVALID_LOCATION`, `TIP_OUT_OF_RANGE`, `CANNOT_ACCEPT_OWN_ORDER`, `IDEMPOTENCY_KEY_REUSED`, `REASON_REQUIRED`, `NOT_REVIEWABLE` | Business rule violations |
| 429 | `RATE_LIMITED` | With `Retry-After` header (seconds) |
| 500 | `INTERNAL_ERROR` | Unexpected; details only in logs |

**`/api/auth/*` codes** (Better Auth's `{ code, message }` body, see §3): `EMAIL_DOMAIN_NOT_ALLOWED`, `INVALID_NAME`, `PASSWORD_TOO_WEAK`, `PASSWORD_TOO_SHORT`, `PASSWORD_TOO_LONG` (400); `INVALID_EMAIL_OR_PASSWORD` (401); `EMAIL_NOT_VERIFIED`, `ACCOUNT_SUSPENDED` (403); `INVALID_TOKEN` (400, or as `?error=` on redirects).

**Admin denials:** the API answers `403 FORBIDDEN` to non-admins; admin *pages* answer `404` so the admin area isn't advertised.

### Rate limits

Fixed-window counters in Postgres, shared by all server instances (`src/server/rate-limit`). Subjects (IPs, emails) are stored as hashes. Limits throttle; they never lock an account. Per-IP limits are generous because many students share campus Wi-Fi NAT addresses; per-email limits protect individual accounts and inboxes.

| Scope | Limit | Status |
|---|---|---|
| Sign-in | 30 / min per IP **and** 10 / 15 min per email | Implemented |
| Sign-up | 20 / hour per IP **and** 5 / hour per email | Implemented |
| Password-reset request | 20 / hour per IP **and** 3 / hour per email | Implemented |
| Verification-email resend | 20 / hour per IP **and** 3 / hour per email | Implemented |
| Reset password / change password | 10 / 15 min per IP | Implemented |
| Other `/api/auth/*` | 120 / min per IP | Implemented |
| `PATCH /me` | 30 / min per user | Implemented |
| Everything under `/api/v1` (default) | 300 / min per IP | Implemented |
| `POST /orders` | 10 / min per user | Implemented |
| `POST /orders/{id}/transitions` | 60 / min per user | Implemented |
| Cart mutations and `POST /checkout/quote` | 120 / min per user | Implemented |
| Courier application, availability, decline | 60 / min per user | Implemented |
| Reviews | 10 / hour per user | Phase 6 |

`/api/health` is exempt (load-balancer polling; it runs only `select 1`).

---

## 2. Endpoint index

Implemented as of Phase 5: `GET /api/health`, `/api/auth/*`, `GET/PATCH /me`, `GET /locations`, everything in §5–8 except `POST /orders/{id}/review`, and from §10 `GET /admin/audit-events` and `GET /admin/kitchen`. The rest is the designed contract.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | public | Liveness + DB check |
| * | `/api/auth/*` | public | Better Auth (sign-up, sign-in, sign-out, session, verify, reset) |
| GET | `/me` | user | Current user + capabilities |
| PATCH | `/me` | user | Update profile |
| GET | `/restaurants` | public | List / search / filter |
| GET | `/restaurants/{slug}` | public | Detail + menu |
| GET | `/cuisines` | public | Filter options |
| GET | `/locations` | public | Campus drop points |
| GET | `/cart` | user | Cart with live quote |
| POST | `/cart/items` | user | Add item |
| PATCH | `/cart/items/{cartItemId}` | user | Change quantity |
| DELETE | `/cart/items/{cartItemId}` | user | Remove item |
| DELETE | `/cart` | user | Clear cart |
| POST | `/checkout/quote` | user | Full price breakdown for chosen location + tip |
| POST | `/orders` | user | Place order (idempotent) |
| GET | `/orders` | user | Own order history |
| GET | `/orders/{orderId}` | user | Order detail (projection depends on viewer) |
| POST | `/orders/{orderId}/transitions` | user | **Every** status change |
| POST | `/orders/{orderId}/review` | user | Rate a delivered order |
| POST | `/courier/application` | user | Apply to deliver |
| GET | `/courier/me` | user | Courier profile + status |
| PUT | `/courier/availability` | courier | Go online / offline |
| GET | `/courier/offers` | courier | Available deliveries (no PII) |
| POST | `/courier/offers/{orderId}/decline` | courier | Hide an offer |
| GET | `/courier/deliveries/active` | courier | Current delivery |
| GET | `/courier/deliveries` | courier | Delivery history |
| GET | `/courier/earnings` | courier | Simulated earnings + stats |
| GET | `/notifications` | user | Notification list |
| POST | `/notifications/mark-read` | user | Mark some/all read |
| GET | `/admin/metrics` | admin | Dashboard numbers |
| GET | `/admin/users` | admin | Search users |
| PATCH | `/admin/users/{userId}` | admin | Suspend / unsuspend |
| GET | `/admin/couriers` | admin | Courier applications & couriers |
| POST | `/admin/couriers/{courierId}/decision` | admin | Approve / reject / suspend / reinstate |
| GET, POST | `/admin/restaurants` | admin | List (incl. deleted) / create |
| PATCH, DELETE | `/admin/restaurants/{restaurantId}` | admin | Update / soft-delete |
| PUT | `/admin/restaurants/{restaurantId}/hours` | admin | Replace weekly hours |
| POST | `/admin/restaurants/{restaurantId}/menu-categories` | admin | Create category |
| PATCH, DELETE | `/admin/menu-categories/{categoryId}` | admin | Update / soft-delete |
| POST | `/admin/restaurants/{restaurantId}/menu-items` | admin | Create item |
| PATCH, DELETE | `/admin/menu-items/{menuItemId}` | admin | Update (incl. availability) / soft-delete |
| PUT | `/admin/menu-items/{menuItemId}/option-groups` | admin | Replace option tree |
| GET | `/admin/orders` | admin | Order list (filters; Kitchen Console queue) |
| GET | `/admin/audit-events` | admin | Audit log |
| POST | `/admin/demo/reset` | admin | Re-seed demo fixtures (non-production only) |

---

## 3. Health and auth

### `GET /api/health`
- **Response 200:** `{ "status": "ok", "db": "ok", "version": "<git sha>" }`; **503** with `"db": "error"` if the DB is unreachable. No secrets or config in the body.

### `/api/auth/*` — Better Auth 1.7.7 (implemented)

Served by Better Auth behind our wrapper (`src/server/auth/route-handler.ts`), which adds: same-origin check on every POST (including sign-in and sign-up, against login CSRF), JSON-only bodies (Better Auth also accepts form posts; we return `415`), the 16 KB limit, the rate limits above, request IDs, and logging that never records query strings or reset tokens.

**Error format differs from `/api/v1`:** Better Auth answers `{ "code": "...", "message": "..." }`. Errors raised by our wrapper (403 origin, 413, 415, 429) use the standard envelope. The browser client (`src/client/api.ts`) normalizes both.

| Method | Path | Purpose and behavior |
|---|---|---|
| POST | `/sign-up/email` | `{ name, email, password, callbackURL? }`. Email domain must be allowed (`400 EMAIL_DOMAIN_NOT_ALLOWED`); password must pass the policy (`400 PASSWORD_TOO_WEAK` / `PASSWORD_TOO_SHORT`); name 1–100 printable characters (`400 INVALID_NAME`). `role` is replaced with `STUDENT`; `suspendedAt` is refused. **Returns the same `200 { token: null, user }` for new and existing emails** (existing owners get a notice email). Sends a verification email. No session is created. |
| POST | `/sign-in/email` | `{ email, password }`. `200` + session cookie. `401 INVALID_EMAIL_OR_PASSWORD` for unknown email **or** wrong password (identical body). After a correct password: `403 EMAIL_NOT_VERIFIED` (and a new verification email) or `403 ACCOUNT_SUSPENDED`. |
| POST | `/sign-out` | Deletes the session row and clears the cookie. |
| GET | `/get-session` | Current session and user, or `null`. |
| GET | `/verify-email?token&callbackURL` | Verifies the address and redirects (`302`) to `callbackURL` (same-site only, else `403`). Does **not** sign the user in. Invalid/expired tokens redirect with `?error=`. |
| POST | `/send-verification-email` | `{ email, callbackURL? }`. Always `200 { status: true }` with a 500 ms minimum response time, whether or not the account exists. |
| POST | `/request-password-reset` | `{ email, redirectTo }`. Always `200` with the same message. `redirectTo` must be same-site (`403` otherwise). |
| GET | `/reset-password/:token?callbackURL` | Validates the token, then redirects to `callbackURL?token=…` (our `/reset-password` page) or `?error=INVALID_TOKEN`. |
| POST | `/reset-password` | `{ token, newPassword }`. Password policy applies. Token is single-use (`400 INVALID_TOKEN` on reuse). Revokes all of the user's sessions and emails a "password changed" notice. |
| POST | `/change-password` | Enabled (requires the current password and a session); password policy applies. No UI yet. |

**Session cookie:** `coogcrave.session_token` (prefixed `__Secure-` when served over HTTPS), httpOnly, `SameSite=Lax`, `Path=/`, `Max-Age` 7 days. Fixed lifetime: the session isn't extended by activity.

**Disabled endpoints (404):** `/update-user`, `/delete-user`, `/change-email`, `/list-sessions`, `/revoke-session(s)`, `/revoke-other-sessions`, `/link-social`, `/list-accounts`, `/unlink-account`, `/refresh-token`, `/get-access-token`, `/account-info`, `/sign-in/social`, `/callback/:id`, `/verify-password`, `/update-session`. Profile changes go through `PATCH /api/v1/me`.

---

## 4. Profile

### `GET /me` — user (implemented)
- Always the caller's own account; there is no user ID parameter.
- **Response 200**
```json
{
  "id": "…", "name": "Alex Rivera", "email": "alex@cougarnet.uh.edu",
  "emailVerified": true, "role": "STUDENT",
  "profile": { "displayName": "Alex", "defaultLocationId": "…" },
  "courier": { "id": "…", "status": "APPROVED", "isOnline": false } | null,
  "unreadNotifications": 2
}
```

### `PATCH /me` — user (implemented)
- **Request (strict):** `{ "displayName"?: string | null, "defaultLocationId"?: uuid | null }`, at least one field. `displayName` is trimmed, 1–60 characters, no control characters or `< >`; `null` clears it. Unknown fields (e.g. `role`) → `400`.
- **Response 200:** same as `GET /me`.
- **Errors:** `400 VALIDATION_ERROR`; `422 INVALID_LOCATION` (not an active drop point: unknown, soft-deleted, or pickup-only); `429`.
- **Side effects:** upsert `user_profiles` (row created on first save).

---

## 5. Catalog (public, implemented)

### `GET /restaurants`
- **Query (strict):** `q?` (≤ 60 chars; matches restaurant names, descriptions, and menu item names, case-insensitive, `%` and `_` matched literally), `cuisine?` (slug, repeatable up to 10; any of them), `openNow?` (`true` → only restaurants that can take an order now). Unknown parameters → `400`.
- **Response 200:** `{ "data": RestaurantSummary[] }`, restaurants that can take orders first, alphabetical within each group. **Not paginated:** a campus has tens of restaurants; revisit past ~100.
```json
{
  "id": "…", "slug": "the-burger-joint", "name": "The Burger Joint", "description": "…",
  "cuisines": [{ "slug": "burgers", "name": "Burgers" }],
  "location": { "id": "…", "name": "Retail, Auxiliary, and Dining (RAD) Center", "shortName": "RAD Center" },
  "isOpenNow": true, "closesAtMinute": 1260, "nextOpenAt": null,
  "isAcceptingOrders": true, "canOrder": true,
  "isSampleData": true, "matchingItems": ["Double cheeseburger"]
}
```
- `isOpenNow` comes from weekly hours in the campus time zone; `canOrder` = open **and** accepting orders. `closesAtMinute` is campus wall-clock minutes (0 = midnight). `nextOpenAt` is an ISO instant within the next week, or `null`. `matchingItems` lists up to three menu items that matched `q`.
- No images in the MVP (no `imagePath`); the UI never shows restaurant logos (THREAT_MODEL T-32).

### `GET /restaurants/{slug}`
- **Response 200:** RestaurantSummary plus `pickupNotes`, `timeZone`, `hours: [{ dayOfWeek, opensAtMinute, closesAtMinute }]`, and `menu: [{ categoryId, name, items: [{ id, name, description, priceCents, isAvailable, optionGroups: [{ id, name, minSelect, maxSelect, options: [{ id, name, priceDeltaCents, isAvailable }] }] }] }]`. Unavailable items and options are listed (shown disabled); deleted ones are not.
- **Errors:** `404` (unknown, malformed, or soft-deleted).

### `GET /cuisines` → `{ "data": [{ "slug", "name" }] }`, only cuisines at least one active restaurant has
### `GET /locations` (implemented) → `{ "data": [{ "id", "name", "shortName", "description" }] }`, active drop points in display order

---

## 6. Cart — user (implemented)

All cart responses return the **CartView**, with prices computed live from the current menu (carts store no prices):

```json
{
  "restaurant": { "id": "…", "slug": "…", "name": "…", "isOpenNow": true, "isAcceptingOrders": true } | null,
  "items": [{
    "id": "…", "menuItemId": "…", "name": "Double cheeseburger", "quantity": 2,
    "unitPriceCents": 899, "optionsTotalCents": 150, "lineTotalCents": 2098,
    "options": [{ "id": "…", "group": "Add-ons", "name": "Bacon", "priceDeltaCents": 150 }],
    "specialInstructions": "No onions",
    "problems": []             // "ITEM_UNAVAILABLE" | "INVALID_OPTIONS"
  }],
  "itemCount": 2,
  "subtotalCents": 2098,
  "minSubtotalCents": 500,
  "canCheckout": true,
  "problems": []               // "RESTAURANT_CLOSED" | "ITEM_PROBLEMS" | "BELOW_MINIMUM_SUBTOTAL"
}
```

An empty cart is `{ restaurant: null, items: [], itemCount: 0, subtotalCents: 0, minSubtotalCents: null, canCheckout: false, problems: [] }`; removing the last line deletes the cart.

### `GET /cart` → **200** CartView.

### `POST /cart/items`
- **Request (strict):** `{ "menuItemId": uuid, "quantity": 1–20, "optionIds"?: uuid[] (≤ 20), "specialInstructions"?: string ≤ 140 (no `< >` or control characters; blank → null), "replaceCart"?: boolean }`. Any other field (e.g. a price) → `400`.
- **Response 201:** CartView.
- **Errors:** `404` item (unknown or deleted); `409 CART_RESTAURANT_CONFLICT` with `details.currentRestaurant { name, slug }` (cart holds another restaurant and `replaceCart` isn't true); `422 ITEM_UNAVAILABLE`; `422 INVALID_OPTIONS` (option not on this item, unavailable, duplicated, or a group's min/max violated; `details` lists every problem with a message); `422 CART_FULL`.
- **Side effects:** creates the cart (concurrent first adds are safe: `ON CONFLICT` + row lock); replaces it when `replaceCart: true`. An identical item with identical options and note merges quantities (capped at 20). Adding is allowed while the restaurant is closed (the cart reports `RESTAURANT_CLOSED`); the UI only offers it while open.

### `PATCH /cart/items/{cartItemId}`
- **Request:** `{ "quantity": 1–20 }` → **200** CartView. **Errors:** `404` (not in the caller's cart).

### `DELETE /cart/items/{cartItemId}` → **200** CartView (`404` if not the caller's) · `DELETE /cart` → **200** empty CartView.

---

## 7. Checkout and orders

### `POST /checkout/quote` — user (implemented)
- **Request:** `{ "deliveryLocationId": uuid, "tipCents": 0–max }`
- **Response 200:**
```json
{
  "lines": [ /* CartView items */ ],
  "restaurant": { /* CartView restaurant */ },
  "subtotalCents": 2098, "deliveryFeeCents": 249, "serviceFeeCents": 105,
  "taxCents": 182, "tipCents": 300, "totalCents": 2934,
  "taxIsSample": true, "paymentMode": "DEMO", "maxTipCents": 5000,
  "canPlaceOrder": true, "problems": []
}
```
- **Errors:** `422 CART_EMPTY`, `INVALID_LOCATION`, `TIP_OUT_OF_RANGE`. Item/restaurant problems are reported in `problems` (not as errors) so the page can show them inline.
- **Side effects:** none.

### `POST /orders` — user (implemented)
- **Headers:** `Idempotency-Key: <uuid>` (required; generated once per checkout attempt and reused on retries).
- **Request:** `{ "deliveryLocationId": uuid, "deliveryInstructions"?: string ≤ 280, "tipCents": int, "expectedTotalCents": int }`
- **Response 201:** OrderDetail (customer projection, §7.1). On idempotent replay: **200** with the original order and header `Idempotent-Replayed: true`.
- **Errors:** `400 IDEMPOTENCY_KEY_REQUIRED`; `409 PRICE_CHANGED` (`details.quote`); `422 CART_EMPTY`, `ITEM_UNAVAILABLE`, `RESTAURANT_CLOSED`, `BELOW_MINIMUM_SUBTOTAL`, `INVALID_LOCATION`, `TIP_OUT_OF_RANGE`, `IDEMPOTENCY_KEY_REUSED`; `429`.
- **Side effects (one transaction, cart row locked):** order + item/option snapshots; status event (`→ PLACED`, actor `CUSTOMER`); `payments` row (`DEMO`, `AUTHORIZED`, reference `demo_pi_…`); notification `ORDER_PLACED`; cart deleted. Order numbers are `CC-` plus 6 Crockford base-32 characters (no I, L, O, U), random, retried on collision inside a savepoint.
- **Idempotency:** the request hash is SHA-256 of `[deliveryLocationId, deliveryInstructions, tipCents, expectedTotalCents]`. A failed attempt stores nothing, so the same key can be retried after fixing the problem. Simultaneous identical requests: the cart lock serializes them and later ones replay the first order (tested with 5 at once).
- **Not yet:** `DEMO_AUTO_ADVANCE` (applying T1/T3 automatically after placement) arrives with the demo tooling in Phase 6.
- **Never trusted from the client:** prices, fees, tax, totals, restaurant, items (taken from the server-side cart).

### `GET /orders` — user (implemented)
- **Query (strict):** `scope=active|past` (default all), `limit` 1–50 (default 20), `cursor`.
- **Response 200:** `{ "data": [{ "id", "orderNumber", "restaurantName", "status", "totalCents", "itemCount", "createdAt" }], "nextCursor" }`, newest first — **only the caller's own orders**. Same microsecond keyset cursor as the audit log.

### `GET /orders/{orderId}` — user (implemented: customer and courier projections)

The customer who placed the order gets the customer projection (now including `courier: { firstName, transportMode } | null`). The courier who holds the delivery, or whose delivery ended within the last 24 hours, gets the courier projection: `{ viewer: "COURIER", id, orderNumber, status, version, restaurant { name, pickupLocation, pickupNotes }, items [{ name, quantity, options[], specialInstructions }], deliveryLocation, deliveryInstructions (null once the delivery ends), customerName ("Alex R." or their display name), timeline [{ status, at }], assignment { assignedAt, pickedUpAt, endedAt, endReason }, payoutCents, payoutIsSimulated, allowedTransitions }` — no prices except the simulated payout, no email, no full name. Everyone else, including couriers who only saw it as an offer, gets `404`. The admin projection arrives in Phase 6.

#### 7.1 Projections

The service picks the projection from the viewer's relationship to the order; anyone else gets `404`.

| Field | Customer (owner) | Assigned courier | Admin |
|---|---|---|---|
| `id`, `orderNumber`, `status`, `restaurant` (name, pickup location), `items` (names, quantities, options) | ✓ | ✓ | ✓ |
| `timeline` (status events: status, at, actorType) | ✓ | ✓ | ✓ + actor user + reason |
| Price breakdown | ✓ | payout only (simulated) | ✓ |
| `deliveryLocation` | ✓ | ✓ | ✓ |
| `deliveryInstructions` | ✓ | ✓ while active and ≤ 24 h after | ✓ |
| Customer name | — | first name + last initial | full name + email |
| Courier | first name + transport mode, once assigned | — | full + assignment history |
| `payment` (provider, status) | `mode: "DEMO"` | — | ✓ |
| `review` | ✓ | rating only | ✓ |
| `allowedTransitions` | ✓ | ✓ | ✓ |

`allowedTransitions` lists what *this* viewer may do next (e.g., `["CANCELLED"]` for a customer on a `PLACED` order) so the UI shows only valid buttons. The server still re-checks on submit.

Couriers who are not assigned see an order only through `/courier/offers` (offer projection). After they release or the assignment ends + 24 h, `GET /orders/{id}` returns the courier projection without instructions, and later `404`.

### `POST /orders/{orderId}/transitions` — user (implemented)

The single endpoint for every status change (see `ARCHITECTURE.md` §6, transitions T1–T11). The server works out who the caller is to the order: an admin with `actingAs: "RESTAURANT_SIM"` is the simulated restaurant (Kitchen Console; the response is the kitchen view); the order's customer is `CUSTOMER`; a courier is `COURIER` (accepting an offer, or moving their own delivery along); anyone else gets `404`. Admin actions as `ADMIN` (T6, T7, T9, T11 resolutions) are applied by the same referee and arrive in the UI in Phase 6.

- **Request:** `{ "toStatus": OrderStatus, "reason"?: string ≤ 300, "actingAs"?: "RESTAURANT_SIM", "expectedVersion"?: int }`
  - `actingAs: "RESTAURANT_SIM"` is accepted **only** from admins (Kitchen Console). Otherwise the actor type is derived from the caller's relationship: owner → `CUSTOMER`, courier → `COURIER`, admin → `ADMIN`.
  - `expectedVersion` (optional) turns any concurrent change into `409 STALE_STATE`; without it, the CAS on the from-status still prevents illegal interleavings.
- **Response 200:** OrderDetail for the caller's projection.
- **Errors:** `404` (including a courier who isn't approved trying anything except accepting); `403 COURIER_NOT_APPROVED` (accepting without approval), `COURIER_OFFLINE`, `FORBIDDEN` (non-admin sending `actingAs`); `409 INVALID_TRANSITION`, `STALE_STATE`, `OFFER_UNAVAILABLE`, `COURIER_HAS_ACTIVE_DELIVERY`; `422 REASON_REQUIRED`, `CANNOT_ACCEPT_OWN_ORDER`; `429`.
- **Side effects:** as listed per transition in the architecture table — status event, notifications, assignment create/release/complete, simulated payment void/capture, payout fixed on delivery, audit event for admin/kitchen actions.
- **Idempotency:** a courier re-sending `ASSIGNED` for an order they already hold gets `200` with the current state; other repeats of an already-applied transition return `409 INVALID_TRANSITION` with the current status in `details`, which clients treat as "already done."

Examples:

| Who | Request body |
|---|---|
| Courier accepts offer | `{ "toStatus": "ASSIGNED" }` |
| Courier picked up | `{ "toStatus": "PICKED_UP" }` |
| Courier delivered | `{ "toStatus": "DELIVERED" }` |
| Courier releases before pickup | `{ "toStatus": "READY_FOR_PICKUP", "reason": "Class ran late" }` |
| Customer cancels | `{ "toStatus": "CANCELLED" }` |
| Kitchen Console confirm | `{ "toStatus": "CONFIRMED", "actingAs": "RESTAURANT_SIM" }` |
| Admin resolves problem | `{ "toStatus": "CANCELLED", "reason": "Restaurant out of stock" }` |

### `POST /orders/{orderId}/review` — user (Phase 6)
- **Request:** `{ "rating": 1–5, "comment"?: string ≤ 500 }`
- **Response 201:** `{ "id", "rating", "comment", "createdAt" }`
- **Errors:** `404` (not the caller's order); `409 ALREADY_REVIEWED`; `422 NOT_REVIEWABLE` (status ≠ `DELIVERED`).
- **Side effects:** insert `reviews` (unique per order).

---

## 8. Courier (implemented)

Routes marked *courier* need an approved courier profile (`403 COURIER_NOT_APPROVED` otherwise, whatever the role). Approval itself is an admin action (Phase 6); the demo seed provides an approved courier.

### `POST /courier/application` — user
- **Request:** `{ "transportMode": "WALK" | "BIKE" | "SCOOTER", "acceptGuidelines": true }`
- **Response 201:** `{ "id", "status": "PENDING", "appliedAt" }`
- **Errors:** `409 COURIER_APPLICATION_EXISTS` (pending or approved); a `REJECTED` applicant may re-apply (row returns to `PENDING`); `403 ACCOUNT_SUSPENDED`.
- **Side effects:** upsert `courier_profiles`.

### `GET /courier/me` — user → courier profile or `404` if never applied.

### `PUT /courier/availability` — courier
- **Request:** `{ "online": boolean }` → **200** `{ "isOnline", "onlineSince" }`.
- Going offline doesn't affect an active delivery; it only hides new offers.

### `GET /courier/offers` — courier (must be online)
- **Response 200:** list of offer projections, oldest-ready first:
```json
{
  "orderId": "…", "restaurantName": "…", "pickupLocation": "Student Center South",
  "dropLocation": "MD Anderson Library", "itemCount": 3,
  "readySince": "…", "estimatedPayoutCents": 549, "payoutIsSimulated": true
}
```
- Excludes: orders declined by this courier and the courier's own orders. **No customer name, instructions, or prices beyond payout.**
- **Errors:** `403 COURIER_OFFLINE`, `COURIER_NOT_APPROVED`.

### `POST /courier/offers/{orderId}/decline` — courier → **204** (idempotent). `404` unless the order is currently an offer (ready, not the courier's own). Accepting is a transition (`toStatus: "ASSIGNED"`). A courier who gives a delivery back (T7) is also recorded as having declined it, so it doesn't come back to them.

### `GET /courier/deliveries/active` — courier → courier projection of the active order, or `204` when none.

### `GET /courier/deliveries` — courier → `{ "data": [...] }` (query `limit` 1–50, default 20), newest first, list of `{ "orderId", "orderNumber", "restaurantName", "dropLocation", "assignedAt", "endedAt", "endReason", "payoutCents" }`.

### `GET /courier/earnings` — courier
- **Response 200:** `{ "simulated": true, "todayCents", "weekCents", "allTimeCents", "completedDeliveries", "averageRating": number | null, "ratingsCount" }`. "Today" and "this week" (Monday start) are in the campus time zone. `averageRating` stays `null` until reviews exist (Phase 6).

---

## 9. Notifications — user

### `GET /notifications`
- **Query:** `unreadOnly?`, `limit`, `cursor` → list of `{ "id", "type", "title", "body", "orderId", "readAt", "createdAt" }`; response also includes `unreadCount`.

### `POST /notifications/mark-read`
- **Request:** `{ "ids": uuid[] (1–50) }` or `{ "all": true }` → **204**. Only the caller's notifications are affected.

---

## 10. Admin — admin

### `GET /admin/kitchen` (implemented) → `{ "data": KitchenOrderView[] }`
Orders in `PLACED`, `CONFIRMED`, or `READY_FOR_PICKUP`, oldest first (≤ 100): `{ id, orderNumber, status, version, restaurantName, placedAt, statusUpdatedAt, dropLocation, items [{ name, quantity, options[], specialInstructions }] }`. No customer details. Actions go through `POST /orders/{id}/transitions` with `actingAs: "RESTAURANT_SIM"`; each writes an audit event `order.kitchen_<status>` naming the admin.

All admin mutations write an `audit_events` row (actor, action, target, before/after of changed fields, reason, request ID).

### `GET /admin/metrics`
`{ "ordersToday": { "PLACED": n, …, "DELIVERED": n }, "onlineCouriers": n, "pendingApplications": n, "simulatedGmvTodayCents": n, "activeDeliveries": n }`

### `GET /admin/users?q=&role=&suspended=` → list of `{ "id", "name", "email", "role", "emailVerified", "suspendedAt", "courierStatus", "createdAt" }`

### `PATCH /admin/users/{userId}`
- **Request:** `{ "suspended": boolean, "reason": string 1–300 }` → **200** user.
- **Errors:** `422` when targeting self or another admin.
- **Side effects:** set/clear `suspended_at`; on suspend, delete all sessions and set courier offline; audit `user.suspend|unsuspend`.
- Changing roles is **not** supported via the API.

### `GET /admin/couriers?status=PENDING` → list of courier profiles with user name/email.

### `POST /admin/couriers/{courierId}/decision`
- **Request:** `{ "decision": "APPROVE" | "REJECT" | "SUSPEND" | "REINSTATE", "note"?: string ≤ 500 }`
- Valid from-states: `APPROVE`/`REJECT` from `PENDING`; `SUSPEND` from `APPROVED`; `REINSTATE` from `SUSPENDED`. Otherwise `409 INVALID_TRANSITION`.
- **Side effects:** status, `reviewed_at/by`, `review_note`; suspend forces offline; notification `COURIER_APPLICATION_DECIDED`; audit.

### Restaurants and menus
- `GET /admin/restaurants?includeDeleted=` · `POST /admin/restaurants` — `{ name, slug, description?, locationId, cuisineSlugs[], imagePath?, pickupNotes?, isAcceptingOrders }` → **201**; `409` on duplicate slug.
- `PATCH /admin/restaurants/{id}` — any subset of the create fields → **200**.
- `DELETE /admin/restaurants/{id}` — soft delete → **204**; `409` if it has non-terminal orders.
- `PUT /admin/restaurants/{id}/hours` — `{ "hours": [{ dayOfWeek, opensAtMinute, closesAtMinute }] }` replaces the week; overlapping ranges → `400`.
- `POST /admin/restaurants/{id}/menu-categories` — `{ name, sortOrder? }` · `PATCH`/`DELETE /admin/menu-categories/{id}`.
- `POST /admin/restaurants/{id}/menu-items` — `{ categoryId, name, description?, priceCents, imagePath?, isAvailable, sortOrder? }` (category must belong to the restaurant → else `422`).
- `PATCH /admin/menu-items/{id}` — subset incl. `isAvailable`, `priceCents`. Price changes never alter existing orders (snapshots).
- `DELETE /admin/menu-items/{id}` — soft delete; existing carts containing it show `ITEM_UNAVAILABLE`.
- `PUT /admin/menu-items/{id}/option-groups` — full option tree `[{ id?, name, minSelect, maxSelect, options: [{ id?, name, priceDeltaCents, isAvailable }] }]`; omitted existing groups/options are soft-deleted.

### `GET /admin/orders`
- **Query:** `status?` (repeatable), `restaurantId?`, `q?` (order number / customer email), `limit`, `cursor`.
- Kitchen Console uses `status=PLACED&status=CONFIRMED` and the transitions endpoint with `actingAs: "RESTAURANT_SIM"`. Order detail uses `GET /orders/{id}` (admin projection).

### `GET /admin/audit-events` — admin (implemented)
- **Query (strict):** `limit` 1–50 (default 20), `cursor?` (opaque), `targetType?`, `targetId?`, `actorUserId?` (uuid). Unknown parameters → `400`.
- **Response 200:** newest first, ties broken by ID:
```json
{
  "data": [{
    "id": "uuid", "createdAt": "ISO-8601",
    "actorType": "ADMIN|SYSTEM",
    "actor": { "id": "uuid", "name": "…", "email": "…" } | null,
    "action": "user.create_admin", "targetType": "user", "targetId": "uuid",
    "metadata": { }, "requestId": "…" | null
  }],
  "nextCursor": "opaque" | null
}
```
- The cursor carries the row's microsecond timestamp, so rows written in the same millisecond are never skipped or repeated. A malformed cursor → `400`.
- Rows are append-only: the app's database role has no `UPDATE`/`DELETE` on `audit_events`. `SYSTEM` rows (e.g. from `pnpm admin:create`) have `actor: null` and a label in `metadata.via`.

### `POST /admin/demo/reset`
- **Available only when** `APP_ENV ≠ production` **and** `DEMO_RESET_ENABLED=true`; otherwise **404** (the endpoint behaves as if it doesn't exist).
- **Request:** `{ "confirm": "RESET DEMO DATA" }`
- **Response 200:** `{ "resetAt", "fixtures": { "restaurants": n, "accounts": n } }`
- **Side effects:** deletes orders/carts/notifications/reviews/assignments for demo accounts, restores demo fixtures to their initial state, writes audit event `demo.reset`. Never touches non-demo accounts.
