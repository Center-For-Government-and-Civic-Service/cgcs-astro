# Services Page Design Spec

## Overview

Add a new top-level "Services" page (`/services`) to the CGCS website showcasing tabletop exercises, simulations, and workforce development offerings. Includes a new "Services" link in the main navigation bar.

## Navigation

- Add "Services" as a direct link (no submenu) in the top nav, positioned after "Initiatives"
- Nav order: Home — About Us — Initiatives — **Services** — Events — Partners — Event Space — Contact
- Update both desktop nav and mobile menu

## Page Structure: `/services`

Single-page layout with five sections, using `BaseLayout.astro`.

### Section 1: Hero

- Full-width hero with background image (use existing CGCS photo, e.g., `CGCSPhotoshoot-183.jpg` or similar) + dark overlay
- Centered text:
  - **Headline:** "Bring Real-World Scenarios to Your Classroom or Organization"
  - **Subheadline:** "From tabletop exercises to full-scale simulations, we partner with you to design immersive learning experiences that build critical skills."
  - **CTA button:** "Explore Our Services" — smooth-scrolls to tier cards section
- Pattern: matches existing initiative page heroes

### Section 2: Service Tier Cards

Three cards displayed side by side on desktop (`grid grid-cols-3`), stacked on mobile. Visual progression: all cards same height, but Tier 1 uses a subtle border, Tier 2 uses a slightly bolder border or accent color, Tier 3 uses a filled/highlighted background (e.g., light green tint) to signal it as the most comprehensive offering. Developer discretion on exact visual treatment within these guidelines.

**Card 1: Tabletop Exercises**
- Icon: inline SVG (matching codebase pattern — no icon library). Developer chooses appropriate icon.
- Description: "Guided scenario discussions brought into your classroom. We work with professors to design exercises tailored to course topics — from public policy dilemmas to cybersecurity incidents."
- Best for: ACC faculty, college classrooms
- Format: 1-2 hour in-class sessions
- CTA: "Request a Tabletop Exercise" — scrolls to inquiry form with "Tabletop Exercise" pre-selected

**Card 2: Simulations**
- Icon: inline SVG (developer discretion)
- Description: "Immersive role-play experiences where participants navigate real-world challenges — conflict resolution, risk management, crisis response, community decision-making."
- Best for: Classes, nonprofits, businesses, community groups
- Format: Half-day or full-day events, on-site or at CGCS
- CTA: "Request a Simulation" — scrolls to inquiry form with "Simulation" pre-selected

**Card 3: Workforce Development**
- Icon: inline SVG (developer discretion)
- Description: "Comprehensive programs combining multiple engagements — skill building, organizational development, and team strengthening through sustained simulation-based learning."
- Best for: Businesses, organizations, government agencies
- Format: Multi-session programs, custom scoped
- CTA: "Request a Program" — scrolls to inquiry form with "Workforce Development" pre-selected

### Section 3: How It Works

Horizontal 3-step process strip (vertical on mobile):

1. **Connect** — "Reach out and tell us about your class, team, or organization" (icon: handshake/message)
2. **Customize** — "We design a scenario tailored to your specific goals and topics" (icon: wrench/puzzle)
3. **Experience** — "We facilitate the exercise with your group and debrief together" (icon: people/checkmark)

Steps connected by a CSS border/line between step circles (using pseudo-elements on a flex container). Light gray background (`bg-gray-50`) to differentiate from card section.

### Section 4: Testimonials

CSS scroll-snap carousel (simpler than Swiper for 3 placeholder cards; can upgrade to Swiper later when there are more real testimonials):

