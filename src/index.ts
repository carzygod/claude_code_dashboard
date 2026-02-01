import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import archiver from 'archiver';
import { sessionManager } from './manager';
import { getSettings, updateSettings } from './config';

const app = express();
const port = process.env.PORT || 4000;
const workspaceRoot = path.resolve(process.env.CLAUDE_WORKSPACE_DIR || '/workspace');

fs.mkdirSync(workspaceRoot, { recursive: true });

function resolveWorkspacePath(relPath?: string) {
    const normalized = relPath ? String(relPath) : '.';
    const target = path.resolve(workspaceRoot, normalized);
    if (!target.startsWith(workspaceRoot)) {
        throw new Error('Path is outside of workspace');
    }
    return target;
}

app.use(cors());
app.use(express.json());
let activeToken: string | null = null;

function ensureAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const provided = req.header('X-CLAUDE-TOKEN');
    if (activeToken && provided && provided === activeToken) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized' });
}

// Serve static files for a simple client UI
app.use(express.static('public'));

const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    const urlParams = new URLSearchParams(req.url?.split('?')[1]);
    const sessionId = urlParams.get('sessionId') || 'default';
    const skipClaude = urlParams.get('skipClaude');

    console.log(`Client connected to session: ${sessionId} (skipClaude=${skipClaude})`);

    const session = sessionManager.createSession(sessionId, {
        autoLaunchClaude: skipClaude !== '1',
    });
    session.attach(ws);

    ws.on('error', console.error);
});

// Simple health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    const settings = getSettings();
    if (
        String(username) === settings.ADMIN_USERNAME &&
        String(password) === settings.ADMIN_PASSWORD
    ) {
        activeToken = randomUUID();
        return res.json({ token: activeToken });
    }
    res.status(401).json({ error: 'Invalid credentials' });
});

// API to list sessions
app.get('/api/sessions', ensureAuth, (req, res) => {
    const sessions = sessionManager.getAllSessions();
    res.json(sessions);
});

// API to create a new session
app.post('/api/sessions', ensureAuth, (req, res) => {
    const sessionId = req.body.id || `session-${Date.now()}`;
    const autoLaunchClaude = req.body?.autoLaunchClaude !== false;
    sessionManager.createSession(sessionId, { autoLaunchClaude });
    res.json({ id: sessionId, status: 'created' });
});

// API to delete a session
app.delete('/api/sessions/:id', ensureAuth, (req, res) => {
    const { id } = req.params;
    sessionManager.removeSession(id);
    res.json({ status: 'deleted', id });
});

app.get('/api/files', ensureAuth, async (req, res) => {
    try {
        const rel = typeof req.query.path === 'string' ? req.query.path : '.';
        const dir = resolveWorkspacePath(rel);
        const stats = await fs.promises.stat(dir);
        if (!stats.isDirectory()) {
            return res.status(400).json({ error: 'Not a directory' });
        }

        const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
        const entries = await Promise.all(dirents.map(async (dirent) => {
            const entryPath = path.join(dir, dirent.name);
            const entryStats = await fs.promises.stat(entryPath);
            return {
                name: dirent.name,
                type: dirent.isDirectory() ? 'directory' : 'file',
                size: entryStats.size,
                mtime: entryStats.mtime.getTime(),
                path: path.relative(workspaceRoot, entryPath) || '.',
            };
        }));

        res.json({ cwd: path.relative(workspaceRoot, dir) || '.', entries });
    } catch (error) {
        console.error('File listing failed', error);
        res.status(500).json({ error: (error as Error).message || 'Failed to list files' });
    }
});

app.get('/api/files/download', ensureAuth, async (req, res) => {
    try {
        const rel = String(req.query.path || '.');
        const filePath = resolveWorkspacePath(rel);
        const stats = await fs.promises.stat(filePath);
        if (stats.isDirectory()) {
            return res.status(400).json({ error: 'Path is a directory' });
        }
        res.download(filePath);
    } catch (error) {
        console.error('Download failed', error);
        res.status(500).json({ error: (error as Error).message || 'Download failed' });
    }
});

app.post('/api/files/zip', ensureAuth, async (req, res) => {
    try {
        const rel = String(req.body?.path || '.');
        const source = resolveWorkspacePath(rel);
        const stats = await fs.promises.stat(source);
        const label = String(req.body?.name || `${path.basename(source)}.zip`);

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${label}"`);

        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.on('error', (err: Error) => {
            console.error('Zip error', err);
            res.status(500).end();
        });
        archive.pipe(res);

        if (stats.isDirectory()) {
            archive.directory(source, false);
        } else {
            archive.file(source, { name: path.basename(source) });
        }
        await archive.finalize();
    } catch (error) {
        console.error('Zip failed', error);
        res.status(500).json({ error: (error as Error).message || 'Failed to create archive' });
    }
});

app.delete('/api/files', ensureAuth, async (req, res) => {
    try {
        const rel = String(req.query.path || '.');
        if (!rel || rel === '.' || rel === '/' || rel === workspaceRoot) {
            return res.status(400).json({ error: 'Cannot delete workspace root' });
        }
        const target = resolveWorkspacePath(rel);
        await fs.promises.rm(target, { recursive: true, force: true });
        res.json({ ok: true });
    } catch (error) {
        console.error('Delete failed', error);
        res.status(500).json({ error: (error as Error).message || 'Delete failed' });
    }
});

app.get('/api/settings', ensureAuth, (req, res) => {
    res.json(getSettings());
});

app.post('/api/settings', ensureAuth, (req, res) => {
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
