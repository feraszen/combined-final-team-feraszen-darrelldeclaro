const express = require('express');
const expressWs = require('express-ws');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcrypt');

const User = require('./models/User');
const Message = require('./models/Message');

const requireAuth = require('./middleware/auth');
const requireAdmin = require('./middleware/admin');

const PORT = 3000;

// MongoDB connection
const MONGO_URI = 'mongodb://localhost:27017/realtime_chat';

const app = express();

expressWs(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(
    session({
        secret: 'chat-app-secret',
        resave: false,
        saveUninitialized: false
    })
);

/*
 * connectedClients contains temporary WebSocket connections.
 *
 * Persistent data such as users and messages is stored in MongoDB.
 */
let connectedClients = [];

/*
 * Return the number of unique users currently connected
 * to the chat through WebSocket.
 */
function getOnlineUserCount() {
    return new Set(
        connectedClients.map((client) => client.username)
    ).size;
}


/*
 * WebSocket connection
 */
app.ws('/ws', (socket, request) => {
    const username = request.session.username;
    const userId = request.session.userId;

    if (!username || !userId) {
        socket.close();
        return;
    }

    const client = {
        socket,
        username,
        userId: userId.toString()
    };

    connectedClients.push(client);

    socket.send(
        JSON.stringify({
            type: 'connected',
            username
        })
    );

    /*
     * Send the existing online users to the newly connected user.
     */
    connectedClients.forEach((existingClient) => {
        if (
            existingClient.socket !== socket &&
            existingClient.socket.readyState === 1
        ) {
            socket.send(
                JSON.stringify({
                    type: 'user_connected',
                    username: existingClient.username
                })
            );
        }
    });

    /*
     * Notify existing users that a new user has connected.
     */
    connectedClients.forEach((client) => {
        if (
            client.socket !== socket &&
            client.socket.readyState === 1
        ) {
            client.socket.send(
                JSON.stringify({
                    type: 'user_connected',
                    username
                })
            );

            client.socket.send(
                JSON.stringify({
                    type: 'user_joined',
                    username
                })
            );
        }
    });

    /*
     * Receive and broadcast chat messages.
     */
    socket.on('message', async (rawMessage) => {
        try {
            const parsedMessage = JSON.parse(rawMessage);

            if (parsedMessage.type !== 'message') {
                return;
            }

            const message = String(
                parsedMessage.message || ''
            ).trim();

            if (!message) {
                return;
            }

            const savedMessage = await Message.create({
                username,
                message
            });

            const chatMessage = {
                type: 'message',
                username: savedMessage.username,
                timestamp: savedMessage.timestamp.toISOString(),
                message: savedMessage.message
            };

            connectedClients.forEach((client) => {
                if (client.socket.readyState === 1) {
                    client.socket.send(
                        JSON.stringify(chatMessage)
                    );
                }
            });
        } catch (error) {
            console.error(
                'WebSocket message error:',
                error
            );
        }
    });

    /*
     * Handle WebSocket disconnection.
     */
    socket.on('close', () => {
        connectedClients = connectedClients.filter(
            (client) => client.socket !== socket
        );

        /*
         * Do not announce that the user left if the same
         * user still has another active WebSocket connection.
         */
        const userStillConnected = connectedClients.some(
            (client) => client.username === username
        );

        if (userStillConnected) {
            return;
        }

        connectedClients.forEach((client) => {
            if (client.socket.readyState === 1) {
                client.socket.send(
                    JSON.stringify({
                        type: 'user_disconnected',
                        username
                    })
                );
            }
        });
    });
});


/*
 * Home page
 */
app.get('/', async (request, response) => {
    return response.render('index/unauthenticated', {
        onlineUsers: getOnlineUserCount()
    });
});


/*
 * Return the current number of online users.
 *
 * The homepage uses this endpoint to update the displayed
 * count without opening a WebSocket connection.
 */
app.get('/online-count', (request, response) => {
    return response.json({
        onlineUsers: getOnlineUserCount()
    });
});


/*
 * Login page
 */
app.get('/login', async (request, response) => {
    return response.render('login', {
        errorMessage: null
    });
});


/*
 * Login
 */
app.post('/login', async (request, response) => {
    try {
        const { username, password } = request.body;

        if (!username || !password) {
            return response.render('login', {
                errorMessage:
                    'Username and password are required.'
            });
        }

        const user = await User.findOne({ username });

        if (!user) {
            return response.render('login', {
                errorMessage:
                    'Invalid username or password.'
            });
        }

        const passwordMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatch) {
            return response.render('login', {
                errorMessage:
                    'Invalid username or password.'
            });
        }

        request.session.userId = user._id;
        request.session.username = user.username;
        request.session.role = user.role;
        request.session.loginAt = Date.now();

        return response.redirect('/dashboard');
    } catch (error) {
        console.error(error);

        return response.render('login', {
            errorMessage:
                'An error occurred during login.'
        });
    }
});


