/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';

/**
 * Pre-commit hook script optimized for speed and efficiency.
 * Exits early if no files are staged to avoid loading heavy dependencies.
 */
async function main() {
  try {
    // Check for staged files first (fast check)
    const stagedFiles = execSync('git diff --cached --name-only', {
      encoding: 'utf-8',
    }).trim();

    if (!stagedFiles) {
      // No files staged, nothing to do.
      return;
    }

    // Get repository root
    const root = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
    }).trim();

    // Dynamically import lint-staged only when needed
    const { default: lintStaged } = await import('lint-staged');

    // Run lint-staged
    const passed = await lintStaged({
      cwd: root,
      quiet: false, // Keep output for transparency during commit
      allowEmpty: true,
    });

    if (!passed) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Pre-commit hook failed:', err.message);
    process.exit(1);
  }
}

main();
