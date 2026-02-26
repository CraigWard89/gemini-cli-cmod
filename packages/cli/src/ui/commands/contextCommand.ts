/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { listMemoryFiles, refreshMemory } from '@google/gemini-cli-core';
import { MessageType } from '../types.js';
import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';

export const contextCommand: SlashCommand = {
  name: 'context',
  description:
    'Commands for interacting with instructional context (GEMINI.md files)',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [
    {
      name: 'refresh',
      altNames: ['reload'],
      description: 'Refresh the instructional context from source files',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: async (context) => {
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: 'Refreshing context from source files...',
          },
          Date.now(),
        );

        try {
          const config = context.services.config;
          if (config) {
            const result = await refreshMemory(config);

            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: result.content,
              },
              Date.now(),
            );
          }
        } catch (error) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
              text: `Error refreshing context: ${(error as Error).message}`,
            },
            Date.now(),
          );
        }
      },
    },
    {
      name: 'list',
      description: 'Lists the paths of the instructional context files in use',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: async (context) => {
        const config = context.services.config;
        if (!config) return;
        const result = listMemoryFiles(config);

        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: result.content,
          },
          Date.now(),
        );
      },
    },
  ],
};
