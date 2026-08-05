# Newsletter Signup Popup — Design

**Date:** 2026-08-04
**Status:** SUPERSEDED — popup built, tested, then rejected same day.
Stefano decided against popups entirely. Final state: the static
"Get our newsletter" section, moved to sit between "Reports & Recaps"
and "The State of Civil Society" on the homepage. `NewsletterModal.astro`
was deleted; the section markup lives inline in `src/pages/index.astro`.
The rest of this document is kept for historical context only.

## Problem

The homepage newsletter signup lives as a static section near the footer.
Stefano likes the signup itself but not its location — most visitors never
scroll that far. Move it to a popup that appears after the visitor engages
with the Initiatives section.

## Decisions (approved)

- **Trigger:** the visitor scrolls past the Initiatives section (`#initiatives`).
  Clicking an initiative card navigates away, so click-based triggers were
  rejected. Fires when the bottom of the section enters the viewport, or when
  the section is already above the viewport (e.g. deep-link past it).
- **Frequency:** once ever per browser. A `localStorage` flag is set the moment
  the popup is shown — dismissing it or signing up never re-triggers it.
- **Old section:** removed. The popup fully replaces the bottom-of-page section.

## Architecture

- New `src/components/NewsletterModal.astro`, following the existing native
  `<dialog>` conventions in `SimulationsModal.astro` (`::backdrop` styling,
  close button, backdrop-click and Esc close).
- The component owns everything: markup, styling, IntersectionObserver trigger,
  localStorage gate, and the Web3Forms submit handler (moved from
  `index.astro`). Form fields are identical to the old section — same
  `PUBLIC_WEB3FORMS_KEY`, subject, and honeypot `botcheck`.
- `index.astro` drops the old `#newsletter` section + its inline script and
  renders `<NewsletterModal />` instead.

## Behavior details

- `localStorage` key: `cgcs-newsletter-popup-shown`.
- Observer disconnects after firing; popup opens after a ~400 ms beat so it
  doesn't jump-scare mid-scroll.
- Success path: form hides, "Thanks for signing up!" shows, dialog stays open
  until the visitor closes it.
- Failure path: alert with fallback email (same as old section).
- Respects `prefers-reduced-motion` (no entry animation).

## Error handling / edge cases

- No JS or `localStorage` unavailable (private mode hard-blocks): popup simply
  never shows; no crash — all storage access wrapped in try/catch.
- `IntersectionObserver` unsupported: popup never shows (acceptable — modern
  browsers all support it).

## Testing

- Local dev server + fresh-profile headless Chrome: deep-link to `/#events`
  (past Initiatives) → popup appears; screenshot verified.
- Reload with same profile → popup suppressed (once-ever flag).
- Real submission left to manual testing to avoid emailing the CGCS inbox.
