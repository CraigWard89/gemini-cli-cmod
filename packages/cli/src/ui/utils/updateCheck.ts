/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/*
import latestVersion from 'latest-version';
import semver from 'semver';
import { getPackageJson, debugLogger } from '@google/gemini-cli-core';
*/
import type { LoadedSettings } from '../../config/settings.js';
/*
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
*/

export const FETCH_TIMEOUT_MS = 2000;

// Replicating the bits of UpdateInfo we need from update-notifier
export interface UpdateInfo {
  latest: string;
  current: string;
  name: string;
  type?: string; // semver.ReleaseType;
}

export interface UpdateObject {
  message: string;
  update: UpdateInfo;
}

/**
 * From a nightly and stable version, determines which is the "best" one to offer.
 * The rule is to always prefer nightly if the base versions are the same.
 */
/*
function getBestAvailableUpdate(
  nightly?: string,
  stable?: string,
): string | null {
  if (!nightly) return stable || null;
  if (!stable) return nightly || null;

  if (semver.coerce(stable)?.version === semver.coerce(nightly)?.version) {
    return nightly;
  }

  return semver.gt(stable, nightly) ? stable : nightly;
}
*/

export async function checkForUpdates(
  _settings: LoadedSettings,
): Promise<UpdateObject | null> {
  // Update check is disabled in Craig's Mod to prevent accidentally updating to the official version.
  return null;
}
