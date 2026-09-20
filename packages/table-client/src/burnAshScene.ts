import {
  AdditiveBlending,
  type Blending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DataTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  NoColorSpace,
  NormalBlending,
  OrthographicCamera,
  PlaneGeometry,
  Points,
  RedFormat,
  Scene,
  ShaderMaterial,
  Sphere,
  Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from "three";
import {
  ASH_HALF_W,
  ASH_FLOOR_Y,
  ASH_STAGE,
  HEAP_COLUMNS,
  ashFootprint,
  burnTiming,
  clamp01,
  cueHeat,
  easeOut,
  heapSurfaceY,
  phaseProgress,
  raiseHeap,
  type BurnTiming,
} from "./burnPile.js";
import { dissolveField, fieldAt, fieldToBytes } from "./burnField.js";

/**
 * The burn, in WebGL: a noise front eats the card away behind a glowing ember
 * rim, and every dissolved texel leaves as an ember that cools to ash on the
 * felt. Kept free of React so the simulation can be reasoned about — and the
 * maths it leans on tested — without a renderer.
 */

const FLAKES_PER_BURN = 1300;
const MAX_FLAKES = 4200;
const FIELD_W = 96;
const FIELD_H = 136;

/** Em per second squared, so the burn scales with the table. */
const BUOYANCY = 10.94;
const BUOYANCY_DECAY_S = 0.3;
const GRAVITY = 7.81;
const DRAG = 1.1;
const SWAY = 0.57;
const HEAT_DECAY_S = 0.24;

const LAUNCH_VX = 0.44;
const LAUNCH_VY_MIN = 0.73;
const LAUNCH_VY_SPREAD = 2.03;

const FLAKE_MIN_EM = 0.039;
const FLAKE_SPREAD_EM = 0.068;

const DECK_ROTATION_DEG = 16;
const REST_ROTATION_DEG = -4;

/** Tuned by eye against the real felt — see `docs/design/burn-pile.md`. */
const EMBER = {
  rim: 0.06,
  glowSize: ASH_STAGE.cardWidth * 1.6,
  glowPeakOpacity: 0.6,
  stainPeakOpacity: 0.9,
} as const;

interface Flake {
  u: number;
  v: number;
  elapsedAtBirth: number;
  birthAt: number;
  seed: number;
  size: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: boolean;
  age: number;
}

export interface AshScene {
  /** Set the newest card alight; it flies in, is eaten, and leaves ash. */
  burn(): void;
  /** Ash for burns that happened while nobody was looking — settled, no flight. */
  settleWhole(burns: number): void;
  reset(): void;
  resize(widthPx: number, heightPx: number): void;
  setCardArtwork(url: string): void;
  advance(deltaSeconds: number): void;
  dispose(): void;
}

export interface AshSceneOptions {
  readonly canvas: HTMLCanvasElement;
  readonly cardArtwork: string;
  readonly pixelRatio: number;
}

const POINT_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    gl_PointSize = aSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const POINT_FRAGMENT = /* glsl */ `
  uniform sampler2D uSprite;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float a = texture2D(uSprite, gl_PointCoord).a;
    if (a * vAlpha < 0.01) discard;
    gl_FragColor = vec4(vColor, a * vAlpha);
  }
`;

const CARD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Texels ahead of the threshold are gone; the ones just behind it are the
 * ember rim, and behind those the card is scorched before it goes.
 */
const CARD_FRAGMENT = /* glsl */ `
  uniform sampler2D uCard;
  uniform sampler2D uField;
  uniform float uThreshold;
  uniform float uRim;
  uniform float uOpacity;
  varying vec2 vUv;

  float roundedMask(vec2 uv, float r) {
    vec2 p = abs(uv - 0.5) - (0.5 - r);
    float d = length(max(p, 0.0)) - r;
    return 1.0 - smoothstep(-0.006, 0.006, d);
  }

  void main() {
    float f = texture2D(uField, vUv).r;
    if (f < uThreshold) discard;
    vec4 card = texture2D(uCard, vUv);
    float d = f - uThreshold;
    float rim = 1.0 - smoothstep(0.0, uRim, d);
    float scorch = 1.0 - smoothstep(0.0, uRim * 4.5, d);
    vec3 charred = mix(card.rgb, vec3(0.045, 0.04, 0.038), scorch);
    vec3 ember = mix(vec3(1.0, 0.34, 0.03), vec3(1.0, 0.94, 0.74), pow(rim, 2.5));
    vec3 rgb = mix(charred, ember, rim * 0.95);
    gl_FragColor = vec4(rgb, roundedMask(vUv, 0.07) * uOpacity);
  }
`;

function radialSprite(): Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.45, "rgba(255,255,255,0.75)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(canvas);
}

