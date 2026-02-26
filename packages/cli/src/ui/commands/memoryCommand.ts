/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  addMemory,
  deleteMemory,
  editMemory,
  showMemory,
} from '@google/gemini-cli-core';
import { MessageType } from '../types.js';
import type { SlashCommand, SlashCommandActionReturn } from './types.js';
import { CommandKind } from './types.js';

export const memoryCommand: SlashCommand = {
  name: 'memory',
  description: 'Commands for interacting with memory',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [
    {
      name: 'show',
      description: 'Show the current stored memories (facts)',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: async (context) => {
        const config = context.services.config;
        if (!config) return;
        const result = showMemory(config);

        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: result.content,
          },
          Date.now(),
        );
      },
    },
    {
      name: 'add',
      description: 'Add content to the memory',
      kind: CommandKind.BUILT_IN,
      autoExecute: false,
      action: (context, args): SlashCommandActionReturn | void => {
        const result = addMemory(args);

        if (result.type === 'message') {
          return result;
        }

        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: `Attempting to save to memory: "${args.trim()}"`,
          },
          Date.now(),
        );

        return result;
      },
    },
    {
      name: 'edit',
      description: 'Update content in the memory by ID',
      kind: CommandKind.BUILT_IN,
      autoExecute: false,
      action: (context, args): SlashCommandActionReturn | void => {
        const result = editMemory(args);

        if (result.type === 'message') {
          return result;
        }

        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: `Attempting to update memory: "${args.trim()}"`,
          },
          Date.now(),
        );

        return result;
      },
    },
    {
      name: 'delete',
      altNames: ['remove', 'rm'],
      description: 'Delete a memory by ID',
      kind: CommandKind.BUILT_IN,
      autoExecute: false,
      action: (context, args): SlashCommandActionReturn | void => {
        const result = deleteMemory(args);

        if (result.type === 'message') {
          return result;
        }

        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: `Attempting to delete memory with ID: "${args.trim()}"`,
          },
          Date.now(),
        );

        return result;
      },
    },
  ],
};
