# Shipment safety: traceability, evidence and early warnings

Four features, built into the existing marketplace (same login, same database, same notification bell, same dashboard):

1. a **unique shipment ID and QR code** for every deal, with a recorded history of who did what and when;
2. a **status lifecycle with timestamps**, with invalid updates refused;
3. **buyer confirmation with a one-time code and delivery photos**;
4. **alerts** for delays, quantity mismatches, damage and failed verification.

**What this is not.** It does not make delivery safe. It makes a delivery *traceable* (who recorded what, when), *evidenced*
(photos, quantities, a code only the buyer receives) and *monitored* (rules that warn early). When something goes wrong
it gives all sides the same facts. Nothing here replaces insurance, a reliable carrier or a legal process.

## How it fits the project

| Piece | Where |
|---|---|
| A shipment is created when a farmer accepts a bid | `routes/bids.js` calls `services/shipmentService.ensureShipmentForTransaction` |
| The old "Mark dispatch" button releases the shipment for pickup | `routes/transactions.js` (`mark-dispatch`) |
| The old delivery-code route is now the shipment confirmation | `routes/transactions.js` (`complete-delivery` wraps `confirmDelivery`) |
| Payout is released only when the delivery is confirmed and nothing is in dispute | `shipmentService.syncTransaction` |
| Alerts show in the existing notification list **and** as a banner at the top of the dashboard | `lib/helpers.createNotification`, `ShipmentAlertsBanner` |
| New **Transporter** role (sign up, log in, own Shipments tab) | `routes/auth.js`, `TopNav` |
| New tab **Shipments** for farmers, buyers and transporters | `components/Shipments/` |

Code layout: pure rules (no database) in `server/lib/shipment*.js`, `deliveryOtp.js`, `tracking.js`, `qr.js`; database work in
`server/services/shipment*.js`; HTTP in `server/routes/shipments.js`; screens in `agribid/src/components/Shipments/`.

## Feature 1: shipment ID and QR code

* **ID**: `SHP-YYYYMMDD-XXXXXXXX` (8 random characters from a 31-symbol alphabet without look-alikes: 0, O, 1, I, L).
  Random, not sequential, with a unique index; a collision is retried.
* **QR code**: generated on the server (`lib/qr.js`, no new dependency) and drawn as SVG in the browser. It contains **only a link**
  (`<PUBLIC_APP_URL>/#/shipment/<ID>`): an identifier, never a secret, token or code.
* **Who can open it**: scanning the QR (with the phone camera, or the in-app scanner where the browser supports it) opens the app.
  The page needs a login **and** a place on the shipment: the farmer, the buyer, the assigned transporter, or an admin.
  Everyone else gets the same `404 Shipment not found` as for an ID that does not exist, so IDs cannot be probed.
* **What is stored** (`Shipment`): the deal's parties, a snapshot of crop, dispatched quantity, origin and destination, status,
  expected delivery time, last position, and an **append-only event log**: pickup, transit checkpoints, delivery attempts,
  receipt confirmations, damage reports, photos, code events, alerts. Every event has a time, the role and name of the
  person who recorded it (`farmer`, `buyer`, `transporter`, `farmer (delivering)`, `admin`, `system`) and an optional location.
  Events are never edited or deleted by any endpoint.

## Feature 2: status lifecycle

Statuses: Created, Ready for Pickup, Picked Up, In Transit, Delayed, Out for Delivery, Delivered, Delivery Failed, Damage Reported,
Under Investigation.

```
created -> ready_for_pickup -> picked_up -> in_transit -> out_for_delivery -> delivered   (delivered: only via the buyer's code)
                 \-> delayed <-> (picked_up | in_transit | out_for_delivery)
out_for_delivery -> delivery_failed -> out_for_delivery (retry) | under_investigation
any moving status or delivered -> damage_reported -> under_investigation -> (delivered | in_transit | out_for_delivery | delivery_failed)
```

* The full table, with **who may make each move**, is `TRANSITIONS` in `server/lib/shipmentLifecycle.js` and is tested
  for every pair. Skipping a step, repeating a status, or the wrong role is refused (`409` or `403`).
* "Delivered" can **never** be set by a status update, not even by an admin: it requires the buyer's one-time code. (An admin can close an
  investigation as delivered.) After delivery a shipment cannot go back on the road.
* "Ready for pickup" needs confirmed payment. "Delayed", "Delivery failed", "Damage reported" and "Under investigation" need a written reason.
* Two people changing a shipment at once: one wins, the other gets `409` and reloads (optimistic concurrency).
* **Screens**: status badge, a progress bar, the chronological timeline with times and actors, and the latest status for farmers,
  buyers and transporters (the page refreshes every 30 seconds).
