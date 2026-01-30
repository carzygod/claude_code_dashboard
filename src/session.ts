import * as pty from 'node-pty';
import { WebSocket } from 'ws';
import { EventEmitter } from 'events';

export class ClaudeSession extends EventEmitter {
    public id: string;
    private ptyProcess: pty.IPty;
    private ws: WebSocket | null = null;
    private history: string = '';

    constructor(id: string) {
        super();
        this.id = id;

        // Determine the working directory - use the workspace volume if available, else standard PWD
        // In the Dockerfile we will mount /workspace
        const cwd = process.env.CLAUDE_WORKSPACE_DIR || '/workspace';

        this.ptyProcess = pty.spawn('bash', [], {
            name: 'xterm-color',
            cols: 80,
            rows: 30,
            cwd: cwd,
            env: process.env as any
        });

        this.ptyProcess.onData((data) => {
            this.history += data;
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'output', data }));
            }
        });

        this.ptyProcess.onExit(({ exitCode, signal }) => {
            this.emit('exit', exitCode, signal);
        });

        // Start with the claude command
        // We run it effectively as if the user typed 'claude' into the shell
        // Or we could spawn 'claude' directly. Spawning bash gives us a shell environment 
        // which might be more robust for some environment variables.
        // Let's spawn 'claude' directly to see if it works better for automation, 
        // but usually 'bash' is safer for setting up the env.
        // However, the user request says "using js/ts build a service... to use this device as claude code server".
        // So we likely want to just drop them into the claude CLI.

        // Let's try running 'claude' immediately upon start.
        this.ptyProcess.write('claude\r');
    }

    public attach(ws: WebSocket) {
        this.ws = ws;
        // Send history so re-connected clients see previous output
        ws.send(JSON.stringify({ type: 'history', data: this.history }));

        ws.on('message', (message) => {
            try {
                const parsed = JSON.parse(message.toString());
                if (parsed.type === 'input') {
                    this.ptyProcess.write(parsed.data);
                } else if (parsed.type === 'resize') {
                    this.ptyProcess.resize(parsed.cols, parsed.rows);
                }
            } catch (e) {
                console.error('Failed to parse message', e);
            }
        });

        ws.on('close', () => {
            this.ws = null;
        });
    }

    public kill() {
        this.ptyProcess.kill();
    }
}
