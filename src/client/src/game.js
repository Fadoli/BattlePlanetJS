(function initBattlePlanetClient(globalScope) {
    const DEFAULT_SIZE = {
        width: 1024,
        height: 700,
    };
    const SCREEN_CENTER = {
        x: DEFAULT_SIZE.width / 2,
        y: DEFAULT_SIZE.height / 2,
    };
    const RESIZE_THROTTLE_MS = 100;
    const CAMERA_LERP = 0.12;
    const CAMERA_SUN_WEIGHT = 0.35;
    const MIN_ZOOM = 0.42;
    const MAX_ZOOM = 1.45;
    const DEFAULT_ZOOM = 0.78;
    const ZOOM_STEP = 0.08;
    const INTERPOLATION_DELAY_MS = 120;
    const MAX_SNAPSHOT_BUFFER = 90;
    const UI_TEXT_REFRESH_MS = 140;

    const app = new PIXI.Application({
        backgroundColor: 0x07111d,
        width: DEFAULT_SIZE.width,
        height: DEFAULT_SIZE.height,
        antialias: true,
    });

    const hostElement = document.getElementById("gameRender");
    hostElement.appendChild(app.view);

    const starField = new PIXI.Graphics();
    const worldLayer = new PIXI.Container();
    const staticWorldLayer = new PIXI.Container();
    const spriteWorldLayer = new PIXI.Container();
    const bodyGraphics = new PIXI.Graphics();
    const controlsElement = document.getElementById("gameControls");
    const leaderboardElement = document.createElement("div");
    leaderboardElement.className = "leaderboardOverlay";
    leaderboardElement.hidden = true;
    hostElement.appendChild(leaderboardElement);
    const audioState = {
        context: null,
        masterGain: null,
        lastExplosionId: null,
        playedExplosions: new Set(),
    };
    const labelCache = new Map();
    const rockSpriteCache = new Map();
    const explosionSpriteCache = new Map();
    const staticWorldSprites = {
        arena: null,
        sun: null,
    };
    const textureCache = {
        rock: null,
        explosion: null,
    };

    app.stage.addChild(starField);
    worldLayer.addChild(staticWorldLayer);
    worldLayer.addChild(spriteWorldLayer);
    worldLayer.addChild(bodyGraphics);
    app.stage.addChild(worldLayer);

    let resizeTimestamp = 0;
    let zoom = DEFAULT_ZOOM;
    let inputSender = () => {};
    let camera = { x: 0, y: 0 };
    let pointerState = { x: SCREEN_CENTER.x, y: SCREEN_CENTER.y, down: false };
    let showLeaderboard = false;
    let networkState = {
        status: "waiting",
        serverTime: 0,
        tickNumber: 0,
        worldRadius: 1750,
        sun: { x: 0, y: 0, radius: 110 },
        players: [],
        enemies: [],
        rocks: [],
        explosions: [],
        playerId: undefined,
    };
    let snapshotBuffer = [];
    let serverOffsetEstimate = null;
    let staticWorldCacheKey = "";
    let lastUiTextUpdateAt = 0;
    let lastControlsText = "";
    let lastLeaderboardText = "";

    drawStarField();
    ensureSpriteTextures();
    attachInputListeners();
    app.stop();
    render();

    function attachInputListeners() {
        function updatePointerPosition(event) {
            const rect = app.view.getBoundingClientRect();
            pointerState.x = ((event.clientX - rect.left) / rect.width) * DEFAULT_SIZE.width;
            pointerState.y = ((event.clientY - rect.top) / rect.height) * DEFAULT_SIZE.height;
        }

        app.view.addEventListener("mousemove", (event) => {
            updatePointerPosition(event);
            if (!battlePlanetGame.isActive() || !getPlayer()) {
                return;
            }

            const worldPoint = getWorldPositionFromScreen(pointerState.x, pointerState.y);
            inputSender({
                x: worldPoint.x,
                y: worldPoint.y,
                fireHeld: pointerState.down,
            });
        });

        app.view.addEventListener("mousedown", (event) => {
            updatePointerPosition(event);
            if (!battlePlanetGame.isActive() || !getPlayer()) {
                return;
            }

            pointerState.down = true;
            ensureAudio();
            playShootSound();
            const worldPoint = getWorldPositionFromScreen(pointerState.x, pointerState.y);
            inputSender({
                x: worldPoint.x,
                y: worldPoint.y,
                fireHeld: true,
                firePulse: true,
            });
        });

        window.addEventListener("mouseup", () => {
            if (!pointerState.down) {
                return;
            }
            pointerState.down = false;
            if (!battlePlanetGame.isActive() || !getPlayer()) {
                return;
            }
            const worldPoint = getWorldPositionFromScreen(pointerState.x, pointerState.y);
            inputSender({
                x: worldPoint.x,
                y: worldPoint.y,
                fireHeld: false,
            });
        });

        app.view.addEventListener("wheel", (event) => {
            event.preventDefault();
            const direction = Math.sign(event.deltaY);
            zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom - direction * ZOOM_STEP));
        }, { passive: false });

        app.view.addEventListener("contextmenu", (event) => {
            event.preventDefault();
        });

        window.addEventListener("resize", () => {
            battlePlanetGame.resizeToContainer();
        });

        window.addEventListener("keydown", (event) => {
            if (event.key !== "Tab" || !battlePlanetGame.isActive()) {
                return;
            }
            event.preventDefault();
            showLeaderboard = true;
        });

        window.addEventListener("keyup", (event) => {
            if (event.key !== "Tab") {
                return;
            }
            showLeaderboard = false;
        });
    }

    function createSeededRandom(seed) {
        let state = seed;
        return function nextRandom() {
            state = (state * 1664525 + 1013904223) % 4294967296;
            return state / 4294967296;
        };
    }

    function ensureAudio() {
        if (audioState.context) {
            if (audioState.context.state === "suspended") {
                audioState.context.resume();
            }
            return audioState.context;
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            return null;
        }

        const context = new AudioContextClass();
        const masterGain = context.createGain();
        masterGain.gain.value = 0.06;
        masterGain.connect(context.destination);

        audioState.context = context;
        audioState.masterGain = masterGain;
        return context;
    }

    function playTone({ frequency, duration, type, volume, rampTo = 0.0001, endFrequency }) {
        const context = ensureAudio();
        if (!context || !audioState.masterGain) {
            return;
        }

        const oscillator = context.createOscillator();
        const gainNode = context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, context.currentTime);
        if (typeof endFrequency === "number") {
            oscillator.frequency.exponentialRampToValueAtTime(endFrequency, context.currentTime + duration);
        }
        gainNode.gain.setValueAtTime(volume, context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(rampTo, context.currentTime + duration);
        oscillator.connect(gainNode);
        gainNode.connect(audioState.masterGain);
        oscillator.start();
        oscillator.stop(context.currentTime + duration);
    }

    function playShootSound() {
        playTone({
            frequency: 240,
            endFrequency: 120,
            duration: 0.08,
            type: "triangle",
            volume: 0.3,
        });
    }

    function playExplosionSound(scale = 1) {
        playTone({
            frequency: 180 * scale,
            endFrequency: 48,
            duration: 0.18,
            type: "sawtooth",
            volume: 0.24,
        });
        playTone({
            frequency: 90 * scale,
            endFrequency: 36,
            duration: 0.24,
            type: "triangle",
            volume: 0.16,
        });
    }

    function lerp(start, end, alpha) {
        return start + (end - start) * alpha;
    }

    function normalizeAngle(angle) {
        let value = angle;
        while (value <= -Math.PI) {
            value += Math.PI * 2;
        }
        while (value > Math.PI) {
            value -= Math.PI * 2;
        }
        return value;
    }

    function lerpAngle(start, end, alpha) {
        const delta = normalizeAngle(end - start);
        return normalizeAngle(start + delta * alpha);
    }

    function drawStarField() {
        const random = createSeededRandom(42);
        starField.clear();
        starField.beginFill(0x06111d);
        starField.drawRect(0, 0, DEFAULT_SIZE.width, DEFAULT_SIZE.height);
        starField.endFill();

        for (let index = 0; index < 200; index += 1) {
            const alpha = 0.18 + random() * 0.4;
            const size = 1 + random() * 2.2;
            starField.beginFill(0xffffff, alpha);
            starField.drawCircle(random() * DEFAULT_SIZE.width, random() * DEFAULT_SIZE.height, size);
            starField.endFill();
        }
    }

    function ensureSpriteTextures() {
        if (!textureCache.rock) {
            const rockGraphic = new PIXI.Graphics();
            rockGraphic.beginFill(0xffffff, 0.18);
            rockGraphic.drawCircle(0, 0, 10);
            rockGraphic.endFill();
            rockGraphic.beginFill(0xffffff, 0.88);
            rockGraphic.drawCircle(0, 0, 6);
            rockGraphic.endFill();
            textureCache.rock = app.renderer.generateTexture(rockGraphic, {
                region: new PIXI.Rectangle(-12, -12, 24, 24),
            });
            rockGraphic.destroy();
        }

        if (!textureCache.explosion) {
            const explosionGraphic = new PIXI.Graphics();
            explosionGraphic.beginFill(0xffffff, 0.2);
            explosionGraphic.drawCircle(0, 0, 38);
            explosionGraphic.endFill();
            explosionGraphic.lineStyle(5, 0xffffff, 0.55);
            explosionGraphic.drawCircle(0, 0, 24);
            explosionGraphic.lineStyle(0);
            textureCache.explosion = app.renderer.generateTexture(explosionGraphic, {
                region: new PIXI.Rectangle(-40, -40, 80, 80),
            });
            explosionGraphic.destroy();
        }
    }

    function rebuildStaticWorldSprites() {
        const cacheKey = `${Math.round(networkState.worldRadius)}:${Math.round(networkState.sun.radius)}`;
        if (cacheKey === staticWorldCacheKey) {
            return;
        }

        staticWorldCacheKey = cacheKey;
        staticWorldLayer.removeChildren();
        if (staticWorldSprites.arena) {
            staticWorldSprites.arena.destroy();
        }
        if (staticWorldSprites.sun) {
            staticWorldSprites.sun.destroy();
        }

        const arenaGraphic = new PIXI.Graphics();
        arenaGraphic.lineStyle(10, 0x0d2335, 0.9);
        arenaGraphic.drawCircle(0, 0, networkState.worldRadius);
        arenaGraphic.lineStyle(4, 0x60d4ff, 0.32);
        arenaGraphic.drawCircle(0, 0, networkState.worldRadius);
        arenaGraphic.lineStyle(1.5, 0xffb347, 0.3);
        arenaGraphic.drawCircle(0, 0, networkState.worldRadius * 0.82);
        arenaGraphic.lineStyle(0);
        const arenaTexture = app.renderer.generateTexture(arenaGraphic, {
            region: new PIXI.Rectangle(
                -(networkState.worldRadius + 16),
                -(networkState.worldRadius + 16),
                (networkState.worldRadius + 16) * 2,
                (networkState.worldRadius + 16) * 2
            ),
        });
        arenaGraphic.destroy();

        const sunExtent = networkState.sun.radius + 54;
        const sunGraphic = new PIXI.Graphics();
        sunGraphic.beginFill(0xffb347, 0.08);
        sunGraphic.drawCircle(0, 0, networkState.sun.radius + 42);
        sunGraphic.endFill();
        sunGraphic.beginFill(0xffd97a, 0.12);
        sunGraphic.drawCircle(0, 0, networkState.sun.radius + 22);
        sunGraphic.endFill();
        sunGraphic.beginFill(0xffc857, 0.92);
        sunGraphic.drawCircle(0, 0, networkState.sun.radius);
        sunGraphic.endFill();
        sunGraphic.beginFill(0xffffff, 0.18);
        sunGraphic.drawCircle(
            -networkState.sun.radius * 0.22,
            -networkState.sun.radius * 0.24,
            networkState.sun.radius * 0.52
        );
        sunGraphic.endFill();
        sunGraphic.lineStyle(8, 0xffe29a, 0.12);
        sunGraphic.drawCircle(0, 0, networkState.sun.radius + 10);
        sunGraphic.lineStyle(0);
        const sunTexture = app.renderer.generateTexture(sunGraphic, {
            region: new PIXI.Rectangle(-sunExtent, -sunExtent, sunExtent * 2, sunExtent * 2),
        });
        sunGraphic.destroy();

        staticWorldSprites.arena = new PIXI.Sprite(arenaTexture);
        staticWorldSprites.arena.anchor.set(0.5);
        staticWorldSprites.sun = new PIXI.Sprite(sunTexture);
        staticWorldSprites.sun.anchor.set(0.5);
        staticWorldLayer.addChild(staticWorldSprites.arena, staticWorldSprites.sun);
    }

    function updateStaticWorldSprites() {
        rebuildStaticWorldSprites();
        const sunX = worldToScreenX(networkState.sun.x);
        const sunY = worldToScreenY(networkState.sun.y);

        if (staticWorldSprites.arena) {
            staticWorldSprites.arena.x = sunX;
            staticWorldSprites.arena.y = sunY;
            staticWorldSprites.arena.scale.set(zoom);
            const player = getPlayer();
            const playerDistance = player ? distanceBetween(player, networkState.sun) : 0;
            staticWorldSprites.arena.alpha = 1;
            staticWorldSprites.arena.tint = playerDistance > networkState.worldRadius * 0.82 ? 0x8ee0ff : 0xffffff;
        }

        if (staticWorldSprites.sun) {
            staticWorldSprites.sun.x = sunX;
            staticWorldSprites.sun.y = sunY;
            staticWorldSprites.sun.scale.set(zoom);
        }
    }

    function getPlayer() {
        return networkState.players.find((player) => player.id === networkState.playerId);
    }

    function cloneState(state) {
        return {
            ...state,
            sun: { ...state.sun },
            players: state.players.map((player) => ({ ...player })),
            enemies: state.enemies.map((enemy) => ({ ...enemy })),
            rocks: state.rocks.map((rock) => ({ ...rock })),
            explosions: (state.explosions || []).map((explosion) => ({ ...explosion })),
        };
    }

    function interpolateEntity(previous, next, alpha) {
        const base = next || previous;
        if (!previous || !next) {
            return { ...base };
        }

        return {
            ...base,
            x: lerp(previous.x, next.x, alpha),
            y: lerp(previous.y, next.y, alpha),
            vx: typeof previous.vx === "number" && typeof next.vx === "number" ? lerp(previous.vx, next.vx, alpha) : base.vx,
            vy: typeof previous.vy === "number" && typeof next.vy === "number" ? lerp(previous.vy, next.vy, alpha) : base.vy,
            radius: typeof previous.radius === "number" && typeof next.radius === "number" ? lerp(previous.radius, next.radius, alpha) : base.radius,
            angle: typeof previous.angle === "number" && typeof next.angle === "number" ? lerpAngle(previous.angle, next.angle, alpha) : base.angle,
            health: typeof previous.health === "number" && typeof next.health === "number" ? lerp(previous.health, next.health, alpha) : base.health,
            modifier: typeof previous.modifier === "number" && typeof next.modifier === "number" ? lerp(previous.modifier, next.modifier, alpha) : base.modifier,
        };
    }

    function interpolateEntityList(previousList, nextList, alpha) {
        const previousMap = new Map(previousList.map((entity) => [entity.id, entity]));
        const nextMap = new Map(nextList.map((entity) => [entity.id, entity]));
        const ids = new Set([...previousMap.keys(), ...nextMap.keys()]);
        const result = [];

        for (const id of ids) {
            const previous = previousMap.get(id);
            const next = nextMap.get(id);
            if (!previous && !next) {
                continue;
            }
            result.push(interpolateEntity(previous, next, alpha));
        }

        return result;
    }

    function buildInterpolatedState(previous, next, alpha) {
        if (!previous) {
            return cloneState(next);
        }
        if (!next) {
            return cloneState(previous);
        }

        return {
            serverTime: lerp(previous.serverTime, next.serverTime, alpha),
            tickNumber: alpha < 0.5 ? previous.tickNumber : next.tickNumber,
            status: alpha < 0.5 ? previous.status : next.status,
            worldRadius: lerp(previous.worldRadius, next.worldRadius, alpha),
            sun: interpolateEntity(previous.sun, next.sun, alpha),
            players: interpolateEntityList(previous.players, next.players, alpha),
            enemies: interpolateEntityList(previous.enemies, next.enemies, alpha),
            rocks: interpolateEntityList(previous.rocks, next.rocks, alpha),
            explosions: interpolateEntityList(previous.explosions || [], next.explosions || [], alpha),
            playerId: next.playerId || previous.playerId,
        };
    }

    function getInterpolatedNetworkState() {
        if (snapshotBuffer.length === 0) {
            return networkState;
        }

        if (snapshotBuffer.length === 1 || serverOffsetEstimate === null) {
            return cloneState(snapshotBuffer[snapshotBuffer.length - 1]);
        }

        const renderServerTime = Date.now() - serverOffsetEstimate - INTERPOLATION_DELAY_MS;
        let previous = snapshotBuffer[0];
        let next = snapshotBuffer[snapshotBuffer.length - 1];

        for (let index = 0; index < snapshotBuffer.length; index += 1) {
            const snapshot = snapshotBuffer[index];
            if (snapshot.serverTime <= renderServerTime) {
                previous = snapshot;
            }
            if (snapshot.serverTime >= renderServerTime) {
                next = snapshot;
                break;
            }
        }

        if (previous === next) {
            return cloneState(previous);
        }

        const duration = Math.max(1, next.serverTime - previous.serverTime);
        const alpha = Math.max(0, Math.min(1, (renderServerTime - previous.serverTime) / duration));
        return buildInterpolatedState(previous, next, alpha);
    }

    function getWorldPositionFromScreen(screenX, screenY) {
        return {
            x: (screenX - SCREEN_CENTER.x) / zoom + camera.x,
            y: (screenY - SCREEN_CENTER.y) / zoom + camera.y,
        };
    }

    function worldToScreenX(worldX) {
        return (worldX - camera.x) * zoom + SCREEN_CENTER.x;
    }

    function worldToScreenY(worldY) {
        return (worldY - camera.y) * zoom + SCREEN_CENTER.y;
    }

    function distanceBetween(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function getSpeed(body) {
        return Math.sqrt(body.vx * body.vx + body.vy * body.vy);
    }

    function updateCamera() {
        const player = getPlayer();
        if (!player) {
            return;
        }

        const targetX = player.x * (1 - CAMERA_SUN_WEIGHT) + networkState.sun.x * CAMERA_SUN_WEIGHT;
        const targetY = player.y * (1 - CAMERA_SUN_WEIGHT) + networkState.sun.y * CAMERA_SUN_WEIGHT;
        camera.x += (targetX - camera.x) * CAMERA_LERP;
        camera.y += (targetY - camera.y) * CAMERA_LERP;
    }

    function updateStatusText() {
        const aliveEnemies = networkState.enemies.filter((enemy) => enemy.alive !== false).length;
        const controlsText = networkState.status === "won"
            ? "Round cleared. Restarting automatically. Hold Tab for leaderboard."
            : networkState.status === "lost"
                ? "All players are down. Restarting automatically. Hold Tab for leaderboard."
                : `Aim with the cursor, click to eject a rock, wheel to zoom, hold Tab for leaderboard. Enemies left: ${aliveEnemies}.`;
        const shouldRefreshUi = Date.now() - lastUiTextUpdateAt >= UI_TEXT_REFRESH_MS;
        if (shouldRefreshUi && controlsText !== lastControlsText) {
            controlsElement.textContent = controlsText;
            lastControlsText = controlsText;
        }
        leaderboardElement.hidden = !showLeaderboard;
        if (showLeaderboard) {
            const entries = [...networkState.players]
                .sort((left, right) => (right.modifier || 1) - (left.modifier || 1))
                .map((entry, index) => {
                    const instabilityPercent = Math.round(((entry.modifier || 1) - 1) * 100);
                    const marker = entry.id === networkState.playerId ? ">" : " ";
                    return `${marker} ${index + 1}. ${entry.name}  +${instabilityPercent}%`;
                });
            const bots = networkState.enemies
                .sort((left, right) => (right.modifier || 1) - (left.modifier || 1))
                .map((entry) => `${entry.name}  +${Math.round(((entry.modifier || 1) - 1) * 100)}%`);
            const leaderboardText = ["Leaderboard", ...entries, "", "Bots", ...bots, "", `Enemies left: ${aliveEnemies}`].join("\n");
            if (shouldRefreshUi && leaderboardText !== lastLeaderboardText) {
                leaderboardElement.textContent = leaderboardText;
                lastLeaderboardText = leaderboardText;
            }
        } else if (lastLeaderboardText) {
            lastLeaderboardText = "";
        }
        if (shouldRefreshUi) {
            lastUiTextUpdateAt = Date.now();
        }
    }

    function updateAudioFromState() {
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
            if (!recentIds.has(id)) {
                audioState.playedExplosions.delete(id);
            }
        });
    }

    function getPlanetLabel(planet, isLocalPlayer) {
        const instabilityPercent = Math.round(((planet.modifier || 1) - 1) * 100);
        const fallbackName = isLocalPlayer ? "You" : (planet.team === "enemy" ? "Bot" : "Player");
        return `${planet.name || fallbackName}  +${instabilityPercent}%`;
    }

    function renderPlanetLabel(planet, x, y, isLocalPlayer) {
        const labelKey = planet.id;
        const labelText = getPlanetLabel(planet, isLocalPlayer);
        let label = labelCache.get(labelKey);

        if (!label) {
            label = new PIXI.Text(labelText, {
                fill: 0xe8f0ff,
                fontFamily: "\"Trebuchet MS\", \"Segoe UI\", sans-serif",
                fontSize: 14,
                fontWeight: "700",
                stroke: 0x07111d,
                strokeThickness: 4,
                letterSpacing: 0.4,
            });
            label.anchor.set(0.5, 1);
            label.resolution = 1;
            labelCache.set(labelKey, label);
            worldLayer.addChild(label);
        }

        if (label.__labelText !== labelText) {
            label.text = labelText;
            label.__labelText = labelText;
        }

        const nextFill = isLocalPlayer ? 0xffffff : (planet.team === "enemy" ? 0xffd7bf : 0xd7e6f6);
        if (label.__labelFill !== nextFill) {
            label.style.fill = nextFill;
            label.__labelFill = nextFill;
        }
        label.alpha = planet.alive === false ? 0.4 : 0.95;
        label.x = x;
        label.y = y - planet.radius - 12;
    }

    function cleanupLabels() {
        const activeIds = new Set([
            ...networkState.players.map((player) => player.id),
            ...networkState.enemies.map((enemy) => enemy.id),
        ]);

        labelCache.forEach((label, id) => {
            if (activeIds.has(id)) {
                return;
            }
            worldLayer.removeChild(label);
            label.destroy();
            labelCache.delete(id);
        });
    }

    function renderPlanet(planet, isLocalPlayer) {
        const x = worldToScreenX(planet.x);
        const y = worldToScreenY(planet.y);
        const alpha = planet.alive === false ? 0.35 : 0.95;
        const instability = Math.max(0, Math.min(1, ((planet.modifier || 1) - 1) / 5));
        const auraRadius = planet.radius + 12 + instability * 12;

        bodyGraphics.beginFill(planet.color, isLocalPlayer ? 0.18 + instability * 0.08 : 0.1 + instability * 0.06);
        bodyGraphics.drawCircle(x, y, auraRadius);
        bodyGraphics.endFill();

        bodyGraphics.beginFill(0xffffff, alpha * 0.14);
        bodyGraphics.drawCircle(x - planet.radius * 0.22, y - planet.radius * 0.24, planet.radius * 0.78);
        bodyGraphics.endFill();

        bodyGraphics.beginFill(planet.color, alpha);
        bodyGraphics.drawCircle(x, y, planet.radius);
        bodyGraphics.endFill();

        bodyGraphics.lineStyle(isLocalPlayer ? 3 : 2, isLocalPlayer ? 0xffffff : 0xe4edf7, 0.16 + instability * 0.14);
        bodyGraphics.drawCircle(x, y, planet.radius + 4 + instability * 2);
        bodyGraphics.lineStyle(1.5, 0xffffff, 0.18);
        bodyGraphics.drawCircle(x, y, Math.max(8, planet.radius * 0.55));
        bodyGraphics.lineStyle(0);

        const outlineColor = isLocalPlayer ? 0xffffff : 0xc9d6e2;
        const outlineWidth = isLocalPlayer ? 3 : 2;
        const noseX = x + Math.cos(planet.angle) * (planet.radius + 8);
        const noseY = y + Math.sin(planet.angle) * (planet.radius + 8);
        const leftX = x + Math.cos(planet.angle + 2.4) * (planet.radius - 4);
        const leftY = y + Math.sin(planet.angle + 2.4) * (planet.radius - 4);
        const rightX = x + Math.cos(planet.angle - 2.4) * (planet.radius - 4);
        const rightY = y + Math.sin(planet.angle - 2.4) * (planet.radius - 4);

        bodyGraphics.lineStyle(outlineWidth, outlineColor, 0.82);
        bodyGraphics.moveTo(noseX, noseY);
        bodyGraphics.lineTo(leftX, leftY);
        bodyGraphics.lineTo(rightX, rightY);
        bodyGraphics.lineTo(noseX, noseY);
        bodyGraphics.lineStyle(0);

        renderPlanetLabel(planet, x, y, isLocalPlayer);
    }

    function renderPointerGuide() {
        const player = getPlayer();
        if (!player || player.alive === false || networkState.status !== "playing") {
            return;
        }

        const playerScreenX = worldToScreenX(player.x);
        const playerScreenY = worldToScreenY(player.y);
        bodyGraphics.lineStyle(1.5, 0x8cf0ff, 0.45);
        bodyGraphics.moveTo(playerScreenX, playerScreenY);
        bodyGraphics.lineTo(pointerState.x, pointerState.y);
        bodyGraphics.drawCircle(pointerState.x, pointerState.y, 8);
        bodyGraphics.lineStyle(0);
    }

    function renderSunDirectionGuide() {
        const player = getPlayer();
        if (!player) {
            return;
        }

        const playerScreenX = worldToScreenX(player.x);
        const playerScreenY = worldToScreenY(player.y);
        const sunScreenX = worldToScreenX(networkState.sun.x);
        const sunScreenY = worldToScreenY(networkState.sun.y);

        bodyGraphics.lineStyle(1.5, 0xffd166, 0.28);
        bodyGraphics.moveTo(playerScreenX, playerScreenY);
        bodyGraphics.lineTo(sunScreenX, sunScreenY);
        bodyGraphics.lineStyle(0);
    }

    function renderBoundaryWarning() {
        const player = getPlayer();
        if (!player) {
            return;
        }

        const playerDistance = distanceBetween(player, networkState.sun);
        if (playerDistance < networkState.worldRadius * 0.82) {
            return;
        }

        const intensity = Math.min(
            1,
            (playerDistance - networkState.worldRadius * 0.82) / (networkState.worldRadius * 0.18)
        );
        bodyGraphics.lineStyle(14, 0xff6b6b, 0.18 + intensity * 0.26);
        bodyGraphics.drawRect(7, 7, DEFAULT_SIZE.width - 14, DEFAULT_SIZE.height - 14);
        bodyGraphics.lineStyle(0);
    }

    function syncRockSprites() {
        const activeIds = new Set();

        for (const rock of networkState.rocks) {
            activeIds.add(rock.id);
            let sprite = rockSpriteCache.get(rock.id);
            if (!sprite) {
                sprite = new PIXI.Sprite(textureCache.rock);
                sprite.anchor.set(0.5);
                rockSpriteCache.set(rock.id, sprite);
                spriteWorldLayer.addChild(sprite);
            }

            sprite.x = worldToScreenX(rock.x);
            sprite.y = worldToScreenY(rock.y);
            sprite.scale.set((rock.radius * 2 * zoom) / 24);
            sprite.alpha = 0.95;
            sprite.tint = rock.color;
        }

        rockSpriteCache.forEach((sprite, id) => {
            if (activeIds.has(id)) {
                return;
            }
            spriteWorldLayer.removeChild(sprite);
            sprite.destroy();
            rockSpriteCache.delete(id);
        });
    }

    function syncExplosionSprites() {
        const activeIds = new Set();

        for (const explosion of networkState.explosions || []) {
            activeIds.add(explosion.id);
            let sprite = explosionSpriteCache.get(explosion.id);
            if (!sprite) {
                sprite = new PIXI.Sprite(textureCache.explosion);
                sprite.anchor.set(0.5);
                explosionSpriteCache.set(explosion.id, sprite);
                spriteWorldLayer.addChild(sprite);
            }

            const alpha = explosion.maxTtl ? Math.max(0, explosion.ttl / explosion.maxTtl) : 0.5;
            const radius = explosion.radius * (1.35 - alpha * 0.35);
            sprite.x = worldToScreenX(explosion.x);
            sprite.y = worldToScreenY(explosion.y);
            sprite.scale.set((radius * 2 * zoom) / 80);
            sprite.alpha = alpha * 0.72;
            sprite.tint = explosion.color;
        }

        explosionSpriteCache.forEach((sprite, id) => {
            if (activeIds.has(id)) {
                return;
            }
            spriteWorldLayer.removeChild(sprite);
            sprite.destroy();
            explosionSpriteCache.delete(id);
        });
    }

    function render() {
        bodyGraphics.clear();
        cleanupLabels();
        updateStaticWorldSprites();
        syncRockSprites();
        syncExplosionSprites();

        for (const player of networkState.players) {
            renderPlanet(player, player.id === networkState.playerId);
        }

        for (const enemy of networkState.enemies) {
            renderPlanet(enemy, false);
        }

        renderSunDirectionGuide();
        renderPointerGuide();
        renderBoundaryWarning();
        updateStatusText();
    }

    app.ticker.add(() => {
        networkState = getInterpolatedNetworkState();
        updateCamera();
        updateAudioFromState();
        render();
    });

    const battlePlanetGame = {
        start() {
            app.start();
        },
        stop() {
            app.stop();
        },
        resizeToContainer() {
            if (Date.now() - resizeTimestamp < RESIZE_THROTTLE_MS) {
                return;
            }

            resizeTimestamp = Date.now();
            const bounds = hostElement.getBoundingClientRect();
            const ratioHeight = bounds.height / DEFAULT_SIZE.height;
            const ratioWidth = bounds.width / DEFAULT_SIZE.width;
            const scale = Math.min(ratioWidth, ratioHeight);

            app.view.style.width = `${DEFAULT_SIZE.width * scale}px`;
            app.view.style.height = `${DEFAULT_SIZE.height * scale}px`;
        },
        setInputSender(sender) {
            inputSender = sender;
        },
        setState(nextState) {
            const snapshot = cloneState(nextState);
            const offsetSample = Date.now() - snapshot.serverTime;
            if (serverOffsetEstimate === null) {
                serverOffsetEstimate = offsetSample;
            } else {
                serverOffsetEstimate = Math.min(serverOffsetEstimate, offsetSample);
                serverOffsetEstimate = lerp(serverOffsetEstimate, offsetSample, 0.02);
            }

            const existingIndex = snapshotBuffer.findIndex((entry) => entry.tickNumber === snapshot.tickNumber);
            if (existingIndex >= 0) {
                snapshotBuffer[existingIndex] = snapshot;
            } else {
                snapshotBuffer.push(snapshot);
            }
            snapshotBuffer.sort((left, right) => left.serverTime - right.serverTime);
            if (snapshotBuffer.length > MAX_SNAPSHOT_BUFFER) {
                snapshotBuffer = snapshotBuffer.slice(snapshotBuffer.length - MAX_SNAPSHOT_BUFFER);
            }

            networkState = getInterpolatedNetworkState();
            const player = getPlayer();
            if (player && camera.x === 0 && camera.y === 0) {
                camera.x = player.x * (1 - CAMERA_SUN_WEIGHT) + networkState.sun.x * CAMERA_SUN_WEIGHT;
                camera.y = player.y * (1 - CAMERA_SUN_WEIGHT) + networkState.sun.y * CAMERA_SUN_WEIGHT;
            }
        },
        clearState() {
            snapshotBuffer = [];
            serverOffsetEstimate = null;
            networkState = {
                status: "waiting",
                serverTime: 0,
                tickNumber: 0,
                worldRadius: 1750,
                sun: { x: 0, y: 0, radius: 110 },
                players: [],
                enemies: [],
                rocks: [],
                explosions: [],
                playerId: undefined,
            };
            audioState.playedExplosions.clear();
            rockSpriteCache.forEach((sprite) => sprite.destroy());
            rockSpriteCache.clear();
            explosionSpriteCache.forEach((sprite) => sprite.destroy());
            explosionSpriteCache.clear();
            staticWorldLayer.removeChildren();
            staticWorldCacheKey = "";
            lastUiTextUpdateAt = 0;
            lastControlsText = "";
            lastLeaderboardText = "";
            showLeaderboard = false;
            leaderboardElement.hidden = true;
        },
        isActive() {
            return app.ticker.started && hostElement.style.display !== "none";
        },
    };

    globalScope.BattlePlanetGame = battlePlanetGame;
})(window);
