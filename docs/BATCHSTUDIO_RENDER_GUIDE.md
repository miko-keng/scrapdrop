# BatchStudio: deploy and connect a real provider

BatchStudio is a separate image-delivery website in this repository. It renames actual JPEG/PNG files and produces a ZIP with unchanged image bytes and a mapping CSV. Its free preview accepts three images. The optional TaskSlice-operated sandbox package costs $6 for 30 days and permits up to 100 images per run, subject to 2 MB per image and 12 MB total. Neither this demo nor marketplace comparisons require Gemini.

This is a same-operator demonstration, using TaskSlice's existing sandbox merchant. It does not enable independent seller onboarding or payouts. Third-party listings remain previews with checkout disabled.

## 1. Deploy the second Render service

Keep your existing TaskSlice service. Create another **Web Service**, connect `miko-keng/taskslice`, and use:

| Setting | Value |
| --- | --- |
| Branch | `main` |
| Root directory | Leave blank |
| Runtime | Node |
| Build command | `npm ci --include=dev` |
| Start command | `npm run start:batchstudio` |
| Health check | `/api/health` |
| Instance | Free is sufficient for a temporary preview |

Environment variables for the **BatchStudio service**:

```dotenv
NODE_VERSION=24
NODE_ENV=production
HOST=0.0.0.0
TASKSLICE_URL=https://taskslice.onrender.com
BATCHSTUDIO_DB_PATH=/tmp/batchstudio.sqlite
```

Render supplies `PORT` and `RENDER_EXTERNAL_URL`; BatchStudio uses them automatically. Do not copy TaskSlice's PayPal or Gemini credentials into this service. Initially omit the provider key and ID: the free preview works before connecting paid access.

An equivalent custom Blueprint is `render.batchstudio.yaml`. Use that filename when creating its separate Blueprint; it does not replace or update the existing TaskSlice service.

Open the new service's actual URL. Click **Run sample**, inspect the filename changes, and download the ZIP. Open **Provider integration example** and copy its manifest. The manifest contains the actual deployed origin.

## 2. Keep TaskSlice records across redeployments

Before configuring account/provider IDs for the full paid demo, ensure the **main TaskSlice service** has durable storage. Its default `.data/taskslice.sqlite` on an ordinary free Render service disappears on redeploy/restart. Saving environment variables redeploys the service, so IDs created just beforehand can disappear.

For durable SQLite, Render requires a paid service with a persistent disk. If you choose that option, mount a disk at `/var/data` and set **main TaskSlice** `DB_PATH=/var/data/taskslice.sqlite`. Moving the path creates a new database unless existing data is migrated; recreate the demo account/listing there. This guide does not purchase or change your Render plan. Without durable main storage, use the free preview and temporary connection checks; do not rely on accounts or purchases surviving deployments.

BatchStudio's `/tmp` database is also temporary. A restart clears its sessions and downloads; existing TaskSlice purchases can be launched again if the main database survives. Optionally give BatchStudio its own persistent disk and `BATCHSTUDIO_DB_PATH=/var/data/batchstudio.sqlite`. Browser sessions last one hour; generated output expires after 24 hours and belongs to the session that created it. Download promptly.

## 3. Register and connect BatchStudio

1. On **main TaskSlice**, add `PROVIDER_ALLOWED_ORIGINS=https://YOUR-ACTUAL-BATCHSTUDIO.onrender.com` and redeploy. Use the exact origin, with no path or trailing slash. Multiple approved origins may be comma-separated. Keep existing values if other providers are connected.
2. Sign in to TaskSlice with your builder demo account. In **For builders → Step 1**, expand **Connect BatchStudio using its manifest**. Paste the manifest from the separate BatchStudio website, choose **Use this manifest**, then save the application.
3. Copy the provider ID and the one-time provider credential. Treat the credential as a secret; it is shown once. Do not place it in a manifest or public browser code. A later save changes the manifest version and clears earlier connection checks.
4. On the **BatchStudio service only**, add `TASKSLICE_PROVIDER_KEY` with that credential and `TASKSLICE_PROVIDER_ID` with that provider ID, then redeploy BatchStudio.
5. Return to TaskSlice's builder page and run the connection checks. All seven should pass: missing access, valid access, wrong application, expired access, revoked access, repeated operation, malformed input. TaskSlice validates the returned ZIP and image bytes for successful image-contract checks.
6. Publish the listing. Checked compatible providers join the **Image renaming** comparison automatically. An independent listing remains a free preview.

