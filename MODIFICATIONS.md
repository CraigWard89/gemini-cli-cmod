# Craig's Mod (cmod) Modifications

This document tracks the modifications made to this version of Gemini CLI,
distinguishing it from the
[official Google Gemini CLI](https://github.com/google-gemini/gemini-cli).

## Branding and Identity

- **ASCII Art Update**: Modified `packages/cli/src/ui/components/AsciiArt.ts` to
  display "GEMINI CMOD" instead of the standard "GEMINI" logo.
- **Header Watermark**: Added a `(cmod)` watermark to the `UserIdentity`
  component, displayed immediately after the user's subscription plan (tier) in
  the header.
- **Instructional Documentation**: Updated `README.md`, `GEMINI.md`,
  `ROADMAP.md`, `CONTRIBUTING.md`, and `docs/index.md` to identify the project
  as **Craig's Mod** and include notes regarding its status as a modified
  version.
- **Package Context**: Updated various `GEMINI.md` files within packages (e.g.,
  `packages/cli`, `packages/devtools`, `packages/a2a-server`) to reflect the
  mod's identity.

## Functional Changes

- **Disabled Auto-Update**: Modified `packages/cli/src/ui/utils/updateCheck.ts`
  to always return `null`. This prevents the CLI from notifying the user about
  official updates or attempting to overwrite this mod with the official
  production version.
- **Ask Permission for Workspace Exit**: Instead of blocking or silently
  allowing access to files outside the workspace, Craig's Mod implements a
  dynamic "ask permission" flow.
  - Reverted silent pathing restrictions in `packages/core/src/config/config.ts`
    and `packages/core/src/utils/workspaceContext.ts`.
  - Added centralized `isLeavingWorkspace` logic in `Config.ts` to identify tool
    calls targeting files outside the workspace.
  - Modified `packages/core/src/core/coreToolScheduler.ts` and
    `packages/core/src/confirmation-bus/message-bus.ts` to intercept `ALLOW`
    decisions. If a tool call is leaving the workspace, it is downgraded to
    `ASK_USER`, forcing a confirmation prompt even for "read-only" tools like
    `read_file`.
    - **Bulk File Operations & Parallelism**:
      - **`read_file`**: Enhanced to support an optional `files` array for
        reading multiple files in parallel.
      - **`write_file`**: Enhanced to support an optional `files` array for
        writing multiple files in parallel.
      - These improvements reduce the number of tool calls (turns) needed for
        multi-file operations, conserving context and tokens.
    - **Improved Terminal Capabilities**:
      - **`run_shell_command`**: Reworked on Windows to use `cmd.exe` by default
        instead of PowerShell. This provides a more traditional command-line
        environment.
      - **`run_powershell_command`**: Added a dedicated tool for executing
        PowerShell commands, allowing the agent to leverage advanced Windows
        scripting features explicitly.
    - **Robust & Optimized Build Process**:
      - Reworked `scripts/build.js` to run `tsc --build` once at the root level
        using TypeScript project references.
      - Optimized the build sequence to avoid redundant Node.js process spawns
        by internalizing `copy_files.js` logic into `build_package.js` and
        invoking it directly via imports in `build.js`.
      - Finalizes packages (asset copying, core-specific docs, etc.) in
        parallel.
      - This significantly reduces the total number of processes created during
        a full build, speeding up the process and improving reliability.
      - Added explicit error handling to ensure the build process halts
        immediately if any package fails, with detailed error reporting.
    - **Optimized Pre-commit Hook**:
      - Reworked `scripts/pre-commit.js` to exit early if no files are staged,
        avoiding heavy module loading.
      - Enabled caching for `eslint` and `prettier` within `lint-staged` to
        speed up incremental commits.
      - Optimized task ordering to ensure consistent formatting.
      - **Automatic Commit Messages**:
      - Updated project instructions (`GEMINI.md`) to mandate that the AI agent
        generate high-quality, Conventional Commits-compliant commit messages
        automatically without prompting the user.
    - **Added `get_time` Tool**: Added a new built-in tool that returns the
      local system's current time and date in multiple formats (Local, ISO,
      Full).
    - **Added `diff` Tool**: Added a new built-in tool for comparing two files
      or directories. It provides unified diff output for files and a comparison
      summary for directories (identifying added, removed, and modified files).

## Build & Reliability

- **UTF-8 BOM Enforcement**: Updated `StandardFileSystemService` to strictly
  strip the UTF-8 BOM when reading files and prevent its introduction when
  writing. This ensures consistent text processing across different operating
  systems.
- **Non-Interactive Build Infrastructure**:
  - Modified `scripts/build.js`, `scripts/build_sandbox.js`, and
    `scripts/build_vscode_companion.js` to operate in a fully non-interactive
    mode (setting `CI=true`, using `--yes`, `--no-audit`, and `--no-fund`).
  - Fixed workspace mapping in the build script to correctly handle packages
    with custom names (e.g., `@google/gemini-cli` and
    `gemini-cli-vscode-ide-companion`).
- **Dynamic Build-Time Versioning**:
  - Integrated `scripts/set-version.py` directly into the build process.
  - Added support for build modes:
    - `npm run build:dev` (Default): Skips versioning for faster iteration.
    - `npm run build:release`: Updates all `package.json` files and
      `package-lock.json` with a fresh development timestamp before building.
- **Improved Code Quality**: Fixed multiple TypeScript syntax and linting errors
  in core tools and services (e.g., `diff.ts`, `message-bus.ts`,
  `write-file.ts`) to ensure a clean build.

## Repository and Distribution

- **Independent Repository**: Forked/Re-initialized as a separate repository at
  `https://github.com/CraigWard89/gemini-cli-cmod`.
- **Global Installation**: Configured to install as the default `gemini` command
  on the local system.
