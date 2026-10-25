# Sample → feature request → builder response

The homepage now labels its animation **Example · Pattern Rename**, describes a photographer's delivery and links to the actual application prefilled with Wedding / 2026-10-25. Its animation is illustrative; the linked application runs the real sample.

## Buyer

1. Open Pattern Rename and run the supplied sample. Its actual result is automatically available for a feature request; another run is not required.
2. In **Need this tool to do something more?**, use **Run sample for this request** if you have not already run it.
3. Explain **What should be different?** For example: preserve camera/ and portraits/ in the ZIP.
4. Sign in and choose **Send request with this sample**.
5. Open **My workspace → Feature requests** to see the attached settings/result, re-run it and read the reply.

Attachments use only bundled sample images. Personal uploads are never shared by this feature. The saved request retains settings, filenames, objective checks and tool version, without links to the buyer's private downloads. Replays remain possible after temporary output downloads expire, provided the original reference tool version is still supported. Running a sample does not implement a requested feature.

## Builder

Registered applications' requests appear in their owner's **For builders → Feature request inbox**. Open the attached result, click **Re-run attached sample**, then reply. Other accounts cannot read or respond. A request can still be submitted without a bundled sample for tools that do not support this replay contract.

## Try a complete example

At the top of **For builders**, choose **Try buyer-to-builder example**:

1. Run the buyer sample.
2. Send the practice request to keep folders.
3. In the example builder view, re-run the attached sample and send a response.
4. Back in the example buyer view, try Map Rename on the same input.

The example saves a real, private practice request and reply under your account. Both roles are explicitly labelled as your practice roles. No fake customer is created, no payment is made, no external message is sent and no paid entitlement is issued. The practice provider cannot be published or used as a real seller. Starting again reopens the same practice record.

Map Rename is an existing alternative; the exercise does not pretend it automatically changed Pattern Rename. The separate **Connect your own application** tutorial remains below the example.

## Connect the reference-app owner inbox on Render

Requests for the three TaskSlice reference apps are routed to a designated TaskSlice owner. They do not belong to an arbitrary new signup.

1. Sign into the TaskSlice account that should handle those requests.
2. Open **For builders**, scroll to **Feature request inbox**, and expand **Connect the TaskSlice reference-app inbox**.
3. Copy the displayed account reference.
4. In Render's Environment settings, set `TASKSLICE_REFERENCE_OWNER_ACCOUNT_ID` to that exact reference. Save and redeploy.
5. Sign into that account again and open **For builders**. It now receives reference-app requests, including earlier saved requests.

This is a TaskSlice account ID, not a PayPal merchant ID or email. Only someone with Render configuration access can grant this role. An unset or nonexistent owner ID leaves requests explicitly marked as awaiting owner setup. Changing the configured owner changes who can read/reply to the reference inbox. Use persistent storage so the configured account survives redeploys.

## Verification

The production build and 41 offline tests pass (5 existing optional legacy/live tests skipped). New tests cover correct inbox routing, buyer/recipient isolation, attachment ownership and expiry, rejection of personal-upload attachments, exact replay, the folder-preserving alternative, migration of earlier requests, practice-request idempotency and prevention of fake paid access/publication. Browser checks exercised the homepage link, real request sample, sign-in with guest-result migration, owner inbox, and the complete guided buyer/builder flow. This change makes zero live Gemini requests.
