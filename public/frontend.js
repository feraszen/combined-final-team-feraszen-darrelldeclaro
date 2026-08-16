const webSocket = new WebSocket(
    `ws://${window.location.host}/ws`
);

const messageForm =
    document.getElementById("message-form");

const messageInput =
    document.getElementById("message-input");

const chatMessages =
    document.getElementById("chat-messages");

const userList =
    document.getElementById("user-list");

const connectionStatus =
    document.getElementById("connection-status");


/*
 * Store connected users by their database user ID.
 *
 * The Map key is the user ID and the value is the username.
 * This prevents duplicate usernames from being displayed
 * when the same user has multiple active connections.
 */
const connectedUsers = new Map();


/*
 * WebSocket connected.
 */
webSocket.addEventListener("open", () => {
    connectionStatus.textContent = "Connected";
});


/*
 * WebSocket disconnected.
 */
webSocket.addEventListener("close", () => {
    connectionStatus.textContent = "Disconnected";
});


/*
 * WebSocket connection error.
 */
webSocket.addEventListener("error", () => {
    connectionStatus.textContent =
        "Connection error";
});


/*
 * Handle messages received from the WebSocket server.
 */
webSocket.addEventListener("message", (event) => {
    try {
        const eventData = JSON.parse(event.data);

        switch (eventData.type) {
            case "connected":
                onUserConnected(
                    eventData.userId,
                    eventData.username
                );
                break;

            case "user_connected":
                onUserConnected(
                    eventData.userId,
                    eventData.username
                );
                break;

            case "user_joined":
                addSystemMessage(
                    `${eventData.username} has joined the chat.`
                );
                break;

            case "user_disconnected":
                onUserDisconnected(
                    eventData.userId,
                    eventData.username
                );
                break;

            case "message":
                onNewMessageReceived(
                    eventData.username,
                    eventData.timestamp,
                    eventData.message
                );
                break;

            default:
                console.warn(
                    "Unknown WebSocket event:",
                    eventData
                );
        }

    } catch (error) {
        console.error(
            "Invalid WebSocket message:",
            error
        );
    }
});


/*
 * Add a user to the online users list.
 */
function onUserConnected(userId, username) {
    if (!userId || !username) {
        return;
    }

    if (connectedUsers.has(userId)) {
        return;
    }

    connectedUsers.set(userId, username);

    updateUserList();
}


/*
 * Remove a user from the online users list.
 */
function onUserDisconnected(userId, username) {
    if (!userId) {
        return;
    }

    if (!connectedUsers.has(userId)) {
        return;
    }

    connectedUsers.delete(userId);

    updateUserList();

    if (username) {
        addSystemMessage(
            `${username} left the chat.`
        );
    }
}


/*
 * Update the displayed online users.
 */
function updateUserList() {
    userList.innerHTML = "";

    connectedUsers.forEach((username) => {
        const listItem =
            document.createElement("li");

        listItem.textContent = username;

        userList.appendChild(listItem);
    });
}


/*
 * Display a new chat message.
 */
function onNewMessageReceived(
    username,
    timestamp,
    message
) {
    const messageContainer =
        document.createElement("div");

    const time =
        new Date(timestamp).toLocaleTimeString();

    const usernameElement =
        document.createElement("strong");

    usernameElement.textContent =
        `${username}: `;

    const messageElement =
        document.createElement("span");

    messageElement.textContent =
        message;

    const timestampElement =
        document.createElement("small");

    timestampElement.textContent =
        ` (${time})`;

    messageContainer.appendChild(
        usernameElement
    );

    messageContainer.appendChild(
        messageElement
    );

    messageContainer.appendChild(
        timestampElement
    );

    chatMessages.appendChild(
        messageContainer
    );

    chatMessages.scrollTop =
        chatMessages.scrollHeight;
}


/*
 * Display a system message in the chat.
 */
function addSystemMessage(message) {
    const systemMessage =
        document.createElement("p");

    systemMessage.textContent =
        message;

    chatMessages.appendChild(
        systemMessage
    );

    chatMessages.scrollTop =
        chatMessages.scrollHeight;
}


/*
 * Send a chat message through WebSocket.
 */
function onMessageSent(event) {
    event.preventDefault();

    const message =
        messageInput.value.trim();

    if (!message) {
        return;
    }

    if (
        webSocket.readyState !==
        WebSocket.OPEN
    ) {
        connectionStatus.textContent =
            "Not connected to chat server.";

        return;
    }

    webSocket.send(
        JSON.stringify({
            type: "message",
            message
        })
    );

    messageInput.value = "";

    messageInput.focus();
}


/*
 * Handle chat form submission.
 */
messageForm.addEventListener(
    "submit",
    onMessageSent
);
