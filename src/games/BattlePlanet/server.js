const { uuidv4 } = require('../../utils');
const { GameEngine, computeDelta, ARENA_PRESETS, AI_PRESETS } = require('./engine');

const TICKS_PER_SECOND = 60;
const TICK_RATE = 1000 / TICKS_PER_SECOND;
const ROUND_RESET_MS = 2500;

// Network throttling: send updates at lower frequency than simulation
const NETWORK_UPDATE_RATE = 30; // Hz - sends per second over network
const NETWORK_TICK_RATIO = TICKS_PER_SECOND / NETWORK_UPDATE_RATE; // how many sim ticks per network send
const FULL_STATE_TICKS = TICKS_PER_SECOND * 5; // full state every 5 seconds

class GameManager {
    constructor(options = {}) {
        this.uuid = uuidv4();
        this.name = options.name || "BattlePlanet";
        this.settings = this.sanitizeSettings(options.settings);
        this.arena = ARENA_PRESETS[this.settings.arenaSize];
        this.tickInterval = undefined;
        this.resetTimeout = undefined;
        this.players = {}; // token -> { client, lastSnapshot }
        this.engine = new GameEngine(this.settings);
        this.networkSendTicks = NETWORK_TICK_RATIO;
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

    addPlayer(client) {
        const token = client.token;
        if (this.players[token]) return;
        this.engine.addPlayer(token, client.name);
        this.players[token] = { client, lastSnapshot: null };
        if (!this.tickInterval) this.start();
        this.sendUpdateToAll();
    }

    removePlayer(client) {
        const token = client.token;
        if (!this.players[token]) return;
        this.engine.removePlayer(token);
        delete this.players[token];
        if (Object.keys(this.players).length === 0) this.stop();
        else this.sendUpdateToAll();
    }

    handleInput(client, payload) {
        this.engine.setInput(client.token, payload);
    }

    start() {
        this.stop();
        this.tickInterval = setInterval(() => this.tick(), TICK_RATE);
    }

    stop() {
        if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = undefined; }
        if (this.resetTimeout) { clearTimeout(this.resetTimeout); this.resetTimeout = undefined; }
    }

    tick() {
        const dt = 1 / TICKS_PER_SECOND;
        this.engine.update(dt);
        // Throttle network updates to reduce bandwidth and CPU
        if (this.engine.tickNumber % this.networkSendTicks === 0) {
            this.sendUpdateToAll();
        }
        if (this.engine.status === 'roundEnd' && !this.resetTimeout) {
            this.resetTimeout = setTimeout(() => this.resetRound(), ROUND_RESET_MS);
        }
    }

    sendUpdateToAll() {
        const snapshot = this.engine.getSnapshot();
        const tick = this.engine.tickNumber;
        const forceFullPeriodic = tick % FULL_STATE_TICKS === 0; // full state every 1 second
        for (const token of Object.keys(this.players)) {
            const player = this.players[token];
            const full = forceFullPeriodic || player.lastSnapshot === null;
            let payload;
            if (full) {
                payload = { full: true, state: { ...snapshot, playerId: token } };
            } else {
                const delta = computeDelta(player.lastSnapshot, snapshot);
                payload = {
                    full: false,
                    delta,
                    meta: {
                        serverTime: snapshot.serverTime,
                        tickNumber: snapshot.tickNumber,
                        status: snapshot.status,
                        playerId: token // include playerId in meta for reference
                    }
                };
            }
            player.client.sendGameState(payload);
            player.lastSnapshot = snapshot;
        }
    }

    resetRound() {
        this.engine.resetRound();
        this.resetTimeout = undefined;
        this.sendUpdateToAll();
    }
}

module.exports = GameManager;