* **Tracking, honestly labelled.** Every position has a source. The screen says **LIVE** only for a GPS fix taken by the carrier's phone
  in the last 15 minutes, with the user's permission. A typed position is labelled "Manual update (not live)". A demo position is labelled
  **SIMULATED** and is refused by the server in production (unless `TRACKING_ALLOW_SIMULATION=true`). The server also refuses
  GPS fixes older than 10 minutes, from the future, or with accuracy worse than 2 km. With no position at all the screen says
  that updates are entered by hand. (A server cannot prove a GPS fix is genuine; it can only refuse impossible ones and never mislabel.)

## Feature 3: delivery confirmation

* The code is issued when the carrier sets the shipment "Out for delivery" (and again when the buyer asks for a new one).
  6 digits from `crypto.randomInt`, valid **60 minutes**, **single use**.
* **Stored only as an HMAC** (server secret + shipment ID + code): a leaked database reveals no live codes, and a code from one
  shipment is useless on another.
* **Delivery channel**: e-mail through the configured provider (Brevo or Resend, see `docs/PAYMENTS_AND_OTP.md`).
  **If no provider is configured** the code can only be obtained by the buyer, in the response to their own request, and only in
  development or when `EXPOSE_DELIVERY_OTP_IN_RESPONSE=true`; the screen labels it "DEVELOPMENT MODE". In production without an e-mail
  service the code is **never** revealed (the buyer is told it could not be delivered).
* The code is **never** returned to the carrier or farmer, **never** put in a notification, event, alert or log, and never sent in the
  shipment view (only `codeActive: true/false`, and for the buyer the expiry and attempts left).
* **Checks on the server**: the right person (the buyer only), the right state (out for delivery), a well-formed code, not expired, not locked,
  not used before. Every wrong guess is counted **atomically before it is checked**, so parallel requests cannot get free tries.
  5 wrong codes burn the code and **lock confirmation for 15 minutes**; there is also a per-user limit of 10 confirmation attempts per
  15 minutes and a cooldown (60 s) and cap (5) on re-sends. Replaying a used code gets `409 already_confirmed`.
* **The buyer states the quantity actually received** and the condition (fine / damaged / missing items, with a description). The server
  records receipt time, quantity, condition and who confirmed.
* **Photos**: JPEG, PNG or WebP only, judged by their **bytes** (not file name or declared type), max 2 MB (`SHIPMENT_PHOTO_MAX_BYTES`),
  max 10 per shipment. The browser shrinks phone photos first. Stored in their own collection under a random id; the name the phone gave
  is never used; downloads need a login and a place on the shipment, are sent as `private, no-store` with the detected type and a
  generated file name. Photo URLs are API paths that need the login: there are no public or shareable file links.
* **Failed and disputed deliveries**: the carrier records a failed attempt with a reason (attempts are counted and visible); the shipment
  can be retried or investigated. A shortfall or damage at the door still records the delivery but **holds the payout** until the buyer
  (or an admin) resolves the alert.

## Feature 4: alerts

| Alert | Raised when (all thresholds configurable) | Severity |
|---|---|---|
| **Delay** | now is later than the expected delivery time plus a grace period (default 60 min) while not delivered; **or** no tracking update for 12 h while on the road; **or** 60% of the window has passed and the shipment has still not been picked up | warning; critical when 12 h or more late |
| **Quantity mismatch** | buyer-confirmed quantity differs from the dispatched quantity by more than the tolerance (default 2% or 0.5 kg, whichever is larger), short or over | warning; critical from 10% |
| **Damage or missing goods** | anyone on the shipment reports it (buyer within 48 h after delivery) | warning; critical when the affected share is 25% or more |
| **Delivery verification failed** | 3 wrong codes (warning), 5 or a lock (critical) | warning / critical |

* Every alert stores its **type, shipment ID, time, severity, status, the rule that fired, a plain-language reason and the numbers behind it**
  (shown in the screen: "Why you are seeing this", and "Show the numbers behind it"). The same reason is sent in the notification.
