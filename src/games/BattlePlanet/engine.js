/**
 * Shared deterministic game engine for BattlePlanet
 * Both server and client use this to simulate game state identically
 */

const {
    buildSun,
    buildPlanet,
    buildBullet,
} = require("./src/physicalObject");

// Constants
const WORLD_RADIUS_STANDARD = 1750;
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
const BASE_MODIFIER = 1;
const MAX_MODIFIER = 6;
const ROCK_HIT_MODIFIER_GAIN = 0.05;
const SUN_HIT_MODIFIER_GAIN = 0.6;
const PLANET_COLLISION_MODIFIER_GAIN = 0.4;
const PLAYER_FIRE_COOLDOWN = 0.08;
const PLAYER_CLICK_FIRE_COOLDOWN = 0.045;
const EXPLOSION_TTL = 0.35;

// Event types
const EVENT_TYPES = {
    ROCK_EJECTED: 'rockEjected',
    ROCK_DESTROYED: 'rockDestroyed',
    EXPLOSION_SPAWNED: 'explosionSpawned',
    PLANET_COLLISION: 'planetCollision',
    SUN_COLLISION: 'sunCollision',
    ENTITY_REMOVED: 'entityRemoved',
    ROUND_END: 'roundEnd',
    ROUND_RESET: 'roundReset',
};

// Rounding for network
function round10(num) { return Math.round(num * 10) / 10; }
function roundAngle10(num) { return Math.round(num * 10) / 10; }

// Compute a minimal delta between two snapshots for visible entities only
function computeDelta(oldSnapshot, newSnapshot, visibleIds) {
    const delta = {};
    const types = ['players', 'enemies', 'rocks', 'asteroids', 'explosions', 'suns'];
    for (const type of types) {
        const oldList = oldSnapshot[type] || [];
        const newList = newSnapshot[type] || [];
        const oldMap = new Map(oldList.map(e => [e.id, e]));
        const newMap = new Map(newList.map(e => [e.id, e]));
        const changes = [];
        // Check visible entities in new snapshot
        for (const id of visibleIds) {
            const oldEnt = oldMap.get(id);
            const newEnt = newMap.get(id);
            if (!newEnt) continue; // not present, maybe ignore (removals handled separately)
            if (!oldEnt) {
                // New entity, include full
                changes.push({ id, ...newEnt });
            } else {
                // Compute changed fields
                const diff = {};
                for (const key of Object.keys(newEnt)) {
                    if (oldEnt[key] !== newEnt[key]) {
                        diff[key] = newEnt[key];
                    }
                }
                if (Object.keys(diff).length > 0) {
                    changes.push({ id, ...diff });
                }
            }
        }
        // Check removals: entities that were in oldMap but not in newMap and were visible
        for (const id of visibleIds) {
            if (!newMap.has(id) && oldMap.has(id)) {
                changes.push({ id, _removed: true });
            }
        }
        if (changes.length > 0) delta[type] = changes;
    }
    // Include metadata that always changes (tick, status) if needed
    if (newSnapshot.status !== oldSnapshot.status || newSnapshot.tickNumber !== oldSnapshot.tickNumber) {
        delta.meta = { tickNumber: newSnapshot.tickNumber, status: newSnapshot.status };
    }
    return delta;
}

// Physics utilities
function normalizeAngle(angle) {
    let value = angle;
    while (value <= -Math.PI) value += Math.PI * 2;
    while (value > Math.PI) value -= Math.PI * 2;
    return value;
}

function distanceSquared(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return dx * dx + dy * dy;
}

function distanceBetween(a, b) {
    return Math.sqrt(distanceSquared(a, b));
}

function applyGravity(body, suns, dt) {
    if (!body.isAffectedByGravity) return;
    for (const sun of suns) {
        const dx = sun.x - body.x;
        const dy = sun.y - body.y;
        const distSq = Math.max(dx * dx + dy * dy, 2500);
        const dist = Math.sqrt(distSq);
        const accel = (sun.mass / distSq) * (body.modifier || BASE_MODIFIER);
        body.vx += (dx / dist) * accel * dt * 60;
        body.vy += (dy / dist) * accel * dt * 60;
    }
}

function moveBody(body, dt) {
    body.x += body.vx * dt * 60;
    body.y += body.vy * dt * 60;
}

