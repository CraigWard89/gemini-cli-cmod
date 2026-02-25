# Gemini CLI (Craig's Mod) Project Context

> **Note:** This is the project context for **Craig's Mod**, a modified version
> of the [official Gemini CLI](https://github.com/google-gemini/gemini-cli).

## 🔴 CRITICAL AGENT RULES

1.  **NO AUTOMATIC BUILDS/COMMITS**: Do **NOT** build or commit/push changes
    unless explicitly asked by the user.
2.  **AUTOMATIC COMMIT MESSAGES**: When asked to commit, you MUST generate a
    high-quality, descriptive commit message following the Conventional Commits
    standard. Do **NOT** ask the user for a commit message.
3.  **`gemini-cli` SIBLING IS READ-ONLY**: The adjacent `gemini-cli` directory
    is for **REFERENCE ONLY**. Never modify it. If accidental changes or commits
    occur, reset it to origin immediately.
4.  **FOUNDATIONAL CONTEXT**: Always refer to the root
    `E:\Super Agent\GEMINI.md` for workspace-wide mandates and project-specific
    architectures.

## Project Overview

- **Purpose:** Provide a seamless terminal interface for Gemini models,
  supporting code understanding, generation, automation, and integration via MCP
  (Model Context Protocol).
- **Branding:** Branded as **GEMINI CMOD**.
- **Auto-Update:** Disabled to prevent overwriting this mod.
- **Pathing:** "Ask Permission" flow for files outside the workspace.

## Tech Stack

- **Runtime:** Node.js (>=20.0.0)
- **Language:** TypeScript
- **UI Framework:** React (using Ink)
- **Testing:** Vitest
- **Bundling:** esbuild
- **Linting/Formatting:** ESLint (optimized/parallelized), Prettier

## Architecture

- `packages/cli`: User-facing terminal UI and input processing.
- `packages/core`: Backend logic, Gemini API orchestration, and tool execution.
- `packages/core/src/tools/`: Built-in tools (including custom `get_time`).
- `packages/a2a-server`: Experimental Agent-to-Agent server.

## Building and Running

- **Install Dependencies:** `npm install`
- **Build All:** `npm run build` (Optimized parallel build)
- **Bundle Project:** `npm run bundle`
- **Run in Development:** `npm run start`

## Testing and Quality

- **Unit Tests:** `npm run test`
- **Linting:** `npm run lint` (Optimized with caching and parallelism)
- **Type Checking:** `npm run typecheck` (Uses incremental project references)

## Development Conventions

- **Commit Messages:** Follow the Conventional Commits standard.
- **License Headers:** Include Apache-2.0 license header in all new source
  files.
- **Imports:** Use relative imports within packages; avoid restricted
  cross-package imports.
