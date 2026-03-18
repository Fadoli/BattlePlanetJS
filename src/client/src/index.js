const socket = io();
let token = localStorage.getItem("token");
let username = localStorage.getItem("username");
let gameId;

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
        $("#gameRender").hide();
        BattlePlanetGame.stop();
        BattlePlanetGame.clearState();
        return;
    }

    $("#lobby").hide();
    $("#gameRender").show();
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
            $(`#${game.uuid}`).text(`${game.name}  ${game.count} players`);
            return;
        }

        const listing = $(`<div id="${game.uuid}" class="gameListing">`);
        listing.text(`${game.name}  ${game.count} players`);
        listing.on("click", () => {
            socket.emit("lobbyListJoin", {
                uuid: game.uuid,
            });
        });
        list.append(listing);
    });
}

$(function onReady() {
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
        socket.emit("lobbyCreate", {
            name: $("#lobbyNameInput").val() || "BattlePlanet",
            isPublic: true,
        });
        $("#lobbyNameInput").val("");
        return false;
    });
});
