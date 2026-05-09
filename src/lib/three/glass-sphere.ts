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
