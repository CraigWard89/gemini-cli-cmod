/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolEditConfirmationDetails, ToolResult } from './tools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolConfirmationOutcome,
} from './tools.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Storage } from '../config/storage.js';
import * as Diff from 'diff';
import { DEFAULT_DIFF_OPTIONS } from './diffOptions.js';
import { tildeifyPath } from '../utils/paths.js';
import type {
  ModifiableDeclarativeTool,
  ModifyContext,
} from './modifiable-tool.js';
import { ToolErrorType } from './tool-error.js';
import { MEMORY_TOOL_NAME } from './tool-names.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { MEMORY_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';

export const DEFAULT_CONTEXT_FILENAME = 'MEMORIES.md';
export const MEMORY_SECTION_HEADER = '# Memories';

// This variable will hold the currently configured filename for memory context files.
// It defaults to DEFAULT_CONTEXT_FILENAME but can be overridden.
let currentGeminiMdFilename: string | string[] = DEFAULT_CONTEXT_FILENAME;

export function setGeminiMdFilename(newFilename: string | string[]): void {
  if (Array.isArray(newFilename)) {
    if (newFilename.length > 0) {
      currentGeminiMdFilename = newFilename.map((name) => name.trim());
    }
  } else if (newFilename && newFilename.trim() !== '') {
    currentGeminiMdFilename = newFilename.trim();
  }
}

export function getCurrentGeminiMdFilename(): string {
  if (Array.isArray(currentGeminiMdFilename)) {
    return currentGeminiMdFilename[0];
  }
  return currentGeminiMdFilename;
}

export function getAllGeminiMdFilenames(): string[] {
  const filenames = new Set<string>(['GEMINI.md', 'MEMORIES.md']);
  if (Array.isArray(currentGeminiMdFilename)) {
    currentGeminiMdFilename.forEach((f) => filenames.add(f));
  } else {
    filenames.add(currentGeminiMdFilename);
  }
  return Array.from(filenames);
}

interface MemoriesParams {
  action: 'save' | 'delete' | 'fetch' | 'update';
  fact?: string;
  id?: string;
  modified_by_user?: boolean;
  modified_content?: string;
}

export function getGlobalMemoryFilePath(): string {
  return path.join(Storage.getGlobalGeminiDir(), getCurrentGeminiMdFilename());
}

/**
 * Reads the current content of the memory file
 */
async function readMemoryFileContent(): Promise<string> {
  try {
    return await fs.readFile(getGlobalMemoryFilePath(), 'utf-8');
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const error = err as Error & { code?: string };
    if (!(error instanceof Error) || error.code !== 'ENOENT') throw err;
    return '';
  }
}

/**
 * Parses the memories from the file content
 */
function parseMemories(content: string): Array<{ id: number; fact: string }> {
  const memories: Array<{ id: number; fact: string }> = [];
  const lines = content.split('\n');
  const memoryRegex = /^-\s*\[ID:\s*(\d+)\]\s*(.*)$/;

  for (const line of lines) {
    const match = line.trim().match(memoryRegex);
    if (match) {
      memories.push({
        id: parseInt(match[1], 10),
        fact: match[2].trim(),
      });
    }
  }
  return memories;
}

/**
 * Formats memories back into file content
 */
function formatMemories(memories: Array<{ id: number; fact: string }>): string {
  let content = `${MEMORY_SECTION_HEADER}\n\n`;
  for (const memory of memories) {
    content += `- [ID: ${memory.id}] ${memory.fact}\n`;
  }
  return content;
}

class MemoriesToolInvocation extends BaseToolInvocation<
  MemoriesParams,
  ToolResult
