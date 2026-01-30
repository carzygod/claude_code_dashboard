# Claude Code Server

This project exposes the `claude` CLI as a service accessible via WebSockets, featuring a premium web dashboard for managing multiple "vibe coding" sessions.

## Features

- **Multi-Session**: Run multiple independent Claude CLI instances simultaneously.
- **Web Dashboard**: A beautiful, dark-themed UI to create, switch, and manage sessions.
- **Persistent History**: Connect to any active session and see the full history.
- **Dockerized**: Easy deployment with a single Docker command.

## Installation & Usage

1.  **Build the Docker Image**:
    ```bash
    docker build -t claude-code-server .
    ```

2.  **Run the Container**:
    
    Mount your workspace directory to `/workspace` inside the container.
    
    ```bash
    mkdir -p $(pwd)/workspace
    docker run -d \
      -p 4000:4000 \
      -v $(pwd)/workspace:/workspace \
      --name claude-server \
      claude-code-server
    ```

3.  **Access the Dashboard**:
    Open `http://localhost:4000` in your browser.

    - **New Session**: Click the button in the sidebar.
    - **Switch**: Click any session in the list to switch context.
    - **Terminate**: Use the "Terminate" button to kill a session.

## API Endpoints

- `GET /api/sessions`: List all active sessions.
- `POST /api/sessions`: Create a new session.
- `DELETE /api/sessions/:id`: Terminate a session.
- `WS /?sessionId={id}`: Connect to a session via WebSocket.

## Notes

- The server runs `claude` immediately upon session start.
- Workspaces are mapped to `/workspace` inside the container.
