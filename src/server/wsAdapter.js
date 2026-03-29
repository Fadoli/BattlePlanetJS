const zlib = require('zlib');

function createServerSocketAdapter(rawSocket, request) {
    const listeners = {};

    rawSocket.on("message", (data) => {
        let message;
        try {
            message = JSON.parse(data.toString());
        } catch (error) {
            return;
        }

        if (!message || typeof message.event !== "string") {
            return;
        }

        const handlers = listeners[message.event] || [];
        for (const handler of handlers) {
            handler(message.payload);
        }
    });

    rawSocket.on("close", () => {
        const handlers = listeners.disconnect || [];
        for (const handler of handlers) {
            handler();
        }
    });

    return {
        conn: {
            remoteAddress: request.socket.remoteAddress,
        },
        on(event, handler) {
            if (!listeners[event]) {
                listeners[event] = [];
            }
            listeners[event].push(handler);
        },
        emit(event, payload, compress = false) {
            if (rawSocket.readyState !== rawSocket.OPEN) {
                return;
            }

            const envelope = JSON.stringify({ event, payload });
            if (compress && envelope.length > 1024) {
                // Compress only if payload is large enough
                rawSocket.send(zlib.gzipSync(envelope));
            } else {
                rawSocket.send(envelope);
            }
        },
        close() {
            rawSocket.close();
        },
    };
}

module.exports = {
    createServerSocketAdapter,
};
