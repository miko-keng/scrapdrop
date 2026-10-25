# Provider sample contract v1

TaskSlice groups tools by a versioned executable contract, not merely a category name. The catalogue determines available tools at runtime. A comparable tool must be available, have a current passed connection-check report, use an operator-approved origin, and declare the contract's family and every required input/output format. At most three tools with the same contract can be compared. Newly connected tools need no hardcoded tool ID in the comparison UI.

| Contract | Family | Required inputs | Required outputs |
| --- | --- | --- | --- |
| `image-rename-v1` | `batch-file-renaming` | `image/jpeg`, `image/png` | `application/zip`, `text/csv` |
| `booking-capacity-v1` | `booking-pages` | `session-details` | `booking-page`, `text/csv` |

These are the initial supported contracts, not an automatic runner for every kind of website. A new operation requires a deliberately implemented runner and validator. Merely giving two applications the same category does not make their results comparable.

## Manifest

GET `/taskslice/manifest` on BatchStudio returns public JSON suitable for importing into TaskSlice's builder form:

```json
{
  "title": "BatchStudio Demo",
  "description": "A separately hosted photo-delivery application.",
  "appUrl": "https://YOUR-PROVIDER.example",
  "previewUrl": "https://YOUR-PROVIDER.example",
  "family": "batch-file-renaming",
  "capabilities": ["filename-pattern", "folder-preservation", "csv-mapping", "preserve-file-bytes"],
  "inputs": ["image/jpeg", "image/png"],
  "outputs": ["application/zip", "text/csv"],
  "sampleContract": "image-rename-v1"
}
```

No credentials belong in this document. Registering returns a one-time credential for the provider's server. A manifest save increments its version, unpublishes the listing, and invalidates the previous check report, including when the declaration text is unchanged.

## Public sample endpoint

POST `/taskslice/trial`, JSON:

```json
{
  "contract": "image-rename-v1",
  "input": {
    "files": [{"name":"camera/IMG_1042.png","type":"image/png","data":"BASE64_IMAGE_BYTES"}],
    "options": {
      "label":"Wedding",
      "date":"2026-10-25",
      "pattern":"{label}_{date}_{seq}",
      "preserveFolders":true,
      "mapping":""
    }
  }
}
```

`data` is raw base64 without a data-URL prefix. The marketplace sends only its bundled three-image sample to external providers. BatchStudio permits at most three files on this public endpoint. Date is YYYY-MM-DD; `{seq}` is required in the pattern. Optional mapping CSV uses `oldName,newName`, with relative input/output paths.

Return HTTP 200 JSON:

```json
{
  "rows":[{"oldName":"camera/IMG_1042.png","newName":"camera/Wedding_20261025_001.png"}],
  "zip":"BASE64_STORE_ONLY_ZIP"
}
```

The actual renamed path follows the supplied options; the path above is illustrative. Return rows in input order. The ZIP must contain exactly one entry per image plus `taskslice-mapping.csv`. Use ZIP method 0 (stored), ordinary files, safe relative paths, no encryption, no data descriptors, no ZIP comments, no symlinks, and no names that collide ignoring case. Image extensions and image bytes must remain unchanged. Mapping CSV must exactly match TaskSlice's CSV encoder (`server/market/files.ts`) with columns `oldName,newName,bytes,sha256` and rows describing the actual outputs. The reference BatchStudio implementation reuses that encoder.

TaskSlice bounds response size/time, rejects redirects, parses entries without extraction, compares every output byte with its input, derives its own hashes and counts, and re-encodes a canonical ZIP. Provider-reported checkmarks are not accepted as evidence. A failed provider becomes a failed comparison result; other successful results remain visible.

For `booking-capacity-v1`, input is `{ "capacity": 3, "attempts": 4 }`; output is `{ "outcomes": [true,true,true,false] }`. This is a capacity simulation, not proof of a working persistent booking backend.

## Contract checks and paid launch

POST `/taskslice/contract` accepts `{ token, requestKey, input }`. The image input has the same `files` and `options` shape above. Before running, verify the token through TaskSlice's `/api/market/provider/verify`, authenticated with the server-only provider credential. Positive responses include `allowed:true`, `repeated:boolean`, and the same `rows`/`zip` output. Invalid/expired/revoked/wrong-app access must return a non-success status and `allowed:false`. Malformed input also fails. See `examples/batchstudio/server.ts` and the seven-scenario runner in `server/market/routes.ts` for the full reference implementation.

TaskSlice's **Open app** creates a short-lived single-use launch code. GET `/taskslice/launch?code=...` on the provider exchanges the code with `/api/market/provider/exchange` using its server credential. The provider stores the returned entitlement token server-side, creates its own HttpOnly browser session, and redirects to `/` without a code in the URL. Never expose the credential or entitlement token to frontend JavaScript. BatchStudio checks current access for every larger batch and its download; an old successful launch is insufficient after access expires or is revoked.

Only an explicitly configured provider owned by the configured reference-owner account may use TaskSlice's existing seller for this sandbox package. Independent provider checkout is disabled until real seller onboarding/payment routing is implemented.

## Requests and reproduction

A buyer may attach a completed sample job to a private feature request. The attachment records its input, contract, tool/version, and current output. **Reproduce current result** runs the existing version against that input. The provider must still be approved and checked; a changed version cannot silently replace the attached version. A builder reply is a message or existing alternative, not an automatic application update.
