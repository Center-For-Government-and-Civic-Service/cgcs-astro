import * as THREE from 'three';
import { createGlassSphere, createTextSprite, disposeGeometryCache, type SphereUserData } from './glass-sphere';
import type { Partner, PartnerClickData } from '../../data/partners';

// ── Types ───────────────────────────────────────────────────────────────

interface PartnerSceneData {
  partner: Partner;
  clearbit: string;
  favicon: string;
  initial: string;
}

// ── Constants ───────────────────────────────────────────────────────────

const WORLD_HEIGHT = 10; // Fixed vertical extent — horizontal grows with aspect
const FOV = 50;
const TABLET_BREAKPOINT = 1024;
const TABLET_SCALE = 0.8;
const RADIUS_MAP: Record<string, number> = { sm: 0.58, md: 0.94, lg: 1.30 };

// ── Helpers ─────────────────────────────────────────────────────────────

function percentToWorld(
  xPct: number,
  yPct: number,
  aspect: number,
): [number, number] {
  const halfH = WORLD_HEIGHT / 2;
  const halfW = halfH * aspect;
  const wx = (xPct / 100) * (WORLD_HEIGHT * aspect) - halfW;
  const wy = -((yPct / 100) * WORLD_HEIGHT) + halfH;
  return [wx, wy];
}

function cameraZForExtent(fovDeg: number): number {
  const halfH = WORLD_HEIGHT / 2;
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
  camera.position.z = cameraZForExtent(FOV);

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

    // Per-sphere logo UV offset
    if (pd.partner.name === 'Skull Games') {
      (mesh.material as THREE.ShaderMaterial).uniforms.uLogoOffset.value.set(-0.1, 0);
    }
    if (pd.partner.name === 'City of Austin') {
      (mesh.material as THREE.ShaderMaterial).uniforms.uLogoOffset.value.set(-0.15, 0);
    }

    scene.add(mesh);
    spheres.push(mesh);
  });

  // Create text label sprites below each sphere
  const labels: THREE.Sprite[] = [];
  partners.forEach((pd, i) => {
    const sprite = createTextSprite(pd.partner.name, pd.partner.size);
    const mesh = spheres[i];
    const labelYOffset = sprite.userData.yOffset as number;
    sprite.position.set(mesh.position.x, mesh.position.y + labelYOffset, mesh.position.z);
    sprite.userData.baseScale = sprite.scale.clone();
    if (!reducedMotion) {
      sprite.scale.setScalar(0);
    }
    scene.add(sprite);
    labels.push(sprite);
  });

  // Raycasting
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-999, -999);

  // State
  let animationId = 0;
  let isVisible = false;
  let entranceTriggered = reducedMotion;
  let entranceStartTime = -1;
  const entranceProgress: number[] = spheres.map(() => reducedMotion ? 1 : 0);
  let pressedSphere: THREE.Mesh | null = null;
  let hoveredIndex = -1;
  const labelHoverScale: number[] = spheres.map(() => 1);

  // ── Resize ──────────────────────────────────────────────────────────

  function onResize() {
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w === 0 || h === 0) return;

    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.position.z = cameraZForExtent(FOV);
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

      // Reposition label above sphere
      const label = labels[i];
      const labelYOffset = label.userData.yOffset as number;
      label.position.set(wx, wy + labelYOffset, mesh.position.z);
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
          labels.forEach((l) => l.scale.setScalar(0));
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
    hoveredIndex = hits.length > 0 ? spheres.indexOf(hits[0].object as THREE.Mesh) : -1;
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

      const label = labels[i];

      // Entrance animation — stagger from entranceStartTime
      if (entranceTriggered && entranceProgress[i] < 1) {
        const staggerDelay = i * 0.06;
        const timeSinceEntrance = elapsed - entranceStartTime;
        if (timeSinceEntrance >= staggerDelay) {
          entranceProgress[i] = Math.min(entranceProgress[i] + 0.04, 1);
        }
        mesh.scale.setScalar(entranceProgress[i] * scaleFactor);
        const bs = label.userData.baseScale as THREE.Vector3;
        label.scale.set(
          bs.x * entranceProgress[i],
          bs.y * entranceProgress[i],
          bs.z * entranceProgress[i],
        );
      }

      // Bob animation (skip if reduced motion) — no rotation so logos always face camera
      if (!reducedMotion && entranceProgress[i] >= 1) {
        const bobY = Math.sin(elapsed * ud.bobSpeed + ud.bobPhase) * ud.bobAmplitude;
        mesh.position.y = ud.baseY + bobY;
        const labelYOffset = label.userData.yOffset as number;
        label.position.y = ud.baseY + bobY + labelYOffset;
      }

      // Label hover scale — smooth lerp toward target
      if (entranceProgress[i] >= 1) {
        const target = i === hoveredIndex ? 1.6 : 1;
        labelHoverScale[i] += (target - labelHoverScale[i]) * 0.12;
        const bs = label.userData.baseScale as THREE.Vector3;
        const s = labelHoverScale[i];
        label.scale.set(bs.x * s, bs.y * s, bs.z * s);
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
    labels.forEach((sprite) => {
      const mat = sprite.material as THREE.SpriteMaterial;
      mat.map?.dispose();
      mat.dispose();
    });
    disposeGeometryCache();
    renderer.dispose();
  };
}
