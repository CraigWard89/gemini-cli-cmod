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

## Repository and Distribution

- **Independent Repository**: Forked/Re-initialized as a separate repository at
  `https://github.com/CraigWard89/gemini-cli-cmod`.
- **Global Installation**: Configured to install as the default `gemini` command
  on the local system.
