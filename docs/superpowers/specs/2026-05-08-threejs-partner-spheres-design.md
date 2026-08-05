# Three.js Partner Spheres — Design Spec

## Overview

Replace the flat 2D CSS partner bubbles on the desktop partners page with 3D glassmorphism spheres rendered via Three.js with custom GLSL shaders. Partner logos are UV-mapped onto the sphere surfaces. Mobile keeps the existing Swiper carousel unchanged.

## Requirements

- **Mobile-first & 100% responsive:** Canvas resizes fluidly across all breakpoints. Mobile uses existing Swiper (no Three.js). Three.js canvas activates at `md` breakpoint (768px+).
- **Glassmorphism shader:** Frosted-glass transparency with refraction, subtle Fresnel rim glow, and soft specular highlights.
- **Logo textures:** Each sphere loads its partner logo as a texture, UV-mapped onto the sphere. Visible through the glass distortion. Three-stage fallback: Clearbit/localLogo → Google Favicon → canvas-rendered initial letter.
- **Floating field layout:** Spheres positioned in 3D space using existing `x/y` percentages from `partners.ts`, with a small random `z` offset for depth. Gentle sinusoidal bob animation per sphere.
- **Click interaction:** Raycasting detects clicks on spheres. Clicking dispatches a custom DOM event that the page script listens for to open the existing `PartnerPanel` dialog.
- **Cursor:** Pointer cursor on sphere hover via raycasting.
- **Performance:** Targets 60fps. Uses `requestAnimationFrame`. Disposes renderer/textures on unmount. Respects `prefers-reduced-motion` (disables bob, rotation, and entrance animation — spheres appear at full scale immediately).
- **Accessibility:** Canvas has `aria-label`. Hidden focusable overlay `<button>` elements positioned over each sphere for keyboard navigation and screen readers.
- **WebGL fallback:** If `WebGLRenderer` creation fails, fall back to showing the existing `PartnerBubble` components via a hidden fallback container.

## Architecture

### New Files

| File | Purpose |
|---|---|
| `src/components/PartnerSpheres.astro` | Astro wrapper: renders `<canvas>` + fallback `<div>`, passes partner data via `<script type="application/json">` inside the component. Includes client-side init script. |
| `src/lib/three/partner-scene.ts` | Main scene setup: renderer, camera, resize handler, animation loop, cleanup. Exports `init(canvas, data, onPartnerClick)` — accepts a callback for click events (decoupled from panel logic). |
| `src/lib/three/glass-sphere.ts` | Sphere factory: creates `Mesh` with `ShaderMaterial` (inline GLSL strings), loads logo texture with fallback pipeline. |

### Modified Files

| File | Change |
|---|---|
| `src/pages/partners.astro` | Replace `#bubble-canvas` section content with `<PartnerSpheres>`. Keep mobile Swiper untouched. Remove desktop GSAP bubble code (float + ScrollTrigger). Keep GSAP imports — still used for mobile Swiper init and potential use on other pages. |
| `src/data/partners.ts` | Export a shared `PartnerClickData` interface (name, href, description, stats, clearbit, favicon, initial) used by both the Three.js module and the page script's `openPanel()`. |
| `package.json` | Add `three` and `@types/three` dependencies. |

### Unchanged Files

| File | Why |
|---|---|
| `src/components/PartnerBubble.astro` | Kept as WebGL fallback content |
| `src/components/PartnerPanel.astro` | No changes — still opened via `openPanel()` in page script |
| Mobile Swiper section in `partners.astro` | Untouched — mobile-first, stays as-is |

## Cross-Module Communication

The Three.js module (`partner-scene.ts`) is decoupled from the panel logic. Communication uses **custom DOM events**:

```
Three.js click → canvas.dispatchEvent(new CustomEvent('partner-click', { detail: PartnerClickData }))
  → partners.astro inline <script> listens for 'partner-click' on canvas
  → calls openPanel(event.detail)
```

This keeps the Three.js module reusable and avoids polluting `window`.

## Shared Types

`src/data/partners.ts` exports a new interface:

```ts
export interface PartnerClickData {
  name: string;
  href: string;
  description: string;
  stats: { label: string; value: string }[];
  clearbit: string;
  favicon: string;
  initial: string;
}
```

Both `partner-scene.ts` and the page script's `openPanel()` use this type. The existing inline `BubbleData` interface in `partners.astro` is replaced with this import.

## Shader Design (Glassmorphism)

Shaders are defined as **inline template literal strings** in `glass-sphere.ts` — no separate `.vert`/`.frag` files, no Vite plugin needed.

```
Fragment shader pseudocode:
1. Sample logo texture at UV coordinates
2. Compute Fresnel term (view angle vs surface normal)
3. Compute refraction vector for fake environment distortion
4. Mix: base glass color (white, ~0.15 opacity) + logo texture + Fresnel rim highlight
5. Add subtle specular from a directional light
6. Output: semi-transparent frosted sphere with logo visible through glass
```

- Glass base: `vec4(1.0, 1.0, 1.0, 0.15)` — near-transparent white
- Fresnel rim: soft white/blue edge glow, intensity ~0.3
- Logo blend: `mix(glass, logoColor, logoColor.a * 0.7)` — logo visible but muted by glass
- Specular: single directional light, soft highlight

