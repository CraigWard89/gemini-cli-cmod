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

// npm install if node_modules was removed (e.g. via npm run clean or scripts/clean.js)
if (!existsSync(join(root, 'node_modules'))) {
  execSync('npm install', { stdio: 'inherit', cwd: root });
}

async function build() {
  console.log('Building all workspaces/packages...');

  // Step 1: Generate commit info
  execSync('npm run generate', { stdio: 'inherit', cwd: root });

  // Step 2: Build core first as others depend on it
  console.log('Building @google/gemini-cli-core...');
  execSync('npm run build --workspace @google/gemini-cli-core', {
    stdio: 'inherit',
    cwd: root,
  });

  // Step 3: Build all other workspaces in parallel
  const packagesDir = join(root, 'packages');
  const packages = readdirSync(packagesDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() && dirent.name !== 'core')
    .map((dirent) => dirent.name);

  console.log(`Building other packages in parallel: ${packages.join(', ')}`);

  const buildTasks = packages.map((pkg) => {
    return execAsync(
      `npm run build --workspace @google/gemini-cli-${pkg} --if-present`,
      { cwd: root },
    )
      .then(() => console.log(`Successfully built ${pkg}`))
      .catch((err) => {
        console.error(`Failed to build ${pkg}:`, err.stderr || err.message);
        throw err;
      });
  });

  await Promise.all(buildTasks);

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
  } catch {
    // ignore
  }
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
