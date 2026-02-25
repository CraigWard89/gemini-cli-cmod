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

import { execSync } from 'node:child_process';
import { writeFileSync, existsSync, cpSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyPackageAssets } from './copy_files.js';

/**
 * Main build logic for a package.
 * @param {Object} options
 * @param {boolean} options.skipTsc Whether to skip the TypeScript build step.
 * @param {string} options.cwd The current working directory (package root).
 */
export async function buildPackage({
  skipTsc = false,
  cwd = process.cwd(),
} = {}) {
  if (!cwd.includes('packages')) {
    console.error(
      'must be invoked from a package directory or with correct cwd',
    );
    return false;
  }

  const packageName = basename(cwd);

  // build typescript files
  if (!skipTsc) {
    execSync('tsc --build', { stdio: 'inherit', cwd });
  }

  // copy .{md,json} files
  copyPackageAssets(cwd);

  // Copy documentation for the core package
  if (packageName === 'core') {
    const docsSource = join(cwd, '..', '..', 'docs');
    const docsTarget = join(cwd, 'dist', 'docs');
    if (existsSync(docsSource)) {
      cpSync(docsSource, docsTarget, { recursive: true, dereference: true });
      console.log('Copied documentation to dist/docs');
    }
  }

  // touch dist/.last_build
  const distDir = join(cwd, 'dist');
  if (!existsSync(distDir)) {
    execSync('mkdir dist', { cwd });
  }
  writeFileSync(join(distDir, '.last_build'), '');
  return true;
}

// Run if called directly
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const skipTsc = process.argv.includes('--skip-tsc');
  buildPackage({ skipTsc })
    .then((success) => {
      if (!success) process.exit(1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
