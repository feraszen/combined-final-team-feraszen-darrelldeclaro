const webSocket = new WebSocket(`ws://${window.location.host}/ws`);

const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const chatMessages = document.getElementById("chat-messages");
const userList = document.getElementById("user-list");
const connectionStatus = document.getElementById("connection-status");

const connectedUsers = new Set();

webSocket.addEventListener("open", () => {
    connectionStatus.textContent = "Connected";
});

webSocket.addEventListener("close", () => {
    connectionStatus.textContent = "Disconnected";
});

webSocket.addEventListener("error", () => {
    connectionStatus.textContent = "Connection error";
});

webSocket.addEventListener("message", (event) => {
    try {
        const eventData = JSON.parse(event.data);

        switch (eventData.type) {
            case "connected":
                onUserConnected(eventData.username);
                break;

            case "user_connected":
                onUserConnected(eventData.username);
                break;

            case "user_joined":
                addSystemMessage(`${eventData.username} has joined the chat.`);
                break;

            case "user_disconnected":
                onUserDisconnected(eventData.username);
                break;

            case "message":
                onNewMessageReceived(
                    eventData.username,
                    eventData.timestamp,
                    eventData.message
                );
                break;

            default:
                console.warn("Unknown WebSocket event:", eventData);
        }

    } catch (error) {
        console.error("Invalid WebSocket message:", error);
    }
});

function onUserConnected(username) {
    if (!username || connectedUsers.has(username)) {
        return;
    }

    connectedUsers.add(username);
    updateUserList();
}

function onUserDisconnected(username) {
    if (!username) {
        return;
    }

    connectedUsers.delete(username);
    updateUserList();

    addSystemMessage(`${username} left the chat.`);
}

function updateUserList() {
    userList.innerHTML = "";

    connectedUsers.forEach((username) => {
        const listItem = document.createElement("li");
        listItem.textContent = username;
        userList.appendChild(listItem);
    });
}

function onNewMessageReceived(username, timestamp, message) {
    const messageContainer = document.createElement("div");

    const time = new Date(timestamp).toLocaleTimeString();

    const usernameElement = document.createElement("strong");
    usernameElement.textContent = `${username}: `;

    const messageElement = document.createElement("span");
    messageElement.textContent = message;

    const timestampElement = document.createElement("small");
    timestampElement.textContent = ` (${time})`;

    messageContainer.appendChild(usernameElement);
    messageContainer.appendChild(messageElement);
    messageContainer.appendChild(timestampElement);

    chatMessages.appendChild(messageContainer);

    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMessage(message) {
    const systemMessage = document.createElement("p");
    systemMessage.textContent = message;

    chatMessages.appendChild(systemMessage);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function onMessageSent(event) {
    event.preventDefault();

    const message = messageInput.value.trim();

    if (!message) {
        return;
    }

    if (webSocket.readyState !== WebSocket.OPEN) {
        connectionStatus.textContent = "Not connected to chat server.";
        return;
    }

    webSocket.send(JSON.stringify({
        type: "message",
        message
    }));

    messageInput.value = "";
    messageInput.focus();
}

messageForm.addEventListener("submit", onMessageSent);
