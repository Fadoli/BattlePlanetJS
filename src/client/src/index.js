function createSocketClient() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}`);
    const listeners = {};
    const queue = [];

    socket.addEventListener("open", () => {
        while (queue.length > 0) {
            socket.send(queue.shift());
        }
    });

    socket.addEventListener("message", (event) => {
        let message;
        try {
            message = JSON.parse(event.data);
        } catch (error) {
            return;
        }

        if (!message || typeof message.event !== "string") {
            return;
        }

        const handlers = listeners[message.event] || [];
        handlers.forEach((handler) => handler(message.payload));
    });

    socket.addEventListener("close", () => {
        const handlers = listeners.disconnect || [];
        handlers.forEach((handler) => handler());
    });

    return {
        on(event, handler) {
            if (!listeners[event]) {
                listeners[event] = [];
            }
            listeners[event].push(handler);
        },
        emit(event, payload) {
            const serialized = JSON.stringify({
                event,
                payload,
            });

            if (socket.readyState === WebSocket.OPEN) {
                socket.send(serialized);
                return;
            }

            if (socket.readyState === WebSocket.CONNECTING) {
                queue.push(serialized);
            }
        },
    };
}

const socket = createSocketClient();
let token = localStorage.getItem("token");
let username = localStorage.getItem("username");
let gameId;
const fullscreenButton = document.getElementById("fullscreenToggle");
const LOBBY_ARENA_LABELS = {
    compact: "Compact",
    standard: "Standard",
    wide: "Wide",
};

function isTypingTarget(target) {
    if (!target) {
        return false;
    }

    const tagName = target.tagName ? target.tagName.toLowerCase() : "";
    return tagName === "input" || tagName === "textarea" || target.isContentEditable;
}

function updateUserVisibility() {
    if (!username) {
        $("#login").show();
        $("#content").hide();
        return;
    }

    $("#login").hide();
    $("#content").show();
}

function updateGameVisibility() {
    if (!gameId) {
        $("#lobby").show();
        $("#gameScreen").hide();
        BattlePlanetGame.stop();
        BattlePlanetGame.clearState();
        return;
    }

    $("#lobby").hide();
    $("#gameScreen").show();
    BattlePlanetGame.start();
    BattlePlanetGame.resizeToContainer();
}

function appendChatMessage(message) {
    const messages = $("#messages");
    const items = messages.children();

    if (items.length > 50) {
        items[0].remove();
    }

    messages.append($("<li>").text(message));

    const side = $("#side");
    side.scrollTop(side.prop("scrollHeight"));
}

function renderLobbyList(request) {
    const list = $("#games");
    const { action, data } = request;

    if (action === "set") {
        list.html("");
    }

    data.forEach((game) => {
        if (action === "remove") {
            $(`#${game.uuid}`).remove();
            return;
        }

        if ($(`#${game.uuid}`).length > 0) {
            const updatedListing = createLobbyListing(game);
            updatedListing.on("click", () => {
                socket.emit("lobbyListJoin", {
                    uuid: game.uuid,
                });
            });
            $(`#${game.uuid}`).replaceWith(updatedListing);
            return;
        }

        const listing = createLobbyListing(game);
        listing.on("click", () => {
            socket.emit("lobbyListJoin", {
                uuid: game.uuid,
            });
        });
        list.append(listing);
    });
}

function createLobbyListing(game) {
    const settings = game.settings || {};
    const arenaLabel = LOBBY_ARENA_LABELS[settings.arenaSize] || "Standard";
    const botCount = Number.isFinite(settings.botCount) ? settings.botCount : 2;
    const visibilityLabel = settings.isPublic === false ? "Private match" : "Public lobby";
    const accessLabel = settings.isPublic === false ? "Invite only" : "Open join";
    const listing = $(`<article id="${game.uuid}" class="gameListing">`);

    listing.append(`
        <div class="gameListingHeader">
            <div>
                <div class="gameListingTitle">${escapeHtml(game.name || "BattlePlanet")}</div>
                <div class="gameListingMeta">${visibilityLabel}</div>
            </div>
            <div class="lobbyPopulation">${game.count} pilots</div>
        </div>
        <div class="lobbyTagRow">
            <span class="lobbyTag">${arenaLabel} arena</span>
            <span class="lobbyTag">${botCount} bots</span>
            <span class="lobbyTag">${accessLabel}</span>
        </div>
        <div class="lobbyJoinHint">Click to join</div>
    `);

    return listing;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}

function getLobbySettings() {
    return {
        botCount: Number.parseInt($("#lobbyBotCount").val(), 10) || 2,
        arenaSize: $("#lobbyArenaSize").val() || "standard",
        isPublic: $("#lobbyPublicInput").is(":checked"),
    };
}

$(function onReady() {
    if (fullscreenButton) {
        fullscreenButton.addEventListener("click", async () => {
            const fullscreenRoot = document.getElementById("main");
            if (!fullscreenRoot) {
                return;
            }

            if (document.fullscreenElement === fullscreenRoot) {
                await document.exitFullscreen();
                return;
            }

            await fullscreenRoot.requestFullscreen();
        });

        document.addEventListener("fullscreenchange", () => {
            const fullscreenRoot = document.getElementById("main");
            const isFullscreen = document.fullscreenElement === fullscreenRoot;
            fullscreenButton.textContent = isFullscreen ? "Exit Fullscreen" : "Fullscreen";
            if (BattlePlanetGame.isActive()) {
                BattlePlanetGame.resizeToContainer();
            }
        });
    }

    updateUserVisibility();
    updateGameVisibility();

    if (!token) {
        socket.emit("getToken");
    } else {
        socket.emit("setToken", {
            uuid: token,
            username,
        });
    }

    socket.on("setToken", (message) => {
        token = message.uuid;
        localStorage.setItem("token", token);
    });

    socket.on("chat", appendChatMessage);

    socket.on("lobbyJoin", (uuid) => {
        gameId = uuid;
        updateGameVisibility();
    });

    socket.on("lobbyListJoin", () => {
        gameId = undefined;
        updateGameVisibility();
    });

    socket.on("lobbyUpdate", renderLobbyList);
    socket.on("gameState", (state) => {
        BattlePlanetGame.setState(state);
    });

    BattlePlanetGame.setInputSender((payload) => {
        socket.emit("gameInput", payload);
    });

    setInterval(() => {
        socket.emit("ping");
    }, 200);

    $("form#user").submit((event) => {
        event.preventDefault();
        username = $("#userInput").val();
        localStorage.setItem("username", username);
        socket.emit("setToken", {
            uuid: token,
            username,
        });
        updateUserVisibility();
        return false;
    });

    $("form#chat").submit((event) => {
        event.preventDefault();
        socket.emit("chat", $("#chatInput").val());
        $("#chatInput").val("");
        return false;
    });

    $("form#lobbyForm").submit((event) => {
        event.preventDefault();
        const settings = getLobbySettings();
        socket.emit("lobbyCreate", {
            name: $("#lobbyNameInput").val() || "BattlePlanet",
            isPublic: settings.isPublic,
            settings,
        });
        $("#lobbyNameInput").val("");
        return false;
    });
});
