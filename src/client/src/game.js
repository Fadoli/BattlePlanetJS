import * as THREE from 'three';

const DEFAULT_SIZE = { width: 1024, height: 700 };
const RESIZE_THROTTLE_MS = 100;
const CAMERA_LERP = 0.12;
const MIN_ZOOM = 0.42;
const MAX_ZOOM = 1.45;
const DEFAULT_ZOOM = 0.52;
const ZOOM_STEP = 0.08;
const INTERPOLATION_DELAY_MS = 100;
const INPUT_SEND_INTERVAL_MS = 33; // ~30Hz input transmission
const MAX_SNAPSHOT_BUFFER = 90;
const UI_TEXT_REFRESH_MS = 140;
const PERF_SAMPLE_WINDOW = 90;
const DPR_CAP = 1;
const VISIBILITY_MARGIN = 96;
const FRAME_CAP_OPTIONS = [30, 60, 90, 120];
const DEFAULT_FRAME_CAP = 60;
const LOCAL_PLAYER_VISUAL_LERP = 0.22;
const hostElement = document.getElementById("gameRender");
const controlsElement = document.getElementById("gameControls");
const frameCapSelect = document.getElementById("frameCapSelect");
const leaderboardElement = document.createElement("div");
leaderboardElement.className = "leaderboardOverlay";
leaderboardElement.hidden = true;
hostElement.appendChild(leaderboardElement);

// Three.js Initialization
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
const canvas = renderer.domElement;
canvas.style.position = "absolute";
hostElement.appendChild(canvas);
const scene = new THREE.Scene();
const camera3d = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
camera3d.position.z = 10;

// Set a clear color to match the space background
renderer.setClearColor(0x06111d, 1);

// UI Canvas for labels and guides
const uiCanvas = document.createElement("canvas");
uiCanvas.style.position = "absolute";
uiCanvas.style.top = "0";
uiCanvas.style.left = "0";
uiCanvas.style.pointerEvents = "none";
hostElement.appendChild(uiCanvas);
const uiCtx = uiCanvas.getContext("2d");

const audioState = { context: null, masterGain: null, playedExplosions: new Set() };
const cache = {
    dpr: 1,
    stars: null,
    starTexture: null,
    arena: null,
    sun: null,
    arenaKey: "",
    sunKey: "",
    planetSprites: new Map(),
    threeObjects: new Map(),
    // Shared geometries for performance
    geometries: {
        circle16: new THREE.CircleGeometry(1, 16),
        circle8: new THREE.CircleGeometry(1, 8),
        plane: new THREE.PlaneGeometry(1, 1),
        ring: new THREE.RingGeometry(0.8, 1, 32)
    }
};
const perfState = { frameCount: 0, lastUpdatedAt: 0, sampleStartedAt: 0, totals: { frame: 0, background: 0, arena: 0, entities: 0, effects: 0, ui: 0 }, snapshot: null };
let viewport = { width: DEFAULT_SIZE.width, height: DEFAULT_SIZE.height, centerX: DEFAULT_SIZE.width / 2, centerY: DEFAULT_SIZE.height / 2 }, baseState = null;
let resizeTimestamp = 0;
let zoom = DEFAULT_ZOOM;
let inputSender = () => { };
let camera = { x: 0, y: 0 };
let pointerState = {
    x: viewport.centerX,
    y: viewport.centerY,
    down: false
};
let showLeaderboard = false;
let isRunning = false;
let animationFrame = null;
let snapshotBuffer = [];
let serverOffsetEstimate = null;
let lastUiTextUpdateAt = 0;
let lastControlsText = "";
let lastLeaderboardText = "";
let lastRenderAt = 0;
let networkState = emptyState();
let hasInitialCamera = false;
let roundHistory = new Map();
let resolvedRoundStatus = null;
let frameCap = loadFrameCap();
let localPlayerVisual = null;
let lastInputSendAt = 0;
// Network latency tracking for adaptive interpolation
let latencySamples = []; // recent RTT samples in ms
const LATENCY_SAMPLE_COUNT = 20;

function emptyState() {
    return {
        status: "waiting",
        serverTime: 0,
        tickNumber: 0,
        worldRadius: 1750,
        sun: { x: 0, y: 0, radius: 110, color: 0xffd166 },
        suns: [{ id: "sun-a", x: 0, y: 0, radius: 110, color: 0xffd166 }],
        players: [],
        enemies: [],
        rocks: [],
        asteroids: [],
        explosions: [],
        playerId: undefined
    };
}
function targetFrameMs() {
    return 1000 / frameCap;
}
function loadFrameCap() {
    const stored = Number.parseInt(
        window.localStorage.getItem("battlePlanet.frameCap") || `${DEFAULT_FRAME_CAP}`,
        10
    );
    return FRAME_CAP_OPTIONS.includes(stored) ? stored : DEFAULT_FRAME_CAP;
}

// Compute adaptive interpolation delay based on measured network latency
function getInterpolationDelay() {
    if (latencySamples.length < 5) return INTERPOLATION_DELAY_MS; // fallback to default

    // Copy and sort samples
    const sorted = [...latencySamples].sort((a, b) => a - b);
    // Use 75th percentile (p75) to cover most latency spikes
    const p75Index = Math.floor(sorted.length * 0.75);
    const p75 = sorted[p75Index];

    // Target delay: p75 * 1.5 + small buffer, clamped to reasonable range
    // This gives ~2-3x the typical one-way delay including jitter
    return Math.min(250, Math.max(50, Math.round(p75 * 1.5 + 20)));
}

// Record a latency sample from a received snapshot (clientTime - serverTime)
function recordLatencySample(snapshot) {
    if (!snapshot || !snapshot.serverTime) return;
    const now = Date.now();
    const rawDelay = now - snapshot.serverTime;
    latencySamples.push(rawDelay);
    if (latencySamples.length > LATENCY_SAMPLE_COUNT) {
        latencySamples.shift();
    }
}

