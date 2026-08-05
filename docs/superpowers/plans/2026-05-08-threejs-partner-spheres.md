# Three.js Partner Spheres Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flat 2D CSS partner bubbles with 3D glassmorphism spheres rendered via Three.js on desktop; keep mobile Swiper carousel unchanged.

**Architecture:** Three.js scene rendered into a `<canvas>` element inside an Astro component. Custom GLSL shaders produce glassmorphism effect (Fresnel + fake refraction + specular) with logo textures UV-mapped onto spheres. Communication with existing panel uses CustomEvent dispatch. Mobile-first: canvas hidden below 768px.

**Tech Stack:** Astro 5.x, Three.js, custom GLSL shaders (inline strings), TypeScript

**Spec:** `docs/superpowers/specs/2026-05-08-threejs-partner-spheres-design.md`

**Note on spec deviations:**
- Spec says "Keep GSAP imports" but GSAP is confirmed to be used only for the desktop bubble animation being replaced. This plan removes GSAP entirely. Spec should be updated to match.
- Spec mentions adding scene lights (DirectionalLight + AmbientLight). The shader handles lighting via a uniform `uLightDir` — no Three.js light objects are needed since we use a custom ShaderMaterial, not MeshStandardMaterial. This is a deliberate simplification.
- The `innerHTML` pattern in `openPanel()` is inherited from the existing code. Not addressed in this plan since the data comes from a static TypeScript file (no user input), but should be refactored if data ever comes from a CMS.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/data/partners.ts` | **Modify** — add `PartnerClickData` interface export |
| `src/lib/three/glass-sphere.ts` | **Create** — sphere factory: geometry, ShaderMaterial with inline GLSL (Fresnel + refraction + specular), logo texture loading with 3-stage fallback |
| `src/lib/three/partner-scene.ts` | **Create** — scene orchestrator: renderer, camera, resize (incl. tablet scaling), animation loop, raycasting, cleanup |
| `src/components/PartnerSpheres.astro` | **Create** — Astro wrapper: canvas + fallback div + a11y buttons + JSON data embed + init script |
| `src/pages/partners.astro` | **Modify** — swap desktop section to use PartnerSpheres, remove GSAP desktop code, wire CustomEvent to openPanel |

---

### Task 1: Install Three.js and add shared type

**Files:**
- Modify: `package.json`
- Modify: `src/data/partners.ts:1-15`

- [ ] **Step 1: Install three**

```bash
npm install three @types/three
```

- [ ] **Step 2: Add PartnerClickData interface to partners.ts**

Add after the existing `Partner` interface (after line 15):

```ts
/** Shape dispatched on partner sphere/bubble click — consumed by panel logic */
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

- [ ] **Step 3: Verify build still works**

Run: `npx astro check 2>&1 | tail -5`
Expected: no errors related to partners.ts

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/data/partners.ts
git commit -m "feat: install three.js and add PartnerClickData shared type"
```

---

### Task 2: Create glass-sphere factory

**Files:**
- Create: `src/lib/three/glass-sphere.ts`

This is the core visual unit — builds a single glassmorphism sphere mesh with logo texture. The fragment shader implements Fresnel rim glow, fake refraction (UV distortion based on refract vector), and Blinn-Phong specular.

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p src/lib/three
```

- [ ] **Step 2: Write glass-sphere.ts**

