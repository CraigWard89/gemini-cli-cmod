/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { execSync, exec } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Ensure non-interactive environment for tools that check it
process.env.CI = 'true';

// npm install if node_modules was removed (e.g. via npm run clean or scripts/clean.js)
if (!existsSync(join(root, 'node_modules'))) {
  execSync('npm install --no-audit --no-fund --yes', {
    stdio: 'inherit',
    cwd: root,
  });
}

async function build() {
  console.log('Building all workspaces/packages...');

  // Step 0: Update version to latest dev timestamp
  console.log('Updating version...');
  try {
    // Try python then python3
    try {
      execSync('python scripts/set-version.py dev', {
        stdio: 'inherit',
        cwd: root,
      });
    } catch {
      execSync('python3 scripts/set-version.py dev', {
        stdio: 'inherit',
        cwd: root,
      });
    }
  } catch (_err) {
    console.warn('Failed to update version, continuing with current version.');
  }

  // Step 1: Generate commit info
  try {
    execSync('npm run generate', { stdio: 'inherit', cwd: root });
  } catch (_err) {
    console.error('Failed to generate commit info.');
    process.exit(1);
  }

  // Step 2: Build core first as others depend on it
  console.log('Building @google/gemini-cli-core...');
  try {
    execSync('npm run build --workspace @google/gemini-cli-core', {
      stdio: 'inherit',
      cwd: root,
    });
  } catch (_err) {
    console.error('Failed to build @google/gemini-cli-core.');
    process.exit(1);
  }

  // Step 3: Build all other workspaces in parallel
  const packagesDir = join(root, 'packages');
  const packages = readdirSync(packagesDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() && dirent.name !== 'core')
    .map((dirent) => dirent.name);

  console.log(`Building other packages in parallel: ${packages.join(', ')}`);

  const buildTasks = packages.map((pkg) => {
    let workspaceName = `@google/gemini-cli-${pkg}`;
    if (pkg === 'cli') {
      workspaceName = '@google/gemini-cli';
    } else if (pkg === 'vscode-ide-companion') {
      workspaceName = 'gemini-cli-vscode-ide-companion';
    }

    return execAsync(
      `npm run build --workspace ${workspaceName} --if-present`,
      {
        cwd: root,
      },
    )
      .then(() => console.log(`Successfully built ${pkg}`))
      .catch((err) => {
        console.error(`\nERROR: Failed to build package: ${pkg}`);
        console.error(`Command: npm run build --workspace ${workspaceName}`);
        console.error('Error Details:', err.stderr || err.message);
        throw new Error(`Build failed for ${pkg}`);
      });
  });

  try {
    await Promise.all(buildTasks);
  } catch (_err) {
    console.error('\nBuild process aborted due to package build failure.');
    process.exit(1);
  }

  // also build container image if sandboxing is enabled
  try {
    execSync('node scripts/sandbox_command.js -q', {
      stdio: 'inherit',
      cwd: root,
    });
    if (
      process.env.BUILD_SANDBOX === '1' ||
      process.env.BUILD_SANDBOX === 'true'
    ) {
      execSync('node scripts/build_sandbox.js -s', {
        stdio: 'inherit',
        cwd: root,
      });
    }
  } catch (_err) {
    console.warn(
      'Sandbox/Container build failed, but continuing as this is optional.',
    );
  }
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
