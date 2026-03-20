const { uuidv4 } = require("../../utils");

const TICKS_PER_SECOND = 20;
const TICK_RATE = 1000 / TICKS_PER_SECOND;
const WORLD_RADIUS = 1750;
const SUN_RADIUS = 110;
const SUN_MASS = 5200;
const BINARY_SUN_OFFSET = 360;
const BINARY_SUN_ANGULAR_SPEED = 0.22;
const ASTEROID_RADIUS = 24;
const ASTEROID_MASS = 360;
const PLAYER_EJECT_SPEED = 9.5;
const PLAYER_RECOIL = 0.72;
const ROCK_RADIUS = 6;
const ROCK_TTL = 10;
const ROCK_MASS = 8;
const SUN_BOUNCE_MULTIPLIER = 1.72;
const ROUND_RESET_MS = 2500;
const TEAM_PALETTES = Object.freeze({
    player: [
        0x48d1ff, 0x5ce1ff, 0x3ac1ff, 0x7af1ff, 
        0x00d2ff, 0x3a7bd5, 0x1cb5e0, 0x000046
    ],
    enemy: [
        0xff6b6b, 0xee0979, 0xff4b2b, 0xd4145a, // Reds/Pinks
        0x9f86ff, 0x8e44ad, 0xbb33ff, 0x663399, // Purples/Violets
        0xffb347, 0xf39c12, 0xff8c00, 0xd35400, // Oranges
        0xe67e22, 0xe74c3c, 0xc0392b, 0x96281b  // Deep Warm tones
    ],
    neutral: [
        0x8ef58f, 0xfab1ff, 0xffd166, 0xcfd8dc,
        0xa8ff78, 0xfbd3e9, 0xfeb47b, 0xff7e5f,
        0x76b852, 0x8e44ad, 0x16a085, 0x2c3e50
    ],
});
const BASE_MODIFIER = 1;
const MAX_MODIFIER = 6;
const ROCK_HIT_MODIFIER_GAIN = 0.05;
const SUN_HIT_MODIFIER_GAIN = 0.6;
const PLANET_COLLISION_MODIFIER_GAIN = 0.4;
const PLAYER_FIRE_COOLDOWN = 0.08;
const PLAYER_CLICK_FIRE_COOLDOWN = 0.045;
const EXPLOSION_TTL = 0.35;
const DEFAULT_SETTINGS = Object.freeze({
    botCount: 2,
    arenaSize: "standard",
    starMode: "single",
    hazards: "none",
    aiDifficulty: "standard",
    gameMode: "team-vs-bots",
});
const ARENA_PRESETS = Object.freeze({
    compact: {
        worldRadius: 1500,
        spawnOrbitRadius: 670,
    },
    standard: {
        worldRadius: 1750,
        spawnOrbitRadius: 760,
    },
    wide: {
        worldRadius: 2150,
        spawnOrbitRadius: 930,
    },
});
const AI_PRESETS = Object.freeze({
    easy: {
        thinkIntervalTicks: 8,
        turnRate: 0.028,
        cooldownMultiplier: 1.25,
        attackBias: 0.28,
        safetyBias: 1.18,
    },
    standard: {
        thinkIntervalTicks: 5,
        turnRate: 0.04,
        cooldownMultiplier: 0.9,
        attackBias: 0.45,
        safetyBias: 1,
    },
    hard: {
        thinkIntervalTicks: 3,
        turnRate: 0.058,
        cooldownMultiplier: 0.6,
        attackBias: 0.65,
        safetyBias: 0.9,
    },
    ace: {
        thinkIntervalTicks: 1,
        turnRate: 0.085,
        cooldownMultiplier: 0.4,
        attackBias: 0.9,
        safetyBias: 0.82,
    },
});

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

