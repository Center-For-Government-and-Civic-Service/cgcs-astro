import * as THREE from 'three';

// ── Inline GLSL shaders ────────────────────────────────────────────────

const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldNormal;
  varying vec3 vViewOffset;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    // Offset from sphere center in view space — keeps logo facing camera
    vec3 viewCenter = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vViewOffset = vPosition - viewCenter;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uLogoTexture;
  uniform float uHasLogo;
  uniform float uRadius;
  uniform vec3 uLightDir;
  uniform vec2 uLogoOffset;

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldNormal;
  varying vec3 vViewOffset;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(-vPosition);

    // Fresnel — stronger glow at edges
    float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);

    // Fake refraction for environment distortion (not applied to logo)
    vec3 refracted = refract(-viewDir, normal, 0.9);

    // Frosted glass — white with subtle depth shading
    vec3 envColor = mix(
      vec3(0.88, 0.90, 0.94),  // slightly cool white in shadow
      vec3(1.0),                // pure white in light
      clamp(dot(normalize(vWorldNormal + refracted * 0.3), vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5, 0.0, 1.0)
    );

    // Base: solid white, edges slightly more opaque (frosted glass look)
    vec4 glassColor = vec4(envColor, 0.55 + fresnel * 0.40);

    // Fresnel rim — crisp white edge for 3D depth
    glassColor.rgb = mix(glassColor.rgb, vec3(1.0), fresnel * 0.5);

    // Specular highlight (Blinn-Phong) — subtle shine
    vec3 lightDir = normalize(uLightDir);
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfVec), 0.0), 48.0);
    glassColor.rgb += vec3(1.0) * spec * 0.25;

    // Logo — flat 2D projection facing camera via view-space offset
    if (uHasLogo > 0.5 && vViewOffset.z > 0.0) {
      // Project logo using view-space XY so it always faces the camera
      float logoScale = 0.65;
      vec2 logoUV = vec2(
        vViewOffset.x / (uRadius * logoScale) * 0.5 + 0.5 + uLogoOffset.x,
        vViewOffset.y / (uRadius * logoScale) * 0.5 + 0.5 + uLogoOffset.y
      );

      if (logoUV.x >= 0.0 && logoUV.x <= 1.0 && logoUV.y >= 0.0 && logoUV.y <= 1.0) {
        vec4 logoColor = texture2D(uLogoTexture, logoUV);
        float logoMask = logoColor.a;
        glassColor.rgb = mix(glassColor.rgb, logoColor.rgb, logoMask * 0.9);
        glassColor.a = max(glassColor.a, logoMask * 0.85);
      }
    }

    gl_FragColor = glassColor;
  }
`;

// ── Size mapping (world-unit radii) ─────────────────────────────────────

const RADIUS_MAP: Record<string, number> = {
  sm: 0.58,
  md: 0.94,
  lg: 1.30,
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
  const radius = RADIUS_MAP[size] ?? 0.5;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uLogoTexture: { value: null },
      uHasLogo: { value: 0 },
      uRadius: { value: radius },
      uLightDir: { value: new THREE.Vector3(1, 1, 1).normalize() },
      uLogoOffset: { value: new THREE.Vector2(0, 0) },
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

// ── Text label sprite (always faces camera) ─────────────────────────────

export function createTextSprite(text: string, size: string): THREE.Sprite {
  const radius = RADIUS_MAP[size] ?? 0.5;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const fontSize = text.length > 18 ? 26 : text.length > 12 ? 30 : 34;
  const font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.font = font;
  const padding = 16;
  const lineHeight = fontSize * 1.25;

  // Word-wrap if text is wider than maxWidth
  const maxWidth = 280;
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = currentLine + ' ' + words[i];
    if (ctx.measureText(test).width > maxWidth) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = test;
    }
  }
  lines.push(currentLine);

  const widestLine = Math.max(...lines.map((l) => ctx.measureText(l).width));
  canvas.width = Math.ceil(widestLine + padding * 2);
  canvas.height = Math.ceil(lineHeight * lines.length + padding);

  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#374151';
  const startY = (canvas.height - lineHeight * (lines.length - 1)) / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, canvas.width / 2, startY + i * lineHeight);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);

  const spriteHeight = 0.264 * lines.length;
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(spriteHeight * aspect, spriteHeight, 1);

  // Position below sphere
  sprite.userData.yOffset = -(radius + spriteHeight * 0.5);

  return sprite;
}

// ── Cleanup ─────────────────────────────────────────────────────────────

export function disposeGeometryCache(): void {
  geometryCache.forEach((g) => g.dispose());
  geometryCache.clear();
}
