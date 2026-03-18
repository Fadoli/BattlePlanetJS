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
    const MIN_ZOOM = 0.55;
    const MAX_ZOOM = 1.45;
    const DEFAULT_ZOOM = 0.78;
    const ZOOM_STEP = 0.08;
    const INTERPOLATION_DELAY_MS = 120;
    const MAX_SNAPSHOT_BUFFER = 90;

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
    const bodyGraphics = new PIXI.Graphics();
    const hudText = new PIXI.Text("", {
        fill: 0xe8f0ff,
        fontFamily: "monospace",
        fontSize: 18,
        lineHeight: 26,
    });

    app.stage.addChild(starField);
    worldLayer.addChild(bodyGraphics);
    app.stage.addChild(worldLayer);
    app.stage.addChild(hudText);

    let resizeTimestamp = 0;
    let zoom = DEFAULT_ZOOM;
    let inputSender = () => {};
    let camera = { x: 0, y: 0 };
    let pointerState = { x: SCREEN_CENTER.x, y: SCREEN_CENTER.y };
    let networkState = {
        status: "waiting",
        serverTime: 0,
        tickNumber: 0,
        worldRadius: 1750,
        sun: { x: 0, y: 0, radius: 110 },
        players: [],
        enemies: [],
        rocks: [],
        playerId: undefined,
    };
    let snapshotBuffer = [];
    let serverOffsetEstimate = null;

    drawStarField();
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
                type: "aim",
                x: worldPoint.x,
                y: worldPoint.y,
            });
        });

        app.view.addEventListener("mousedown", (event) => {
            updatePointerPosition(event);
            if (!battlePlanetGame.isActive() || !getPlayer()) {
                return;
            }

            const worldPoint = getWorldPositionFromScreen(pointerState.x, pointerState.y);
            inputSender({
                type: "fire",
                x: worldPoint.x,
                y: worldPoint.y,
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
    }

    function createSeededRandom(seed) {
        let state = seed;
        return function nextRandom() {
            state = (state * 1664525 + 1013904223) % 4294967296;
            return state / 4294967296;
        };
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
        const player = getPlayer();
        const playerDistance = player ? Math.round(distanceBetween(player, networkState.sun)) : 0;
        const playerSpeed = player ? getSpeed(player).toFixed(2) : "0.00";
        const aliveEnemies = networkState.enemies.filter((enemy) => enemy.alive !== false).length;
        const teammates = networkState.players.length;

        const lines = [
            "BattlePlanet",
            "Shared lobby match: move the cursor to aim, click to eject a rock, wheel to zoom.",
            `Hull: ${player ? Math.max(0, player.health) : 0}    Speed: ${playerSpeed}    Teammates: ${teammates}`,
            `Orbit radius: ${playerDistance} / ${networkState.worldRadius}    Enemies: ${aliveEnemies}    Zoom: ${zoom.toFixed(2)}x`,
        ];

        if (networkState.status === "won") {
            lines.push("Round cleared. Restarting automatically...");
        } else if (networkState.status === "lost") {
            lines.push("All players are down. Restarting automatically...");
        } else if (!player) {
            lines.push("Waiting for your player state from the server...");
        } else {
            lines.push("Everyone in the lobby is looking at the same battle state now.");
        }

        hudText.text = lines.join("\n");
        hudText.x = 18;
        hudText.y = 16;
    }

    function drawArenaLimit() {
        const centerX = worldToScreenX(networkState.sun.x);
        const centerY = worldToScreenY(networkState.sun.y);
        const player = getPlayer();
        const playerDistance = player ? distanceBetween(player, networkState.sun) : 0;
        const warningAlpha = playerDistance > networkState.worldRadius * 0.82 ? 0.65 : 0.28;

        bodyGraphics.lineStyle(3, 0x60d4ff, warningAlpha);
        bodyGraphics.drawCircle(centerX, centerY, networkState.worldRadius);
        bodyGraphics.lineStyle(1.5, 0xffb347, 0.3);
        bodyGraphics.drawCircle(centerX, centerY, networkState.worldRadius * 0.82);
        bodyGraphics.lineStyle(0);
    }

    function renderPlanet(planet, isLocalPlayer) {
        const x = worldToScreenX(planet.x);
        const y = worldToScreenY(planet.y);
        const alpha = planet.alive === false ? 0.35 : 0.95;

        bodyGraphics.beginFill(planet.color, alpha);
        bodyGraphics.drawCircle(x, y, planet.radius);
        bodyGraphics.endFill();

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

    function render() {
        bodyGraphics.clear();
        drawArenaLimit();

        const sunX = worldToScreenX(networkState.sun.x);
        const sunY = worldToScreenY(networkState.sun.y);
        bodyGraphics.beginFill(0xffc857, 0.92);
        bodyGraphics.drawCircle(sunX, sunY, networkState.sun.radius);
        bodyGraphics.endFill();
        bodyGraphics.lineStyle(8, 0xffe29a, 0.08);
        bodyGraphics.drawCircle(sunX, sunY, networkState.sun.radius + 10);
        bodyGraphics.lineStyle(0);

        for (const player of networkState.players) {
            renderPlanet(player, player.id === networkState.playerId);
        }

        for (const enemy of networkState.enemies) {
            renderPlanet(enemy, false);
        }

        for (const rock of networkState.rocks) {
            bodyGraphics.beginFill(rock.color, 0.95);
            bodyGraphics.drawCircle(worldToScreenX(rock.x), worldToScreenY(rock.y), rock.radius);
            bodyGraphics.endFill();
        }

        renderSunDirectionGuide();
        renderPointerGuide();
        renderBoundaryWarning();
        updateStatusText();
    }

    app.ticker.add(() => {
        networkState = getInterpolatedNetworkState();
        updateCamera();
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
            const mainElement = document.getElementById("main");
            const ratioHeight = mainElement.offsetHeight / DEFAULT_SIZE.height;
            const ratioWidth = mainElement.offsetWidth / DEFAULT_SIZE.width;
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
                playerId: undefined,
            };
        },
        isActive() {
            return app.ticker.started && hostElement.style.display !== "none";
        },
    };

    globalScope.BattlePlanetGame = battlePlanetGame;
})(window);