## Scene Setup

- **Camera:** `PerspectiveCamera`, FOV 50, z position calculated to frame the full partner field: `z = (maxWorldExtent / 2) / tan(FOV/2)` ≈ 10-12 units back depending on aspect ratio. Recalculated on resize.
- **Renderer:** `WebGLRenderer` with `alpha: true` (transparent background — uses section's `bg-[#1e3a5f]` from CSS). If renderer creation throws, activate fallback container.
- **Sphere geometry:** `SphereGeometry(radius, 32, 32)` — 2,048 triangles per sphere, 32K total for 16 spheres. Smooth enough for glass at screen sizes used.
- **Size mapping:** `sm` = radius 0.4, `md` = radius 0.65, `lg` = radius 0.9 (in world units)
- **Positioning:** Convert partner `x/y` percentages to world coordinates based on camera frustum width/height at z=0.
- **Lighting:** One `DirectionalLight` + one soft `AmbientLight` (used for specular calculation in shader)

## Logo Texture Loading

Three-stage fallback pipeline matching the current bubble behavior:

1. **Primary:** `localLogo` path (e.g., `/images/Army_Software_Factory_Logo.png`) or Clearbit URL. Loaded via `THREE.TextureLoader` with `crossOrigin: 'anonymous'`.
2. **Fallback 1:** Google Favicon URL (`https://www.google.com/s2/favicons?domain=...&sz=128`).
3. **Fallback 2:** Dynamically generated `CanvasTexture` with the partner's initial letter (white letter on dark blue circle, matching current `.bubble-initial` style).

Each stage triggers on `onError` callback of `TextureLoader.load()`. The `localLogo` paths are same-origin, so no CORS issues. External URLs (Clearbit, Google) are loaded with `crossOrigin: 'anonymous'`.

## Responsive Behavior

| Breakpoint | Behavior |
|---|---|
| `< 768px` | Three.js canvas hidden (`hidden md:block`). Swiper carousel shown. |
| `768px – 1024px` | Canvas shown, camera frustum adjusted to narrower aspect. Sphere radii scaled down ~20%. |
| `1024px+` | Full canvas, standard sphere sizes. |

- `ResizeObserver` on canvas parent triggers camera aspect + renderer size update.
- Sphere world positions recalculated on resize to maintain percentage-based layout.

## Animation

- **Bob:** Each sphere oscillates on Y-axis: `y += sin(time * speed + phase) * amplitude`. Speed and phase randomized per sphere.
- **Subtle rotation:** Each sphere slowly rotates around Y-axis (~0.1 rad/s) so logo sweeps in and out of view.
- **Scroll entrance:** Spheres start with `scale(0)` and lerp to full size when canvas enters viewport (IntersectionObserver, threshold: 0.15). Staggered by index, 60ms apart. Tween uses `MathUtils.lerp` in the render loop (no external tween library). Re-triggers on scroll back up then down (matching current GSAP `onEnter`/`onLeaveBack` behavior).
- **Reduced motion:** If `prefers-reduced-motion: reduce`, all animation skipped — spheres appear at full scale, static positions, no bob/rotation, no entrance tween.

## Interaction

- **Raycasting:** On `pointermove`, raycast against spheres. If intersecting, set `canvas.style.cursor = 'pointer'`. On `pointerdown` + `pointerup` on same sphere, fire click.
- **Click handler:** Reads partner data from `sphere.userData`, dispatches `CustomEvent('partner-click', { detail: PartnerClickData })` on the canvas element.
- **Keyboard accessibility:** Hidden `<button>` elements absolutely positioned over each sphere (positions synced on resize). Each has `aria-label="View {name} partner details"`. On click/Enter, dispatches the same `partner-click` event. This preserves the per-element tab focus the current bubbles have.

## Data Flow

```
partners.ts → PartnerSpheres.astro (embeds data as <script type="application/json">)
  → partner-scene.ts reads JSON, creates spheres with userData
  → Click → dispatches CustomEvent('partner-click') on canvas
  → partners.astro <script> listens → calls openPanel(event.detail)
```

## Performance Considerations

- 16 spheres at 32x32 segments = ~2K triangles each = ~32K total — very lightweight
- Logo textures: loaded once per partner. Max 16 texture loads.
- Single render pass, no post-processing (bloom etc.) to keep it lean
- `renderer.dispose()` and texture cleanup on page navigation

## Testing Plan

- [ ] Desktop: spheres render at correct positions matching current bubble layout
- [ ] Desktop: clicking a sphere opens the partner panel with correct data
- [ ] Desktop: resize browser — spheres reposition smoothly, canvas fills section
- [ ] Desktop: keyboard tab through spheres, Enter opens panel
- [ ] Mobile (< 768px): Three.js canvas hidden, Swiper carousel works as before
- [ ] Tablet (768-1024px): canvas shown, spheres scaled appropriately
- [ ] Reduced motion: spheres static at full scale, no animation
- [ ] Logo fallback: sphere with broken Clearbit URL falls back to favicon then initial letter
- [ ] WebGL unavailable: fallback container with PartnerBubble components shown
- [ ] Performance: 60fps on mid-range hardware (check via DevTools)