/** A soot smear, speckled so it does not read as an airbrushed oval. */
function stainTexture(): Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    gradient.addColorStop(0, "rgba(14,12,11,0.95)");
    gradient.addColorStop(0.5, "rgba(20,17,15,0.55)");
    gradient.addColorStop(1, "rgba(20,17,15,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 420; i += 1) {
      ctx.fillStyle = `rgba(0,0,0,${String(Math.random() * 0.4)})`;
      ctx.fillRect(
        Math.random() * size,
        Math.random() * size,
        2 + Math.random() * 5,
        1 + Math.random() * 3,
      );
    }
  }
  return new CanvasTexture(canvas);
}

interface PointCloud {
  readonly points: Points;
  readonly position: BufferAttribute;
  readonly colour: BufferAttribute;
  readonly size: BufferAttribute;
  readonly alpha: BufferAttribute;
}

function makePointCloud(
  capacity: number,
  sprite: Texture,
  blending: Blending,
): PointCloud {
  const geometry = new BufferGeometry();
  const position = new BufferAttribute(new Float32Array(capacity * 3), 3);
  const colour = new BufferAttribute(new Float32Array(capacity * 3), 3);
  const size = new BufferAttribute(new Float32Array(capacity), 1);
  const alpha = new BufferAttribute(new Float32Array(capacity), 1);
  geometry.setAttribute("position", position);
  geometry.setAttribute("aColor", colour);
  geometry.setAttribute("aSize", size);
  geometry.setAttribute("aAlpha", alpha);
  geometry.setDrawRange(0, 0);
  // The points are repositioned every frame, so a computed one would be stale.
  geometry.boundingSphere = new Sphere(new Vector3(), 1000);

  const material = new ShaderMaterial({
    uniforms: { uSprite: { value: sprite } },
    vertexShader: POINT_VERTEX,
    fragmentShader: POINT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending,
  });
  return {
    points: new Points(geometry, material),
    position,
    colour,
    size,
    alpha,
  };
}

/** Uploads only the slice that changed, not the whole preallocated buffer. */
function uploadRange(
  attribute: BufferAttribute,
  start: number,
  count: number,
): void {
  if (count <= 0) return;
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(
    start * attribute.itemSize,
    count * attribute.itemSize,
  );
  attribute.needsUpdate = true;
}