```ts
import * as THREE from 'three';

// ── Inline GLSL shaders ────────────────────────────────────────────────

const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldNormal;
  varying vec2 vUv;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uLogoTexture;
  uniform float uHasLogo;
  uniform vec3 uLightDir;

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldNormal;
  varying vec2 vUv;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(-vPosition);

    // Fresnel — stronger glow at edges
    float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);

    // Fake refraction — offset UVs based on refract vector for glass distortion
    vec3 refracted = refract(-viewDir, normal, 0.9);
    vec2 refractOffset = refracted.xy * 0.08;
    vec2 distortedUv = vUv + refractOffset;

    // Fake environment color from refraction (procedural gradient)
    vec3 envColor = mix(
      vec3(0.12, 0.23, 0.37),  // dark blue (matches bg #1e3a5f)
      vec3(0.3, 0.5, 0.7),     // lighter blue
      clamp(dot(normalize(vWorldNormal), vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5, 0.0, 1.0)
    );

    // Base glass color — near-transparent white with environment refraction
    vec4 glassColor = vec4(mix(vec3(1.0), envColor, 0.3), 0.12 + fresnel * 0.35);

    // Fresnel rim — soft blue-white edge glow
    vec3 rimColor = mix(vec3(0.85, 0.9, 1.0), vec3(1.0), fresnel);
    glassColor.rgb = mix(glassColor.rgb, rimColor, fresnel * 0.6);

    // Specular highlight (Blinn-Phong)
    vec3 lightDir = normalize(uLightDir);
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfVec), 0.0), 64.0);
    glassColor.rgb += vec3(1.0) * spec * 0.5;

    // Logo texture blend — sample at distorted UVs for glass refraction effect
    if (uHasLogo > 0.5) {
      vec4 logoColor = texture2D(uLogoTexture, distortedUv);
      // Blend logo onto glass — visible but muted by glass
      glassColor.rgb = mix(glassColor.rgb, logoColor.rgb, logoColor.a * 0.65);
      glassColor.a = max(glassColor.a, logoColor.a * 0.5);
    }

    gl_FragColor = glassColor;
  }
`;

// ── Size mapping (world-unit radii) ─────────────────────────────────────

const RADIUS_MAP: Record<string, number> = {
  sm: 0.4,
  md: 0.65,
  lg: 0.9,
};

// ── Shared geometry cache (one per size tier) ───────────────────────────

const geometryCache = new Map<string, THREE.SphereGeometry>();

function getGeometry(size: string): THREE.SphereGeometry {
  if (!geometryCache.has(size)) {
    geometryCache.set(size, new THREE.SphereGeometry(RADIUS_MAP[size] ?? 0.5, 32, 32));
  }
  return geometryCache.get(size)!;
}

// ── Initial-letter fallback texture via canvas ──────────────────────────

function createInitialTexture(letter: string): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Dark blue circle background
  ctx.fillStyle = '#1e3a5f';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  // White letter
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${size * 0.45}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, size / 2, size / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── Logo texture loader with 3-stage fallback ───────────────────────────

const textureLoader = new THREE.TextureLoader();
textureLoader.crossOrigin = 'anonymous';

export function loadLogoTexture(
  primaryUrl: string,
  faviconUrl: string,
  initial: string,
  onLoaded: (tex: THREE.Texture) => void,
): void {
  textureLoader.load(
    primaryUrl,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      onLoaded(tex);
    },
    undefined,
    () => {
      // Stage 2: favicon
      textureLoader.load(
        faviconUrl,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          onLoaded(tex);
        },
        undefined,
        () => {
          // Stage 3: canvas initial letter
          onLoaded(createInitialTexture(initial));
        },
      );
    },
  );
}

// ── Sphere factory ──────────────────────────────────────────────────────

export interface SphereUserData {
  name: string;
  href: string;
  description: string;
  stats: { label: string; value: string }[];
  clearbit: string;
  favicon: string;
  initial: string;
  baseY: number;
  bobSpeed: number;
  bobPhase: number;
  bobAmplitude: number;
  rotSpeed: number;
}

export function createGlassSphere(
  size: string,
  userData: Omit<SphereUserData, 'bobSpeed' | 'bobPhase' | 'bobAmplitude' | 'rotSpeed'>,
): THREE.Mesh {
  const geometry = getGeometry(size);

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uLogoTexture: { value: null },
      uHasLogo: { value: 0 },
      uLightDir: { value: new THREE.Vector3(1, 1, 1).normalize() },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });

  const mesh = new THREE.Mesh(geometry, material);

  // Attach animation params + partner data
  const fullUserData: SphereUserData = {
    ...userData,
    bobSpeed: 0.4 + Math.random() * 0.4,
    bobPhase: Math.random() * Math.PI * 2,
    bobAmplitude: 0.06 + Math.random() * 0.06,
    rotSpeed: 0.08 + Math.random() * 0.06,
  };
  mesh.userData = fullUserData;

  // Load logo texture asynchronously
  loadLogoTexture(userData.clearbit, userData.favicon, userData.initial, (tex) => {
    (material.uniforms.uLogoTexture.value as THREE.Texture | null)?.dispose();
    material.uniforms.uLogoTexture.value = tex;
    material.uniforms.uHasLogo.value = 1;
  });

  return mesh;
}