/*
 * Signup page
 */
app.get('/signup', async (request, response) => {
    return response.render('signup', {
        errorMessage: null
    });
});


/*
 * Signup
 */
app.post('/signup', async (request, response) => {
    try {
        const { username, password } = request.body;

        if (!username || !password) {
            return response.render('signup', {
                errorMessage:
                    'Username and password are required.'
            });
        }

        const existingUser = await User.findOne({
            username
        });

        if (existingUser) {
            return response.render('signup', {
                errorMessage:
                    'Username already exists.'
            });
        }

        const hashedPassword = await bcrypt.hash(
            password,
            10
        );

        await User.create({
            username,
            password: hashedPassword
        });

        return response.redirect('/');
    } catch (error) {
        console.error(error);

        return response.render('signup', {
            errorMessage:
                'An error occurred during signup.'
        });
    }
});


/*
 * Chat dashboard
 */
app.get(
    '/dashboard',
    requireAuth,
    async (request, response) => {
        try {
            if (!request.session.loginAt) {
                request.session.loginAt = Date.now();
            }

            const loginTime = new Date(
                request.session.loginAt
            );

            const messages = await Message.find({
                timestamp: {
                    $gte: loginTime
                }
            }).sort({
                timestamp: 1
            });

            return response.render(
                'index/authenticated',
                {
                    messages,
                    role: request.session.role
                }
            );
        } catch (error) {
            console.error(
                'Error loading messages:',
                error
            );

            return response.render(
                'index/authenticated',
                {
                    messages: [],
                    role: request.session.role
                }
            );
        }
    }
);


/*
 * Admin dashboard
 */
app.get(
    '/admin',
    requireAdmin,
    async (request, response) => {
        try {
            const users = await User.find()
                .select('username role createdAt')
                .sort({ username: 1 });

            return response.render('admin', {
                users,
                userId:
                    request.session.userId.toString(),
                errorMessage: null
            });
        } catch (error) {
            console.error(
                'Admin dashboard error:',
                error
            );

            return response
                .status(500)
                .send(
                    'Unable to load admin dashboard.'
                );
        }
    }
);


/*
 * Remove a user from the admin dashboard.
 */
app.post(
    '/admin/users/:id/delete',
    requireAdmin,
    async (request, response) => {
        try {
            if (
                request.params.id ===
                request.session.userId.toString()
            ) {
                return response
                    .status(400)
                    .send(
                        'You cannot remove your own account.'
                    );
            }

            await User.findByIdAndDelete(
                request.params.id
            );

            return response.redirect('/admin');
        } catch (error) {
            console.error(
                'Remove user error:',
                error
            );

            return response
                .status(500)
                .send(
                    'Unable to remove user.'
                );
        }
    }
);


/*
 * Profile page
 */
app.get(
    '/profile',
    requireAuth,
    async (request, response) => {
        try {
            const user = await User.findById(
                request.session.userId
            );

            if (!user) {
                return request.session.destroy(
                    () => {
                        response.redirect('/login');
                    }
                );
            }

            return response.render('profile', {
                username: user.username,
                joinDate:
                    user.createdAt.toLocaleDateString(),
                role: request.session.role
            });
        } catch (error) {
            console.error(
                'Profile error:',
                error
            );

            return response
                .status(500)
                .send(
                    'Unable to load profile.'
                );
        }
    }
);


/*
 * View another member's profile
 */
app.get(
    '/profile/:id',
    requireAuth,
    async (request, response) => {
        try {
            const user = await User.findById(
                request.params.id
            ).select('username createdAt');

            if (!user) {
                return response
                    .status(404)
                    .send('User profile not found.');
            }

            return response.render('profile', {
                username: user.username,
                joinDate:
                    user.createdAt.toLocaleDateString(),
                role: request.session.role
            });
        } catch (error) {
            console.error(
                'Other profile error:',
                error
            );

            return response
                .status(404)
                .send('User profile not found.');
        }
    }
);


/*
 * Logout
 */
app.post('/logout', (request, response) => {
    request.session.destroy((error) => {
        if (error) {
            console.error(
                'Logout error:',
                error
            );

            return response
                .status(500)
                .send(
                    'Unable to log out.'
                );
        }

        return response.redirect('/');
    });
});


/*
 * Connect to MongoDB and start the server.
 */
mongoose
    .connect(MONGO_URI)
    .then(() => {
        app.listen(PORT, () => {
            console.log(
                `Server running on http://localhost:${PORT}`
            );
        });
    })
    .catch((err) => {
        console.error(
            'MongoDB connection error:',
            err
        );
    });
