import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SettingsPayload {
    ANTHROPIC_BASE_URL: string;
    ANTHROPIC_AUTH_TOKEN: string;
    ANTHROPIC_MODEL: string;
    ANTHROPIC_SMALL_FAST_MODEL: string;
    API_TIMEOUT_MS: string;
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: string;
    ADMIN_USERNAME: string;
    ADMIN_PASSWORD: string;
}

const DEFAULT_SETTINGS: SettingsPayload = {
    ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
    ANTHROPIC_AUTH_TOKEN: 'sk-7286f1be7902450297b892e6f4bd629d',
    ANTHROPIC_MODEL: 'deepseek-chat',
    ANTHROPIC_SMALL_FAST_MODEL: 'deepseek-chat',
    API_TIMEOUT_MS: '600000',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'admin',
};

const SETTINGS_FILE = path.resolve(process.cwd(), 'settings.json');
let cachedSettings: SettingsPayload = loadSettings();

function loadSettings(): SettingsPayload {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const file = fs.readFileSync(SETTINGS_FILE, 'utf8');
            const parsed = JSON.parse(file);
            return {
                ...DEFAULT_SETTINGS,
                ...parsed,
            };
        }
    } catch (err) {
        console.warn('Failed to load settings file:', err);
    }

    return { ...DEFAULT_SETTINGS };
}

function persistSettings(settings: SettingsPayload) {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
    } catch (err) {
        console.warn('Failed to persist settings file:', err);
    }
}

export function getSettings(): SettingsPayload {
    return { ...cachedSettings };
}

export function updateSettings(payload: Partial<SettingsPayload>): SettingsPayload {
    const allowedKeys: (keyof SettingsPayload)[] = [
        'ANTHROPIC_BASE_URL',
        'ANTHROPIC_AUTH_TOKEN',
        'ANTHROPIC_MODEL',
        'ANTHROPIC_SMALL_FAST_MODEL',
        'API_TIMEOUT_MS',
        'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
    ];

    const normalized: SettingsPayload = { ...cachedSettings };

    allowedKeys.forEach((key) => {
        if (payload[key] !== undefined && payload[key] !== null) {
            normalized[key] = String(payload[key]);
        }
    });

    cachedSettings = normalized;
    persistSettings(cachedSettings);
    return getSettings();
}