function setFrameCap(nextCap) {
    if (!FRAME_CAP_OPTIONS.includes(nextCap)) return;
    frameCap = nextCap;
    window.localStorage.setItem("battlePlanet.frameCap", `${nextCap}`);
    if (frameCapSelect && frameCapSelect.value !== `${nextCap}`) {
        frameCapSelect.value = `${nextCap}`;
    }
    lastRenderAt = 0;
}
function syncFrameCapControl() {
    if (!frameCapSelect) return;
    frameCapSelect.value = `${frameCap}`;
    frameCapSelect.addEventListener("change", (event) => {
        setFrameCap(Number.parseInt(event.target.value, 10) || DEFAULT_FRAME_CAP);
    });
}
function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
}
function rgba(color, a) {
    const r = (color >> 16) & 255;
    const g = (color >> 8) & 255;
    const b = color & 255;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function fillCircle(target, x, y, r, fill) {
    target.beginPath();
    target.fillStyle = fill;
    target.arc(x, y, r, 0, Math.PI * 2);
    target.fill();
}

function strokeCircle(target, x, y, r, stroke, w) {
    target.beginPath();
    target.strokeStyle = stroke;
    target.lineWidth = w;
    target.arc(x, y, r, 0, Math.PI * 2);
    target.stroke();
}
function randomFactory(seed) {
    let state = seed;
    return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
}
function buildStarfield() {
    const STAR_COUNT = 2000;
    const WORLD_RADIUS = networkState.worldRadius || 1750;
    const SPREAD = WORLD_RADIUS * 3; // Spread stars well beyond the arena

    // Create star texture if not exists
    if (!cache.starTexture) {
        const size = 64;
        const canvas = makeCanvas(size, size);
        const ctx = canvas.getContext("2d");
        const center = size / 2;
        const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
        gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
        gradient.addColorStop(0.2, "rgba(255, 255, 255, 0.8)");
        gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.3)");
        gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        cache.starTexture = new THREE.CanvasTexture(canvas);
    }

    // Remove existing stars
    if (cache.stars) {
        scene.remove(cache.stars);
        cache.stars.geometry.dispose();
        cache.stars.material.dispose();
    }

    const positions = new Float32Array(STAR_COUNT * 3);
    const basePositions = new Float32Array(STAR_COUNT * 2); // Store base X,Y for parallax
    const parallaxFactors = new Float32Array(STAR_COUNT);
    const colors = new Float32Array(STAR_COUNT * 3);
    const sizes = new Float32Array(STAR_COUNT);

    const random = randomFactory(12345); // Fixed seed for consistency

    for (let i = 0; i < STAR_COUNT; i++) {
        const i3 = i * 3;
        const baseX = (random() - 0.5) * SPREAD * 2;
        const baseY = (random() - 0.5) * SPREAD * 2;
        const depth = random(); // 0 to 1, 0 = far, 1 = near

        // Z position: far stars at more negative Z, near stars at less negative Z
        const z = -200 - depth * 600; // Range -200 to -800, all in front of camera

        positions[i3] = baseX; // will be updated per frame
        positions[i3 + 1] = baseY;
        positions[i3 + 2] = z;

        basePositions[i * 2] = baseX;
        basePositions[i * 2 + 1] = baseY;
        parallaxFactors[i] = 0.05 + depth * 0.3; // far stars move less

        // Color variation: white to blue/yellow tints
        const colorType = random();
        let r, g, b;
        if (colorType < 0.6) {
            // White
            r = 1; g = 1; b = 1;
        } else if (colorType < 0.8) {
            // Blue tint
            r = 0.8; g = 0.9; b = 1;
        } else {
            // Yellow tint
            r = 1; g = 0.95; b = 0.8;
        }
        colors[i3] = r;
        colors[i3 + 1] = g;
        colors[i3 + 2] = b;

        sizes[i] = 0.5 + random() * 1.5;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Store base positions and parallax factors for update loop
    geometry.userData = { basePositions, parallaxFactors };

    const material = new THREE.PointsMaterial({
        size: 2,
        map: cache.starTexture,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
    });

    cache.stars = new THREE.Points(geometry, material);
    scene.add(cache.stars);
}

function updateStarfield() {
    if (!cache.stars) return;

    const positions = cache.stars.geometry.attributes.position.array;
    const { basePositions, parallaxFactors } = cache.stars.geometry.userData;

    for (let i = 0; i < basePositions.length / 2; i++) {
        const i3 = i * 3;
        const pf = parallaxFactors[i];
        // Star world position = base + (1 - pf) * camera
        // This creates parallax: screen position = (base - pf * camera) * zoom
        positions[i3] = basePositions[i * 2] + (1 - pf) * camera.x;
        positions[i3 + 1] = basePositions[i * 2 + 1] + (1 - pf) * camera.y;
        // Z stays constant
    }

    cache.stars.geometry.attributes.position.needsUpdate = true;
}
function buildArena() {
    const key = `${Math.round(networkState.worldRadius)}`;
    if (key === cache.arenaKey && cache.arena) return;
    cache.arenaKey = key;

    const radius = Math.ceil(networkState.worldRadius + 18);
    const node = makeCanvas(radius * 2, radius * 2), g = node.getContext("2d");
    g.translate(radius, radius);
    strokeCircle(g, 0, 0, networkState.worldRadius, "#0d2335", 10);
    strokeCircle(g, 0, 0, networkState.worldRadius, "rgba(96,212,255,0.32)", 4);
    strokeCircle(g, 0, 0, networkState.worldRadius * 0.82, "rgba(255,179,71,0.3)", 1.5);

    if (!cache.arena) {
        const texture = new THREE.CanvasTexture(node);
        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(cache.geometries.plane, material);
        mesh.position.z = 1;
        scene.add(mesh);
        cache.arena = mesh;
    } else {
        cache.arena.material.map.dispose();
        cache.arena.material.map = new THREE.CanvasTexture(node);
    }
    cache.arena.scale.set(radius * 2, radius * 2, 1);
}
function buildSun() {
    const primarySun = (networkState.suns && networkState.suns[0]) || networkState.sun;
    const key = `${Math.round(primarySun.radius)}`;
    if (key === cache.sunKey && cache.sun) return;
    cache.sunKey = key;

    const extent = Math.ceil(primarySun.radius + 42), node = makeCanvas(extent * 2, extent * 2), g = node.getContext("2d");
    g.translate(extent, extent);
    fillCircle(g, 0, 0, primarySun.radius + 28, "rgba(255,190,88,0.08)");
    fillCircle(g, 0, 0, primarySun.radius + 12, "rgba(255,221,138,0.10)");
    fillCircle(g, 0, 0, primarySun.radius, "rgba(255,200,87,0.94)");
    fillCircle(g, -primarySun.radius * 0.2, -primarySun.radius * 0.22, primarySun.radius * 0.46, "rgba(255,255,255,0.14)");
    strokeCircle(g, 0, 0, primarySun.radius + 7, "rgba(255,226,154,0.1)", 5);

    if (!cache.sun) {
        const texture = new THREE.CanvasTexture(node);
        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(cache.geometries.plane, material);
        mesh.position.z = 2;
        cache.sun = mesh;
    } else {
        cache.sun.material.map.dispose();
        cache.sun.material.map = new THREE.CanvasTexture(node);
    }
    cache.sun.prototypeSize = extent * 2;
}
function planetSpriteKey(planet, isLocalPlayer) {
    const instability = Math.max(
        0,
        Math.min(
            5,
            Math.round((((planet.modifier || 1) - 1) * 100) / 50)
        )
    );
    const stateKey = planet.alive === false ? "dead" : "alive";
    return `${planet.color}-${Math.round(planet.radius)}-${isLocalPlayer ? "local" : "remote"}-${instability}-${stateKey}`;
}
function getPlanetSprite(planet, isLocalPlayer) {
    const key = planetSpriteKey(planet, isLocalPlayer);
    if (cache.planetSprites.has(key)) return cache.planetSprites.get(key);

    const instability = Math.max(0, Math.min(1, ((planet.modifier || 1) - 1) / 5));
    const baseRadius = Math.max(8, Math.round(planet.radius));
    const auraRadius = Math.ceil(baseRadius + 10 + instability * 10);
    const padding = 16;
    const size = (auraRadius + padding) * 2;
    const node = makeCanvas(size, size);
    const g = node.getContext("2d");
    const center = size / 2;
    const alpha = planet.alive === false ? 0.35 : 0.95;

    fillCircle(
        g,
        center - (baseRadius * 0.18),
        center - (baseRadius * 0.22),
        baseRadius * 0.72,
        `rgba(255,255,255,${alpha * 0.12})`
    );
    fillCircle(g, center, center, baseRadius, rgba(planet.color, alpha));
    strokeCircle(
        g,
        center,
        center,
        baseRadius + 3 + instability * 2,
        isLocalPlayer ? "rgba(255,255,255,0.24)" : "rgba(228,237,247,0.18)",
        isLocalPlayer ? 2.5 : 1.75
    );

    const sprite = { node, size, center, baseRadius, auraRadius };
    cache.planetSprites.set(key, sprite);
    return sprite;
}
function resizeBackingStore() {
    const inner = getHostInnerSize(), dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP), nextWidth = Math.max(1, Math.round(inner.width)), nextHeight = Math.max(1, Math.round(inner.height));
    viewport = { width: nextWidth, height: nextHeight, centerX: nextWidth / 2, centerY: nextHeight / 2 };
    pointerState.x = Math.min(nextWidth, Math.max(0, pointerState.x));
    pointerState.y = Math.min(nextHeight, Math.max(0, pointerState.y));

    if (dpr === cache.dpr && canvas.width === Math.round(nextWidth * dpr) && canvas.height === Math.round(nextHeight * dpr)) return;

    cache.dpr = dpr;
    renderer.setSize(nextWidth, nextHeight);
    renderer.setPixelRatio(dpr);
    camera3d.left = -nextWidth / 2;
    camera3d.right = nextWidth / 2;
    camera3d.top = -nextHeight / 2;
    camera3d.bottom = nextHeight / 2;
    camera3d.updateProjectionMatrix();

    // Position both canvases correctly based on host element padding
    const styles = window.getComputedStyle(hostElement);
    const px = parseFloat(styles.paddingLeft) || 0;
    const py = parseFloat(styles.paddingTop) || 0;
    canvas.style.left = `${px}px`;
    canvas.style.top = `${py}px`;

    uiCanvas.width = Math.round(nextWidth * dpr);
    uiCanvas.height = Math.round(nextHeight * dpr);
    uiCanvas.style.width = `${nextWidth}px`;
    uiCanvas.style.height = `${nextHeight}px`;
    uiCanvas.style.left = `${px}px`;
    uiCanvas.style.top = `${py}px`;

    uiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    uiCtx.imageSmoothingEnabled = true;
}
function getHostInnerSize() {
    const styles = window.getComputedStyle(hostElement);
    const paddingX =
        parseFloat(styles.paddingLeft || "0") + parseFloat(styles.paddingRight || "0");
    const paddingY =
        parseFloat(styles.paddingTop || "0") + parseFloat(styles.paddingBottom || "0");

    return {
        width: Math.max(1, Math.floor(hostElement.clientWidth - paddingX)),
        height: Math.max(1, Math.floor(hostElement.clientHeight - paddingY))
    };
}
function attachInputListeners() { function updatePointer(event) { const rect = canvas.getBoundingClientRect(); pointerState.x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * viewport.width; pointerState.y = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * viewport.height; } canvas.addEventListener("mousemove", (event) => { updatePointer(event); }); canvas.addEventListener("mousedown", (event) => { updatePointer(event); if (!battlePlanetGame.isActive() || !getPlayer()) return; pointerState.down = true; ensureAudio(); playShootSound(); const worldPoint = screenToWorld(pointerState.x, pointerState.y); inputSender({ x: worldPoint.x, y: worldPoint.y, fireHeld: true, firePulse: true }); }); window.addEventListener("mouseup", () => { if (!pointerState.down) return; pointerState.down = false; const player = getPlayer(); if (player && battlePlanetGame.isActive()) { const worldPoint = screenToWorld(pointerState.x, pointerState.y); inputSender({ x: worldPoint.x, y: worldPoint.y, fireHeld: false }); } }); canvas.addEventListener("wheel", (event) => { event.preventDefault(); zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom - Math.sign(event.deltaY) * ZOOM_STEP)); }, { passive: false }); canvas.addEventListener("contextmenu", (event) => event.preventDefault()); window.addEventListener("resize", () => battlePlanetGame.resizeToContainer()); window.addEventListener("keydown", (event) => { if (event.key === "Tab" && battlePlanetGame.isActive()) { event.preventDefault(); showLeaderboard = true; } }); window.addEventListener("keyup", (event) => { if (event.key === "Tab") showLeaderboard = false; }); }
function ensureAudio() { if (audioState.context) { if (audioState.context.state === "suspended") audioState.context.resume(); return audioState.context; } const AudioContextClass = window.AudioContext || window.webkitAudioContext; if (!AudioContextClass) return null; const audioContext = new AudioContextClass(), masterGain = audioContext.createGain(); masterGain.gain.value = 0.06; masterGain.connect(audioContext.destination); audioState.context = audioContext; audioState.masterGain = masterGain; return audioContext; }
function tone({ frequency, endFrequency, duration, type, volume }) { const audioContext = ensureAudio(); if (!audioContext || !audioState.masterGain) return; const oscillator = audioContext.createOscillator(), gain = audioContext.createGain(); oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime); if (typeof endFrequency === "number") oscillator.frequency.exponentialRampToValueAtTime(endFrequency, audioContext.currentTime + duration); gain.gain.setValueAtTime(volume, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration); oscillator.connect(gain); gain.connect(audioState.masterGain); oscillator.start(); oscillator.stop(audioContext.currentTime + duration); }
function playShootSound() {
    tone({ frequency: 240, endFrequency: 120, duration: 0.08, type: "triangle", volume: 0.3 });
}
function playExplosionSound(scale) {
    tone({ frequency: 180 * scale, endFrequency: 48, duration: 0.18, type: "sawtooth", volume: 0.24 });
    tone({ frequency: 90 * scale, endFrequency: 36, duration: 0.24, type: "triangle", volume: 0.16 });
}
function lerp(start, end, alpha) { return start + (end - start) * alpha; }
function normalizeAngle(angle) {
    let value = angle;
    while (value <= -Math.PI) value += Math.PI * 2;
    while (value > Math.PI) value -= Math.PI * 2;
    return value;
}

