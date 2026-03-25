# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Use **Bun** as the package manager (not npm or yarn).

```bash
bun install                             # Install frontend dependencies
bun run dev                             # Start Vite dev server (port 1420) — frontend only
bun run tauri dev                       # Start full Tauri app in development mode
bun run build                           # TypeScript check + Vite production build
bun run tauri build                     # Build production Tauri desktop app
```

Rust workspace lives in `src-tauri/`:
```bash
cd src-tauri && cargo check --workspace  # Type-check all Rust crates
cd src-tauri && cargo test --workspace   # Run all Rust tests
cd src-tauri && cargo build -p sprinter-daemon    # Build daemon binary
cd src-tauri && cargo build -p sprinter-simulate  # Build simulate binary
cd src-tauri && cargo run --bin sprinter-daemon    # Run daemon directly
```

TypeScript check:
```bash
bunx tsc --noEmit                       # Type-check frontend
```

## Architecture

Three-tier Tauri 2 desktop app: **React frontend** → **Tauri backend** (gRPC client) → **Daemon** (gRPC server).

### System Overview

```
React (shadcn/ui + Tailwind + Zustand)
  ↕ Tauri invoke() / listen()
Tauri Backend (Rust, gRPC client)
  ↕ gRPC over localhost
Daemon (sprinter-daemon, separate process, survives app close)
  → SQLite (~/.sprinter/commands.db)
  → Child processes (command execution)
```

### Cargo Workspace (`src-tauri/`)

| Crate | Type | Purpose |
|---|---|---|
| `sprinter-app` (root) | lib+bin | Tauri app — gRPC client, Tauri commands |
| `sprinter-proto` | lib | Generated protobuf types (tonic + prost) |
| `sprinter-common` | lib | Shared models, SQLite DB access |
| `sprinter-daemon` | bin | Headless gRPC server, command executor |
| `sprinter-simulate` | bin | Test binary that streams output for a configurable duration |

### gRPC Service

Defined in `src-tauri/proto/command_service.proto`. Key RPCs:
- `ExecuteCommand` — server-streaming (returns CommandEvent stream: Started → Output* → Completed/Failed)
- `KillCommand`, `GetCommand`, `ListCommands`, `StreamOutput`, `Ping`

`CommandSpec` uses protobuf `oneof` for extensibility — currently `ShellCommand`, designed for future typed command variants.

### Daemon Lifecycle

- Writes `~/.sprinter/daemon.pid` and `~/.sprinter/daemon.port` on startup
- Binds to `127.0.0.1:0` (OS-assigned port)
- Tauri app auto-starts daemon on first command if not running
- Spawned as detached process (`setsid`) — survives app close

### Frontend → Backend Flow

1. Frontend calls `invoke("execute_command", { spec })` via `src/lib/tauri.ts`
2. Tauri backend connects to daemon via gRPC, starts streaming
3. Tauri backend spawns background task, emits `"command-event"` Tauri events
4. Frontend `useEventListeners` hook processes events, updates Zustand store
5. Output batched via `requestAnimationFrame` for performance

### Frontend Stack

- **shadcn/ui + Tailwind CSS v4** — component library and styling
- **Zustand** — state management (commands map, output buffers, selection)
- **@tanstack/react-virtual** — virtualized terminal output
- **sonner** — toast notifications (command completion)

### Key Files

| File | Purpose |
|---|---|
| `src/App.tsx` | Root component, layout, event listener setup |
| `src/store.ts` | Zustand store (all app state) |
| `src/lib/tauri.ts` | Typed wrappers around Tauri invoke/listen |
| `src/hooks/useEventListeners.ts` | Subscribes to daemon events, updates store |
| `src/components/CommandOutput.tsx` | Virtualized terminal output renderer |
| `src-tauri/src/lib.rs` | Tauri commands (execute, kill, list, get, daemon_status) |
| `src-tauri/src/daemon_manager.rs` | Daemon start/connect/health-check |
| `src-tauri/src/grpc_client.rs` | JSON ↔ protobuf conversion types |
| `src-tauri/crates/sprinter-daemon/src/executor.rs` | Process spawning, output streaming |
| `src-tauri/crates/sprinter-daemon/src/server.rs` | gRPC service implementation |
| `src-tauri/crates/sprinter-common/src/db.rs` | SQLite schema and queries |
| `src-tauri/proto/command_service.proto` | gRPC service definition |

### Permissions

Tauri capabilities in `src-tauri/capabilities/default.json`. Includes `core:default`, `opener:default`, `core:event:default`.
