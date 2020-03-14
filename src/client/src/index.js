var socket = io();
var token = localStorage.getItem('token');
var username = localStorage.getItem('username');
var gameId = undefined;

$(function () {
    // Username managing here !
    var updateUser = function () {
        if (!username) {
            $('#login').show();
            $('#content').hide();
        } else {
            $('#login').hide();
            $('#content').show();
        }
    }
    var updateGame = function () {
        if (!gameId) {
            $('#lobby').show();
            $('#gameRender').hide();
        } else {
            $('#lobby').hide();
            $('#gameRender').show();
        }
    }
    updateUser();
    updateGame();
    if (!token) {
        socket.emit('getToken');
    } else {
        socket.emit('setToken', { uuid: token, username: username });
    }
    socket.on('setToken', function (msg) {
        token = msg.uuid;
        localStorage.setItem('token', token);
    })
    $('form#user').submit(function (e) {
        e.preventDefault(); // prevents page reloading
        username = $('#userInput').val()
        localStorage.setItem('username', username);
        socket.emit('setToken', { uuid: token, username: username });
        updateUser();
        return false;
    });
    
    // Chat managing here !
    $('form#chat').submit(function (e) {
        e.preventDefault(); // prevents page reloading
        socket.emit('chat', $('#chatInput').val());
        $('#chatInput').val('');
        return false;
    });
    socket.on('chat', function (msg) {
        const array = $('#messages').children();
        if (array.length > 50) {
            array[array.length - 1].remove();
        }
        $('#messages').prepend($('<li>').text(msg));
    });
    
    // Game (list) managing here !
    $('form#gameForm').submit(function (e) {
        e.preventDefault(); // prevents page reloading
        socket.emit('gameCreate', {
            name: $('#gameInput').val()
        });
        $('#gameInput').val('');
        return false;
    });
    socket.on('gameJoin', function (uuid) {
        gameId = uuid;
        updateGame();
    });
    function addServer(game) {
    }
    socket.on('lobbyJoin', function () {
        gameId = undefined;
        updateGame();
    });
    socket.on('lobbyUpdate', function (req) {
        const action = req.action;
        const servers = req.data;
        const list = $('#games');
        console.log(req);
        
        if (action === 'set') {
            list.html("");
        }
        // game has :
        // uuid
        // name
        // count
        servers.forEach(game => {
            if (action === 'remove') {
                try {
                    $(`#${game.uuid}`).remove();
                } catch (e) { }
            } else {
                const local = $(`<div id="${game.uuid}" class="gameListing">`);
                local.text(`${game.name} ${game.count} (${game.uuid})`)
                local.on('click', () => {
                    socket.emit('gameJoin', {
                        uuid: game.uuid
                    });
                })
                list.append(local)
            }
        });
    });
});