function lerpAngle(start, end, alpha) {
    return normalizeAngle(start + normalizeAngle(end - start) * alpha);
}
function cloneState(state) {
    return {
        ...state,
        sun: { ...state.sun },
        suns: (state.suns || [state.sun]).map((entry) => ({ ...entry })),
        players: state.players.map((entry) => ({ ...entry })),
        enemies: state.enemies.map((entry) => ({ ...entry })),
        rocks: state.rocks.map((entry) => ({ ...entry })),
        asteroids: (state.asteroids || []).map((entry) => ({ ...entry })),
        explosions: (state.explosions || []).map((entry) => ({ ...entry }))
    };
}

function applyDeltaToState(state, delta) {
    const types = ['players', 'enemies', 'rocks', 'asteroids', 'explosions', 'suns'];
    for (const type of types) {
        const patches = delta[type];
        if (!patches) continue;
        const arr = state[type];
        for (const patch of patches) {
            const id = patch.id;
            if (patch._removed) {
                const idx = arr.findIndex(e => e.id === id);
                if (idx !== -1) arr.splice(idx, 1);
            } else {
                let entity = arr.find(e => e.id === id);
                if (!entity) {
                    const { id: _, ...rest } = patch;
                    entity = { id, ...rest };
                    arr.push(entity);
                } else {
                    for (const key of Object.keys(patch)) {
                        if (key === 'id' || key === '_removed') continue;
                        entity[key] = patch[key];
                    }
                }
            }
        }
    }
}
function interpolateEntity(previous, next, alpha) { const base = next || previous; if (!previous || !next) return { ...base }; return { ...base, x: lerp(previous.x, next.x, alpha), y: lerp(previous.y, next.y, alpha), vx: typeof previous.vx === "number" && typeof next.vx === "number" ? lerp(previous.vx, next.vx, alpha) : base.vx, vy: typeof previous.vy === "number" && typeof next.vy === "number" ? lerp(previous.vy, next.vy, alpha) : base.vy, radius: typeof previous.radius === "number" && typeof next.radius === "number" ? lerp(previous.radius, next.radius, alpha) : base.radius, angle: typeof previous.angle === "number" && typeof next.angle === "number" ? lerpAngle(previous.angle, next.angle, alpha) : base.angle, modifier: typeof previous.modifier === "number" && typeof next.modifier === "number" ? lerp(previous.modifier, next.modifier, alpha) : base.modifier }; }
function interpolateList(previousList, nextList, alpha) {
    const previousMap = new Map(previousList.map((entry) => [entry.id, entry]));
    const nextMap = new Map(nextList.map((entry) => [entry.id, entry]));
    const ids = new Set([...previousMap.keys(), ...nextMap.keys()]);
    const result = [];

    for (const id of ids) {
        const prev = previousMap.get(id);
        const next = nextMap.get(id);
        // If entity exists only in previous (removed) and we're at or past next snapshot time, skip it
        if (!next && alpha >= 1) continue;
        if (!prev || !next) {
            // One-sided: just use whichever exists (no interpolation)
            result.push({ ...(next || prev) });
        } else {
            result.push(interpolateEntity(prev, next, alpha));
        }
    }
    return result;
}
function interpolatedState() {
    if (snapshotBuffer.length === 0) return networkState;
    if (snapshotBuffer.length === 1 || serverOffsetEstimate === null) {
        return cloneState(snapshotBuffer[snapshotBuffer.length - 1]);
    }

    const renderServerTime = Date.now() - serverOffsetEstimate - getInterpolationDelay();
    let previous = snapshotBuffer[0];
    let next = snapshotBuffer[snapshotBuffer.length - 1];

    for (let i = 0; i < snapshotBuffer.length; i += 1) {
        const snapshot = snapshotBuffer[i];
        if (snapshot.serverTime <= renderServerTime) previous = snapshot;
        if (snapshot.serverTime >= renderServerTime) {
            next = snapshot;
            break;
        }
    }

    if (previous === next) return cloneState(previous);

    const duration = Math.max(1, next.serverTime - previous.serverTime);
    const alpha = Math.max(0, Math.min(1, (renderServerTime - previous.serverTime) / duration));

    const interpolatedSuns = interpolateList(
        previous.suns || [previous.sun],
        next.suns || [next.sun],
        alpha
    );

    return {
        serverTime: lerp(previous.serverTime, next.serverTime, alpha),
        tickNumber: alpha < 0.5 ? previous.tickNumber : next.tickNumber,
        status: alpha < 0.5 ? previous.status : next.status,
        worldRadius: lerp(previous.worldRadius, next.worldRadius, alpha),
        sun: interpolateEntity(previous.sun, next.sun, alpha),
        suns: interpolatedSuns,
        players: interpolateList(previous.players, next.players, alpha),
        enemies: interpolateList(previous.enemies, next.enemies, alpha),
        rocks: interpolateList(previous.rocks, next.rocks, alpha),
        asteroids: interpolateList(previous.asteroids || [], next.asteroids || [], alpha),
        explosions: interpolateList(previous.explosions || [], next.explosions || [], alpha),
        playerId: next.playerId || previous.playerId
    };
}
function continuousAimPayload() {
    const player = getPlayer();
    if (!player || player.alive === false) return null;
    const worldPoint = screenToWorld(pointerState.x, pointerState.y);
    return { x: worldPoint.x, y: worldPoint.y, fireHeld: pointerState.down };
}
function sendContinuousAim() {
    if (!battlePlanetGame.isActive()) return;
    if (!pointerState.down) return; // only send aim when firing

    const now = Date.now();
    if (now - lastInputSendAt < INPUT_SEND_INTERVAL_MS) return;

    lastInputSendAt = now;
    const payload = continuousAimPayload();
    if (!payload) return;
    inputSender(payload);
}
function screenToWorld(screenX, screenY) {
    return {
        x: (screenX - viewport.centerX) / zoom + camera.x,
        y: (screenY - viewport.centerY) / zoom + camera.y
    };
}