function resolvePlanetCollision(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const distSq = dx * dx + dy * dy;
    const dist = Math.sqrt(distSq) || 0.0001;
    const overlap = a.radius + b.radius - dist;
    if (overlap <= 0) return null;
    const nx = dx / dist, ny = dy / dist, sep = overlap / 2;
    a.x -= nx * sep; a.y -= ny * sep;
    b.x += nx * sep; b.y += ny * sep;
    const relVel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (relVel >= 0) return null;
    const massA = a.mass / (a.modifier || BASE_MODIFIER);
    const massB = b.mass / (b.modifier || BASE_MODIFIER);
    const impulse = Math.max(45.0, (-2.2 * relVel) / ((1/massA) + (1/massB)));
    a.vx -= (impulse * nx) / massA; a.vy -= (impulse * ny) / massA;
    b.vx += (impulse * nx) / massB; b.vy += (impulse * ny) / massB;
    return { aId: a.id, bId: b.id, impulse };
}

function bounceRock(body, rock) {
    const dx = rock.x - body.x, dy = rock.y - body.y;
    const dist = Math.sqrt(dx*dx + dy*dy) || 0.0001;
    const nx = dx/dist, ny = dy/dist, overlap = body.radius + rock.radius - dist;
    if (overlap > 0) { rock.x += nx*overlap; rock.y += ny*overlap; }
    const relVel = (rock.vx - body.vx)*nx + (rock.vy - body.vy)*ny;
    if (relVel >= 0) return false;
    const effMass = body.mass / (body.modifier || BASE_MODIFIER);
    const impulse = (-1.15 * relVel) / ((1/effMass) + (1/rock.mass));
    body.vx -= (impulse * nx) / effMass; body.vy -= (impulse * ny) / effMass;
    rock.vx += (impulse * nx) / rock.mass; rock.vy += (impulse * ny) / rock.mass;
    return true;
}

function increaseModifier(body, amount) {
    body.modifier = Math.min(MAX_MODIFIER, (body.modifier || BASE_MODIFIER) + amount);
}

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

function leadAngle(shooter, target, projSpeed) {
    const dx = target.x - shooter.x, dy = target.y - shooter.y;
    const dvx = target.vx - shooter.vx, dvy = target.vy - shooter.vy;
    const a = dvx*dvx + dvy*dvy - projSpeed*projSpeed;
    const b = 2 * (dx*dvx + dy*dvy);
    const c = dx*dx + dy*dy;
    let t = null;
    if (Math.abs(a) < 0.0001) {
        if (Math.abs(b) > 0.0001) t = -c / b;
    } else {
        const disc = b*b - 4*a*c;
        if (disc >= 0) {
            const root = Math.sqrt(disc);
            const t1 = (-b - root) / (2*a), t2 = (-b + root) / (2*a);
            const valid = [t1, t2].filter(x => x > 0);
            if (valid.length) t = Math.min(...valid);
        }
    }
    const leadTime = clamp(t || (Math.sqrt(c) / Math.max(projSpeed, 0.001)), 0, 1.4);
    return Math.atan2(dy + dvy*leadTime, dx + dvx*leadTime);
}

// Presets
const ARENA_PRESETS = {
    compact: { worldRadius: 1500, spawnOrbitRadius: 670 },
    standard: { worldRadius: 1750, spawnOrbitRadius: 760 },
    wide: { worldRadius: 2150, spawnOrbitRadius: 930 },
};

const AI_PRESETS = {
    easy: { thinkIntervalTicks: 8, turnRate: 0.028, cooldownMult: 1.25, attackBias: 0.28, safetyBias: 1.18 },
    standard: { thinkIntervalTicks: 5, turnRate: 0.04, cooldownMult: 0.9, attackBias: 0.45, safetyBias: 1 },
    hard: { thinkIntervalTicks: 3, turnRate: 0.058, cooldownMult: 0.6, attackBias: 0.65, safetyBias: 0.9 },
    ace: { thinkIntervalTicks: 1, turnRate: 0.085, cooldownMult: 0.4, attackBias: 0.9, safetyBias: 0.82 },
};