The platform does not fetch arbitrary submitted URLs. Its operator must approve each origin before server-side comparison or connection checks can contact it. Comparison sends only the bundled, nonprivate sample to external providers. Buyer uploads stay in the reference app unless the buyer deliberately uses the separate provider website.

## 4. Optional: enable the operator-owned sandbox package

Only use this for BatchStudio that **you operate using the same sandbox seller as TaskSlice**.

On the main TaskSlice service, set:

```dotenv
TASKSLICE_REFERENCE_OWNER_ACCOUNT_ID=EXISTING_BUILDER_ACCOUNT_ID
TASKSLICE_DEMO_PROVIDER_ID=REGISTERED_BATCHSTUDIO_PROVIDER_ID
```

Copy the account ID from **For builders → Connect the TaskSlice reference-app inbox**. Both records must already exist in the durable main database, and that account must own the configured provider. These are not PayPal account IDs. Redeploy main TaskSlice, then reload the listing. A checked listing should display its $6 sandbox package. If the manifest is changed later, repeat checks and publish again.

Keep main TaskSlice's existing sandbox app credentials, webhook ID, sandbox mode, and `APP_BASE_URL=https://taskslice.onrender.com`. PayPal should notify the existing listener `/api/paypal/webhook`; verify the actual configured listener against the main deployment's existing setup. Buyer/seller login passwords belong only on PayPal's sandbox sign-in page, not in this provider service.

## 5. Test the full journey

1. In Explore, select **Image renaming** and compare Pattern Rename, Map Rename, and BatchStudio. All receive the same bundled files/options; inspect actual filenames and download results. Booking capacity uses a separate contract and cannot be mixed into the image comparison.
2. Open BatchStudio's listing and run its provider sample. Submit a feature request such as “Support sequence numbers starting at 100.” Attach the sample. **Reproduce current result** repeats existing behaviour; it does not add that feature.
3. As the owning builder, open the private request, reproduce its input, and reply. The buyer sees the response in their workspace. A message is a proposal; the builder must actually implement and deploy new behaviour before it exists. The guided example lets one account practise both roles and labels that clearly.
4. On the separate BatchStudio site, run three supplied images for free. Try four small images without access: the server must refuse the larger batch.
5. As a buyer in TaskSlice, deliberately complete the **sandbox** package using your sandbox personal buyer account. Confirm $6 USD and the expected sandbox seller. No real-money purchase is needed. This checkout step requires your interaction; automated tests use payment fixtures.
6. In the buyer workspace choose **Open app**. TaskSlice creates a short-lived, single-use code; BatchStudio exchanges it server-to-server and redirects to its clean home URL. Active access should be visible there. Process four images and download their ZIP.
7. A different browser without the provider session must not download that private output. Expired/revoked access must refuse paid operations and paid downloads; the free three-image preview stays available. Automated tests exercise these states without making a payment. For manual refund testing, use an actual sandbox refund and verify the existing verified notification handler updates the grant.

If a free Render instance is waking up, open its website first and wait for it to respond before running the ten-second connection tests.

## Local development

No API keys are required for free preview. From the repository, with Node 24 or newer:

```sh
PORT=4419 TASKSLICE_URL=http://127.0.0.1:4317 npm run start:batchstudio
```

For integration, approve `http://127.0.0.1:4419` on the local main server using `PROVIDER_ALLOWED_ORIGINS`, register the local manifest, and start BatchStudio with its local provider ID/key. Local HTTP is allowed only for approved development origins. Production requires HTTPS.

The complete isolated test runs through `npm test`: it starts a separate provider process, connects it to a temporary marketplace database, uses explicit payment fixtures, and removes temporary data afterward. `AI_MODE=fixture` prevents Gemini calls.

See `PROVIDER_SAMPLE_CONTRACT.md` for the versioned comparison protocol.

References: [Render Blueprint configuration](https://render.com/docs/blueprint-spec), [Render persistent disks](https://render.com/docs/disks).