function worldToScreenX(worldX) {
    return (worldX - camera.x) * zoom + viewport.centerX;
}

function worldToScreenY(worldY) {
    return (worldY - camera.y) * zoom + viewport.centerY;
}

function worldToScreenSize(size) {
    return size * zoom;
}

function isCircleVisible(x, y, radius) {
    return (
        x + radius >= -VISIBILITY_MARGIN &&
        x - radius <= viewport.width + VISIBILITY_MARGIN &&
        y + radius >= -VISIBILITY_MARGIN &&
        y - radius <= viewport.height + VISIBILITY_MARGIN
    );
}

function perfNow() {
    return performance.now();
}

function roundPerfValue(value) {
    return Math.round(value * 100) / 100;
}
function recordPerfSample(sample) {
    const now = Date.now();
    if (perfState.frameCount === 0) perfState.sampleStartedAt = now;

    perfState.frameCount += 1;
    perfState.totals.frame += sample.frame;
    perfState.totals.background += sample.background;
    perfState.totals.arena += sample.arena;
    perfState.totals.entities += sample.entities;
    perfState.totals.effects += sample.effects;
    perfState.totals.ui += sample.ui;

    if (perfState.frameCount < PERF_SAMPLE_WINDOW) return;

    const elapsedMs = Math.max(1, now - perfState.sampleStartedAt);
    perfState.snapshot = {
        fps: roundPerfValue((perfState.frameCount * 1000) / elapsedMs),
        frameMs: roundPerfValue(perfState.totals.frame / perfState.frameCount),
        backgroundMs: roundPerfValue(perfState.totals.background / perfState.frameCount),
        arenaMs: roundPerfValue(perfState.totals.arena / perfState.frameCount),
        entitiesMs: roundPerfValue(perfState.totals.entities / perfState.frameCount),
        effectsMs: roundPerfValue(perfState.totals.effects / perfState.frameCount),
        uiMs: roundPerfValue(perfState.totals.ui / perfState.frameCount),
        sampleMs: elapsedMs,
        frames: perfState.frameCount,
        frameCap,
        viewport: { width: viewport.width, height: viewport.height },
        zoom: roundPerfValue(zoom),
        updatedAt: now
    };

    perfState.frameCount = 0;
    perfState.sampleStartedAt = 0;
    perfState.totals = { frame: 0, background: 0, arena: 0, entities: 0, effects: 0, ui: 0 };
    perfState.lastUpdatedAt = now;
    window.BattlePlanetPerf = perfState.snapshot;
}
function getPerfStats() {
    return (
        perfState.snapshot || {
            fps: 0,
            frameMs: 0,
            backgroundMs: 0,
            arenaMs: 0,
            entitiesMs: 0,
            effectsMs: 0,
            uiMs: 0,
            sampleMs: 0,
            frames: 0,
            frameCap,
            viewport: { width: viewport.width, height: viewport.height },
            zoom: roundPerfValue(zoom),
            updatedAt: perfState.lastUpdatedAt
        }
    );
}
function historyForEntity(entity) {
    const existing = roundHistory.get(entity.id);
    if (existing) {
        existing.name = entity.name || existing.name;
        existing.team = entity.team || existing.team;
        return existing;
    }

    const created = {
        id: entity.id,
        name: entity.name || entity.id,
        team: entity.team || "unknown",
        rounds: 0,
        wins: 0,
        losses: 0,
        deaths: 0,
        lastOutcome: ""
    };
    roundHistory.set(entity.id, created);
    return created;
}
function updateRoundHistory(state) {
    const currentEntities = [...state.players, ...state.enemies];
    currentEntities.forEach((entity) => historyForEntity(entity));

    if (state.status === "playing") {
        resolvedRoundStatus = null;
        return;
    }

    if (resolvedRoundStatus === state.status) return;
    resolvedRoundStatus = state.status;

    const playerTeamWon = state.status === "won";
    for (const entity of currentEntities) {
        const history = historyForEntity(entity);
        const alive = entity.alive !== false;
        const isPlayerTeam = entity.team !== "enemy";

        history.rounds += 1;
        if ((playerTeamWon && isPlayerTeam) || (!playerTeamWon && !isPlayerTeam)) {
            history.wins += 1;
        } else {
            history.losses += 1;
        }
        if (!alive) history.deaths += 1;
        history.lastOutcome = alive ? "survived" : "destroyed";
    }
}
function leaderboardLine(entry, { alive, instability, isLocalPlayer, history }) {
    const marker = isLocalPlayer ? ">" : " ";
    const stateLabel = alive ? "alive" : "dead";
    return `${marker} ${entry.name}  ${stateLabel}  +${instability}%  W${history.wins}-L${history.losses}  D${history.deaths}`;
}
function syncLocalPlayerVisual() { const player = getPlayer(); if (!player || player.alive === false) { localPlayerVisual = null; return; } if (!localPlayerVisual || localPlayerVisual.id !== player.id) { localPlayerVisual = { id: player.id, x: player.x, y: player.y, angle: player.angle, radius: player.radius, modifier: player.modifier }; return; } localPlayerVisual.x = lerp(localPlayerVisual.x, player.x, LOCAL_PLAYER_VISUAL_LERP); localPlayerVisual.y = lerp(localPlayerVisual.y, player.y, LOCAL_PLAYER_VISUAL_LERP); localPlayerVisual.angle = lerpAngle(localPlayerVisual.angle, player.angle, LOCAL_PLAYER_VISUAL_LERP); localPlayerVisual.radius = lerp(localPlayerVisual.radius, player.radius, LOCAL_PLAYER_VISUAL_LERP); localPlayerVisual.modifier = lerp(localPlayerVisual.modifier || player.modifier, player.modifier || 1, LOCAL_PLAYER_VISUAL_LERP); }
function renderStateForPlanet(planet, isLocalPlayer) { if (!isLocalPlayer || !localPlayerVisual || localPlayerVisual.id !== planet.id) return planet; return { ...planet, x: localPlayerVisual.x, y: localPlayerVisual.y, angle: localPlayerVisual.angle, radius: localPlayerVisual.radius, modifier: localPlayerVisual.modifier }; }
function activeSuns() { return networkState.suns && networkState.suns.length > 0 ? networkState.suns : [networkState.sun]; }
function primarySunRadius() { return ((networkState.suns && networkState.suns[0]) || networkState.sun).radius; }
function getPlayer() { return networkState.players.find((player) => player.id === networkState.playerId); }
function updateCamera() {
    const player = getPlayer();
    let focus = player;

    if (!player || player.alive === false) {
        const aliveAllies = networkState.players.filter(
            (p) => p.alive !== false && p.id !== networkState.playerId
        );
        if (aliveAllies.length > 0) {
            focus = aliveAllies[0];
        } else {
            const aliveEnemies = networkState.enemies.filter((e) => e.alive !== false);
            if (aliveEnemies.length > 0) focus = aliveEnemies[0];
        }
    }

    if (!focus) return;

    // Direct camera follow without sun weighting
    camera.x += (focus.x - camera.x) * CAMERA_LERP;
    camera.y += (focus.y - camera.y) * CAMERA_LERP;
}
function updateUi() {
    const aliveEnemies = networkState.enemies.filter((enemy) => enemy.alive !== false).length;
    const player = getPlayer();
    const isDead = player && player.alive === false;
    const controlsText =
        networkState.status === "won"
            ? "Round cleared. Restarting automatically."
            : networkState.status === "lost"
            ? "All players are down. Restarting automatically."
            : isDead
            ? `You are down. Spectating... Enemies left: ${aliveEnemies}`
            : `Aim with the cursor, click to eject a rock, wheel to zoom. Enemies left: ${aliveEnemies}.`;

    const now = Date.now();
    const shouldRefresh = now - lastUiTextUpdateAt >= UI_TEXT_REFRESH_MS;

    if (shouldRefresh && controlsText !== lastControlsText) {
        controlsElement.textContent = controlsText;
        lastControlsText = controlsText;
    }

    leaderboardElement.hidden = !showLeaderboard;

    if (showLeaderboard) {
        const perf = getPerfStats();

        const sortEntities = (left, right) => {
            const aliveDelta = (right.alive !== false) - (left.alive !== false);
            if (aliveDelta !== 0) return aliveDelta;
            return (right.modifier || 1) - (left.modifier || 1);
        };

        const players = [...networkState.players]
            .sort(sortEntities)
            .map((entry) => {
                const history = historyForEntity(entry);
                return leaderboardLine(entry, {
                    alive: entry.alive !== false,
                    instability: Math.round(((entry.modifier || 1) - 1) * 100),
                    isLocalPlayer: entry.id === networkState.playerId,
                    history
                });
            });

        const bots = [...networkState.enemies]
            .sort(sortEntities)
            .map((entry) => {
                const history = historyForEntity(entry);
                return leaderboardLine(entry, {
                    alive: entry.alive !== false,
                    instability: Math.round(((entry.modifier || 1) - 1) * 100),
                    isLocalPlayer: false,
                    history
                });
            });

        const historySummary = [...roundHistory.values()]
            .sort((left, right) => {
                if (right.wins !== left.wins) return right.wins - left.wins;
                if (left.losses !== right.losses) return left.losses - right.losses;
                return left.name.localeCompare(right.name);
            })
            .slice(0, 8)
            .map((entry) => `${entry.name}  W${entry.wins}-L${entry.losses}  D${entry.deaths}`);

        const leaderboardText = [
            "Match Board",
            `Status: ${networkState.status}   Enemies left: ${aliveEnemies}`,
            "",
            "Pilots",
            ...(players.length > 0 ? players : ["No pilots connected"]),
            "",
            "Bots",
            ...(bots.length > 0 ? bots : ["No bots"]),
            "",
            "Campaign",
            ...(historySummary.length > 0 ? historySummary : ["No completed rounds yet"]),
            "",
            "Rendering",
            `Cap ${perf.frameCap}   FPS ${perf.fps}   ${perf.frames} frames / ${perf.sampleMs}ms`,
            `Cost ${perf.frameMs}ms   BG ${perf.backgroundMs}   Arena ${perf.arenaMs}`,
            `Entities ${perf.entitiesMs}   Effects ${perf.effectsMs}   UI ${perf.uiMs}`,
            `Viewport ${perf.viewport.width}x${perf.viewport.height}  Zoom ${perf.zoom}`
        ].join("\n");

        if (shouldRefresh && leaderboardText !== lastLeaderboardText) {
            leaderboardElement.textContent = leaderboardText;
            lastLeaderboardText = leaderboardText;
        }
    } else if (lastLeaderboardText) {
        lastLeaderboardText = "";
    }

    if (shouldRefresh) lastUiTextUpdateAt = now;
}
function updateAudio() {
    const explosions = networkState.explosions || [];
    const recentIds = new Set();

    for (const explosion of explosions) {
        recentIds.add(explosion.id);
        if (!audioState.playedExplosions.has(explosion.id)) {
            ensureAudio();
            playExplosionSound(Math.max(0.8, Math.min(1.6, explosion.radius / 18)));
            audioState.playedExplosions.add(explosion.id);
        }
    }

    audioState.playedExplosions.forEach((id) => {
        if (!recentIds.has(id)) audioState.playedExplosions.delete(id);
    });
}
function labelForPlanet(planet, isLocalPlayer) {
    const instabilityPercent = Math.round(((planet.modifier || 1) - 1) * 100);
    const fallbackName = isLocalPlayer ? "You" : planet.team === "enemy" ? "Bot" : "Player";
    return `${planet.name || fallbackName}  +${instabilityPercent}%`;
}
function drawLabel(text, x, y, fillStyle, fontSize) {
    uiCtx.font = `700 ${fontSize}px 'Trebuchet MS', 'Segoe UI', sans-serif`;
    uiCtx.textAlign = "center";
    uiCtx.textBaseline = "bottom";
    uiCtx.lineJoin = "round";
    uiCtx.strokeStyle = "#07111d";
    uiCtx.lineWidth = Math.max(3, fontSize * 0.34);
    uiCtx.strokeText(text, x, y);
    uiCtx.fillStyle = fillStyle;
    uiCtx.fillText(text, x, y);
}

