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
        emit(event, payload) {
            if (rawSocket.readyState !== rawSocket.OPEN) {
                return;
            }

            rawSocket.send(JSON.stringify({
                event,
                payload,
            }));
        },
        close() {
            rawSocket.close();
        },
    };
}

module.exports = {
    createServerSocketAdapter,
};
