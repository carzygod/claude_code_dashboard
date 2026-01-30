const term = new Terminal({
    theme: {
        background: '#0d0d12',
        foreground: '#e2e8f0',
        cursor: '#6366f1',
        selectionBackground: 'rgba(99, 102, 241, 0.3)',
        black: '#000000',
        red: '#ef4444',
        green: '#10b981',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#d946ef',
        cyan: '#06b6d4',
        white: '#ffffff',
    },
    fontFamily: '"JetBrains Mono", Menlo, Consolas, monospace',
    fontSize: 14,
    lineHeight: 1.2,
    cursorBlink: true
});

const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);

let currentSocket = null;
let currentSessionId = null;

// UI Elements
const sessionListEl = document.getElementById('session-list');
const newSessionBtn = document.getElementById('new-session-btn');
const terminalContainer = document.getElementById('terminal-container');
const emptyState = document.getElementById('empty-state');
const currentSessionTitle = document.getElementById('current-session-title');
const deleteSessionBtn = document.getElementById('delete-session-btn');
const connectionStatus = document.getElementById('connection-status');
const statusDot = document.querySelector('.status-indicator .dot');
const sessionBadge = document.querySelector('.session-badge');
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const settingsBackdrop = document.getElementById('settings-backdrop');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const cancelSettingsBtn = document.getElementById('cancel-settings-btn');
const settingsForm = document.getElementById('settings-form');
const settingsStatus = document.getElementById('settings-status');
const settingFields = [
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_MODEL',
    'ANTHROPIC_SMALL_FAST_MODEL',
    'API_TIMEOUT_MS',
    'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
];

// Initialize Terminal
// We only open the terminal when a session is active
// term.open(terminalContainer); 

async function fetchSessions() {
    try {
        const res = await fetch('/api/sessions');
        const sessions = await res.json();
        renderSessionList(sessions);
    } catch (e) {
        console.error('Failed to fetch sessions', e);
    }
}

async function createNewSession() {
    try {
        const res = await fetch('/api/sessions', { method: 'POST' });
        const data = await res.json();
        await fetchSessions();
        activateSession(data.id);
    } catch (e) {
        console.error('Failed to create session', e);
    }
}

async function deleteSession(id) {
    if (!confirm('Are you sure you want to terminate this session?')) return;

    try {
        await fetch('/api/sessions/' + id, { method: 'DELETE' });
        if (currentSessionId === id) {
            disconnectCurrentSession();
        }
        await fetchSessions();
    } catch (e) {
        console.error('Failed to delete session', e);
    }
}

function renderSessionList(sessions) {
    sessionListEl.innerHTML = '';
    sessions.forEach(session => {
        const el = document.createElement('div');
        el.className = `session-item ${session.id === currentSessionId ? 'active' : ''}`;

        const timeString = new Date(session.startTime).toLocaleTimeString();

        el.innerHTML = `
            <div class="session-id">${session.id}</div>
            <div class="session-time">Started ${timeString}</div>
        `;

        el.onclick = () => activateSession(session.id);
        sessionListEl.appendChild(el);
    });
}

function disconnectCurrentSession() {
    if (currentSocket) {
        currentSocket.close();
        currentSocket = null;
    }
    term.reset(); // Clear terminal completely
    // Detach terminal from DOM visually or just clear it
    if (term.element) {
        term.element.remove();
    }

    currentSessionId = null;
    currentSessionTitle.textContent = "Select a Session";
    sessionBadge.classList.remove('visible');
    deleteSessionBtn.style.display = 'none';
    emptyState.style.display = 'block';

    // Update active class in list
    document.querySelectorAll('.session-item').forEach(el => el.classList.remove('active'));
}

