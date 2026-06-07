# CGCS Website — Maintainer SOP (`cgcs-acc`)

How to update the CGCS website (https://cgcs-acc.org) from a brand-new computer/terminal.
Every push to the `main` branch automatically builds and deploys to Cloudflare Pages — you do **not** need a Cloudflare login or any deploy commands.

- **Repo:** https://github.com/stefanocasafranca/cgcs-astro (public)
- **Live site:** https://cgcs-acc.org
- **GitHub account to use:** `cgcs-acc`
- **Tech:** Astro + Tailwind (static site)

---

## STEP 1 — One-time setup on a new computer

You only do this section **once** per machine.

### 1a. Install the tools

**macOS** (open Terminal):
```bash
# Install Homebrew if you don't have it (paste the line from https://brew.sh)
brew install git node gh
```

**Windows** (open PowerShell):
```powershell
winget install Git.Git OpenJS.NodeJS GitHub.cli
```

Verify (close and reopen the terminal first):
```bash
git --version
node --version    # should be v20 or newer (CI uses v24)
gh --version
```

### 1b. Log in to GitHub from the terminal

```bash
gh auth login
```
Answer the prompts:
- **GitHub.com**
- **HTTPS**
- **Login with a web browser** → copy the code, press Enter, sign in as `cgcs-acc`, authorize.

This also sets up git so pushing works without retyping passwords.

### 1c. Clone the website (download it)

```bash
cd ~/Desktop
git clone https://github.com/stefanocasafranca/cgcs-astro.git
cd cgcs-astro
npm install
```

You now have a folder `~/Desktop/cgcs-astro` with the whole site.

---

## STEP 2 — Every time you want to make a change

Open a terminal and run:

```bash
cd ~/Desktop/cgcs-astro     # go into the project
git pull                    # get the latest version first (IMPORTANT)
npm run dev                 # start a local preview
```

`npm run dev` prints a local address like **http://localhost:4321** — open it in your
browser to see the site live as you edit. Leave this running while you work; the page
auto-refreshes when you save a file. Press **Ctrl + C** in the terminal to stop it.

### Make your edits
Open the project folder in a text editor (e.g. **VS Code** — `code .`) and change files.
Common things to edit:
- **Events** (add/update/remove): `src/data/events.ts` — this is the single source of truth.
  Upcoming vs. past is decided automatically by each event's date.
- **Pages:** `src/pages/` (e.g. `index.astro` is the homepage).
- **Images:** drop files into `public/images/` and reference them by name.

---

## STEP 3 — Publish your change (this is the deploy)

Once you're happy with the preview, save everything, then in the terminal:

```bash
git add -A
git commit -m "Short description of what you changed"
git push
```

That's it. Pushing to `main` triggers an automatic build + deploy to Cloudflare Pages.
The live site updates in about **1–2 minutes**.

### Confirm it deployed
Go to **https://github.com/stefanocasafranca/cgcs-astro/actions** — the top run
("Daily Rebuild", triggered by your push) should show a green ✓ when the site is live.
If it shows a red ✗, the change had an error and did **not** go live (see Troubleshooting).

---

## Quick reference (after first-time setup)

```bash
cd ~/Desktop/cgcs-astro
git pull                 # 1. get latest
npm run dev              # 2. preview at http://localhost:4321 (Ctrl+C to stop)
# ...edit files...
git add -A
git commit -m "what I changed"
git push                 # 3. publish → live in ~1–2 min
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `git push` says *permission denied* / *403* | You haven't accepted the repo invite, or you're logged in as the wrong GitHub user. Accept the invite at https://github.com/stefanocasafranca/cgcs-astro/invitations, run `gh auth status` to check the account, then re-run `gh auth login` as `cgcs-acc`. |
| `git pull` says *merge conflict* | Someone else changed the same file. Don't force anything — note what you changed and ask Stefano, or run `git merge --abort` to back out. |
| Actions run shows red ✗ | Click the failed run on the Actions page to see the error. The site stays on the last good version, so nothing breaks. Usually it's a typo in a file you edited — fix it and push again. |
| `npm run dev` errors about modules | Run `npm install` again, then retry. |
| Site didn't update after a green ✓ | Hard-refresh the browser (Cmd/Ctrl + Shift + R). |

---

## Important notes

- **Every push to `main` goes straight to the live site** — there is no separate review/staging step. Preview locally with `npm run dev` before you push.
- **Always `git pull` before you start editing** so you're working on the latest version.
- You never need to log in to Cloudflare or run any deploy command — the GitHub Action handles it using a token already stored in the repo.
- The site also rebuilds **automatically every night at 12:01am Central**, which keeps the upcoming/past events lists current even if nobody pushes.

---

*Questions Stefano can answer when back: July 1, 2026*