- Each card: quote text, person's name, title/role, department/organization
- 3 placeholder cards with structure visible but content marked as "Coming Soon"
- Data source: `src/data/testimonials.ts` exporting a `testimonials` array
- Interface: `{ quote: string; name: string; title: string; organization: string; image?: string }`
- **Empty state:** If `testimonials.length === 0`, hide the entire testimonials section (don't render it at all)

### Section 5: Inquiry Form

Embedded form at bottom of page with id `inquiry` for anchor linking:

- Fields:
  - First Name (text, required) + Last Name (text, required) — in a 2-column grid on desktop, matching ContactForm pattern
  - Email (email, required)
  - Organization / Department (text, required)
  - Service Interest (`id="service-select"`, select dropdown with explicit short values):
    - `<option value="tabletop">Tabletop Exercise</option>`
    - `<option value="simulation">Simulation</option>`
    - `<option value="workforce">Workforce Development</option>`
    - `<option value="unsure">Not Sure Yet</option>`
  - Message (textarea, optional)
- Submit button with `.btn-primary` styling
- **Form submission:** Demo/placeholder — `preventDefault()` + success message displayed inline below the form ("Thank you! We'll be in touch soon."). Matches existing ContactForm.astro pattern (no backend exists in this codebase). Can be wired to a real endpoint later.
- **Validation:** HTML5 `required` attributes + browser-native validation. No custom JS validation needed for V1.
- **Accessibility:** Use proper `<label>` elements associated with each input via `for`/`id` attributes. Placeholders are supplementary, not replacements for labels. (Note: this intentionally improves on ContactForm.astro's placeholder-only pattern.)
- **Success state:** On submit, hide the form and display an inline success message ("Thank you! We'll be in touch soon.") in its place.

#### Card CTA Pre-selection

When a tier card CTA is clicked **on-page**, use JavaScript:
1. `document.getElementById('inquiry').scrollIntoView({ behavior: 'smooth' })`
2. Set the select dropdown value via DOM: `document.getElementById('service-select').value = 'tabletop'`
3. Focus the form's first field after scroll completes

Query param mapping (for external/direct links to `/services?service=tabletop`):
- `?service=tabletop` → "Tabletop Exercise"
- `?service=simulation` → "Simulation"
- `?service=workforce` → "Workforce Development"

A small inline `<script>` reads `URLSearchParams` on page load and sets the dropdown if a valid param is present.

## Data Files

### `src/data/testimonials.ts`

```typescript
export interface Testimonial {
  quote: string;
  name: string;
  title: string;
  organization: string;
  image?: string;
}

export const testimonials: Testimonial[] = [
  // Placeholder entries — replace with real testimonials
  {
    quote: "The tabletop exercise transformed how my students engage with cybersecurity concepts. They were solving real problems, not just reading about them.",
    name: "Coming Soon",
    title: "Professor",
    organization: "Austin Community College",
  },
  {
    quote: "CGCS worked with us to design a simulation that addressed exactly the team dynamics challenges we were facing. The experience was eye-opening.",
    name: "Coming Soon",
    title: "Manager",
    organization: "Local Organization",
  },
  {
    quote: "Our students left the simulation with a completely different understanding of crisis management. You can't get that from a textbook.",
    name: "Coming Soon",
    title: "Department Chair",
    organization: "Austin Community College",
  },
];
```

## Styling

- Follow existing Tailwind CSS v4 patterns and custom theme
- Colors: primary green (`#00A651`), accent teal (`#00B4D8`), text dark (`#1a1a1a`)
- Typography: Inter for body, Montserrat for headings
- Card styles: `.card` pattern with hover lift effect
- Buttons: `.btn-primary` and `.btn-outline` as appropriate
- Responsive: mobile-first with `md:` breakpoint for desktop layout
- Animations: staggered fade-in on scroll for tier cards (match existing card animations)

## Files to Create

- `src/pages/services.astro` — the services page
- `src/data/testimonials.ts` — testimonials data file with placeholder entries

## Files to Modify

- `src/components/Header.astro` — add "Services" nav link after "Initiatives" in both desktop and mobile menus

## Accessibility

- All form fields must have associated `<label>` elements (not placeholder-only)
- Tier cards section: use `role="list"` on the grid container, `role="listitem"` on each card
- Testimonials carousel: `aria-label="Testimonials"` on the container, `aria-roledescription="slide"` on each card
- Keyboard: all CTAs and form elements must be keyboard-navigable (standard HTML behavior, no special work needed)
- Focus management: when card CTA scrolls to form, focus the first form field after scroll completes
- Images: hero background image is decorative (empty `alt=""` or CSS background-image)

## Mobile Responsiveness

- Tier cards: single column stack on mobile, 3-column grid at `md:` breakpoint
- How It Works: vertical stack on mobile, horizontal at `md:` breakpoint
- Testimonials: all 3 cards visible side by side at `md:` breakpoint; horizontal scroll with `scroll-snap-type: x mandatory` and one card visible at a time on mobile only
- Hero: fixed height (`min-h-[60vh]`), image via CSS `background-image` with `background-size: cover`
- Inquiry form: first/last name fields stack to single column on mobile, 2-column at `md:`

## Technical Notes

- The page is static (SSG) — no runtime data fetching needed
- Form is demo/placeholder (no backend) — see Section 5 for details
- Hero image: use CSS `background-image` (not `<img>`) since it's decorative. No Astro `<Image>` component needed (consistent with existing pages)
