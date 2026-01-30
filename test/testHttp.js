const { WebSocket } = require('ws');

const SERVER_ORIGIN = process.env.CLAUDE_SERVER_URL || 'http://192.168.31.214:4000';
const WS_ORIGIN = SERVER_ORIGIN.replace(/^http/, 'ws');

const COMMANDS = [
    { cmd: 'mkdir -p /root/agent/sandbox/test1', marker: 'mkdir-workspace' },
    { cmd: 'cd /root/agent/sandbox/test1', marker: 'enter-workspace' },
    { cmd: 'npm create vite@latest claude-dashboard -- --template react', marker: 'create-project' },
    { cmd: 'cd claude-dashboard', marker: 'enter-project' },
    { cmd: 'npm install', marker: 'install-deps' },
    { cmd: 'npm run build', marker: 'build-project' },
    { cmd: 'ls dist/index.html', marker: 'verify-dist' },
];

const MARKER_PREFIX = '__CMD_DONE__';
const MAX_MARKER_WAIT = 180_000;

let pendingMarker = null;
let outputTail = '';
const outputLog = [];

function waitForMarker(markerToken) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            pendingMarker = null;
            reject(new Error(`Timeout waiting for marker "${markerToken}"`));
        }, MAX_MARKER_WAIT);

        pendingMarker = {
            marker: markerToken,
            resolve: (buffer) => {
                clearTimeout(timeout);
                pendingMarker = null;
                resolve(buffer);
            },
        };
    });
}

function handleOutput(text) {
    outputLog.push(text);
    outputTail = (outputTail + text).slice(-4096);
    if (pendingMarker && pendingMarker.marker && outputTail.includes(pendingMarker.marker)) {
        pendingMarker.resolve(outputTail);
    }
}

async function sendCommand(ws, command, marker) {
    const markerToken = `${MARKER_PREFIX}${marker}__`;
    const wrapped = `${command} && printf '\\n${markerToken}\\n'`;
    const waitPromise = waitForMarker(markerToken);

    console.log(`> ${command}`);
    ws.send(JSON.stringify({ type: 'input', data: `${wrapped}\r` }));
    await waitPromise;
    console.log(`✔ command ${marker} completed`);
}

async function createSession() {
    const res = await fetch(`${SERVER_ORIGIN}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoLaunchClaude: false }),
    });

    if (!res.ok) {
        throw new Error(`failed to create session: ${res.status}`);
    }

    const payload = await res.json();
    return payload.id;
}

async function runCommands(ws) {
    for (const item of COMMANDS) {
        await sendCommand(ws, item.cmd, item.marker);
    }

    const combined = outputLog.join('');
    if (!combined.includes('dist/index.html')) {
        throw new Error('Failed to confirm dist/index.html output');
    }

    console.log('✅ dist/index.html confirmed');
}

async function main() {
    console.log('Creating Claude session via HTTP API...');
    const sessionId = await createSession();
    console.log(`Session created: ${sessionId}`);

    const ws = new WebSocket(`${WS_ORIGIN}?sessionId=${sessionId}`);

    ws.on('open', () => {
        console.log('WebSocket connected; running commands...');
        runCommands(ws)
            .then(() => {
                console.log('All commands executed successfully');
                setTimeout(() => ws.close(), 2000);
            })
            .catch((err) => {
                console.error('Test failed:', err);
                ws.close();
                process.exit(1);
            });
    });

    ws.on('message', (message) => {
        try {
            const parsed = JSON.parse(message.toString());
            if (parsed.type === 'output' || parsed.type === 'history') {
                const data = String(parsed.data || '');
                process.stdout.write(data);
                handleOutput(data);
            }
        } catch (err) {
            console.error('Failed to parse message', err);
        }
    });

    ws.on('close', () => {
        console.log('WebSocket closed.');
        process.exit(0);
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
        process.exit(1);
    });
}

main().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
