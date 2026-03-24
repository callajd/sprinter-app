# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Use **Bun** as the package manager (not npm or yarn).

```bash
bun install           # Install dependencies
bun run dev           # Start Vite dev server (port 1420) — frontend only, no Tauri
bun run tauri dev     # Start full Tauri app in development mode
bun run build         # TypeScript check + Vite production build
bun run tauri build   # Build production Tauri desktop app
```

For Rust/Tauri backend only:
```bash
cd src-tauri && cargo check   # Type-check Rust code
cd src-tauri && cargo test    # Run Rust tests
```

## Architecture

**Tauri 2 desktop app** — React frontend + Rust backend communicating via IPC.

### Frontend → Backend IPC
React calls Rust functions using `invoke` from `@tauri-apps/api/core`:
```ts
import { invoke } from "@tauri-apps/api/core";
const result = await invoke("command_name", { arg: value });
```

### Backend: Rust Commands
Rust commands live in `src-tauri/src/lib.rs`. Each must be:
1. Annotated with `#[tauri::command]`
2. Registered in the `.invoke_handler(tauri::generate_handler![...])` call in `lib.rs`

### Permissions
Tauri capabilities (which APIs the frontend can access) are configured in `src-tauri/capabilities/default.json`. When adding new Tauri plugins or APIs, add the corresponding permission there.

### Key files
- `src/App.tsx` — main React component
- `src-tauri/src/lib.rs` — all Rust command handlers and Tauri builder setup
- `src-tauri/tauri.conf.json` — app name, window size, bundle config
- `src-tauri/capabilities/default.json` — frontend permission grants
