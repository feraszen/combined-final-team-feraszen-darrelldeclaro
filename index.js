const express = require('express');
const expressWs = require('express-ws');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcrypt');
const User = require('./models/User');
const requireAuth = require('./middleware/auth');

const PORT = 3000;
//TODO: Replace with the URI pointing to your own MongoDB setup
const MONGO_URI = 'mongodb://localhost:27017/realtime_chat';
const app = express();
expressWs(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(session({
    secret: 'chat-app-secret',
    resave: false,
    saveUninitialized: true
}));

let connectedClients = [];

//Note: These are (probably) not all the required routes, nor are the ones present all completed.
//But they are a decent starting point for the routes you'll probably need

app.ws('/ws', (socket, request) => {
    const username = request.session.username;

    if (!username) {
        socket.close();
        return;
    }

    const client = {
        socket,
        username
    };

    connectedClients.push(client);

    socket.send(JSON.stringify({
        type: 'connected',
        username
    }));

    connectedClients.forEach((existingClient) => {
        if (
            existingClient.socket !== socket &&
            existingClient.socket.readyState === 1
        ) {
            socket.send(JSON.stringify({
                type: 'user_connected',
                username: existingClient.username
            }));
        }
    });

    connectedClients.forEach((client) => {
        if (client.socket !== socket && client.socket.readyState === 1) {
            client.socket.send(JSON.stringify({
                type: 'user_connected',
                username
            }));
        }
    });

    socket.on('message', (rawMessage) => {
        try {
            const parsedMessage = JSON.parse(rawMessage);

            if (parsedMessage.type !== 'message') {
                return;
            }

            const message = String(parsedMessage.message || '').trim();

            if (!message) {
                return;
            }

            const chatMessage = {
                type: 'message',
                username,
                timestamp: new Date().toISOString(),
                message
            };

            connectedClients.forEach((client) => {
                if (client.socket.readyState === 1) {
                    client.socket.send(JSON.stringify(chatMessage));
                }
            });
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });

    socket.on('close', () => {
        connectedClients = connectedClients.filter(
            (client) => client.socket !== socket
        );

        connectedClients.forEach((client) => {
            if (client.socket.readyState === 1) {
                client.socket.send(JSON.stringify({
                    type: 'user_disconnected',
                    username
                }));
            }
        });
    });
});

app.get('/', async (request, response) => {
    response.render('index/unauthenticated');
});

app.get('/login', async (request, response) => {
    return response.render('login', {
        errorMessage: null
    });
});

app.post('/login', async (request, response) => {
    try {
        const { username, password } = request.body;

        if (!username || !password) {
            return response.render('login', {
                errorMessage: 'Username and password are required.'
            });
        }

        const user = await User.findOne({ username });

        if (!user) {
            return response.render('login', {
                errorMessage: 'Invalid username or password.'
            });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return response.render('login', {
                errorMessage: 'Invalid username or password.'
            });
        }

        request.session.userId = user._id;
        request.session.username = user.username;
        request.session.role = user.role;

        return response.redirect('/dashboard');

    } catch (error) {
        console.error(error);

        return response.render('login', {
            errorMessage: 'An error occurred during login.'
        });
    }
});

app.get('/signup', async (request, response) => {
    return response.render('signup', { errorMessage: null });
});

app.post('/signup', async (request, response) => {
    try {
        const { username, password } = request.body;

        if (!username || !password) {
            return response.render('signup', {
                errorMessage: 'Username and password are required.'
            });
        }

        const existingUser = await User.findOne({ username });

        if (existingUser) {
            return response.render('signup', {
                errorMessage: 'Username already exists.'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await User.create({
            username,
            password: hashedPassword
        });

        return response.redirect('/login');
    } catch (error) {
        console.error(error);

        return response.render('signup', {
            errorMessage: 'An error occurred during signup.'
        });
    }
});

app.get('/dashboard', requireAuth, async (request, response) => {
    return response.render('index/authenticated');
});

app.get('/profile', requireAuth, async (request, response) => {
    try {
        const user = await User.findById(request.session.userId);

        if (!user) {
            return request.session.destroy(() => {
                response.redirect('/login');
            });
        }

        return response.render('profile', {
            username: user.username,
            joinDate: user.createdAt.toLocaleDateString()
        });
    } catch (error) {
        console.error('Profile error:', error);
        return response.status(500).send('Unable to load profile.');
    }
});

app.post('/logout', (request, response) => {
    request.session.destroy((error) => {
        if (error) {
            console.error('Logout error:', error);
            return response.status(500).send('Unable to log out.');
        }

        return response.redirect('/login');
    });
});

mongoose.connect(MONGO_URI)
    .then(() => app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`)))
    .catch((err) => console.error('MongoDB connection error:', err));