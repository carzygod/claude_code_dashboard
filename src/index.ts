import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { sessionManager } from './manager';
import { getSettings, updateSettings } from './config';

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Serve static files for a simple client UI
app.use(express.static('public'));

const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    const urlParams = new URLSearchParams(req.url?.split('?')[1]);
    const sessionId = urlParams.get('sessionId') || 'default';

    console.log(`Client connected to session: ${sessionId}`);

    const session = sessionManager.createSession(sessionId);
    session.attach(ws);

    ws.on('error', console.error);
});

// Simple health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// API to list sessions
app.get('/api/sessions', (req, res) => {
    const sessions = sessionManager.getAllSessions();
    res.json(sessions);
});

// API to create a new session
app.post('/api/sessions', (req, res) => {
    const sessionId = req.body.id || `session-${Date.now()}`;
    sessionManager.createSession(sessionId);
    res.json({ id: sessionId, status: 'created' });
});

// API to delete a session
app.delete('/api/sessions/:id', (req, res) => {
    const { id } = req.params;
    sessionManager.removeSession(id);
    res.json({ status: 'deleted', id });
});

app.get('/api/settings', (req, res) => {
    res.json(getSettings());
});

app.post('/api/settings', (req, res) => {
    try {
        const updated = updateSettings(req.body);
        res.json(updated);
    } catch (error) {
        console.error('Failed to update settings', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

server.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
    console.log(`WebSocket endpoint: ws://localhost:${port}`);
});
