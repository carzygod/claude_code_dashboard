import { ClaudeSession } from './session';

export class SessionManager {
  private sessions: Map<string, ClaudeSession> = new Map();
  private sessionMetadata: Map<string, { startTime: number }> = new Map();

  createSession(id: string): ClaudeSession {
    if (this.sessions.has(id)) {
      return this.sessions.get(id)!;
    }
    const session = new ClaudeSession(id);
    this.sessions.set(id, session);
    this.sessionMetadata.set(id, { startTime: Date.now() });
    
    session.on('exit', () => {
      this.sessions.delete(id);
      this.sessionMetadata.delete(id);
    });

    return session;
  }

  getSession(id: string): ClaudeSession | undefined {
    return this.sessions.get(id);
  }

  getAllSessions(): { id: string; startTime: number }[] {
    return Array.from(this.sessions.keys()).map((id) => ({
      id,
      startTime: this.sessionMetadata.get(id)?.startTime || 0,
    }));
  }

  removeSession(id: string) {
    const session = this.sessions.get(id);
    if (session) {
      session.kill();
      this.sessions.delete(id);
      this.sessionMetadata.delete(id);
    }
  }
}

export const sessionManager = new SessionManager();