> {
  private static readonly allowlist: Set<string> = new Set();
  private proposedNewContent: string | undefined;

  constructor(
    params: MemoriesParams,
    messageBus: MessageBus,
    toolName?: string,
    displayName?: string,
  ) {
    super(params, messageBus, toolName, displayName);
  }

  getDescription(): string {
    const memoryFilePath = getGlobalMemoryFilePath();
    return `${this.params.action} in ${tildeifyPath(memoryFilePath)}`;
  }

  protected override async getConfirmationDetails(
    _abortSignal: AbortSignal,
  ): Promise<ToolEditConfirmationDetails | false> {
    if (this.params.action === 'fetch') {
      return false;
    }

    const memoryFilePath = getGlobalMemoryFilePath();
    const allowlistKey = `${this.params.action}:${memoryFilePath}`;

    if (MemoriesToolInvocation.allowlist.has(allowlistKey)) {
      return false;
    }

    const currentContent = await readMemoryFileContent();
    const memories = parseMemories(currentContent);

    if (this.params.action === 'save' && this.params.fact) {
      const nextId =
        memories.length > 0 ? Math.max(...memories.map((m) => m.id)) + 1 : 1;
      const updatedMemories = [
        ...memories,
        { id: nextId, fact: this.params.fact.replace(/[\r\n]/g, ' ').trim() },
      ];
      this.proposedNewContent = formatMemories(updatedMemories);
    } else if (this.params.action === 'delete' && this.params.id) {
      const targetId = parseInt(this.params.id, 10);
      const updatedMemories = memories.filter((m) => m.id !== targetId);
      this.proposedNewContent = formatMemories(updatedMemories);
    } else if (
      this.params.action === 'update' &&
      this.params.id &&
      this.params.fact
    ) {
      const targetId = parseInt(this.params.id, 10);
      const updatedMemories = memories.map((m) =>
        m.id === targetId
          ? { ...m, fact: this.params.fact!.replace(/[\r\n]/g, ' ').trim() }
          : m,
      );
      this.proposedNewContent = formatMemories(updatedMemories);
    } else {
      return false;
    }

    const fileName = path.basename(memoryFilePath);
    const fileDiff = Diff.createPatch(
      fileName,
      currentContent,
      this.proposedNewContent,
      'Current',
      'Proposed',
      DEFAULT_DIFF_OPTIONS,
    );

    const confirmationDetails: ToolEditConfirmationDetails = {
      type: 'edit',
      title: `Confirm Memory ${this.params.action.toUpperCase()}: ${tildeifyPath(memoryFilePath)}`,
      fileName: memoryFilePath,
      filePath: memoryFilePath,
      fileDiff,
      originalContent: currentContent,
      newContent: this.proposedNewContent,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          MemoriesToolInvocation.allowlist.add(allowlistKey);
        }
      },
    };
    return confirmationDetails;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const { action, fact, id, modified_by_user, modified_content } =
      this.params;

    try {
      const currentContent = await readMemoryFileContent();
      const memories = parseMemories(currentContent);

      if (action === 'fetch') {
        if (!id)
          throw new Error('Parameter "id" is required for "fetch" action.');
        const memory = memories.find((m) => m.id === parseInt(id, 10));
        if (!memory) {
          return {
            llmContent: JSON.stringify({
              success: false,
              error: `Memory with ID ${id} not found.`,
            }),
            returnDisplay: `Memory with ID ${id} not found.`,
          };
        }
        return {
          llmContent: JSON.stringify({ success: true, memory }),
          returnDisplay: `Memory [ID: ${memory.id}]: ${memory.fact}`,
        };
      }

      let contentToWrite: string;
      let successMessage: string;

      if (modified_by_user && modified_content !== undefined) {
        contentToWrite = modified_content;
        successMessage = `Okay, I've updated the memories with your modifications.`;
      } else {
        if (this.proposedNewContent === undefined) {
          if (action === 'save' && fact) {
            const nextId =
              memories.length > 0
                ? Math.max(...memories.map((m) => m.id)) + 1
                : 1;
            const updatedMemories = [
              ...memories,
              { id: nextId, fact: fact.replace(/[\r\n]/g, ' ').trim() },
            ];
            this.proposedNewContent = formatMemories(updatedMemories);
            successMessage = `Okay, I've saved that memory with ID ${nextId}.`;
          } else if (action === 'delete' && id) {
            const targetId = parseInt(id, 10);
            const updatedMemories = memories.filter((m) => m.id !== targetId);
            this.proposedNewContent = formatMemories(updatedMemories);
            successMessage = `Okay, I've deleted memory with ID ${id}.`;
          } else if (action === 'update' && id && fact) {
            const targetId = parseInt(id, 10);
            if (!memories.some((m) => m.id === targetId)) {
              throw new Error(`Memory with ID ${id} not found.`);
            }
            const updatedMemories = memories.map((m) =>
              m.id === targetId
                ? { ...m, fact: fact.replace(/[\r\n]/g, ' ').trim() }
                : m,
            );
            this.proposedNewContent = formatMemories(updatedMemories);
            successMessage = `Okay, I've updated memory with ID ${id}.`;
          } else {
            throw new Error(
              `Invalid action or missing parameters for ${action}.`,
            );
          }
        } else {
          successMessage = `Memory ${action} successful.`;
        }
        contentToWrite = this.proposedNewContent;
      }

      await fs.mkdir(path.dirname(getGlobalMemoryFilePath()), {
        recursive: true,
      });
      await fs.writeFile(getGlobalMemoryFilePath(), contentToWrite, 'utf-8');

      return {
        llmContent: JSON.stringify({ success: true, message: successMessage }),
        returnDisplay: successMessage,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: JSON.stringify({
          success: false,
          error: `Failed to manage memories. Detail: ${errorMessage}`,
        }),
        returnDisplay: `Error managing memories: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.MEMORY_TOOL_EXECUTION_ERROR,
        },
      };
    }
  }
}

export class MemoriesTool
  extends BaseDeclarativeTool<MemoriesParams, ToolResult>
  implements ModifiableDeclarativeTool<MemoriesParams>
{
  static readonly Name = MEMORY_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      MemoriesTool.Name,
      'Memories',
      MEMORY_DEFINITION.base.description!,
      Kind.Think,
      MEMORY_DEFINITION.base.parametersJsonSchema,
      messageBus,
      true,
      false,
    );
  }

  protected override validateToolParamValues(
    params: MemoriesParams,
  ): string | null {
    if (
      (params.action === 'save' || params.action === 'update') &&
      (!params.fact || params.fact.trim() === '')
    ) {
      return `Parameter "fact" must be a non-empty string for "${params.action}" action.`;
    }
    if (
      (params.action === 'delete' ||
        params.action === 'fetch' ||
        params.action === 'update') &&
      !params.id
    ) {
      return `Parameter "id" is required for "${params.action}" actions.`;
    }

    return null;
  }

  protected createInvocation(
    params: MemoriesParams,
    messageBus: MessageBus,
    toolName?: string,
    displayName?: string,
  ) {
    return new MemoriesToolInvocation(
      params,
      messageBus,
      toolName ?? this.name,
      displayName ?? this.displayName,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(MEMORY_DEFINITION, modelId);
  }

  getModifyContext(_abortSignal: AbortSignal): ModifyContext<MemoriesParams> {
    return {
      getFilePath: (_params: MemoriesParams) => getGlobalMemoryFilePath(),
      getCurrentContent: async (_params: MemoriesParams): Promise<string> =>
        readMemoryFileContent(),
      getProposedContent: async (params: MemoriesParams): Promise<string> => {
        const currentContent = await readMemoryFileContent();
        const memories = parseMemories(currentContent);
        if (params.action === 'save' && params.fact) {
          const nextId =
            memories.length > 0
              ? Math.max(...memories.map((m) => m.id)) + 1
              : 1;
          const updatedMemories = [
            ...memories,
            { id: nextId, fact: params.fact.replace(/[\r\n]/g, ' ').trim() },
          ];
          return formatMemories(updatedMemories);
        } else if (params.action === 'delete' && params.id) {
          const targetId = parseInt(params.id, 10);
          const updatedMemories = memories.filter((m) => m.id !== targetId);
          return formatMemories(updatedMemories);
        } else if (params.action === 'update' && params.id && params.fact) {
          const targetId = parseInt(params.id, 10);
          const updatedMemories = memories.map((m) =>
            m.id === targetId
              ? { ...m, fact: params.fact!.replace(/[\r\n]/g, ' ').trim() }
              : m,
          );
          return formatMemories(updatedMemories);
        }
        return currentContent;
      },
      createUpdatedParams: (
        _oldContent: string,
        modifiedProposedContent: string,
        originalParams: MemoriesParams,
      ): MemoriesParams => ({
        ...originalParams,
        modified_by_user: true,
        modified_content: modifiedProposedContent,
      }),
    };
  }
}