function getThreeObject(id, type, creator) {
    if (cache.threeObjects.has(id)) return cache.threeObjects.get(id);
    const obj = creator();
    scene.add(obj);
    cache.threeObjects.set(id, obj);
    return obj;
}

function renderPlanet(planet, isLocalPlayer) {
    const x = worldToScreenX(planet.x);
    const y = worldToScreenY(planet.y);
    const screenRadius = Math.max(2, worldToScreenSize(planet.radius));
    const sprite = getPlanetSprite(planet, isLocalPlayer);
    const auraRadius = Math.max(screenRadius + 2, sprite.auraRadius * zoom);

    const obj = getThreeObject(planet.id, "planet", () => {
        const texture = new THREE.CanvasTexture(sprite.node);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide
        });
        return new THREE.Mesh(cache.geometries.plane, material);
    });

    if (!isCircleVisible(x, y, auraRadius)) {
        obj.visible = false;
    } else {
        if (obj.material.map.image !== sprite.node) {
            obj.material.map.dispose();
            obj.material.map = new THREE.CanvasTexture(sprite.node);
        }
        obj.visible = true;
        obj.position.set(planet.x, planet.y, 5);
        obj.scale.set(sprite.size, sprite.size, 1);
    }

    const labelY = y - screenRadius - Math.max(10, worldToScreenSize(12));
    if (labelY > -VISIBILITY_MARGIN && labelY < viewport.height + VISIBILITY_MARGIN) {
        drawLabel(labelForPlanet(planet, isLocalPlayer), x, labelY, isLocalPlayer ? "#ffffff" : (planet.team === "enemy" ? "#ffd7bf" : "#d7e6f6"), Math.max(11, Math.min(18, 12 + zoom * 3.5)));
    }
}