// ── Cleanup ─────────────────────────────────────────────────────────────

export function disposeGeometryCache(): void {
  geometryCache.forEach((g) => g.dispose());
  geometryCache.clear();
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx astro check 2>&1 | tail -10`
Expected: no errors in glass-sphere.ts

- [ ] **Step 4: Commit**

```bash
git add src/lib/three/glass-sphere.ts
git commit -m "feat: add glassmorphism sphere factory with GLSL shaders and refraction"
```

---

### Task 3: Create partner-scene orchestrator

**Files:**
- Create: `src/lib/three/partner-scene.ts`

Scene setup, animation loop (with entrance stagger fix using `entranceStartTime`), raycasting, resize handling (with tablet radius scaling), visibility-aware rendering, and cleanup.

- [ ] **Step 1: Write partner-scene.ts**

```ts
import * as THREE from 'three';
import { createGlassSphere, disposeGeometryCache, type SphereUserData } from './glass-sphere';
import type { Partner, PartnerClickData } from '../../data/partners';

// ── Types ───────────────────────────────────────────────────────────────

interface PartnerSceneData {
  partner: Partner;
  clearbit: string;
  favicon: string;
  initial: string;
}

// ── Constants ───────────────────────────────────────────────────────────

const WORLD_EXTENT = 10;
const FOV = 50;
const TABLET_BREAKPOINT = 1024;
const TABLET_SCALE = 0.8;

// ── Helpers ─────────────────────────────────────────────────────────────

function percentToWorld(
  xPct: number,
  yPct: number,
  aspect: number,
): [number, number] {
  const halfW = WORLD_EXTENT / 2;
  const halfH = halfW / aspect;
  const wx = (xPct / 100) * WORLD_EXTENT - halfW;
  const wy = -((yPct / 100) * (WORLD_EXTENT / aspect)) + halfH;
  return [wx, wy];
}

function cameraZForExtent(fovDeg: number, aspect: number): number {
  const halfH = (WORLD_EXTENT / aspect) / 2;
  return halfH / Math.tan((fovDeg / 2) * (Math.PI / 180)) + 1;
}

// ── Init ────────────────────────────────────────────────────────────────

export function init(
  canvas: HTMLCanvasElement,
  partners: PartnerSceneData[],
  onPartnerClick: (data: PartnerClickData) => void,
): () => void {
  const parent = canvas.parentElement!;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Renderer
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch {
    throw new Error('WebGL not supported');
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(parent.clientWidth, parent.clientHeight);

  // Scene + camera
  const scene = new THREE.Scene();
  const aspect = parent.clientWidth / parent.clientHeight;
  const camera = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 100);
  camera.position.z = cameraZForExtent(FOV, aspect);

  // Create spheres
  const spheres: THREE.Mesh[] = [];
  partners.forEach((pd) => {
    const [wx, wy] = percentToWorld(pd.partner.x, pd.partner.y, aspect);
    const mesh = createGlassSphere(pd.partner.size, {
      name: pd.partner.name,
      href: pd.partner.href,
      description: pd.partner.description ?? '',
      stats: pd.partner.stats ?? [],
      clearbit: pd.clearbit,
      favicon: pd.favicon,
      initial: pd.initial,
      baseY: wy,
    });
    mesh.position.set(wx, wy, (Math.random() - 0.5) * 0.5);

    if (!reducedMotion) {
      mesh.scale.setScalar(0); // start hidden for entrance animation
    }

    scene.add(mesh);
    spheres.push(mesh);
  });

  // Raycasting
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-999, -999);

  // State
  let animationId = 0;
  let isVisible = false;
  let entranceTriggered = reducedMotion;
  let entranceStartTime = -1;
  const entranceProgress = spheres.map(() => reducedMotion ? 1 : 0);
  let pressedSphere: THREE.Mesh | null = null;

  // ── Resize ──────────────────────────────────────────────────────────

  function onResize() {
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w === 0 || h === 0) return;

    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.position.z = cameraZForExtent(FOV, camera.aspect);
    camera.updateProjectionMatrix();

    // Tablet scaling: ~20% smaller spheres below 1024px
    const scaleFactor = w < TABLET_BREAKPOINT ? TABLET_SCALE : 1;

    // Reposition and rescale spheres
    spheres.forEach((mesh, i) => {
      const pd = partners[i];
      const [wx, wy] = percentToWorld(pd.partner.x, pd.partner.y, camera.aspect);
      mesh.position.x = wx;
      mesh.position.y = wy;
      (mesh.userData as SphereUserData).baseY = wy;

      // Only apply scale if entrance is complete for this sphere
      if (entranceProgress[i] >= 1) {
        mesh.scale.setScalar(scaleFactor);
      }
    });
  }

  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(parent);

  // ── Scroll entrance via IntersectionObserver ─────────────────────────

  const intersectionObserver = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        isVisible = true;
        if (!entranceTriggered) {
          entranceTriggered = true;
          entranceStartTime = clock.getElapsedTime();
        }
      } else {
        isVisible = false;
        if (!reducedMotion) {
          // Reset entrance so it replays on re-enter
          entranceTriggered = false;
          entranceStartTime = -1;
          for (let i = 0; i < entranceProgress.length; i++) entranceProgress[i] = 0;
          spheres.forEach((m) => m.scale.setScalar(0));
        }
      }
    },
    { threshold: 0.15 },
  );
  intersectionObserver.observe(canvas);

  // ── Pointer events ──────────────────────────────────────────────────

  function onPointerMove(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(spheres);
    canvas.style.cursor = hits.length > 0 ? 'pointer' : 'default';
  }

  function onPointerDown(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(spheres);
    pressedSphere = hits.length > 0 ? hits[0].object as THREE.Mesh : null;
  }

  function onPointerUp(e: PointerEvent) {
    if (!pressedSphere) return;

    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(spheres);

    if (hits.length > 0 && hits[0].object === pressedSphere) {
      const ud = pressedSphere.userData as SphereUserData;
      onPartnerClick({
        name: ud.name,
        href: ud.href,
        description: ud.description,
        stats: ud.stats,
        clearbit: ud.clearbit,
        favicon: ud.favicon,
        initial: ud.initial,
      });
    }
    pressedSphere = null;
  }

  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);

  // ── Animation loop ──────────────────────────────────────────────────

  const clock = new THREE.Clock();

  function animate() {
    animationId = requestAnimationFrame(animate);

    // Skip rendering when canvas is off-screen
    if (!isVisible && entranceProgress.every((p) => p === 0 || p >= 1)) {
      return;
    }

    const elapsed = clock.getElapsedTime();
    const w = parent.clientWidth;
    const scaleFactor = w < TABLET_BREAKPOINT ? TABLET_SCALE : 1;

    spheres.forEach((mesh, i) => {
      const ud = mesh.userData as SphereUserData;

      // Entrance animation — stagger from entranceStartTime
      if (entranceTriggered && entranceProgress[i] < 1) {
        const staggerDelay = i * 0.06;
        const timeSinceEntrance = elapsed - entranceStartTime;
        if (timeSinceEntrance >= staggerDelay) {
          entranceProgress[i] = Math.min(entranceProgress[i] + 0.04, 1);
        }
        mesh.scale.setScalar(entranceProgress[i] * scaleFactor);
      }

      // Bob + rotation (skip if reduced motion)
      if (!reducedMotion && entranceProgress[i] >= 1) {
        mesh.position.y = ud.baseY + Math.sin(elapsed * ud.bobSpeed + ud.bobPhase) * ud.bobAmplitude;
        mesh.rotation.y += ud.rotSpeed * 0.016; // ~60fps delta
      }
    });

    renderer.render(scene, camera);
  }

  animate();

  // ── Cleanup function ────────────────────────────────────────────────

  return function cleanup() {
    cancelAnimationFrame(animationId);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointerup', onPointerUp);

    spheres.forEach((mesh) => {
      const mat = mesh.material as THREE.ShaderMaterial;
      const tex = mat.uniforms.uLogoTexture.value as THREE.Texture | null;
      tex?.dispose();
      mat.dispose();
    });
    disposeGeometryCache();
    renderer.dispose();
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx astro check 2>&1 | tail -10`
Expected: no errors in partner-scene.ts

- [ ] **Step 3: Commit**

```bash
git add src/lib/three/partner-scene.ts
git commit -m "feat: add Three.js partner scene orchestrator with raycasting and animation"
```

---

### Task 4: Create PartnerSpheres Astro component

**Files:**
- Create: `src/components/PartnerSpheres.astro`

Astro wrapper: renders canvas, embeds partner data as JSON, initializes the Three.js scene client-side, includes a11y buttons and WebGL fallback. A11y buttons use percentage positions matching partner x/y data — since the canvas also maps these same percentages to world coordinates, the alignment is consistent across viewports.

- [ ] **Step 1: Write PartnerSpheres.astro**

```astro
---
import PartnerBubble from './PartnerBubble.astro';
import { partners } from '../data/partners';

// Pre-compute logo URLs for each partner (same logic as PartnerBubble)
const partnerData = partners.map((partner) => {
  let domain = '';
  if (partner.logoDomain) {
    domain = partner.logoDomain;
  } else {
    try {
      domain = new URL(partner.href).hostname.replace(/^www\./, '');
    } catch {
      domain = '';
    }
  }
  return {
    partner,
    clearbit: partner.localLogo ?? `https://logo.clearbit.com/${domain}`,
    favicon: partner.localLogo ?? `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
    initial: partner.name.charAt(0).toUpperCase(),
  };
});
---

<div id="spheres-container" class="relative w-full" style="min-height: 900px;">
  <!-- Three.js canvas -->
  <canvas
    id="partner-canvas"
    class="absolute inset-0 w-full h-full"
    aria-label="Partner organizations — interactive 3D view"
  ></canvas>

  <!-- A11y: hidden buttons positioned over each sphere -->
  {partnerData.map((pd) => (
    <button
      class="sphere-a11y-btn absolute opacity-0 focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#1e3a5f] rounded-full"
      style={`left: ${pd.partner.x}%; top: ${pd.partner.y}%; transform: translate(-50%, -50%); width: 3rem; height: 3rem;`}
      aria-label={`View ${pd.partner.name} partner details`}
      data-name={pd.partner.name}
      data-href={pd.partner.href}
      data-description={pd.partner.description ?? ''}
      data-stats={JSON.stringify(pd.partner.stats ?? [])}
      data-clearbit={pd.clearbit}
      data-favicon={pd.favicon}
      data-initial={pd.initial}
    />
  ))}

  <!-- WebGL fallback: existing 2D bubbles, hidden by default -->
  <div id="spheres-fallback" class="hidden absolute inset-0">
    {partners.map((partner) => (
      <PartnerBubble partner={partner} />
    ))}
  </div>

  <!-- Partner data for Three.js (avoids large data-* attributes) -->
  <script
    id="partner-scene-data"
    type="application/json"
    set:html={JSON.stringify(partnerData)}
  />
</div>

<script>
  import { init } from '../lib/three/partner-scene';
  import type { PartnerClickData } from '../data/partners';

  const container = document.getElementById('spheres-container')!;
  const canvas = document.getElementById('partner-canvas') as HTMLCanvasElement;
  const fallback = document.getElementById('spheres-fallback')!;
  const dataScript = document.getElementById('partner-scene-data')!;

  // Parse embedded partner data
  const partnerData = JSON.parse(dataScript.textContent ?? '[]');

  // Handle click from Three.js scene — dispatch CustomEvent for page script
  function handlePartnerClick(data: PartnerClickData) {
    canvas.dispatchEvent(new CustomEvent('partner-click', { detail: data, bubbles: true }));
  }

  // A11y buttons also dispatch same event
  container.querySelectorAll<HTMLButtonElement>('.sphere-a11y-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const data: PartnerClickData = {
        name: btn.dataset.name!,
        href: btn.dataset.href!,
        description: btn.dataset.description ?? '',
        stats: JSON.parse(btn.dataset.stats ?? '[]'),
        clearbit: btn.dataset.clearbit!,
        favicon: btn.dataset.favicon!,
        initial: btn.dataset.initial!,
      };
      canvas.dispatchEvent(new CustomEvent('partner-click', { detail: data, bubbles: true }));
    });
  });

  // Initialize Three.js scene, with WebGL fallback
  try {
    const cleanup = init(canvas, partnerData, handlePartnerClick);

    // Cleanup on page navigation (Astro view transitions)
    document.addEventListener('astro:before-swap', cleanup, { once: true });
  } catch {
    // WebGL failed — show 2D fallback bubbles
    canvas.style.display = 'none';
    fallback.classList.remove('hidden');
  }
</script>
```

- [ ] **Step 2: Verify build compiles**

Run: `npx astro check 2>&1 | tail -10`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/PartnerSpheres.astro
git commit -m "feat: add PartnerSpheres Astro wrapper with canvas, a11y, and WebGL fallback"
```

---

### Task 5: Wire PartnerSpheres into partners page

**Files:**
- Modify: `src/pages/partners.astro:1-5` (imports)
- Modify: `src/pages/partners.astro:40-50` (desktop section)
- Modify: `src/pages/partners.astro:142-329` (full script block replacement)

This is the integration task. The page script keeps: mobile logo fallback, Swiper init, panel open/close logic. It loses: GSAP desktop bubble animation, desktop bubble click wiring, inline BubbleData type.

- [ ] **Step 1: Update imports (top of frontmatter)**

Replace lines 1-5:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import PartnerSpheres from '../components/PartnerSpheres.astro';
import PartnerPanel from '../components/PartnerPanel.astro';
import { partners } from '../data/partners';
```

Remove `PartnerBubble` import (now handled inside PartnerSpheres). Keep `partners` import for mobile Swiper data.

- [ ] **Step 2: Replace desktop section (lines 40-50)**

Replace the `#bubble-canvas` section with:

```html
  <!-- Desktop: Three.js Spheres -->
  <section
    id="bubble-canvas"
    class="hidden md:block relative w-full bg-[#1e3a5f] overflow-hidden"
    style="min-height: 900px;"
    aria-label="Partner organizations"
  >
    <PartnerSpheres />
  </section>
```

- [ ] **Step 3: Update the inline script**

Replace the full `<script>` block (lines 142-329). The new script keeps mobile functionality + panel logic, replaces GSAP desktop code with CustomEvent listener:

```html
  <script>
    import Swiper from 'swiper';
    import { Pagination } from 'swiper/modules';
    import 'swiper/css';
    import 'swiper/css/pagination';
    import type { PartnerClickData } from '../data/partners';

    // ── Logo fallback — mobile only ───────────────────────────────────────
    function attachFallback(img: HTMLImageElement, faviconUrl: string, initialEl: HTMLElement) {
      let stage = 0;
      img.addEventListener('error', () => {
        stage++;
        if (stage === 1) {
          img.src = faviconUrl;
        } else {
          img.style.display = 'none';
          initialEl.style.display = 'flex';
        }
      });
    }

    document.querySelectorAll<HTMLElement>('.partner-bubble-mobile').forEach((el) => {
      const slide     = el.closest<HTMLElement>('[data-name]')!;
      const img       = el.querySelector<HTMLImageElement>('.bubble-logo-mobile')!;
      const initialEl = el.querySelector<HTMLElement>('.bubble-initial-mobile')!;
      if (img && initialEl && slide) attachFallback(img, slide.dataset.favicon!, initialEl);
    });

    // ── Desktop fallback bubbles (WebGL fail path) ────────────────────────
    document.querySelectorAll<HTMLElement>('.partner-bubble').forEach((el) => {
      const img       = el.querySelector<HTMLImageElement>('.bubble-logo')!;
      const initialEl = el.querySelector<HTMLElement>('.bubble-initial')!;
      if (img && initialEl) attachFallback(img, el.dataset.favicon!, initialEl);
    });

    // ── Swiper — mobile carousel ──────────────────────────────────────────
    const swiperEl = document.querySelector<HTMLElement>('.partners-swiper');
    if (swiperEl) {
      const infoEl = document.getElementById('mobile-partner-info')!;
      const nameEl = document.getElementById('mobile-partner-name')!;
      const descEl = document.getElementById('mobile-partner-desc')!;
      const linkEl = document.getElementById('mobile-partner-link') as HTMLAnchorElement;

      const swiper = new Swiper(swiperEl, {
        modules: [Pagination],
        slidesPerView: 1.25,
        centeredSlides: true,
        spaceBetween: 16,
        pagination: { el: '.swiper-pagination', clickable: true },
      });

      function updateInfo() {
        const slide = swiper.slides[swiper.activeIndex] as HTMLElement;
        if (!slide) return;
        infoEl.style.opacity = '0';
        setTimeout(() => {
          nameEl.textContent = slide.dataset.name ?? '';
          const desc = slide.dataset.description ?? '';
          descEl.textContent = desc;
          descEl.style.display = desc ? 'block' : 'none';
          linkEl.href = slide.dataset.href ?? '#';
          infoEl.style.opacity = '1';
        }, 160);
      }

      updateInfo();
      swiper.on('slideChange', updateInfo);
    }

    // ── Panel open / close ────────────────────────────────────────────────
    const dialog      = document.getElementById('partner-panel')     as HTMLDialogElement;
    const panelLogo   = document.getElementById('panel-logo')        as HTMLImageElement;
    const panelInit   = document.getElementById('panel-initial')     as HTMLElement;
    const panelName   = document.getElementById('panel-name')        as HTMLElement;
    const panelDesc   = document.getElementById('panel-description') as HTMLElement;
    const panelStats  = document.getElementById('panel-stats')       as HTMLElement;
    const panelLink   = document.getElementById('panel-link')        as HTMLAnchorElement;
    const closeBtn    = document.getElementById('panel-close')       as HTMLButtonElement;

    function openPanel(d: PartnerClickData) {
      panelLogo.style.display = 'block';
      panelInit.style.display = 'none';
      panelInit.textContent   = d.initial;
      panelLogo.alt           = d.name;

      let logoStage = 0;
      panelLogo.onerror = () => {
        logoStage++;
        if (logoStage === 1) { panelLogo.src = d.favicon; }
        else { panelLogo.style.display = 'none'; panelInit.style.display = 'flex'; }
      };
      panelLogo.src = d.clearbit;

      panelName.textContent   = d.name;
      panelDesc.textContent   = d.description;
      panelDesc.style.display = d.description ? 'block' : 'none';

      panelStats.innerHTML = '';
      if (d.stats.length) {
        d.stats.forEach(({ label, value }) => {
          panelStats.innerHTML += `
            <div class="text-center">
              <div class="text-2xl font-bold text-[#00A651]">${value}</div>
              <div class="text-xs text-gray-500 uppercase tracking-wide">${label}</div>
            </div>`;
        });
      }
      panelStats.style.display = d.stats.length ? 'flex' : 'none';
      panelLink.href = d.href;
      dialog.showModal();
    }

    function closePanel() { dialog.close(); }

    closeBtn.addEventListener('click', closePanel);
    dialog.addEventListener('click', (e) => { if (e.target === dialog) closePanel(); });

    // ── Three.js sphere click → open panel (CustomEvent from PartnerSpheres) ──
    const canvas = document.getElementById('partner-canvas');
    if (canvas) {
      canvas.addEventListener('partner-click', ((e: CustomEvent<PartnerClickData>) => {
        openPanel(e.detail);
      }) as EventListener);
    }

    // ── WebGL fallback bubbles → open panel ───────────────────────────────
    function bubbleDataFrom(el: HTMLElement): PartnerClickData {
      return {
        name:        el.dataset.name!,
        href:        el.dataset.href!,
        description: el.dataset.description ?? '',
        stats:       JSON.parse(el.dataset.stats ?? '[]'),
        clearbit:    el.dataset.clearbit!,
        favicon:     el.dataset.favicon!,
        initial:     el.dataset.initial!,
      };
    }

    document.querySelectorAll<HTMLElement>('.partner-bubble').forEach((el) => {
      el.addEventListener('click', () => openPanel(bubbleDataFrom(el)));
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') el.click(); });
    });
  </script>
```

- [ ] **Step 4: Verify full build**

Run: `npx astro build 2>&1 | tail -15`
Expected: build succeeds with no errors

- [ ] **Step 5: Test in browser**

Run: `npx astro dev` (or use existing dev server)
- Open http://localhost:4328/partners
- Verify: 3D spheres visible on desktop, glass effect with refraction, logos loading
- Verify: clicking a sphere opens the partner panel
- Verify: resize browser — spheres reposition, tablet sizes scale down
- Verify: mobile view shows Swiper carousel (no Three.js)

- [ ] **Step 6: Commit**

```bash
git add src/pages/partners.astro
git commit -m "feat: integrate Three.js partner spheres on desktop, keep mobile Swiper"
```

---

### Task 6: Clean up — remove GSAP dependency

**Files:**
- Modify: `package.json` (remove gsap)

GSAP is confirmed used only in the desktop bubble code we just replaced. Safe to remove.

- [ ] **Step 1: Verify GSAP is unused**

Use the Grep tool to search for `from 'gsap'` or `from "gsap"` across all `*.astro`, `*.ts`, `*.tsx` files in `src/`. Expected: no results.

- [ ] **Step 2: Remove GSAP**

```bash
npm uninstall gsap
```

- [ ] **Step 3: Verify build**

Run: `npx astro build 2>&1 | tail -10`
Expected: build succeeds

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove unused gsap dependency"
```

---

### Task 7: Final responsive + a11y verification

**Files:** None (manual testing only)

- [ ] **Step 1: Desktop (1440px+) — full scene**
  - Spheres render at correct scattered positions
  - Glass effect visible with Fresnel rim and refraction distortion
  - Logos load and are UV-mapped on spheres
  - Hover shows pointer cursor
  - Click opens partner panel with correct data
  - Scroll entrance animation works (spheres scale in with stagger)

- [ ] **Step 2: Tablet (768px-1024px) — scaled scene**
  - Canvas shown, spheres repositioned for narrower viewport
  - Spheres are ~20% smaller than desktop
  - All interactions work

- [ ] **Step 3: Mobile (<768px) — Swiper only**
  - Three.js canvas hidden
  - Swiper carousel fully functional
  - Info panel updates on swipe

- [ ] **Step 4: Keyboard a11y**
  - Tab through sphere buttons
  - Focus ring visible
  - Enter/Space opens panel

- [ ] **Step 5: Reduced motion**
  - Enable "reduce motion" in OS settings
  - Spheres appear at full scale, no animation, no entrance tween

- [ ] **Step 6: Logo fallback**
  - Temporarily break a Clearbit URL in partners.ts
  - Verify fallback to favicon, then to initial letter

- [ ] **Step 7: Final commit if any fixes were needed**

```bash
git add src/lib/three/glass-sphere.ts src/lib/three/partner-scene.ts src/components/PartnerSpheres.astro src/pages/partners.astro
git commit -m "fix: responsive and a11y adjustments for partner spheres"
```
