import "./game.js";

function createSocketClient() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}`);
    const listeners = {};
    const queue = [];

    socket.addEventListener("open", () => {
        while (queue.length) socket.send(queue.shift());
    });
    socket.addEventListener("message", async (event) => {
        try {
            const data = event.data instanceof ArrayBuffer || event.data instanceof Blob
                ? new TextDecoder().decode(await new Response(new Response(event.data).body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer())
                : event.data;
            const message = JSON.parse(data);
            if (typeof message.event === "string") (listeners[message.event] || []).forEach((handler) => handler(message.payload));
        } catch { /* Ignore malformed or unsupported messages. */ }
    });
    socket.addEventListener("close", () => (listeners.disconnect || []).forEach((handler) => handler()));
    return {
        on(event, handler) { (listeners[event] ||= []).push(handler); },
        emit(event, payload) {
            const message = JSON.stringify({ event, payload });
            if (socket.readyState === WebSocket.OPEN) socket.send(message);
            else if (socket.readyState === WebSocket.CONNECTING) queue.push(message);
        },
    };
}

const socket = createSocketClient();
let token = localStorage.getItem("token");
let username = localStorage.getItem("username");
let gameId;
const $ = (selector) => document.querySelector(selector);
const login = $("#login");
const content = $("#content");
const lobby = $("#lobby");
const gameScreen = $("#gameScreen");
const games = $("#games");
const messages = $("#messages");
const side = $("#side");
const fullscreenButton = $("#fullscreenToggle");
const LOBBY_ARENA_LABELS = { compact: "Compact", standard: "Standard", wide: "Wide" };
const LOBBY_STAR_LABELS = { single: "Single sun", binary: "Binary suns" };
const LOBBY_HAZARD_LABELS = { none: "Clear orbit", asteroids: "Asteroids" };
const LOBBY_AI_LABELS = { easy: "Easy AI", standard: "Standard AI", hard: "Hard AI", ace: "Ace AI" };
const LOBBY_MODE_LABELS = { "team-vs-bots": "Team vs Bots", ffa: "Free-for-all", "bots-ffa": "Bots FFA" };

function updateUserVisibility() {
    login.hidden = Boolean(username);
    content.hidden = !username;
}

function updateGameVisibility() {
    const inGame = Boolean(gameId);
    lobby.hidden = inGame;
    gameScreen.hidden = !inGame;
    if (inGame) {
        BattlePlanetGame.start();
        BattlePlanetGame.resizeToContainer();
    } else {
        BattlePlanetGame.stop();
        BattlePlanetGame.clearState();
    }
}

function appendChatMessage(message) {
    if (messages.children.length >= 50) messages.firstElementChild.remove();
    const item = document.createElement("li");
    item.textContent = message;
    messages.append(item);
    side.scrollTop = side.scrollHeight;
}

function createLobbyListing(game) {
    const settings = game.settings || {};
    const labels = [
        `${LOBBY_ARENA_LABELS[settings.arenaSize] || "Standard"} arena`,
        LOBBY_MODE_LABELS[settings.gameMode] || "Team vs Bots",
        LOBBY_STAR_LABELS[settings.starMode] || "Single sun",
        LOBBY_HAZARD_LABELS[settings.hazards] || "Clear orbit",
        LOBBY_AI_LABELS[settings.aiDifficulty] || "Standard AI",
        `${Number.isFinite(settings.botCount) ? settings.botCount : 2} bots`,
        settings.isPublic === false ? "Invite only" : "Open join",
    ];
    const listing = document.createElement("article");
    listing.id = game.uuid;
    listing.className = "gameListing";
    const header = document.createElement("div");
    header.className = "gameListingHeader";
    const titleGroup = document.createElement("div");
    const title = document.createElement("div");
    title.className = "gameListingTitle";
    title.textContent = game.name || "BattlePlanet";
    const meta = document.createElement("div");
    meta.className = "gameListingMeta";
    meta.textContent = settings.isPublic === false ? "Private match" : "Public lobby";
    titleGroup.append(title, meta);
    const population = document.createElement("div");
    population.className = "lobbyPopulation";
    population.textContent = `${game.count} pilots`;
    header.append(titleGroup, population);
    const tagRow = document.createElement("div");
    tagRow.className = "lobbyTagRow";
    labels.forEach((label) => {
        const tag = document.createElement("span");
        tag.className = "lobbyTag";
        tag.textContent = label;
        tagRow.append(tag);
    });
    const hint = document.createElement("div");
    hint.className = "lobbyJoinHint";
    hint.textContent = "Click to join";
    listing.append(header, tagRow, hint);
    listing.addEventListener("click", () => socket.emit("lobbyListJoin", { uuid: game.uuid }));
    return listing;
}

function renderLobbyList({ action, data }) {
    if (action === "set") games.replaceChildren();
    data.forEach((game) => {
        const existing = document.getElementById(game.uuid);
        if (action === "remove") return existing?.remove();
        const listing = createLobbyListing(game);
        if (existing) existing.replaceWith(listing);
        else games.append(listing);
    });
}

function getLobbySettings() {
    return {
        botCount: Number.parseInt($("#lobbyBotCount").value, 10) || 2,
        arenaSize: $("#lobbyArenaSize").value || "standard",
        starMode: $("#lobbyStarMode").value || "single",
        hazards: $("#lobbyHazards").value || "none",
        aiDifficulty: $("#lobbyAiDifficulty").value || "standard",
        gameMode: $("#lobbyGameMode").value || "team-vs-bots",
        isPublic: $("#lobbyPublicInput").checked,
    };
}

function onReady() {
    fullscreenButton?.addEventListener("click", async () => {
        const main = $("#main");
        if (document.fullscreenElement === main) await document.exitFullscreen();
        else await main?.requestFullscreen();
    });
    document.addEventListener("fullscreenchange", () => {
        fullscreenButton.textContent = document.fullscreenElement === $("#main") ? "Exit Fullscreen" : "Fullscreen";
        if (BattlePlanetGame.isActive()) BattlePlanetGame.resizeToContainer();
    });
    updateUserVisibility();
    updateGameVisibility();
    socket.emit(token ? "setToken" : "getToken", token ? { uuid: token, username } : undefined);
    socket.on("setToken", (message) => { token = message.uuid; localStorage.setItem("token", token); });
    socket.on("chat", appendChatMessage);
    socket.on("lobbyJoin", (uuid) => { gameId = uuid; updateGameVisibility(); });
    socket.on("lobbyListJoin", () => { gameId = undefined; updateGameVisibility(); });
    socket.on("lobbyUpdate", renderLobbyList);
    socket.on("gameState", (message) => message.full ? BattlePlanetGame.setFullState(message.state) : BattlePlanetGame.setDelta(message));
    BattlePlanetGame.setInputSender((payload) => socket.emit("gameInput", payload));
    setInterval(() => socket.emit("ping"), 30000);

    $("#user").addEventListener("submit", (event) => {
        event.preventDefault();
        username = $("#userInput").value;
        localStorage.setItem("username", username);
        socket.emit("setToken", { uuid: token, username });
        updateUserVisibility();
    });
    $("#chat").addEventListener("submit", (event) => {
        event.preventDefault();
        const input = $("#chatInput");
        socket.emit("chat", input.value);
        input.value = "";
    });
    $("#lobbyForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const input = $("#lobbyNameInput");
        const settings = getLobbySettings();
        socket.emit("lobbyCreate", { name: input.value || "BattlePlanet", isPublic: settings.isPublic, settings });
        input.value = "";
    });
}

onReady();