function render() {
    const frameStart = perfNow();

    uiCtx.clearRect(0, 0, viewport.width, viewport.height);

    camera3d.position.x = camera.x;
    camera3d.position.y = camera.y;
    camera3d.zoom = zoom;
    camera3d.updateProjectionMatrix();

    const backgroundStart = perfNow();
    updateStarfield();
    const backgroundEnd = perfNow();

    buildArena();
    buildSun();
    const arenaDrawStart = perfNow();
    if (cache.arena) {
        cache.arena.position.set(0, 0, 1);
    }

    const suns = activeSuns();
    suns.forEach((sun, index) => {
        const id = `sun-${index}`;
        const obj = getThreeObject(id, "sun", () => {
            const mesh = new THREE.Mesh(cache.geometries.plane, cache.sun.material.clone());
            mesh.position.z = 2;
            return mesh;
        });
        const sunScale = (sun.radius / (primarySunRadius() || 1)) * cache.sun.prototypeSize;
        obj.position.set(sun.x, sun.y, 2);
        obj.scale.set(sunScale, sunScale, 1);
        if (obj.material.map !== cache.sun.material.map) {
            obj.material.map = cache.sun.material.map;
        }
        obj.visible = true;
    });

    const arenaDrawEnd = perfNow();
    const entitiesStart = perfNow();

    (networkState.asteroids || []).forEach((asteroid, index) => {
        const id = `asteroid-${asteroid.id || index}`;
        const obj = getThreeObject(id, "asteroid", () => {
            const material = new THREE.MeshBasicMaterial({ color: asteroid.color, side: THREE.DoubleSide });
            return new THREE.Mesh(cache.geometries.circle16, material);
        });
        obj.position.set(asteroid.x, asteroid.y, 3);
        obj.scale.set(asteroid.radius, asteroid.radius, 1);
        obj.material.color.set(asteroid.color);
        obj.visible = isCircleVisible(worldToScreenX(asteroid.x), worldToScreenY(asteroid.y), worldToScreenSize(asteroid.radius));
    });

    networkState.rocks.forEach((rock, index) => {
        const id = `rock-${rock.id || index}`;
        const obj = getThreeObject(id, "rock", () => {
            const material = new THREE.MeshBasicMaterial({ color: rock.color, side: THREE.DoubleSide });
            return new THREE.Mesh(cache.geometries.circle8, material);
        });
        obj.position.set(rock.x, rock.y, 4);
        obj.scale.set(rock.radius, rock.radius, 1);
        obj.material.color.set(rock.color);
        obj.visible = isCircleVisible(worldToScreenX(rock.x), worldToScreenY(rock.y), worldToScreenSize(rock.radius));
    });

    for (const player of networkState.players) renderPlanet(renderStateForPlanet(player, player.id === networkState.playerId), player.id === networkState.playerId);
    for (const enemy of networkState.enemies) renderPlanet(enemy, false);

    const entitiesEnd = perfNow();
    const effectsStart = perfNow();

    (networkState.explosions || []).forEach((explosion, index) => {
        const id = `explosion-${explosion.id || index}`;
        const obj = getThreeObject(id, "explosion", () => {
            const material = new THREE.MeshBasicMaterial({ color: explosion.color, transparent: true, side: THREE.DoubleSide });
            return new THREE.Mesh(cache.geometries.ring, material);
        });
        const alpha = explosion.maxTtl ? Math.max(0, explosion.ttl / explosion.maxTtl) : 0.5;
        const radius = explosion.radius * (1.35 - alpha * 0.35);
        obj.position.set(explosion.x, explosion.y, 6);
        obj.scale.set(radius, radius, 1);
        obj.material.color.set(explosion.color);
        obj.material.opacity = alpha * 0.9;
        obj.visible = isCircleVisible(worldToScreenX(explosion.x), worldToScreenY(explosion.y), worldToScreenSize(radius));
    });

    const currentIds = new Set([
        ...suns.map((_, i) => `sun-${i}`),
        ...(networkState.asteroids || []).map((a, i) => `asteroid-${a.id || i}`),
        ...networkState.rocks.map((r, i) => `rock-${r.id || i}`),
        ...networkState.players.map(p => p.id),
        ...networkState.enemies.map(e => e.id),
        ...(networkState.explosions || []).map((e, i) => `explosion-${e.id || i}`)
    ]);

    cache.threeObjects.forEach((obj, id) => {
        if (!currentIds.has(id)) obj.visible = false;
    });

    const effectsEnd = perfNow();

    renderer.render(scene, camera3d);

    const uiStart = perfNow();
    updateUi();
    const uiEnd = perfNow();
    recordPerfSample({ frame: uiEnd - frameStart, background: backgroundEnd - backgroundStart, arena: arenaDrawEnd - arenaDrawStart, entities: entitiesEnd - entitiesStart, effects: effectsEnd - effectsStart, ui: uiEnd - uiStart });
}
function frame(now) {
    if (now - lastRenderAt < targetFrameMs()) {
        if (isRunning) animationFrame = window.requestAnimationFrame(frame);
        return;
    }

    lastRenderAt = now;
    networkState = interpolatedState();
    syncLocalPlayerVisual();
    updateCamera();
    sendContinuousAim();
    updateAudio();
    render();

    if (isRunning) animationFrame = window.requestAnimationFrame(frame);
}