// Colors
const PLAYER_PALETTE = [0x48d1ff, 0x5ce1ff, 0x3ac1ff, 0x7af1ff, 0x00d2ff, 0x3a7bd5, 0x1cb5e0, 0x000046];
const ALL_ENEMY_COLORS = [0xff6b6b, 0xee0979, 0xff4b2b, 0xd4145a, 0x9f86ff, 0x8e44ad, 0xbb33ff, 0x663399, 0xffb347, 0xf39c12, 0xff8c00, 0xd35400, 0xe67e22, 0xe74c3c, 0xc0392b, 0x96281b];
function getPlayerColor(team, index, gameMode) {
    if (gameMode === "ffa" || (gameMode === "bots-ffa" && team !== "player")) {
        const all = [...ALL_ENEMY_COLORS, ...PLAYER_PALETTE.slice(4)];
        return all[index % all.length];
    }
    return PLAYER_PALETTE[index % PLAYER_PALETTE.length];
}
function getEnemyColor(index, gameMode) {
    if (gameMode === "ffa" || gameMode === "bots-ffa") {
        return ALL_ENEMY_COLORS[index % ALL_ENEMY_COLORS.length];
    }
    return ALL_ENEMY_COLORS[(index % 4) * 4]; // distinct palette groups
}

function binarySunPosition(angle, distance) {
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
}

function orbitalVelocity(aroundBody, x, y, speed) {
    const angle = Math.atan2(y - aroundBody.y, x - aroundBody.x);
    return { vx: -Math.sin(angle) * speed, vy: Math.cos(angle) * speed };
}

class GameEngine {
    constructor(settings, options = {}) {
        this.settings = this.sanitizeSettings(settings);
        this.arena = ARENA_PRESETS[this.settings.arenaSize];
        this.tickNumber = 0;
        this.status = 'playing';
        this.clock = options.clock || { now: () => Date.now() };
        this.idCounter = 0;

        // State
        this.players = {}; // token -> { name, inputs }
        this.entities = {
            players: {},    // token -> body
            enemies: [],
            rocks: [],
            asteroids: [],
            suns: [],
            explosions: []
        };

        this.events = [];
        this.reset();
    }

    sanitizeSettings(settings = {}) {
        const arenaSize = ARENA_PRESETS[settings.arenaSize] ? settings.arenaSize : 'standard';
        const botCount = Math.max(0, Math.min(5, Number.parseInt(settings.botCount, 10) || 2));
        const starMode = settings.starMode === 'binary' ? 'binary' : 'single';
        const hazards = settings.hazards === 'asteroids' ? 'asteroids' : 'none';
        const aiDifficulty = AI_PRESETS[settings.aiDifficulty] ? settings.aiDifficulty : 'standard';
        const gameMode = ['team-vs-bots', 'ffa', 'bots-ffa'].includes(settings.gameMode) ? settings.gameMode : 'team-vs-bots';
        return { botCount, arenaSize, starMode, hazards, aiDifficulty, gameMode };
    }

    reset() {
        this.tickNumber = 0;
        this.status = 'playing';
        this.entities = {
            players: {},
            enemies: [],
            rocks: [],
            asteroids: [],
            suns: this.createSuns(),
            explosions: []
        };
        this.entities.sun = this.entities.suns[0];
        this.entities.asteroids = this.createAsteroids();
        this.entities.enemies = this.createEnemies();
        this.events = [];
    }

    createSuns() {
        if (this.settings.starMode !== 'binary') {
            return [{ id: this.nextId('sun'), x: 0, y: 0, radius: SUN_RADIUS, mass: SUN_MASS, color: 0xffd166 }];
        }
        const first = binarySunPosition(0, BINARY_SUN_OFFSET);
        const second = binarySunPosition(Math.PI, BINARY_SUN_OFFSET);
        return [
            { id: this.nextId('sun'), x: first.x, y: first.y, radius: SUN_RADIUS * 0.92, mass: SUN_MASS * 0.78, color: 0xffd166 },
            { id: this.nextId('sun'), x: second.x, y: second.y, radius: SUN_RADIUS * 0.88, mass: SUN_MASS * 0.74, color: 0xffb347 }
        ];
    }

