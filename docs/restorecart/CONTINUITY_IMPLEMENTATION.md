# Five-step continuity release

Implemented locally on 29 October 2026. The current directory remains named ScrapDrop; the separate RestoreCart application and database are preserved.

## Seller flow

Upload records → preview/map unfamiliar CSV headers → reconstruct with explicit parsing or configured Gemini → answer only the saved product's unresolved questions → confirm physical counts and emergency allocations → publish → take PayPal sandbox orders → fulfill/refund → close checkouts → compare/apply a local return → download the updated original-store file.

The full catalog editor is optional. Physical allocation has one confirmation path; the publishing page displays the saved counts and timestamps. Published shops retain their own contact snapshot until the seller republishes.

## 1. Recovery readiness and mapping

`server/restorecart/continuity.ts` builds Ready / Needs information / Excluded from required identity, valid USD price, seller confirmation, positive allocation, a count matching that allocation, photo confirmation when an image is suggested, and a resolution note when prices conflict. These are data/stock readiness checks, not a certification that products are safe or lawful.

A count records physical quantity, reserved allocation and server time. Counts older than seven days carry a recount recommendation. Source uploaded time and optional seller-provided record time are separate. An old shop without count metadata stays public, but requires confirmation before it can be republished.

CSV mappings preserve original bytes and evidence. Column selections must belong to the file and use distinct headers; SKU and name are required. The preview shows sample rows and the number of recognized records. Rows without usable identity require correction/manual entry; the importer does not invent SKUs. The mapping and source date enter the AI cache key.

## 2. Focused reconstruction

Gemini receives explicit source IDs beside each visual attachment, original text, optional column mappings and source dates. It suggests catalog/image associations using the existing bounded tools. The server rejects images outside that shop's sources and validates evidence. Exact SKU filenames can produce deterministic image suggestions without Gemini. The seller must confirm the variant image. New contradictory identity/price/currency facts reopen an earlier answer; a new document date never silently wins a price conflict.

Navigation, counting, readiness, kit operations, communication and reconciliation make no model calls. The fixture/live/off switch remains restorecart.config.json. The final owned-example visual check used one actual generation and the cached repeat used zero.

## 3. Original Store JSON v1

This is the implemented destination adapter, a local exchange format rather than a Shopify/WooCommerce connector. Example: examples/restorecart/original-store-v1.json.

Top-level fields:

- schema: restorecart.original-store.v1
- storeId: stable destination identity
- revision: nonnegative monotonically increasing local destination version
- exportedAt: ISO timestamp
- inventory: unique SKU/quantity rows
- orders: emergencyOrderId, capture, amount/refunded in cents, fulfillment, and SKU/quantity/unitCents lines
- inventoryEvents: stable key, SKU and signed units for each applied sale or confirmed physical restock

The return screen accepts a fresh file or a practice export. Comparisons require checkouts closed and pending payments/refunds resolved. Captured orders supply immutable price snapshots. Confirmed stock movement records drive inventory; a refund alone does not restock goods.

The preview records an emergency fingerprint. Apply recomputes it under a SQLite transaction, rejects changed records, unknown SKUs, negative stock, conflicting capture/line/event references, stale exports, dropped emergency history and newer original-store refund/collection information. It creates or updates emergency order records and applies each inventory event once. The destination, applied preview journal and resume pointer are persisted atomically in rc_meta. Repeating the same apply returns the original result. Comparing the updated destination creates zero duplicate changes. Multiple previews against an outdated destination cannot both apply. Restarting the app preserves the journal and the UI resumes from the last destination.

A newer original export must retain the emergency references, not merely increment its revision. An original order with no corresponding sale trace is ambiguous and blocked. Applying updates a durable local file and produces a download; it does not charge, refund or call an original-store API. An external connector would require separate implementation and validation.

## 4. Rescue kits and rehearsals

A kit contains saved catalog choices, original files/images and their SHA-256 hashes, source mappings/dates, shop/pickup/original URL and contact settings. It excludes orders, sessions, payment records and credentials. Each changed snapshot creates a version; saving identical content reuses its version. Kits can be downloaded and imported. Schema, sizes, duplicate identities, source references and content hashes are checked. Hashes detect content changes; they are not proof of merchant ownership or a cryptographic signature.

Operational restoration creates an unpublished draft and remaps source/image IDs. Allocation resets to zero, product confirmations reset, and stock-count confirmations are not copied. A rehearsal uses the same restoration but has a server-enforced flag preventing publication and payments. It can exercise the same local reconciliation engine in a temporary in-memory database with one explicitly simulated captured order. The first comparison makes one order and one inventory change; the second makes zero, and repeated apply is safe. No PayPal calls or source-shop changes occur.

## 5. Customer communication

Merchants can save public contact, hours and an outage-status message. Publishing snapshots them for the buyer view; later drafts remain private. A ready-to-copy announcement includes status, shop URL and pickup/contact details. The application does not send messages automatically.

## Storage, access and scope

New state uses prefixed rc_meta records; existing incident, payment and source history is preserved. Every continuity route requires seller access, and writes retain CSRF protection. No new accounts or external service keys are required. Single configured merchant, USD and pickup restrictions remain. Persistent disk and hosted webhook verification remain deployment requirements.
