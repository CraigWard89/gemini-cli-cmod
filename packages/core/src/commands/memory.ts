/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { flattenMemory } from '../config/memory.js';
import { refreshServerHierarchicalMemory } from '../utils/memoryDiscovery.js';
import type { MessageActionReturn, ToolActionReturn } from './types.js';

import { DEFAULT_CONTEXT_FILENAME } from '../tools/memoryTool.js';

export function showMemory(config: Config): MessageActionReturn {
  const memoryContent = flattenMemory(config.getUserMemory());
  const fileCount = config.getGeminiMdFileCount() || 0;
  let content: string;

  if (memoryContent.length > 0) {
    content = `Current memory content from ${fileCount} file(s) (${DEFAULT_CONTEXT_FILENAME}):\n\n---\n${memoryContent}\n---`;
  } else {
    content = 'Memory is currently empty.';
  }

  return {
    type: 'message',
    messageType: 'info',
    content,
  };
}

export function addMemory(
  args?: string,
): MessageActionReturn | ToolActionReturn {
  if (!args || args.trim() === '') {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Usage: /memory add <text to remember>',
    };
  }
  return {
    type: 'tool',
    toolName: 'memories',
    toolArgs: { action: 'save', fact: args.trim() },
  };
}

export function editMemory(
  args?: string,
): MessageActionReturn | ToolActionReturn {
  const match = args?.trim().match(/^(\d+)\s+(.*)$/);
  if (!match) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Usage: /memory edit <id> <new text>',
    };
  }
  return {
    type: 'tool',
    toolName: 'memories',
    toolArgs: { action: 'update', id: match[1], fact: match[2].trim() },
  };
}

export function deleteMemory(
  args?: string,
): MessageActionReturn | ToolActionReturn {
  const id = args?.trim();
  if (!id || !/^\d+$/.test(id)) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Usage: /memory delete <id>',
    };
  }
  return {
    type: 'tool',
    toolName: 'memories',
    toolArgs: { action: 'delete', id },
  };
}

export async function refreshMemory(
  config: Config,
): Promise<MessageActionReturn> {
  let memoryContent = '';
  let fileCount = 0;

  if (config.isJitContextEnabled()) {
    await config.getContextManager()?.refresh();
    memoryContent = flattenMemory(config.getUserMemory());
    fileCount = config.getGeminiMdFileCount();
  } else {
    const result = await refreshServerHierarchicalMemory(config);
    memoryContent = flattenMemory(result.memoryContent);
    fileCount = result.fileCount;
  }

  config.updateSystemInstructionIfInitialized();
  let content: string;

  if (memoryContent.length > 0) {
    content = `Memory refreshed successfully. Loaded ${memoryContent.length} characters from ${fileCount} file(s).`;
  } else {
    content = 'Memory refreshed successfully. No memory content found.';
  }

  return {
    type: 'message',
    messageType: 'info',
    content,
  };
}

export function listMemoryFiles(config: Config): MessageActionReturn {
  const filePaths = config.getGeminiMdFilePaths() || [];
  const fileCount = filePaths.length;
  let content: string;

  if (fileCount > 0) {
    content = `There are ${fileCount} ${DEFAULT_CONTEXT_FILENAME} file(s) in use:\n\n${filePaths.join(
      '\n',
    )}`;
  } else {
    content = `No ${DEFAULT_CONTEXT_FILENAME} files in use.`;
  }

  return {
    type: 'message',
    messageType: 'info',
    content,
  };
}
