const { uuidv4 } = require("../../utils");

const TICKS_PER_SECOND = 30;
const TICK_RATE = 1000 / TICKS_PER_SECOND;
const WORLD_RADIUS = 1750;
const SUN_RADIUS = 110;
const SUN_MASS = 5200;
const PLAYER_EJECT_SPEED = 9.5;
const PLAYER_RECOIL = 0.72;
const ROCK_RADIUS = 6;
const ROCK_TTL = 10;
const ROCK_MASS = 8;
const SUN_BOUNCE_MULTIPLIER = 1.28;
const AI_DANGER_RADIUS = 340;
const AI_SAFE_ORBIT = 920;
const AI_FAR_RADIUS = 1460;
const ROUND_RESET_MS = 2500;
const PLAYER_COLORS = [0x48d1ff, 0x8ef58f, 0xfab1ff, 0xffd166];
const BASE_MODIFIER = 1;
const MAX_MODIFIER = 6;
const ROCK_HIT_MODIFIER_GAIN = 0.6;
const SUN_HIT_MODIFIER_GAIN = 1.2;
const PLANET_COLLISION_MODIFIER_GAIN = 0.18;
const PLAYER_FIRE_COOLDOWN = 0.08;
const PLAYER_CLICK_FIRE_COOLDOWN = 0.045;
const EXPLOSION_TTL = 0.35;
const DEFAULT_SETTINGS = Object.freeze({
    botCount: 2,
    arenaSize: "standard",
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
const ENEMY_PALETTE = [
    0xff6b6b,
    0xffb347,
    0xff8fab,
    0x9f86ff,
    0x87f5c7,
];

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

function applyGravity(body, sun, dt) {
    if (!body.isAffectedByGravity) {
        return;
    }

    const dx = sun.x - body.x;
    const dy = sun.y - body.y;
    const distanceSquared = Math.max(dx * dx + dy * dy, 2500);
    const distance = Math.sqrt(distanceSquared);
    const acceleration = (sun.mass / distanceSquared) * (body.modifier || BASE_MODIFIER);

    body.vx += ((dx / distance) * acceleration) * dt * 60;
    body.vy += ((dy / distance) * acceleration) * dt * 60;
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
    const impulse = (-1.1 * relativeVelocity) / ((1 / effectiveMassA) + (1 / effectiveMassB));
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

        return {
            botCount,
            arenaSize,
        };
    }

    createRoundState() {
        return {
            status: "playing",
            sun: {
                x: 0,
                y: 0,
                radius: SUN_RADIUS,
                mass: SUN_MASS,
            },
            rocks: [],
            explosions: [],
            enemies: this.createEnemies(),
        };
    }

    createEnemies() {
        const enemies = [];
        const count = this.settings.botCount;
        const orbitRadius = Math.min(this.arena.worldRadius * 0.66, this.arena.spawnOrbitRadius + 240);

        for (let index = 0; index < count; index += 1) {
            const angle = ((Math.PI * 2) / Math.max(1, count)) * index;
            const speed = 2.8 + (index % 3) * 0.32;
            const radius = 16 + (index % 3) * 2;
            enemies.push(this.createEnemy(
                `bot-${index + 1}`,
                Math.cos(angle) * orbitRadius,
                Math.sin(angle) * orbitRadius,
                -Math.sin(angle) * speed,
                Math.cos(angle) * speed,
                radius,
                2 + (index % 2),
                ENEMY_PALETTE[index % ENEMY_PALETTE.length]
            ));
        }

        return enemies;
    }

    createEnemy(id, x, y, vx, vy, radius, health, color) {
        return {
            id,
            name: id,
            team: "enemy",
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
            isAffectedByGravity: true,
            alive: true,
        };
    }

    spawnPlayerBody(token, index) {
        const angle = ((Math.PI * 2) / Math.max(1, index + 1)) * index - Math.PI / 2;
        const orbitRadius = this.arena.spawnOrbitRadius + (index % 2) * 120;
        const orbitalSpeed = 3.7 - (index % 2) * 0.25;
        return {
            id: token,
            name: this.players[token] ? this.players[token].name : token,
            team: "player",
            x: Math.cos(angle) * orbitRadius,
            y: Math.sin(angle) * orbitRadius,
            vx: -Math.sin(angle) * orbitalSpeed,
            vy: Math.cos(angle) * orbitalSpeed,
            radius: 22,
            mass: 264,
            angle,
            health: 5,
            modifier: BASE_MODIFIER,
            color: PLAYER_COLORS[index % PLAYER_COLORS.length],
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
        const planets = [...players, ...enemies];

        this.updateExplosions(dt);

        if (this.state.status !== "playing") {
            this.broadcastState();
            return;
        }

        for (const planet of planets) {
            planet.shootCooldown = Math.max(0, planet.shootCooldown - dt);
        }

        this.applyPlayerInputs(players);
        for (const enemy of enemies) {
            this.updateEnemy(enemy, dt, players);
        }

        for (const planet of planets) {
            applyGravity(planet, this.state.sun, dt);
            moveBody(planet, dt);
        }

        for (let index = 0; index < planets.length; index += 1) {
            for (let secondIndex = index + 1; secondIndex < planets.length; secondIndex += 1) {
                resolvePlanetCollision(planets[index], planets[secondIndex]);
            }
        }

        this.updateRocks(dt, planets);
        this.handleSunCollisions(planets);
        this.handleArenaBounds(planets);
        this.checkRoundEnd();
        this.broadcastState();
    }

    applyPlayerInputs(players) {
        for (const player of players) {
            const input = this.inputs[player.id];
            if (!input) {
                continue;
            }

            player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
            if (input.firePulse && player.shootCooldown <= 0) {
                this.ejectRock(player, player.angle, PLAYER_RECOIL, PLAYER_EJECT_SPEED, ROCK_MASS, 0xcfd8dc);
                player.shootCooldown = PLAYER_CLICK_FIRE_COOLDOWN;
            } else if (input.fireHeld && player.shootCooldown <= 0) {
                this.ejectRock(player, player.angle, PLAYER_RECOIL, PLAYER_EJECT_SPEED, ROCK_MASS, 0xcfd8dc);
                player.shootCooldown = PLAYER_FIRE_COOLDOWN;
            }
            input.firePulse = false;
        }
    }

    updateEnemy(enemy, dt, players) {
        const target = players[0];
        if (!target) {
            return;
        }

        const toSunX = this.state.sun.x - enemy.x;
        const toSunY = this.state.sun.y - enemy.y;
        const sunDistance = Math.sqrt(toSunX * toSunX + toSunY * toSunY);
        const radialUnitX = toSunX / Math.max(sunDistance, 0.001);
        const radialUnitY = toSunY / Math.max(sunDistance, 0.001);
        const tangentUnitX = -radialUnitY;
        const tangentUnitY = radialUnitX;
        const radialVelocity = enemy.vx * radialUnitX + enemy.vy * radialUnitY;
        const tangentialVelocity = enemy.vx * tangentUnitX + enemy.vy * tangentUnitY;
        const targetAngle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
        const playerDistance = distanceBetween(enemy, target);

        let desiredVectorX = tangentUnitX;
        let desiredVectorY = tangentUnitY;

        if (sunDistance < AI_DANGER_RADIUS) {
            desiredVectorX = -radialUnitX * 1.8 + tangentUnitX * 0.35;
            desiredVectorY = -radialUnitY * 1.8 + tangentUnitY * 0.35;
        } else if (sunDistance < AI_SAFE_ORBIT) {
            desiredVectorX = -radialUnitX * 1.05 + tangentUnitX * 0.9;
            desiredVectorY = -radialUnitY * 1.05 + tangentUnitY * 0.9;
        } else if (sunDistance > AI_FAR_RADIUS) {
            desiredVectorX = radialUnitX * 0.8 + tangentUnitX * 0.7;
            desiredVectorY = radialUnitY * 0.8 + tangentUnitY * 0.7;
        } else if (Math.abs(radialVelocity) > 1.9) {
            desiredVectorX = -radialUnitX * Math.sign(radialVelocity) * 1.2 + tangentUnitX;
            desiredVectorY = -radialUnitY * Math.sign(radialVelocity) * 1.2 + tangentUnitY;
        }

        if (Math.abs(tangentialVelocity) < 2.2) {
            desiredVectorX += tangentUnitX * 0.7;
            desiredVectorY += tangentUnitY * 0.7;
        }

        if (playerDistance < 720 && sunDistance > AI_DANGER_RADIUS * 1.1) {
            desiredVectorX += Math.cos(targetAngle) * 0.45;
            desiredVectorY += Math.sin(targetAngle) * 0.45;
        }

        const desiredAngle = Math.atan2(desiredVectorY, desiredVectorX);
        const angleDelta = normalizeAngle(desiredAngle - enemy.angle);
        enemy.angle += Math.sign(angleDelta) * Math.min(Math.abs(angleDelta), 0.04 * dt * 60);

        if (enemy.shootCooldown <= 0) {
            if (sunDistance < AI_DANGER_RADIUS || Math.abs(radialVelocity) > 2.5) {
                this.ejectRock(enemy, enemy.angle + Math.PI, 0.72, 8.4, 7, 0xe8c39e);
                enemy.shootCooldown = 0.55;
            } else if (sunDistance > AI_FAR_RADIUS) {
                this.ejectRock(enemy, enemy.angle + Math.PI, 0.62, 7.6, 7, 0xe8c39e);
                enemy.shootCooldown = 0.75;
            } else if (playerDistance < 680) {
                this.ejectRock(enemy, targetAngle, 0.52, 7.9, 7, 0xe8c39e);
                enemy.shootCooldown = 0.95;
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

    updateRocks(dt, planets) {
        this.state.rocks = this.state.rocks.filter((rock) => {
            rock.ttl -= dt;
            if (rock.ttl <= 0) {
                return false;
            }

            applyGravity(rock, this.state.sun, dt);
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
                if (!planet.alive || rock.ownerId === planet.id) {
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
            if (distanceBetween(planet, this.state.sun) < planet.radius + this.state.sun.radius) {
                this.bounceOffSun(planet);
            }
        }

        this.state.rocks = this.state.rocks.filter(
            (rock) => {
                const collides = distanceBetween(rock, this.state.sun) < rock.radius + this.state.sun.radius;
                if (collides) {
                    this.spawnExplosion(rock.x, rock.y, 18, 0xffd166);
                }
                return !collides;
            }
        );
    }

    bounceOffSun(planet) {
        const dx = planet.x - this.state.sun.x;
        const dy = planet.y - this.state.sun.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        const normalX = dx / distance;
        const normalY = dy / distance;
        const minDistance = planet.radius + this.state.sun.radius;
        const overlap = minDistance - distance;
        const incomingSpeed = planet.vx * normalX + planet.vy * normalY;

        if (overlap > 0) {
            planet.x += normalX * overlap;
            planet.y += normalY * overlap;
        }

        const tangentX = -normalY;
        const tangentY = normalX;
        const tangentSpeed = planet.vx * tangentX + planet.vy * tangentY;
        const bounceSpeed = Math.max(6.5, Math.abs(incomingSpeed) * SUN_BOUNCE_MULTIPLIER + 2.2);

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
            if (distanceBetween(planet, this.state.sun) > this.arena.worldRadius) {
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
        const alivePlayers = this.getAlivePlayers();
        if (alivePlayers.length === 0) {
            this.state.status = "lost";
        } else if (this.state.enemies.length === 0) {
            this.state.status = "won";
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
        const players = Object.keys(this.players)
            .map((token) => this.state[token])
            .filter(Boolean)
            .map((body) => ({
                id: body.id,
                name: body.name,
                team: body.team,
                x: body.x,
                y: body.y,
                vx: body.vx,
                vy: body.vy,
                radius: body.radius,
                angle: body.angle,
                health: body.health,
                modifier: body.modifier,
                color: body.color,
                alive: body.alive,
            }));

        const enemies = this.state.enemies.map((enemy) => ({
            id: enemy.id,
            name: enemy.name,
            team: enemy.team,
            x: enemy.x,
            y: enemy.y,
            vx: enemy.vx,
            vy: enemy.vy,
            radius: enemy.radius,
            angle: enemy.angle,
            health: enemy.health,
            modifier: enemy.modifier,
            color: enemy.color,
            alive: enemy.alive,
        }));

        const rocks = this.state.rocks.map((rock) => ({
            id: rock.id,
            ownerId: rock.ownerId,
            team: rock.team,
            x: rock.x,
            y: rock.y,
            radius: rock.radius,
            color: rock.color,
        }));

        const explosions = this.state.explosions.map((explosion) => ({
            id: explosion.id,
            x: explosion.x,
            y: explosion.y,
            radius: explosion.radius,
            color: explosion.color,
            ttl: explosion.ttl,
            maxTtl: explosion.maxTtl,
        }));

        return {
            serverTime: Date.now(),
            tickNumber: this.tickNumber,
            status: this.state.status,
            worldRadius: this.arena.worldRadius,
            sun: this.state.sun,
            players,
            enemies,
            rocks,
            explosions,
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