function activateSession(sessionId) {
    if (currentSessionId === sessionId) return;

    disconnectCurrentSession();
    currentSessionId = sessionId;

    // Update UI
    emptyState.style.display = 'none';
    currentSessionTitle.textContent = sessionId;
    sessionBadge.classList.add('visible');
    deleteSessionBtn.style.display = 'block';
    deleteSessionBtn.onclick = () => deleteSession(sessionId);

    // Re-render list to show active state
    // Ideally we just toggle class but full re-render is safe
    fetchSessions();

    // Initialize Terminal UI if not present
    if (!terminalContainer.hasChildNodes()) {
        term.open(terminalContainer);
    } else {
        // If wrapper exists, term.open might append again if we removed element. 
        // We removed element in disconnect, so we open a new one.
        term.open(terminalContainer);
    }

    fitAddon.fit();

    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}?sessionId=${sessionId}`;

    currentSocket = new WebSocket(wsUrl);

    currentSocket.onopen = () => {
        statusDot.classList.add('connected');
        connectionStatus.textContent = 'Connected';
        term.write('\x1b[32m[INFO] Session attached.\x1b[0m\r\n');

        // Resize after connection
        const dims = { cols: term.cols, rows: term.rows };
        currentSocket.send(JSON.stringify({ type: 'resize', ...dims }));
    };

    currentSocket.onclose = () => {
        statusDot.classList.remove('connected');
        connectionStatus.textContent = 'Disconnected';
    };

    currentSocket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'output' || message.type === 'history') {
            term.write(message.data);
        }
    };

    term.onData(data => {
        if (currentSocket && currentSocket.readyState === WebSocket.OPEN) {
            currentSocket.send(JSON.stringify({ type: 'input', data }));
        }
    });
}

function toggleSettingsPanel(show) {
    if (!settingsPanel) return;
    settingsPanel.classList.toggle('visible', show);
    settingsPanel.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (!show && settingsStatus) {
        settingsStatus.textContent = '';
        settingsStatus.classList.remove('error');
    }
}

function setSettingsStatus(message, isError = false) {
    if (!settingsStatus) return;
    settingsStatus.textContent = message;
    settingsStatus.classList.toggle('error', isError);
}

function populateSettings(values) {
    if (!settingsForm) return;
    settingFields.forEach((field) => {
        const input = settingsForm.elements.namedItem(field);
        if (input instanceof HTMLInputElement) {
            input.value = values[field] ?? '';
        }
    });
}

async function loadSettings() {
    try {
        const res = await fetch('/api/settings');
        if (!res.ok) {
            throw new Error('Failed to load settings');
        }
        const data = await res.json();
        populateSettings(data);
    } catch (err) {
        console.error(err);
    }
}

async function submitSettings(event) {
    event.preventDefault();
    if (!settingsForm) return;
    const payload = {};
    settingFields.forEach((field) => {
        const input = settingsForm.elements.namedItem(field);
        if (input instanceof HTMLInputElement) {
            payload[field] = input.value.trim();
        }
    });

    setSettingsStatus('Saving…');

    try {
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            throw new Error('Unable to save settings');
        }

        setSettingsStatus('Settings saved.');
        setTimeout(() => toggleSettingsPanel(false), 900);
    } catch (err) {
        console.error(err);
        setSettingsStatus('Failed to save settings.', true);
    }
}

// Event Listeners
newSessionBtn.addEventListener('click', createNewSession);

window.addEventListener('resize', () => {
    if (currentSessionId) {
        fitAddon.fit();
        if (currentSocket && currentSocket.readyState === WebSocket.OPEN) {
            currentSocket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        }
    }
});

if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
        toggleSettingsPanel(true);
        loadSettings();
    });
}

if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => toggleSettingsPanel(false));
}

if (cancelSettingsBtn) {
    cancelSettingsBtn.addEventListener('click', () => toggleSettingsPanel(false));
}

if (settingsBackdrop) {
    settingsBackdrop.addEventListener('click', () => toggleSettingsPanel(false));
}

if (settingsForm) {
    settingsForm.addEventListener('submit', submitSettings);
}

// Initial Load
fetchSessions();
loadSettings();