function distanceBetween(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function applyGravity(body, suns, dt) {
    if (!body.isAffectedByGravity) {
        return;
    }
    for (const sun of suns) {
        const dx = sun.x - body.x;
        const dy = sun.y - body.y;
        const distanceSquared = Math.max(dx * dx + dy * dy, 2500);
        const distance = Math.sqrt(distanceSquared);
        const acceleration = (sun.mass / distanceSquared) * (body.modifier || BASE_MODIFIER);
        body.vx += ((dx / distance) * acceleration) * dt * 60;
        body.vy += ((dy / distance) * acceleration) * dt * 60;
    }
}

function moveBody(body, dt) {
    body.x += body.vx * dt * 60;
    body.y += body.vy * dt * 60;
}

function resolvePlanetCollision(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    const overlap = a.radius + b.radius - distance;

    if (overlap <= 0) {
        return;
    }

    const nx = dx / distance;
    const ny = dy / distance;
    const separation = overlap / 2;

    a.x -= nx * separation;
    a.y -= ny * separation;
    b.x += nx * separation;
    b.y += ny * separation;

    const relativeVelocity = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (relativeVelocity >= 0) {
        return;
    }

    const effectiveMassA = a.mass / (a.modifier || BASE_MODIFIER);
    const effectiveMassB = b.mass / (b.modifier || BASE_MODIFIER);
    // Extreme bounciness (2.2) and massive kick floor (45.0)
    const impulse = Math.max(45.0, (-2.2 * relativeVelocity) / ((1 / effectiveMassA) + (1 / effectiveMassB)));
    a.vx -= (impulse * nx) / effectiveMassA;
    a.vy -= (impulse * ny) / effectiveMassA;
    b.vx += (impulse * nx) / effectiveMassB;
    b.vy += (impulse * ny) / effectiveMassB;
    increaseModifier(a, PLANET_COLLISION_MODIFIER_GAIN);
    increaseModifier(b, PLANET_COLLISION_MODIFIER_GAIN);
}

function bounceRock(body, rock) {
    const dx = rock.x - body.x;
    const dy = rock.y - body.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    const nx = dx / distance;
    const ny = dy / distance;
    const overlap = body.radius + rock.radius - distance;

    if (overlap > 0) {
        rock.x += nx * overlap;
        rock.y += ny * overlap;
    }

    const relativeVelocity = (rock.vx - body.vx) * nx + (rock.vy - body.vy) * ny;
    if (relativeVelocity >= 0) {
        return;
    }

    const effectiveMass = body.mass / (body.modifier || BASE_MODIFIER);
    const impulse = (-1.15 * relativeVelocity) / ((1 / effectiveMass) + (1 / rock.mass));
    body.vx -= (impulse * nx) / effectiveMass;
    body.vy -= (impulse * ny) / effectiveMass;
    rock.vx += (impulse * nx) / rock.mass;
    rock.vy += (impulse * ny) / rock.mass;
}

function increaseModifier(body, amount) {
    body.modifier = Math.min(MAX_MODIFIER, (body.modifier || BASE_MODIFIER) + amount);
}

function orbitalVelocity(aroundBody, x, y, speed) {
    const angle = Math.atan2(y - aroundBody.y, x - aroundBody.x);
    return {
        vx: -Math.sin(angle) * speed,
        vy: Math.cos(angle) * speed,
    };
}

function binarySunPosition(angle, distance) {
    return {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
    };
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function leadAngle(shooter, target, projectileSpeed) {
    const dx = target.x - shooter.x;
    const dy = target.y - shooter.y;
    const dvx = target.vx - shooter.vx;
    const dvy = target.vy - shooter.vy;
    const a = (dvx * dvx) + (dvy * dvy) - (projectileSpeed * projectileSpeed);
    const b = 2 * ((dx * dvx) + (dy * dvy));
    const c = (dx * dx) + (dy * dy);

    let time = null;
    if (Math.abs(a) < 0.0001) {
        if (Math.abs(b) > 0.0001) {
            time = -c / b;
        }
    } else {
        const discriminant = (b * b) - (4 * a * c);
        if (discriminant >= 0) {
            const root = Math.sqrt(discriminant);
            const t1 = (-b - root) / (2 * a);
            const t2 = (-b + root) / (2 * a);
            const validTimes = [t1, t2].filter((entry) => entry > 0);
            if (validTimes.length > 0) {
                time = Math.min(...validTimes);
            }
        }
    }

    const leadTime = clamp(time || (Math.sqrt(c) / Math.max(projectileSpeed, 0.001)), 0, 1.4);
    return Math.atan2(dy + (dvy * leadTime), dx + (dvx * leadTime));
}

function getPlanetColor(team, index, gameMode) {
    if (gameMode === "ffa" || (gameMode === "bots-ffa" && team !== "player")) {
        // Create a massive combined pool for maximum variety in FFA
        const ffaColors = [
            ...TEAM_PALETTES.enemy, 
            ...TEAM_PALETTES.neutral, 
            ...TEAM_PALETTES.player.slice(4) // Use some of the darker/unique player blues too
        ];
        return ffaColors[index % ffaColors.length];
    }
    const palette = TEAM_PALETTES[team] || TEAM_PALETTES.neutral;
    return palette[index % palette.length];
}

class GameManager {
    constructor(options = {}) {
        this.uuid = uuidv4();
        this.name = options.name || "BattlePlanet";
        this.settings = this.sanitizeSettings(options.settings);
        this.arena = ARENA_PRESETS[this.settings.arenaSize];
        this.tick = undefined;
        this.resetTimeout = undefined;
        this.tickNumber = 0;
        this.players = {};
        this.inputs = {};
        this.state = this.createRoundState();
    }

    sanitizeSettings(settings = {}) {
        const arenaSize = ARENA_PRESETS[settings.arenaSize] ? settings.arenaSize : DEFAULT_SETTINGS.arenaSize;
        const parsedBotCount = Number.parseInt(settings.botCount, 10);
        const botCount = Number.isFinite(parsedBotCount)
            ? Math.max(0, Math.min(5, parsedBotCount))
            : DEFAULT_SETTINGS.botCount;
        const starMode = settings.starMode === "binary" ? "binary" : DEFAULT_SETTINGS.starMode;
        const hazards = settings.hazards === "asteroids" ? "asteroids" : DEFAULT_SETTINGS.hazards;
        const aiDifficulty = AI_PRESETS[settings.aiDifficulty] ? settings.aiDifficulty : DEFAULT_SETTINGS.aiDifficulty;
        const gameMode = ["team-vs-bots", "ffa", "bots-ffa"].includes(settings.gameMode) ? settings.gameMode : DEFAULT_SETTINGS.gameMode;

        return {
            botCount,
            arenaSize,
            starMode,
            hazards,
            aiDifficulty,
            gameMode,
        };
    }

    createRoundState() {
        const suns = this.createSuns();
        return {
            status: "playing",
            sun: suns[0],
            suns,
            sunOrbitAngle: 0,
            rocks: [],
            explosions: [],
            asteroids: this.createAsteroids(suns),
            enemies: this.createEnemies(),
        };
    }

    createSuns() {
        if (this.settings.starMode === "binary") {
            const first = binarySunPosition(0, BINARY_SUN_OFFSET);
            const second = binarySunPosition(Math.PI, BINARY_SUN_OFFSET);
            return [
                {
                    id: "sun-a",
                    x: first.x,
                    y: first.y,
                    radius: SUN_RADIUS * 0.92,
                    mass: SUN_MASS * 0.78,
                    color: 0xffd166,
                },
                {
                    id: "sun-b",
                    x: second.x,
                    y: second.y,
                    radius: SUN_RADIUS * 0.88,
                    mass: SUN_MASS * 0.74,
                    color: 0xffb347,
                },
            ];
        }

        return [{
            id: "sun-a",
            x: 0,
            y: 0,
            radius: SUN_RADIUS,
            mass: SUN_MASS,
            color: 0xffd166,
        }];
    }

    createAsteroids(suns) {
        if (this.settings.hazards !== "asteroids") {
            return [];
        }

        const asteroids = [];
        const count = this.settings.starMode === "binary" ? 12 : 8;

        for (let index = 0; index < count; index += 1) {
            const anchorSun = suns[index % suns.length];
            const ringRadius = anchorSun.radius + 260 + (index % 4) * 54 + (this.settings.starMode === "binary" ? 20 : 0);
            const angle = ((Math.PI * 2) / count) * index + (index % 2) * 0.3;
            const x = anchorSun.x + Math.cos(angle) * ringRadius;
            const y = anchorSun.y + Math.sin(angle) * ringRadius;
            const orbit = orbitalVelocity(anchorSun, x, y, 2.2 + (index % 3) * 0.22);

            asteroids.push({
                id: `asteroid-${index + 1}`,
                team: "hazard",
                x,
                y,
                vx: orbit.vx,
                vy: orbit.vy,
                radius: ASTEROID_RADIUS + (index % 3) * 2,
                mass: ASTEROID_MASS + (index % 3) * 24,
                angle,
                modifier: 1,
                color: TEAM_PALETTES.neutral[index % TEAM_PALETTES.neutral.length],
                isAffectedByGravity: true,
                alive: true,
            });
        }

        return asteroids;
    }

    createEnemies() {
        const enemies = [];
        const count = this.settings.botCount;
        const orbitRadius = Math.min(this.arena.worldRadius * 0.66, this.arena.spawnOrbitRadius + 240);

        for (let index = 0; index < count; index += 1) {
            const angle = ((Math.PI * 2) / Math.max(1, count)) * index;
            const speed = 2.8 + (index % 3) * 0.32;
            const radius = 45; // Massive size
            const id = `bot-${index + 1}`;
            let team = "enemy";
            if (this.settings.gameMode === "bots-ffa") {
                team = id;
            } else if (this.settings.gameMode === "ffa") {
                team = id;
            }

            enemies.push(this.createEnemy(
                id,
                Math.cos(angle) * orbitRadius,
                Math.sin(angle) * orbitRadius,
                -Math.sin(angle) * speed,
                Math.cos(angle) * speed,
                radius,
                2 + (index % 2),
                getPlanetColor(team, index, this.settings.gameMode),
                team
            ));
        }

        return enemies;
    }

    createEnemy(id, x, y, vx, vy, radius, health, color, team) {
        return {
            id,
            name: id,
            team: team || "enemy",
            x,
            y,
            vx,
            vy,
            radius,
            mass: radius * 12,
            angle: Math.atan2(vy, vx),
            health,
            modifier: BASE_MODIFIER,
            color,
            shootCooldown: 0,
            aiAimAngle: Math.atan2(vy, vx),
            isAffectedByGravity: true,
            alive: true,
        };
    }

    spawnPlayerBody(token, index) {
        const angle = ((Math.PI * 2) / Math.max(1, index + 1)) * index - Math.PI / 2;
        const orbitRadius = this.arena.spawnOrbitRadius + (index % 2) * 120;
        const orbitalSpeed = 3.7 - (index % 2) * 0.25;
        let team = "player";
        if (this.settings.gameMode === "ffa") {
            team = token;
        }

        return {
            id: token,
            name: this.players[token] ? this.players[token].name : token,
            team,
            x: Math.cos(angle) * orbitRadius,
            y: Math.sin(angle) * orbitRadius,
            vx: -Math.sin(angle) * orbitalSpeed,
            vy: Math.cos(angle) * orbitalSpeed,
            radius: 45, // Massive size
            mass: 540,
            angle,
            health: 5,
            modifier: BASE_MODIFIER,
            color: getPlanetColor(team, index, this.settings.gameMode),
            shootCooldown: 0,
            isAffectedByGravity: true,
            alive: true,
        };
    }

    addPlayer(player) {
        const existing = this.players[player.token];
        this.players[player.token] = player;

        if (!existing) {
            const index = Object.keys(this.players).length - 1;
            this.state[player.token] = this.spawnPlayerBody(player.token, index);
            this.inputs[player.token] = { aimX: 0, aimY: 0, fireHeld: false, firePulse: false };
        }

        if (!this.tick) {
            this.start();
        } else {
            this.broadcastState();
        }
    }

    removePlayer(player) {
        delete this.players[player.token];
        delete this.inputs[player.token];
        delete this.state[player.token];

        if (Object.keys(this.players).length === 0) {
            this.stop();
        } else {
            this.broadcastState();
        }
    }

    start() {
        this.stop();
        this.tick = setInterval(() => this.update(), TICK_RATE);
        this.broadcastState();
    }

    stop() {
        if (this.tick) {
            clearInterval(this.tick);
            this.tick = undefined;
        }
        if (this.resetTimeout) {
            clearTimeout(this.resetTimeout);
            this.resetTimeout = undefined;
        }
    }

    handleInput(player, payload = {}) {
        const input = this.inputs[player.token];
        const body = this.state[player.token];
        if (!input || !body || !body.alive) {
            return;
        }

        if (typeof payload.x === "number" && typeof payload.y === "number") {
            input.aimX = payload.x;
            input.aimY = payload.y;
        }

        if (typeof payload.fireHeld === "boolean") {
            input.fireHeld = payload.fireHeld;
        }
        if (payload.firePulse === true) {
            input.firePulse = true;
        }
    }

    update() {
        this.tickNumber += 1;
        const dt = 1 / TICKS_PER_SECOND;
        const players = this.getAlivePlayers();
        const enemies = this.state.enemies.filter((enemy) => enemy.alive);
        const asteroids = this.state.asteroids.filter((asteroid) => asteroid.alive !== false);
        const planets = [...players, ...enemies];
        const collisionBodies = [...planets, ...asteroids];

        this.updateExplosions(dt);

        if (this.state.status !== "playing") {
            this.broadcastState();
            return;
        }

        this.updateSuns(dt);

        for (const planet of planets) {
            planet.shootCooldown = Math.max(0, planet.shootCooldown - dt);
        }

        this.applyPlayerInputs(players);
        for (const enemy of enemies) {
            this.updateEnemy(enemy, dt, planets);
        }

        for (const body of collisionBodies) {
            applyGravity(body, this.state.suns, dt);
            moveBody(body, dt);
        }

        for (let index = 0; index < collisionBodies.length; index += 1) {
            for (let secondIndex = index + 1; secondIndex < collisionBodies.length; secondIndex += 1) {
                resolvePlanetCollision(collisionBodies[index], collisionBodies[secondIndex]);
            }
        }

        this.updateRocks(dt, collisionBodies);
        this.handleSunCollisions(collisionBodies);
        this.handleArenaBounds(planets);
        this.checkRoundEnd();
        this.broadcastState();
    }

    updateSuns(dt) {
        if (this.settings.starMode !== "binary" || this.state.suns.length < 2) {
            return;
        }

        this.state.sunOrbitAngle = (this.state.sunOrbitAngle || 0) + (BINARY_SUN_ANGULAR_SPEED * dt);
        const first = binarySunPosition(this.state.sunOrbitAngle, BINARY_SUN_OFFSET);
        const second = binarySunPosition(this.state.sunOrbitAngle + Math.PI, BINARY_SUN_OFFSET);

        this.state.suns[0].x = first.x;
        this.state.suns[0].y = first.y;
        this.state.suns[1].x = second.x;
        this.state.suns[1].y = second.y;
        this.state.sun = this.state.suns[0];
    }

    applyPlayerInputs(players) {
        for (const player of players) {
            const input = this.inputs[player.id];
            if (!input) {
                continue;
            }

            player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
            if (input.firePulse && player.shootCooldown <= 0) {
                this.ejectRock(player, player.angle, PLAYER_RECOIL, PLAYER_EJECT_SPEED, ROCK_MASS, player.color);
                player.shootCooldown = PLAYER_CLICK_FIRE_COOLDOWN;
            } else if (input.fireHeld && player.shootCooldown <= 0) {
                this.ejectRock(player, player.angle, PLAYER_RECOIL, PLAYER_EJECT_SPEED, ROCK_MASS, player.color);
                player.shootCooldown = PLAYER_FIRE_COOLDOWN;
            }
            input.firePulse = false;
        }
    }

    updateEnemy(enemy, dt, planets) {
        let target = null;
        let minTargetDistance = Number.POSITIVE_INFINITY;

        for (const other of planets) {
            if (!other.alive || other.team === enemy.team || other.id === enemy.id) {
                continue;
            }
            const dist = distanceBetween(enemy, other);
            if (dist < minTargetDistance) {
                minTargetDistance = dist;
                target = other;
            }
        }

        if (!target) {
            return;
        }

        const aiPreset = AI_PRESETS[this.settings.aiDifficulty] || AI_PRESETS.standard;
        const shouldThink = this.tickNumber % aiPreset.thinkIntervalTicks === 0;

        const anchorSun = this.nearestSun(enemy);
        const toSunX = anchorSun.x - enemy.x;
        const toSunY = anchorSun.y - enemy.y;
        const sunDistance = Math.sqrt(toSunX * toSunX + toSunY * toSunY);
        const radialUnitX = toSunX / Math.max(sunDistance, 0.001);
        const radialUnitY = toSunY / Math.max(sunDistance, 0.001);
        const tangentUnitX = -radialUnitY;
        const tangentUnitY = radialUnitX;
        const radialVelocity = enemy.vx * radialUnitX + enemy.vy * radialUnitY;
        const tangentialVelocity = enemy.vx * tangentUnitX + enemy.vy * tangentUnitY;
        const interceptAngle = leadAngle(enemy, target, 7.9);
        const playerDistance = distanceBetween(enemy, target);
        const centerDistance = Math.sqrt((enemy.x * enemy.x) + (enemy.y * enemy.y));
        const secondarySun = this.state.suns.find((sun) => sun.id !== anchorSun.id);
        const secondarySunDistance = secondarySun ? distanceBetween(enemy, secondarySun) : Number.POSITIVE_INFINITY;
        const relativeVelocityX = target.vx - enemy.vx;
        const relativeVelocityY = target.vy - enemy.vy;
        const interceptVectorX = Math.cos(interceptAngle);
        const interceptVectorY = Math.sin(interceptAngle);
        const enemyDriftTowardSun = (enemy.vx * radialUnitX) + (enemy.vy * radialUnitY);

        // Scalable thresholds based on arena size
        const dangerLimit = this.arena.worldRadius * 0.22;
        const safeLimit = this.arena.worldRadius * 0.52;
        const farLimit = this.arena.worldRadius * 0.85;

        let desiredVectorX = tangentUnitX;
        let desiredVectorY = tangentUnitY;

        if (sunDistance < dangerLimit * aiPreset.safetyBias || secondarySunDistance < dangerLimit * 0.92 * aiPreset.safetyBias) {
            desiredVectorX = -radialUnitX * 1.95 + tangentUnitX * 0.42;
            desiredVectorY = -radialUnitY * 1.95 + tangentUnitY * 0.42;
        } else if (sunDistance < safeLimit * aiPreset.safetyBias) {
            desiredVectorX = -radialUnitX * 1.12 + tangentUnitX * 0.96;
            desiredVectorY = -radialUnitY * 1.12 + tangentUnitY * 0.96;
        } else if (Math.abs(radialVelocity) > 1.9) {
            desiredVectorX = -radialUnitX * Math.sign(radialVelocity) * 1.35 + tangentUnitX * 0.65;
            desiredVectorY = -radialUnitY * Math.sign(radialVelocity) * 1.35 + tangentUnitY * 0.65;
        } else if (centerDistance > farLimit) {
            desiredVectorX = (-enemy.x / Math.max(centerDistance, 0.001)) * 1.25 + tangentUnitX * 0.6;
            desiredVectorY = (-enemy.y / Math.max(centerDistance, 0.001)) * 1.25 + tangentUnitY * 0.6;
        }

        if (Math.abs(tangentialVelocity) < 2.2) {
            desiredVectorX += tangentUnitX * 0.7;
            desiredVectorY += tangentUnitY * 0.7;
        }

        const totalSpeed = Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy);
        if (totalSpeed > 6.2) {
            desiredVectorX -= enemy.vx * 0.15;
            desiredVectorY -= enemy.vy * 0.15;
        }

        desiredVectorX += (-radialUnitX * enemyDriftTowardSun) * 0.28;
        desiredVectorY += (-radialUnitY * enemyDriftTowardSun) * 0.28;

        if (playerDistance < this.arena.worldRadius * 0.45 && sunDistance > dangerLimit * 1.1) {
            desiredVectorX += interceptVectorX * aiPreset.attackBias;
            desiredVectorY += interceptVectorY * aiPreset.attackBias;
            desiredVectorX += relativeVelocityX * 0.045;
            desiredVectorY += relativeVelocityY * 0.045;
        }

        const desiredAngle = Math.atan2(desiredVectorY, desiredVectorX);
        if (shouldThink || typeof enemy.aiAimAngle !== "number") {
            enemy.aiAimAngle = desiredAngle;
        }
        const angleDelta = normalizeAngle(enemy.aiAimAngle - enemy.angle);
        enemy.angle += Math.sign(angleDelta) * Math.min(Math.abs(angleDelta), aiPreset.turnRate * dt * 60);

        if (enemy.shootCooldown <= 0) {
            if (sunDistance < dangerLimit * aiPreset.safetyBias || secondarySunDistance < dangerLimit * 0.94 * aiPreset.safetyBias || Math.abs(radialVelocity) > 2.5) {
                this.ejectRock(enemy, enemy.angle + Math.PI, 0.82, 8.4, 7, enemy.color);
                enemy.shootCooldown = 0.52 * aiPreset.cooldownMultiplier;
            } else if (centerDistance > farLimit) {
                this.ejectRock(enemy, enemy.angle + Math.PI, 0.75, 7.6, 7, enemy.color);
                enemy.shootCooldown = 0.68 * aiPreset.cooldownMultiplier;
            } else if (playerDistance < this.arena.worldRadius * 0.42 && shouldThink) {
                this.ejectRock(enemy, interceptAngle, 0.52, 7.9, 7, enemy.color);
                enemy.shootCooldown = 0.8 * aiPreset.cooldownMultiplier;
            }
        }
    }

    ejectRock(owner, angle, recoil, speed, mass, color) {
        const ejectDistance = owner.radius + ROCK_RADIUS + 6;
        const instability = owner.modifier || BASE_MODIFIER;

        this.state.rocks.push({
            id: uuidv4(),
            ownerId: owner.id,
            team: owner.team,
            x: owner.x + Math.cos(angle) * ejectDistance,
            y: owner.y + Math.sin(angle) * ejectDistance,

            y: owner.y + Math.sin(angle) * ejectDistance,
            vx: owner.vx + Math.cos(angle) * speed,
            vy: owner.vy + Math.sin(angle) * speed,
            radius: ROCK_RADIUS,
            mass,
            ttl: ROCK_TTL,
            color,
            isAffectedByGravity: true,
        });

        owner.vx -= Math.cos(angle) * recoil * instability;
        owner.vy -= Math.sin(angle) * recoil * instability;
    }

    nearestSun(body) {
        let closestSun = this.state.suns[0];
        let closestDistance = distanceBetween(body, closestSun);

        for (let index = 1; index < this.state.suns.length; index += 1) {
            const sun = this.state.suns[index];
            const distance = distanceBetween(body, sun);
            if (distance < closestDistance) {
                closestDistance = distance;
                closestSun = sun;
            }
        }

        return closestSun;
    }

    updateRocks(dt, planets) {
        this.state.rocks = this.state.rocks.filter((rock) => {
            rock.ttl -= dt;
            if (rock.ttl <= 0) {
                return false;
            }

            applyGravity(rock, this.state.suns, dt);
            moveBody(rock, dt);
            return true;
        });

        for (let index = 0; index < this.state.rocks.length; index += 1) {
            const rock = this.state.rocks[index];
            for (let secondIndex = index + 1; secondIndex < this.state.rocks.length; secondIndex += 1) {
                const otherRock = this.state.rocks[secondIndex];
                if (distanceBetween(rock, otherRock) >= rock.radius + otherRock.radius) {
                    continue;
                }

                rock.ttl = 0;
                otherRock.ttl = 0;
                this.spawnExplosion(
                    (rock.x + otherRock.x) / 2,
                    (rock.y + otherRock.y) / 2,
                    18,
                    0xffd8a8
                );
            }
        }

        for (const rock of this.state.rocks) {
            for (const planet of planets) {
                if (!planet.alive || rock.ownerId === planet.id || (rock.team === planet.team && rock.team !== undefined)) {
                    continue;
                }

                if (distanceBetween(rock, planet) >= rock.radius + planet.radius) {
                    continue;
                }

                bounceRock(planet, rock);
                increaseModifier(planet, ROCK_HIT_MODIFIER_GAIN);
                rock.ttl = Math.min(rock.ttl, 0.25);
                this.spawnExplosion(rock.x, rock.y, 16, rock.color);
            }
        }

        this.state.rocks = this.state.rocks.filter((rock) => rock.ttl > 0);
    }

    handleSunCollisions(planets) {
        for (const planet of planets) {
            if (!planet.alive) {
                continue;
            }
            for (const sun of this.state.suns) {
                if (distanceBetween(planet, sun) < planet.radius + sun.radius) {
                    this.bounceOffSun(planet, sun);
                    break;
                }
            }
        }

        this.state.rocks = this.state.rocks.filter(
            (rock) => {
                const collides = this.state.suns.some((sun) => distanceBetween(rock, sun) < rock.radius + sun.radius);
                if (collides) {
                    this.spawnExplosion(rock.x, rock.y, 18, 0xffd166);
                }
                return !collides;
            }
        );
    }

    bounceOffSun(planet, sun) {
        const dx = planet.x - sun.x;
        const dy = planet.y - sun.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        const normalX = dx / distance;
        const normalY = dy / distance;
        const minDistance = planet.radius + sun.radius;
        const overlap = minDistance - distance;
        const incomingSpeed = planet.vx * normalX + planet.vy * normalY;

        if (overlap > 0) {
            planet.x += normalX * overlap;
            planet.y += normalY * overlap;
        }

        const tangentX = -normalY;
        const tangentY = normalX;
        const tangentSpeed = planet.vx * tangentX + planet.vy * tangentY;
        const bounceSpeed = Math.max(8.5, Math.abs(incomingSpeed) * SUN_BOUNCE_MULTIPLIER + 3.6);

        planet.vx = normalX * bounceSpeed + tangentX * tangentSpeed * 0.92;
        planet.vy = normalY * bounceSpeed + tangentY * tangentSpeed * 0.92;
        increaseModifier(planet, SUN_HIT_MODIFIER_GAIN);
        this.spawnExplosion(
            planet.x - normalX * planet.radius,
            planet.y - normalY * planet.radius,
            24,
            0xffe29a
        );

    }

    handleArenaBounds(planets) {
        for (const planet of planets) {
            if (!planet.alive) {
                continue;
            }
            if (Math.sqrt((planet.x * planet.x) + (planet.y * planet.y)) > this.arena.worldRadius) {
                this.destroyPlanet(planet);
            }
        }
    }

    destroyPlanet(planet) {
        planet.alive = false;
        this.spawnExplosion(planet.x, planet.y, planet.radius + 10, 0xffffff);
        if (planet.team === "enemy") {
            this.state.enemies = this.state.enemies.filter((enemy) => enemy.id !== planet.id);
        }
    }

    updateExplosions(dt) {
        this.state.explosions = this.state.explosions.filter((explosion) => {
            explosion.ttl -= dt;
            return explosion.ttl > 0;
        });
    }

    spawnExplosion(x, y, radius, color) {
        this.state.explosions.push({
            id: uuidv4(),
            x,
            y,
            radius,
            color,
            ttl: EXPLOSION_TTL,
            maxTtl: EXPLOSION_TTL,
        });
    }

    checkRoundEnd() {
        if (this.state.status !== "playing") {
            return;
        }

        const alivePlanets = [...this.getAlivePlayers(), ...this.state.enemies.filter((e) => e.alive)];
        const teamsRemaining = new Set(alivePlanets.map((p) => p.team));

        if (teamsRemaining.size <= 1) {
            const playerToken = Object.keys(this.players)[0];
            const playerBody = playerToken ? this.state[playerToken] : null;

            if (playerBody && playerBody.alive) {
                this.state.status = "won";
            } else if (teamsRemaining.size === 0) {
                this.state.status = "lost";
            } else {
                // Bots won or a different team won
                this.state.status = "lost";
            }
        }

        if (this.state.status !== "playing" && !this.resetTimeout) {
            this.resetTimeout = setTimeout(() => {
                this.resetRound();
            }, ROUND_RESET_MS);
        }
    }

    resetRound() {
        const currentPlayers = Object.values(this.players);
        this.state = this.createRoundState();
        currentPlayers.forEach((player, index) => {
            this.state[player.token] = this.spawnPlayerBody(player.token, index);
        });
        this.resetTimeout = undefined;
    }

    getAlivePlayers() {
        return Object.keys(this.players)
            .map((token) => this.state[token])
            .filter((body) => body && body.alive);
    }

    buildSnapshot() {
        const round = (num) => Math.round(num * 10) / 10;
        const players = Object.keys(this.players)
            .map((token) => this.state[token])
            .filter(Boolean)
            .map((body) => ({
                id: body.id,
                name: body.name,
                team: body.team,
                x: round(body.x),
                y: round(body.y),
                vx: round(body.vx),
                vy: round(body.vy),
                radius: body.radius,
                angle: round(body.angle),
                health: body.health,
                modifier: round(body.modifier),
                color: body.color,
                alive: body.alive,
            }));

        const enemies = this.state.enemies.map((enemy) => ({
            id: enemy.id,
            name: enemy.name,
            team: enemy.team,
            x: round(enemy.x),
            y: round(enemy.y),
            vx: round(enemy.vx),
            vy: round(enemy.vy),
            radius: enemy.radius,
            angle: round(enemy.angle),
            health: enemy.health,
            modifier: round(enemy.modifier),
            color: enemy.color,
            alive: enemy.alive,
        }));

        const rocks = this.state.rocks.map((rock) => ({
            id: rock.id,
            ownerId: rock.ownerId,
            team: rock.team,
            x: round(rock.x),
            y: round(rock.y),
            radius: rock.radius,
            color: rock.color,
        }));

        const explosions = this.state.explosions.map((explosion) => ({
            id: explosion.id,
            x: round(explosion.x),
            y: round(explosion.y),
            radius: round(explosion.radius),
            color: explosion.color,
            ttl: round(explosion.ttl),
            maxTtl: round(explosion.maxTtl),
        }));

        const asteroids = this.state.asteroids.map((asteroid) => ({
            id: asteroid.id,
            team: asteroid.team,
            x: round(asteroid.x),
            y: round(asteroid.y),
            vx: round(asteroid.vx),
            vy: round(asteroid.vy),
            radius: asteroid.radius,
            angle: round(asteroid.angle),
            color: asteroid.color,
            alive: asteroid.alive,
        }));

        return {
            serverTime: Date.now(),
            tickNumber: this.tickNumber,
            status: this.state.status,
            worldRadius: this.arena.worldRadius,
            sun: {
                id: this.state.suns[0].id,
                x: round(this.state.suns[0].x),
                y: round(this.state.suns[0].y),
                radius: this.state.suns[0].radius,
                mass: this.state.suns[0].mass,
                color: this.state.suns[0].color,
            },
            suns: this.state.suns.map((sun) => ({
                id: sun.id,
                x: round(sun.x),
                y: round(sun.y),
                radius: sun.radius,
                mass: sun.mass,
                color: sun.color,
            })),
            players,
            enemies,
            rocks,
            explosions,
            asteroids,
        };
    }

    broadcastState() {
        const snapshot = this.buildSnapshot();
        for (const player of Object.values(this.players)) {
            if (typeof player.sendGameState !== "function") {
                continue;
            }
            player.sendGameState({
                ...snapshot,
                playerId: player.token,
            });
        }
    }
}

module.exports = GameManager;