* **Statuses**: open, acknowledged, investigating, resolved. Everyone on the shipment can acknowledge and add investigation notes.
  **Who may resolve**: delay and verification alerts: the farmer, the carrier or an admin; quantity and damage alerts: the buyer or an admin
  (the seller cannot close the buyer's complaint). Resolving needs a written note. Every step is kept in the alert's history.
* **Avoiding duplicates and false alarms**: a database rule allows one open alert per cause (so two servers or two requests cannot raise the same
  alert twice); checking again changes nothing; getting worse **escalates** the same alert (one more notification) instead of adding another;
  an alert resolved less than 6 hours ago is not re-raised for the same cause; delay and verification alerts **close themselves** when the cause
  is gone (new estimate, delivered); a grace period avoids alerts for tiny lateness; delivered shipments are never "late".
* **When it runs**: right after any status change, receipt, damage report or wrong code; whenever a shipment is opened (at most once a minute);
  and every 10 minutes by a background sweep (`ALERT_SWEEP_INTERVAL_MINUTES`, 0 turns it off). The on-open check means alerts stay correct on hosts
  that go to sleep.
* **Where it shows**: the existing notification list (type `alert`), a banner at the top of the dashboard, and the Shipments tab.

## Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PUBLIC_APP_URL` | first `CORS_ORIGINS` entry, else `http://localhost:3000` | base of the link inside the QR code |
| `SHIPMENT_ADMIN_EMAILS` | none | comma-separated e-mails of people who may see and resolve any shipment |
| `DELIVERY_OTP_TTL_MINUTES` | 60 | how long a delivery code works |
| `DELIVERY_OTP_MAX_ATTEMPTS` / `DELIVERY_OTP_LOCK_MINUTES` | 5 / 15 | wrong guesses before the lock, and how long it lasts |
| `DELIVERY_OTP_RESEND_COOLDOWN_SECONDS` / `DELIVERY_OTP_MAX_ISSUES` | 60 / 5 | re-send limits |
| `DELIVERY_CONFIRM_RATE_LIMIT_MAX` | 10 per 15 min per user | extra brake on confirmation attempts |
| `EXPOSE_DELIVERY_OTP_IN_RESPONSE` | true only in development without e-mail | echo the code to the requesting buyer (demo) |
| `SHIPMENT_PHOTO_MAX_BYTES` | 2097152 | largest photo |
| `TRACKING_ALLOW_SIMULATION` | false in production | allow SIMULATED positions |
| `ALERT_DELAY_GRACE_MINUTES` / `ALERT_DELAY_CRITICAL_HOURS` / `ALERT_STALE_HOURS` / `ALERT_AT_RISK_FRACTION` | 60 / 12 / 12 / 0.6 | delay rules |
| `ALERT_QUANTITY_TOLERANCE_PERCENT` / `ALERT_QUANTITY_MIN_TOLERANCE_KG` / `ALERT_QUANTITY_CRITICAL_PERCENT` | 2 / 0.5 / 10 | quantity rule |
| `ALERT_DAMAGE_CRITICAL_PERCENT` / `ALERT_DAMAGE_WINDOW_HOURS` | 25 / 48 | damage rule |
| `ALERT_OTP_WARN_FAILURES` / `ALERT_OTP_CRITICAL_FAILURES` | 3 / 5 | verification rule |
| `ALERT_RESOLVED_COOLDOWN_HOURS` | 6 | no repeat of an alert resolved this recently |
| `ALERT_SWEEP_INTERVAL_MINUTES` | 10 | background re-check (0 = off) |

The defaults are reasonable guesses, not measured values. Adjust them after a pilot, and write down what you chose and why.

## API summary (all need a login)

`GET /api/shipments` | `GET /api/shipments/by-transaction/:transactionId` | `GET /api/shipments/:code` | `GET /api/shipments/:code/qr` |
`POST /api/shipments/:code/status` | `POST .../checkpoints` | `PUT .../carrier` | `POST .../delivery-code` | `POST .../confirm-delivery` |
`POST .../issues` | `POST .../photos?kind=` (raw image body) | `GET .../photos/:photoId` | `GET /api/shipment-alerts` |
`POST /api/shipment-alerts/:id/(acknowledge|investigate|resolve)`

## Known limits (please keep them in the report)

* The delivery code is e-mailed to the **buyer** and entered by the buyer. It proves the buyer controls their e-mail at confirmation time, not
  that they physically hold the goods; the photos, timeline and carrier checkpoints are the evidence for that. A stronger design has the
  carrier enter the code the buyer reads out at the door; the data model supports it, the screens do not yet.
* Without an e-mail provider the delivery code cannot reach the buyer in production. Configure one before any real use.
* GPS positions are reported by the carrier's phone and cannot be verified by the server. There is no continuous live tracking: positions arrive
  when the carrier updates them. There are no map tiles; the screen links to OpenStreetMap.
* Photos live in MongoDB (fine for a project, not for large scale: use object storage and virus scanning then). They are not re-encoded.
* There is no admin screen: an admin (from `SHIPMENT_ADMIN_EMAILS`) uses the same Shipments tab with wider access.
* The alert thresholds are not calibrated on real deliveries.
* Notifications are in-app (and the delivery code by e-mail). There is no SMS or push.
* The camera QR scanner works only where the browser offers `BarcodeDetector` over https; typing the code always works.

## Testing

* Pure rules: `server/test/shipmentLifecycle|Rules|Engine|deliveryOtp|shipmentFiles|tracking|shipmentAccess|shipmentIds|qr.test.js`.
* The QR encoder was decoded successfully by two independent readers (OpenCV and a ZXing-style decoder) for 180 codes over versions 1 to 10 and all eight masks.
* `shipmentFlow.test.js` runs the whole service (create, track, deliver, brute force, alerts, payout hold and release) against an in-memory stand-in for MongoDB.
* `shipments-api.test.js` repeats the key paths over HTTP against a real MongoDB; `e2e/tests/shipments.spec.js` drives a browser through the buyer, farmer and transporter journeys.