const battlePlanetGame = {
    start() { if (isRunning) return; isRunning = true; lastRenderAt = 0; animationFrame = window.requestAnimationFrame(frame); }, stop() { isRunning = false; if (animationFrame !== null) { window.cancelAnimationFrame(animationFrame); animationFrame = null; } }, resizeToContainer() { if (Date.now() - resizeTimestamp < RESIZE_THROTTLE_MS) return; resizeTimestamp = Date.now(); resizeBackingStore(); buildStarfield(); canvas.style.display = "block"; canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`; render(); }, setInputSender(sender) { inputSender = sender; }, setFullState(fullState) {
        // Use fullState directly as mutable base (no clone)
        baseState = fullState;

        // Record latency
        const snapshot = cloneState(fullState);
        recordLatencySample(snapshot);

        const offsetSample = Date.now() - snapshot.serverTime;
        if (serverOffsetEstimate === null) serverOffsetEstimate = offsetSample; else serverOffsetEstimate = Math.min(serverOffsetEstimate, offsetSample);
        
        // Keep only buffered snapshots that are older than this full state for continuity
        snapshotBuffer = snapshotBuffer.filter(s => s.tickNumber < snapshot.tickNumber);
        
        // Insert the new snapshot in order
        const last = snapshotBuffer[snapshotBuffer.length - 1];
        if (!last || snapshot.serverTime >= last.serverTime) {
            snapshotBuffer.push(snapshot);
        } else {
            // Out-of-order insertion (rare)
            let i = 0;
            while (i < snapshotBuffer.length && snapshotBuffer[i].serverTime < snapshot.serverTime) i++;
            snapshotBuffer.splice(i, 0, snapshot);
        }
        
        // Trim buffer if too large
        if (snapshotBuffer.length > MAX_SNAPSHOT_BUFFER) {
            snapshotBuffer = snapshotBuffer.slice(snapshotBuffer.length - MAX_SNAPSHOT_BUFFER);
        }
        networkState = interpolatedState();
        updateRoundHistory(networkState);
        buildArena(); buildSun();
        const player = getPlayer(); if (!player) localPlayerVisual = null;
        if (player && !hasInitialCamera) { camera.x = player.x; camera.y = player.y; hasInitialCamera = true; }
        render();
    },
    setDelta(packet) {
        if (!baseState) return;
        const { delta, meta } = packet;
        // Mutate baseState directly - no initial clone
        applyDeltaToState(baseState, delta);
        baseState.sun = baseState.suns[0];
        if (meta && meta.playerId !== undefined) {
            baseState.playerId = meta.playerId;
        }
        const snapshot = cloneState(baseState);
        if (meta) {
            if (meta.serverTime !== undefined) snapshot.serverTime = meta.serverTime;
            if (meta.tickNumber !== undefined) snapshot.tickNumber = meta.tickNumber;
            if (meta.status !== undefined) snapshot.status = meta.status;
            if (meta.playerId !== undefined) snapshot.playerId = meta.playerId;
        }
        // Record network latency from this snapshot
        recordLatencySample(snapshot);

        const offsetSample = Date.now() - snapshot.serverTime;
        if (serverOffsetEstimate === null) serverOffsetEstimate = offsetSample; else serverOffsetEstimate = Math.min(serverOffsetEstimate, offsetSample);

        const existingIndex = snapshotBuffer.findIndex((entry) => entry.tickNumber === snapshot.tickNumber);
        if (existingIndex >= 0) {
            snapshotBuffer[existingIndex] = snapshot;
        } else {
            // WebSocket guarantees order, so we can just push
            snapshotBuffer.push(snapshot);
        }
        // No sort needed due to monotonic delivery

        // Trim from front if buffer too large
        if (snapshotBuffer.length > MAX_SNAPSHOT_BUFFER) {
            snapshotBuffer = snapshotBuffer.slice(snapshotBuffer.length - MAX_SNAPSHOT_BUFFER);
        }

        networkState = interpolatedState();
        updateRoundHistory(networkState);
        render();
    }, clearState() {
        snapshotBuffer = [];
        serverOffsetEstimate = null;
        baseState = null;
        networkState = emptyState();
        audioState.playedExplosions.clear();
        lastUiTextUpdateAt = 0;
        lastControlsText = "";
        lastLeaderboardText = "";
        lastRenderAt = 0;
        camera = { x: 0, y: 0 };
        localPlayerVisual = null;
        hasInitialCamera = false;
        showLeaderboard = false;
        resolvedRoundStatus = null;
        roundHistory = new Map();
        leaderboardElement.hidden = true;
        cache.threeObjects.forEach(obj => scene.remove(obj));
        cache.threeObjects.clear();
        if (cache.arena) { scene.remove(cache.arena); cache.arena = null; }
        if (cache.sun) { scene.remove(cache.sun); cache.sun = null; }
        if (cache.stars) { scene.remove(cache.stars); cache.stars = null; }
        buildStarfield();
        buildArena();
        buildSun();
        render();
    }, getPerfStats() { return getPerfStats(); }, isActive() { return isRunning && hostElement.style.display !== "none"; }
};

function init() {
    buildStarfield();
    buildArena();
    buildSun();
    attachInputListeners();
    syncFrameCapControl();
    resizeBackingStore();
    render();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

window.BattlePlanetGame = battlePlanetGame;