export function createAshScene(options: AshSceneOptions): AshScene | null {
  const { canvas, pixelRatio } = options;

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new OrthographicCamera(
    0,
    ASH_STAGE.width,
    ASH_STAGE.height,
    0,
    -100,
    100,
  );
  /** Stage coordinates run down the screen; the camera's y runs up it. */
  const worldY = (stageY: number) => ASH_STAGE.height - stageY;

  const field = dissolveField(FIELD_W, FIELD_H, 7);
  const fieldTexture = new DataTexture(
    fieldToBytes(field),
    FIELD_W,
    FIELD_H,
    RedFormat,
  );
  fieldTexture.minFilter = LinearFilter;
  fieldTexture.magFilter = LinearFilter;
  fieldTexture.needsUpdate = true;

  const loader = new TextureLoader();
  let cardTexture = loader.load(options.cardArtwork);
  // The shader writes straight to the framebuffer, so the texel must pass
  // through unconverted or the card reads darker than the DOM cards beside it.
  cardTexture.colorSpace = NoColorSpace;

  const cardUniforms = {
    uCard: { value: cardTexture },
    uField: { value: fieldTexture },
    uThreshold: { value: 0 },
    uRim: { value: EMBER.rim },
    uOpacity: { value: 0 },
  };
  const cardMaterial = new ShaderMaterial({
    uniforms: cardUniforms,
    vertexShader: CARD_VERTEX,
    fragmentShader: CARD_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
  const cardGeometry = new PlaneGeometry(
    ASH_STAGE.cardWidth,
    ASH_STAGE.cardHeight,
  );
  const card = new Mesh(cardGeometry, cardMaterial);
  card.visible = false;
  scene.add(card);

  const sprite = radialSprite();
  const stain = stainTexture();
  const stainGeometry = new PlaneGeometry(
    ASH_HALF_W * 2.4,
    ASH_STAGE.cardHeight * 0.5,
  );
  const stainMaterial = new MeshBasicMaterial({
    map: stain,
    transparent: true,
    depthWrite: false,
    opacity: 0,
  });
  const stainMesh = new Mesh(stainGeometry, stainMaterial);
  stainMesh.position.set(ASH_STAGE.restX, worldY(ASH_FLOOR_Y - 0.26), -1);
  scene.add(stainMesh);

  const glowGeometry = new PlaneGeometry(EMBER.glowSize, EMBER.glowSize);
  const glowMaterial = new MeshBasicMaterial({
    map: sprite,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    color: new Color(1, 0.55, 0.16),
    opacity: 0,
  });
  const glow = new Mesh(glowGeometry, glowMaterial);
  glow.position.z = 1;
  scene.add(glow);

  const embers = makePointCloud(MAX_FLAKES, sprite, AdditiveBlending);
  embers.points.position.z = 2;
  scene.add(embers.points);
  const ash = makePointCloud(MAX_FLAKES, sprite, NormalBlending);
  scene.add(ash.points);

  const flakes: Flake[] = Array.from({ length: MAX_FLAKES }, () => ({
    u: 0,
    v: 0,
    elapsedAtBirth: 0,
    birthAt: 0,
    seed: 0,
    size: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    born: false,
    age: 0,
  }));
  const heap = new Float32Array(HEAP_COLUMNS);

  let activeFlakes = 0;
  let ashCount = 0;
  let burns = 0;
  let cardStart = -1;
  let clock = 0;
  let timing: BurnTiming = burnTiming();
  let sizeScale = 1;

  const emberColour = new Color();
  const ashColour = new Color();

  const pushAsh = (x: number, y: number, size: number, seed: number) => {
    if (ashCount >= MAX_FLAKES) return;
    const settledX = ashFootprint(x);
    ash.position.setXYZ(ashCount, settledX, worldY(y), 0);
    const tone = 0.2 + seed * 0.14;
    ash.colour.setXYZ(ashCount, tone, tone * 0.96, tone * 0.9);
    ash.size.setX(ashCount, size * sizeScale);
    ash.alpha.setX(ashCount, 0.75 + seed * 0.2);
    raiseHeap(heap, settledX);

    uploadRange(ash.position, ashCount, 1);
    uploadRange(ash.colour, ashCount, 1);
    uploadRange(ash.size, ashCount, 1);
    uploadRange(ash.alpha, ashCount, 1);
    ashCount += 1;
    ash.points.geometry.setDrawRange(0, ashCount);
  };

  const cardPose = (elapsed: number) => {
    const t = easeOut(phaseProgress(timing.travel, elapsed));
    const degrees =
      DECK_ROTATION_DEG + (REST_ROTATION_DEG - DECK_ROTATION_DEG) * t;
    return {
      x: ASH_STAGE.deckX + (ASH_STAGE.restX - ASH_STAGE.deckX) * t,
      y: ASH_STAGE.deckY + (ASH_STAGE.restY - ASH_STAGE.deckY) * t,
      rotation: (degrees * Math.PI) / 180,
    };
  };

  const spawnFlakes = (now: number) => {
    for (let i = 0; i < FLAKES_PER_BURN; i += 1) {
      if (activeFlakes >= MAX_FLAKES) return;
      const flake = flakes[activeFlakes];
      if (!flake) return;
      const u = Math.random();
      const v = Math.random();
      const elapsedAtBirth =
        timing.consume.delay + fieldAt(field, u, v) * timing.consume.duration;
      flake.u = u;
      flake.v = v;
      flake.elapsedAtBirth = elapsedAtBirth;
      flake.birthAt = now + elapsedAtBirth;
      flake.seed = Math.random();
      flake.size = FLAKE_MIN_EM + Math.random() * FLAKE_SPREAD_EM;
      flake.born = false;
      flake.age = 0;
      activeFlakes += 1;
    }
  };

  const retire = (index: number) => {
    const last = activeFlakes - 1;
    const dying = flakes[index];
    const survivor = flakes[last];
    if (dying && survivor && index !== last) {
      flakes[index] = survivor;
      flakes[last] = dying;
    }
    activeFlakes = last;
  };

  return {
    burn() {
      burns += 1;
      cardStart = clock;
      spawnFlakes(clock);
    },

    settleWhole(count: number) {
      burns = count;
      for (let burn = 0; burn < count; burn += 1) {
        for (let i = 0; i < FLAKES_PER_BURN * 0.55; i += 1) {
          const angle = Math.random() * Math.PI * 2;
          const radius =
            Math.pow(Math.random(), 0.6) * ASH_STAGE.cardWidth * 0.6;
          const x = ASH_STAGE.restX + Math.cos(angle) * radius;
          pushAsh(
            x,
            heapSurfaceY(heap, x) - Math.random() * 0.1,
            FLAKE_MIN_EM + Math.random() * FLAKE_SPREAD_EM,
            Math.random(),
          );
        }
      }
      stainMaterial.opacity = Math.min(EMBER.stainPeakOpacity, count * 0.3);
      stainMesh.scale.setScalar(1 + Math.min(count, 3) * 0.05);
    },

    reset() {
      activeFlakes = 0;
      ashCount = 0;
      burns = 0;
      cardStart = -1;
      heap.fill(0);
      ash.points.geometry.setDrawRange(0, 0);
      embers.points.geometry.setDrawRange(0, 0);
      card.visible = false;
      stainMaterial.opacity = 0;
      glowMaterial.opacity = 0;
    },

    resize(widthPx: number, heightPx: number) {
      if (widthPx <= 0 || heightPx <= 0) return;
      renderer.setSize(widthPx, heightPx, false);
      // Point size is a pixel quantity; the rest of the scene is in em.
      sizeScale = (widthPx / ASH_STAGE.width) * renderer.getPixelRatio();
    },

    setCardArtwork(url: string) {
      const next = loader.load(url);
      next.colorSpace = NoColorSpace;
      cardTexture.dispose();
      cardTexture = next;
      cardUniforms.uCard.value = next;
    },

    advance(delta: number) {
      clock += delta;
      timing = burnTiming();

      if (cardStart >= 0) {
        const elapsed = clock - cardStart;
        const threshold = phaseProgress(timing.consume, elapsed);
        const pose = cardPose(elapsed);
        card.visible = threshold < 1;
        card.position.set(pose.x, worldY(pose.y), 3);
        card.rotation.z = -pose.rotation;
        cardUniforms.uThreshold.value = threshold;
        cardUniforms.uOpacity.value = clamp01(
          elapsed / Math.max(timing.travel.duration * 0.4, 0.001),
        );

        glowMaterial.opacity = cueHeat(timing, elapsed) * EMBER.glowPeakOpacity;
        glow.position.set(
          pose.x,
          worldY(
            pose.y +
              ASH_STAGE.cardHeight * 0.34 -
              threshold * ASH_STAGE.cardHeight * 0.72,
          ),
          1,
        );

        if (threshold >= 1) {
          cardStart = -1;
          card.visible = false;
          glowMaterial.opacity = 0;
        }
      }

      let live = 0;
      for (let i = activeFlakes - 1; i >= 0; i -= 1) {
        const flake = flakes[i];
        if (!flake) continue;

        if (!flake.born) {
          if (clock < flake.birthAt) continue;
          const pose = cardPose(flake.elapsedAtBirth);
          const localX = (flake.u - 0.5) * ASH_STAGE.cardWidth;
          const localY = (0.5 - flake.v) * ASH_STAGE.cardHeight;
          const cos = Math.cos(pose.rotation);
          const sin = Math.sin(pose.rotation);
          flake.x = pose.x + localX * cos - localY * sin;
          flake.y = pose.y + localX * sin + localY * cos;
          flake.vx = (Math.random() - 0.5) * 2 * LAUNCH_VX;
          flake.vy = -(LAUNCH_VY_MIN + Math.random() * LAUNCH_VY_SPREAD);
          flake.born = true;
        }

        flake.age += delta;
        const buoyancy = BUOYANCY * Math.exp(-flake.age / BUOYANCY_DECAY_S);
        flake.vy += (GRAVITY - buoyancy) * delta;
        // Phased on the flake's own age: on a shared clock every flake is
        // pushed the same way at once and the whole cloud drifts as one.
        flake.vx +=
          Math.sin(flake.age * 5.2 + flake.seed * 9) *
          SWAY *
          delta *
          (0.4 + flake.seed);
        const drag = Math.exp(-delta * DRAG);
        flake.vx *= drag;
        flake.vy *= drag;
        flake.x += flake.vx * delta;
        flake.y += flake.vy * delta;

        const surface = heapSurfaceY(heap, flake.x);
        if (flake.vy > 0 && flake.y >= surface) {
          pushAsh(flake.x, surface, flake.size, flake.seed);
          retire(i);
          continue;
        }

        const heat = Math.exp(-flake.age / HEAT_DECAY_S);
        emberColour.setRGB(
          1,
          0.28 + heat * 0.62,
          0.05 + Math.pow(heat, 3) * 0.6,
        );
        const tone = 0.3 + flake.seed * 0.12;
        ashColour.setRGB(tone, tone * 0.95, tone * 0.88);
        emberColour.lerp(ashColour, 1 - heat);

        embers.position.setXYZ(live, flake.x, worldY(flake.y), 0);
        embers.colour.setXYZ(live, emberColour.r, emberColour.g, emberColour.b);
        embers.size.setX(live, flake.size * sizeScale * (0.8 + heat * 0.9));
        embers.alpha.setX(live, 0.3 + heat * 0.6);
        live += 1;
      }

      embers.points.geometry.setDrawRange(0, live);
      uploadRange(embers.position, 0, live);
      uploadRange(embers.colour, 0, live);
      uploadRange(embers.size, 0, live);
      uploadRange(embers.alpha, 0, live);

      const target = Math.min(EMBER.stainPeakOpacity, burns * 0.3);
      stainMaterial.opacity += (target - stainMaterial.opacity) * delta * 2.4;
      stainMesh.scale.setScalar(1 + Math.min(burns, 3) * 0.05);

      renderer.render(scene, camera);
    },

    dispose() {
      cardGeometry.dispose();
      cardMaterial.dispose();
      stainGeometry.dispose();
      stainMaterial.dispose();
      glowGeometry.dispose();
      glowMaterial.dispose();
      for (const cloud of [embers, ash]) {
        cloud.points.geometry.dispose();
        (cloud.points.material as ShaderMaterial).dispose();
      }
      fieldTexture.dispose();
      cardTexture.dispose();
      sprite.dispose();
      stain.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
