# Newsletter → Google Sheet: one-time setup

> **Status: DEPLOYED (2026-08-05).** Live pieces, all owned by admin@cgcs-acc.org:
> - Sheet: <https://drive.google.com/open?id=1EI7OWI2wmM4fCSh1_B0JmXt9CC3ov0_h-maizUaz9v0>
> - Script: <https://script.google.com/d/1gyRN-m2wG2GFcIyfkitEs8Idb93mu2sJe4kMeDhhJxY2ncXZbYkbCqIe/edit>
> - Web app deployment: `AKfycbzYEZc10gN5An5r8ZeaFDm_kb2tBRbOmVeiQDdRZy4x_Nb1Vdb6cCXg1anOvgQuo46V`
>   (the `/exec` URL in `PUBLIC_NEWSLETTER_SHEET_URL`)
>
> Deployment gotchas learned the hard way:
> - The Sheet + script MUST be owned by the same account/domain that deploys
>   (a script bound to a sheet owned by another account fails with "Only users
>   in the same domain as the script owner may deploy").
> - Web-app deployments created via clasp/API return 404 — the first web-app
>   deployment must be created in the script editor UI. After that, update it
>   from the CLI (see "Updating the script later").
> - When testing with curl, use `curl -L -d ...` WITHOUT `-X POST` — Apps
>   Script answers via a 302 redirect that must be followed as GET.

Newsletter signups on the homepage post to a Google Apps Script web app that
appends each email to a Google Sheet in the CGCS Drive. This is the one-time
deployment walkthrough (kept for reference / redeployment from scratch).
Total time: ~5 minutes of clicking.

**Do all of this logged into the CGCS Google account** (the account that
should own the signup list), not a personal or ACC account.

## 1. Create the Sheet

1. Go to <https://sheets.new>.
2. Name it **CGCS Newsletter Signups** (top-left title box).
3. Leave it empty — the script creates its own "Signups" tab with headers on
   the first submission.

## 2. Add the script

1. In the Sheet: **Extensions → Apps Script**.
2. Delete the placeholder code in the editor.
3. Paste the full contents of [`apps-script.gs`](./apps-script.gs).
4. **Save** (Cmd+S). Name the project "CGCS Newsletter Receiver" if prompted.

## 3. Deploy as a web app

1. Click **Deploy → New deployment**.
2. Gear icon next to "Select type" → **Web app**.
3. Set:
   - Description: `newsletter receiver`
   - **Execute as: Me**
   - **Who has access: Anyone**  ← must be "Anyone", not "Anyone with Google
     account", or visitor submissions will be rejected.
4. Click **Deploy**, authorize when prompted (it only touches this
   spreadsheet). If Google shows "unverified app", click *Advanced →
   Go to CGCS Newsletter Receiver (unsafe)* — it's our own script.
5. Copy the **Web app URL** (ends in `/exec`).

## 4. Connect the website

Put the `/exec` URL into `PUBLIC_NEWSLETTER_SHEET_URL` in both `.env` and
`.env.production`, then rebuild/deploy. (If Claude is driving: just paste the
URL in chat and it takes it from there.)

## Updating the script later

Edit `apps-script.gs` in this repo (source of truth), then push and redeploy
with clasp (login as admin@cgcs-acc.org; the clasp project lives wherever you
`clasp clone 1gyRN-m2wG2GFcIyfkitEs8Idb93mu2sJe4kMeDhhJxY2ncXZbYkbCqIe`,
copying `apps-script.gs` in as `Code.gs`):

```sh
npx @google/clasp@2.4.2 push -f
npx @google/clasp@2.4.2 deploy -i AKfycbzYEZc10gN5An5r8ZeaFDm_kb2tBRbOmVeiQDdRZy4x_Nb1Vdb6cCXg1anOvgQuo46V -d "newsletter receiver"
```

Deploying with `-i <deploymentId>` updates the EXISTING deployment in place —
the `/exec` URL never changes, so the website needs no update. (Manual
alternative: paste into the script editor → Deploy → Manage deployments →
✏️ Edit → New version → Deploy.)

## Getting the list as XLSX

The Sheet **is** the live list. For an Excel copy at any moment:
**File → Download → Microsoft Excel (.xlsx)**.