    createAsteroids() {
        if (this.settings.hazards !== 'asteroids') return [];
        const asteroids = [], count = this.settings.starMode === 'binary' ? 12 : 8;
        for (let i = 0; i < count; i++) {
            const anchor = this.entities.suns[i % this.entities.suns.length];
            const ringR = anchor.radius + 260 + (i % 4) * 54 + (this.settings.starMode === 'binary' ? 20 : 0);
            const angle = ((Math.PI * 2) / count) * i + (i % 2) * 0.3;
            const x = anchor.x + Math.cos(angle) * ringR;
            const y = anchor.y + Math.sin(angle) * ringR;
            const orbit = orbitalVelocity(anchor, x, y, 2.2 + (i % 3) * 0.22);
            asteroids.push({
                id: this.nextId('asteroid'),
                team: 'hazard',
                x, y, vx: orbit.vx, vy: orbit.vy,
                radius: ASTEROID_RADIUS + (i % 3) * 2,
                mass: ASTEROID_MASS + (i % 3) * 24,
                angle, modifier: 1,
                color: [0x8ef58f, 0xfab1ff, 0xffd166, 0xcfd8dc][i % 4],
                isAffectedByGravity: true,
                alive: true
            });
        }
        return asteroids;
    }

    createEnemies() {
        const enemies = [], count = this.settings.botCount;
        const orbitR = Math.min(this.arena.worldRadius * 0.66, this.arena.spawnOrbitRadius + 240);
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / Math.max(1, count)) * i;
            const speed = 2.8 + (i % 3) * 0.32;
            let team = 'enemy';
            if (this.settings.gameMode === 'bots-ffa' || this.settings.gameMode === 'ffa') team = this.nextId('bot');
            enemies.push({
                id: this.nextId('bot'),
                name: `bot-${i+1}`,
                team,
                x: Math.cos(angle) * orbitR,
                y: Math.sin(angle) * orbitR,
                vx: -Math.sin(angle) * speed,
                vy: Math.cos(angle) * speed,
                radius: 45, mass: 45 * 12,
                angle: Math.atan2(speed, 0),
                health: 2 + (i % 2),
                modifier: BASE_MODIFIER,
                color: getEnemyColor(i, this.settings.gameMode),
                shootCooldown: 0,
                aiAimAngle: Math.atan2(speed, 0),
                isAffectedByGravity: true,
                alive: true
            });
        }
        return enemies;
    }

    addPlayer(token, name) {
        if (this.players[token]) return;
        const idx = Object.keys(this.players).length;
        this.players[token] = { token, name: name || token, inputs: { aimX:0, aimY:0, fireHeld:false, firePulse:false } };
        this.entities.players[token] = this.createPlayerBody(token, name, idx);
    }

    createPlayerBody(token, name, index) {
        const angle = ((Math.PI * 2) / Math.max(1, index + 1)) * index - Math.PI / 2;
        const orbitR = this.arena.spawnOrbitRadius + (index % 2) * 120;
        const orbitalSpeed = 3.7 - (index % 2) * 0.25;
        let team = 'player';
        if (this.settings.gameMode === 'ffa') team = token;
        return {
            id: token,
            name: name || token,
            team,
            x: Math.cos(angle) * orbitR,
            y: Math.sin(angle) * orbitR,
            vx: -Math.sin(angle) * orbitalSpeed,
            vy: Math.cos(angle) * orbitalSpeed,
            radius: 45, mass: 540,
            angle, health: 5, modifier: BASE_MODIFIER,
            color: getPlayerColor(team, index, this.settings.gameMode),
            shootCooldown: 0,
            isAffectedByGravity: true,
            alive: true
        };
    }

    removePlayer(token) {
        delete this.players[token];
        delete this.entities.players[token];
    }

    setInput(token, payload) {
        const input = this.players[token]?.inputs;
        if (!input) return;
        if (typeof payload.x === 'number' && typeof payload.y === 'number') { input.aimX = payload.x; input.aimY = payload.y; }
        if (typeof payload.fireHeld === 'boolean') input.fireHeld = payload.fireHeld;
        if (payload.firePulse === true) input.firePulse = true;
    }

    update(dt) {
        this.tickNumber += 1;
        this.events = [];

        // Update explosions
        this.entities.explosions = this.entities.explosions.filter(ex => { ex.ttl -= dt; return ex.ttl > 0; });

        if (this.status !== 'playing') return this.events;

        // Binary sun orbit
        if (this.settings.starMode === 'binary' && this.entities.suns.length >= 2) {
            const ang = (this.entities.sunOrbitAngle || 0) + BINARY_SUN_ANGULAR_SPEED * dt;
            this.entities.sunOrbitAngle = ang;
            const p0 = binarySunPosition(ang, BINARY_SUN_OFFSET);
            const p1 = binarySunPosition(ang + Math.PI, BINARY_SUN_OFFSET);
            this.entities.suns[0].x = p0.x; this.entities.suns[0].y = p0.y;
            this.entities.suns[1].x = p1.x; this.entities.suns[1].y = p1.y;
            this.entities.sun = this.entities.suns[0];
        }

        // Apply player inputs
        const alivePlayers = this.getAlivePlayers();
        for (const p of alivePlayers) {
            const input = this.players[p.id]?.inputs;
            if (!input) continue;
            p.angle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
            if (input.firePulse && p.shootCooldown <= 0) {
                this.ejectRock(p, p.angle, PLAYER_RECOIL, PLAYER_EJECT_SPEED, ROCK_MASS, p.color);
                p.shootCooldown = PLAYER_CLICK_FIRE_COOLDOWN;
            } else if (input.fireHeld && p.shootCooldown <= 0) {
                this.ejectRock(p, p.angle, PLAYER_RECOIL, PLAYER_EJECT_SPEED, ROCK_MASS, p.color);
                p.shootCooldown = PLAYER_FIRE_COOLDOWN;
            }
            input.firePulse = false;
            p.shootCooldown = Math.max(0, p.shootCooldown - dt);
        }

        // AI update (server authoritative)
        const aliveEnemies = this.entities.enemies.filter(e => e.alive);
        for (const e of aliveEnemies) {
            this.updateEnemy(e, dt, alivePlayers);
        }

        // Physics
        const bodies = [...alivePlayers, ...aliveEnemies, ...this.entities.asteroids.filter(a => a.alive !== false)];
        for (const b of bodies) {
            applyGravity(b, this.entities.suns, dt);
            moveBody(b, dt);
        }

        // Planet collisions
        for (let i = 0; i < bodies.length; i++) {
            for (let j = i+1; j < bodies.length; j++) {
                const res = resolvePlanetCollision(bodies[i], bodies[j]);
                if (res) this.events.push({ type: EVENT_TYPES.PLANET_COLLISION, ...res });
            }
        }

        // Rocks update
        this.updateRocks(dt, bodies);

        // Sun collisions
        this.handleSunCollisions(bodies);

        // Arena bounds
        this.handleArenaBounds([...alivePlayers, ...aliveEnemies]);

        // Round end check
        this.checkRoundEnd();

        return this.events;
    }

    ejectRock(owner, angle, recoil, speed, mass, color) {
        const rock = {
            id: this.nextId('rock'),
            ownerId: owner.id,
            team: owner.team,
            x: owner.x + Math.cos(angle) * (owner.radius + ROCK_RADIUS + 6),
            y: owner.y + Math.sin(angle) * (owner.radius + ROCK_RADIUS + 6),
            vx: owner.vx + Math.cos(angle) * speed,
            vy: owner.vy + Math.sin(angle) * speed,
            radius: ROCK_RADIUS,
            mass,
            ttl: ROCK_TTL,
            color,
            isAffectedByGravity: true
        };
        this.entities.rocks.push(rock);
        this.events.push({
            type: EVENT_TYPES.ROCK_EJECTED,
            id: rock.id, ownerId: rock.ownerId, team: rock.team,
            x: rock.x, y: rock.y, vx: rock.vx, vy: rock.vy,
            radius: rock.radius, color: rock.color, ttl: rock.ttl
        });
        owner.vx -= Math.cos(angle) * recoil * (owner.modifier || BASE_MODIFIER);
        owner.vy -= Math.sin(angle) * recoil * (owner.modifier || BASE_MODIFIER);
    }

    updateRocks(dt, bodies) {
        // Expire and move
        this.entities.rocks = this.entities.rocks.filter(r => {
            r.ttl -= dt;
            if (r.ttl <= 0) {
                this.events.push({ type: EVENT_TYPES.ROCK_DESTROYED, id: r.id });
                return false;
            }
            applyGravity(r, this.entities.suns, dt);
            moveBody(r, dt);
            return true;
        });

        // Rock-rock collisions
        for (let i = 0; i < this.entities.rocks.length; i++) {
            for (let j = i+1; j < this.entities.rocks.length; j++) {
                const a = this.entities.rocks[i], b = this.entities.rocks[j];
                if (distanceSquared(a, b) < (a.radius + b.radius)**2) {
                    a.ttl = 0; b.ttl = 0;
                }
            }
        }

        // Rock-body collisions
        for (const r of this.entities.rocks) {
            for (const b of bodies) {
                if (!b.alive || r.ownerId === b.id || (r.team === b.team && r.team !== undefined)) continue;
                if (distanceSquared(r, b) >= (r.radius + b.radius)**2) continue;
                if (bounceRock(b, r)) {
                    increaseModifier(b, ROCK_HIT_MODIFIER_GAIN);
                    this.spawnExplosion(r.x, r.y, 16, r.color);
                    r.ttl = 0;
                    this.events.push({ type: EVENT_TYPES.ROCK_DESTROYED, id: r.id });
                    break;
                }
            }
        }
        this.entities.rocks = this.entities.rocks.filter(r => r.ttl > 0);
    }

    handleSunCollisions(bodies) {
        for (const b of bodies) {
            if (!b.alive) continue;
            for (const sun of this.entities.suns) {
                if (distanceSquared(b, sun) < (b.radius + sun.radius)**2) {
                    this.bounceOffSun(b, sun);
                    break;
                }
            }
        }
        for (const r of this.entities.rocks) {
            for (const sun of this.entities.suns) {
                if (distanceSquared(r, sun) < (r.radius + sun.radius)**2) {
                    this.events.push({ type: EVENT_TYPES.ROCK_DESTROYED, id: r.id });
                    this.spawnExplosion(r.x, r.y, 18, 0xffd166);
                    r.ttl = 0;
                    break;
                }
            }
        }
        this.entities.rocks = this.entities.rocks.filter(r => r.ttl > 0);
    }

    bounceOffSun(p, sun) {
        const dx = p.x - sun.x, dy = p.y - sun.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 0.0001;
        const nx = dx/dist, ny = dy/dist;
        const overlap = (p.radius + sun.radius) - dist;
        if (overlap > 0) { p.x += nx*overlap; p.y += ny*overlap; }
        const incSpeed = p.vx*nx + p.vy*ny;
        const tx = -ny, ty = nx;
        const tSpeed = p.vx*tx + p.vy*ty;
        const bSpeed = Math.max(8.5, Math.abs(incSpeed)*SUN_BOUNCE_MULTIPLIER + 3.6);
        p.vx = nx*bSpeed + tx*tSpeed*0.92;
        p.vy = ny*bSpeed + ty*tSpeed*0.92;
        increaseModifier(p, SUN_HIT_MODIFIER_GAIN);
        this.spawnExplosion(p.x - nx*p.radius, p.y - ny*p.radius, 24, 0xffe29a);
    }

    handleArenaBounds(bodies) {
        for (const b of bodies) {
            if (b.alive && (b.x*b.x + b.y*b.y) > this.arena.worldRadius*this.arena.worldRadius) {
                this.destroyPlanet(b);
            }
        }
    }

    destroyPlanet(p) {
        p.alive = false;
        this.spawnExplosion(p.x, p.y, p.radius + 10, 0xffffff);
        this.entities.enemies = this.entities.enemies.filter(e => e.id !== p.id);
        this.events.push({ type: EVENT_TYPES.ENTITY_REMOVED, entityId: p.id, entityType: 'player' });
    }

    spawnExplosion(x, y, radius, color) {
        const ex = { id: this.nextId('explosion'), x, y, radius, color, ttl: EXPLOSION_TTL, maxTtl: EXPLOSION_TTL };
        this.entities.explosions.push(ex);
        this.events.push({ type: EVENT_TYPES.EXPLOSION_SPAWNED, id: ex.id, x, y, radius, color, ttl: ex.ttl, maxTtl: ex.maxTtl });
    }

    checkRoundEnd() {
        if (this.status !== 'playing') return;
        const alive = [...this.getAlivePlayers(), ...this.entities.enemies.filter(e => e.alive)];
        const teams = new Set(alive.map(p => p.team));
        if (teams.size <= 1) {
            this.status = 'roundEnd';
            this.events.push({ type: EVENT_TYPES.ROUND_END, status: teams.size === 1 ? 'won' : 'lost' });
        }
    }

    resetRound() {
        this.reset();
        for (const token of Object.keys(this.players)) {
            const idx = Object.keys(this.players).indexOf(token);
            this.entities.players[token] = this.createPlayerBody(token, this.players[token].name, idx);
        }
        this.events.push({ type: EVENT_TYPES.ROUND_RESET });
    }

    getAlivePlayers() {
        return Object.values(this.entities.players).filter(p => p && p.alive);
    }

    // Server-side AI (authoritative)
    updateEnemy(enemy, dt, allPlayers) {
        const preset = AI_PRESETS[this.settings.aiDifficulty] || AI_PRESETS.standard;
        const think = this.tickNumber % preset.thinkIntervalTicks === 0;
        const anchor = this.nearestSun(enemy);
        const toSunX = anchor.x - enemy.x, toSunY = anchor.y - enemy.y;
        const sunDist = Math.sqrt(toSunX*toSunX + toSunY*toSunY);
        const radUnitX = toSunX / Math.max(sunDist, 0.001), radUnitY = toSunY / Math.max(sunDist, 0.001);
        const tanUnitX = -radUnitY, tanUnitY = radUnitX;
        const radVel = enemy.vx*radUnitX + enemy.vy*radUnitY;
        const tanVel = enemy.vx*tanUnitX + enemy.vy*tanUnitY;

        let target = null, minDist = Infinity;
        for (const p of allPlayers) {
            if (!p.alive || p.team === enemy.team || p.id === enemy.id) continue;
            const d = distanceBetween(enemy, p);
            if (d < minDist) { minDist = d; target = p; }
        }
        if (!target) return;

        const interceptAng = leadAngle(enemy, target, 7.9);
        const playerDist = distanceBetween(enemy, target);
        const centerDist = Math.sqrt(enemy.x*enemy.x + enemy.y*enemy.y);
        const otherSun = this.entities.suns.find(s => s.id !== anchor.id);
        const otherSunDist = otherSun ? distanceBetween(enemy, otherSun) : Infinity;
        const relVelX = target.vx - enemy.vx, relVelY = target.vy - enemy.vy;

        const dangerLim = this.arena.worldRadius * 0.22, safeLim = this.arena.worldRadius * 0.52, farLim = this.arena.worldRadius * 0.85;
        let dVX = tanUnitX, dVY = tanUnitY;

        if (sunDist < dangerLim * preset.safetyBias || otherSunDist < dangerLim * 0.92 * preset.safetyBias) {
            dVX = -radUnitX*1.95 + tanUnitX*0.42; dVY = -radUnitY*1.95 + tanUnitY*0.42;
        } else if (sunDist < safeLim * preset.safetyBias) {
            dVX = -radUnitX*1.12 + tanUnitX*0.96; dVY = -radUnitY*1.12 + tanUnitY*0.96;
        } else if (Math.abs(radVel) > 1.9) {
            dVX = -radUnitX*Math.sign(radVel)*1.35 + tanUnitX*0.65; dVY = -radUnitY*Math.sign(radVel)*1.35 + tanUnitY*0.65;
        } else if (centerDist > farLim) {
            dVX = (-enemy.x/Math.max(centerDist, 0.001))*1.25 + tanUnitX*0.6;
            dVY = (-enemy.y/Math.max(centerDist, 0.001))*1.25 + tanUnitY*0.6;
        }
        if (Math.abs(tanVel) < 2.2) { dVX += tanUnitX*0.7; dVY += tanUnitY*0.7; }
        const totalSpd = Math.sqrt(enemy.vx*enemy.vx + enemy.vy*enemy.vy);
        if (totalSpd > 6.2) { dVX -= enemy.vx*0.15; dVY -= enemy.vy*0.15; }
        dVX += (-radUnitX * (enemy.vx*radUnitX + enemy.vy*radUnitY)) * 0.28;
        dVY += (-radUnitY * (enemy.vx*radUnitX + enemy.vy*radUnitY)) * 0.28;
        if (playerDist < this.arena.worldRadius * 0.45 && sunDist > dangerLim * 1.1) {
            dVX += Math.cos(interceptAng) * preset.attackBias;
            dVY += Math.sin(interceptAng) * preset.attackBias;
            dVX += relVelX * 0.045; dVY += relVelY * 0.045;
        }

        const desiredAng = Math.atan2(dVY, dVX);
        if (think || typeof enemy.aiAimAngle !== 'number') enemy.aiAimAngle = desiredAng;
        const deltaAng = normalizeAngle(enemy.aiAimAngle - enemy.angle);
        enemy.angle += Math.sign(deltaAng) * Math.min(Math.abs(deltaAng), preset.turnRate * dt * 60);

        if (enemy.shootCooldown <= 0) {
            if (sunDist < dangerLim * preset.safetyBias || otherSunDist < dangerLim * 0.94 * preset.safetyBias || Math.abs(radVel) > 2.5) {
                this.ejectRock(enemy, enemy.angle + Math.PI, 0.82, 8.4, 7, enemy.color);
                enemy.shootCooldown = 0.52 * preset.cooldownMult;
            } else if (centerDist > farLim) {
                this.ejectRock(enemy, enemy.angle + Math.PI, 0.75, 7.6, 7, enemy.color);
                enemy.shootCooldown = 0.68 * preset.cooldownMult;
            } else if (playerDist < this.arena.worldRadius * 0.42 && think) {
                this.ejectRock(enemy, interceptAng, 0.52, 7.9, 7, enemy.color);
                enemy.shootCooldown = 0.8 * preset.cooldownMult;
            }
        }
    }

    nearestSun(body) {
        let best = this.entities.suns[0], bestDist = distanceBetween(body, best);
        for (let i = 1; i < this.entities.suns.length; i++) {
            const d = distanceBetween(body, this.entities.suns[i]);
            if (d < bestDist) { bestDist = d; best = this.entities.suns[i]; }
        }
        return best;
    }

    // Create a snapshot for network transmission (per-client filtered later)
    getSnapshot() {
        const round = val => typeof val === 'number' ? Math.round(val * 10) / 10 : val;
        const playersArray = Object.values(this.entities.players).map(p => ({
            id: p.id, name: p.name, team: p.team,
            x: round(p.x), y: round(p.y),
            vx: round(p.vx), vy: round(p.vy),
            radius: p.radius, angle: round(p.angle),
            health: p.health, modifier: round(p.modifier),
            color: p.color, alive: p.alive
        }));
        const enemiesArr = this.entities.enemies.map(e => ({
            id: e.id, name: e.name, team: e.team,
            x: round(e.x), y: round(e.y),
            vx: round(e.vx), vy: round(e.vy),
            radius: e.radius, angle: round(e.angle),
            health: e.health, modifier: round(e.modifier),
            color: e.color, alive: e.alive
        }));
        const rocksArr = this.entities.rocks.map(r => ({
            id: r.id, ownerId: r.ownerId, team: r.team,
            x: round(r.x), y: round(r.y),
            radius: r.radius, color: r.color
        }));
        const explosionsArr = this.entities.explosions.map(ex => ({
            id: ex.id, x: round(ex.x), y: round(ex.y),
            radius: round(ex.radius), color: ex.color,
            ttl: round(ex.ttl), maxTtl: round(ex.maxTtl)
        }));
        const asteroidsArr = this.entities.asteroids.map(a => ({
            id: a.id, team: a.team,
            x: round(a.x), y: round(a.y),
            vx: round(a.vx), vy: round(a.vy),
            radius: a.radius, angle: round(a.angle),
            color: a.color, alive: a.alive
        }));
        const sunsArr = this.entities.suns.map(s => ({
            id: s.id, x: s.x, y: s.y, radius: s.radius, mass: s.mass, color: s.color
        })); // suns don't need rounding as much

        return {
            tickNumber: this.tickNumber,
            serverTime: Date.now(),
            status: this.status,
            worldRadius: this.arena.worldRadius,
            sun: sunsArr[0],
            suns: sunsArr,
            players: playersArray,
            enemies: enemiesArr,
            rocks: rocksArr,
            explosions: explosionsArr,
            asteroids: asteroidsArr
        };
    }

    // Calculate which entities are visible to a player
    getVisibleEntityIds(playerToken, viewDistance = 2000) {
        const player = this.entities.players[playerToken];
        if (!player) return new Set();
        const visible = new Set();
        const addIfVisible = (entity) => {
            if ((entity.x - player.x)**2 + (entity.y - player.y)**2 <= viewDistance**2) {
                visible.add(entity.id);
            }
        };
        Object.values(this.entities.players).forEach(addIfVisible);
        this.entities.enemies.forEach(addIfVisible);
        this.entities.rocks.forEach(addIfVisible);
        this.entities.asteroids.forEach(addIfVisible);
        // explosions and suns usually visible regardless
        this.entities.explosions.forEach(ex => visible.add(ex.id));
        this.entities.suns.forEach(s => visible.add(s.id));
        return visible;
    }

    nextId(prefix) {
        this.idCounter += 1;
        return `${prefix}-${this.idCounter}`;
    }
}

module.exports = {
    GameEngine,
    EVENT_TYPES,
    ARENA_PRESETS,
    AI_PRESETS,
    computeDelta
};
