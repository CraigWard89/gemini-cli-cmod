# Craig's Mod (cmod) Modifications

This document tracks the modifications made to this version of Gemini CLI,
distinguishing it from the
[official Google Gemini CLI](https://github.com/google-gemini/gemini-cli).

## Branding and Identity

- **ASCII Art Update**: Modified `packages/cli/src/ui/components/AsciiArt.ts` to
  display "GEMINI CMOD" instead of the standard "GEMINI" logo.
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
  - Modified `packages/core/src/confirmation-bus/message-bus.ts` to intercept
    tool calls. If a tool (like `read_file`, `shell`, `ls`) attempts to access a
    path outside the defined workspace, the decision is downgraded to
    `ASK_USER`, triggering a confirmation dialog in the UI.
- **Added `get_time` Tool**: Added a new built-in tool that returns the local
  system's current time and date in multiple formats (Local, ISO, Full).

## Repository and Distribution

- **Independent Repository**: Forked/Re-initialized as a separate repository at
  `https://github.com/CraigWard89/gemini-cli-cmod`.
- **Global Installation**: Configured to install as the default `gemini` command
  on the local system.
