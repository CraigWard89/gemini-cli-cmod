/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MemoriesTool,
  setGeminiMdFilename,
  getCurrentGeminiMdFilename,
  getAllGeminiMdFilenames,
  DEFAULT_CONTEXT_FILENAME,
} from './memoryTool.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { GEMINI_DIR } from '../utils/paths.js';
import {
  createMockMessageBus,
  getMockMessageBusInstance,
} from '../test-utils/mock-message-bus.js';

// Mock dependencies
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    mkdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
  };
});

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  createWriteStream: vi.fn(() => ({
    on: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  })),
}));

vi.mock('os');

const MEMORY_SECTION_HEADER = '# Memories';

describe('MemoriesTool', () => {
  const mockAbortSignal = new AbortController().signal;

  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue(path.join('/mock', 'home'));
    vi.mocked(fs.mkdir).mockReset().mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockReset().mockResolvedValue('');
    vi.mocked(fs.writeFile).mockReset().mockResolvedValue(undefined);

    // Clear the static allowlist before every single test to prevent pollution.
    const tool = new MemoriesTool(createMockMessageBus());
    const invocation = tool.build({ action: 'save', fact: 'dummy' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (invocation.constructor as any).allowlist.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setGeminiMdFilename(DEFAULT_CONTEXT_FILENAME);
  });

  describe('setGeminiMdFilename', () => {
    it('should update currentGeminiMdFilename when a valid new name is provided', () => {
      const newName = 'CUSTOM_CONTEXT.md';
      setGeminiMdFilename(newName);
      expect(getCurrentGeminiMdFilename()).toBe(newName);
    });

    it('should handle an array of filenames', () => {
      const newNames = ['CUSTOM_CONTEXT.md', 'ANOTHER_CONTEXT.md'];
      setGeminiMdFilename(newNames);
      expect(getCurrentGeminiMdFilename()).toBe('CUSTOM_CONTEXT.md');
      expect(getAllGeminiMdFilenames()).toEqual(newNames);
    });
  });

  describe('execute', () => {
    let memoriesTool: MemoriesTool;

    beforeEach(() => {
      const bus = createMockMessageBus();
      getMockMessageBusInstance(bus).defaultToolDecision = 'ask_user';
      memoriesTool = new MemoriesTool(bus);
    });

    it('should have correct name and schema', () => {
      expect(memoriesTool.name).toBe('memories');
      expect(memoriesTool.displayName).toBe('Memories');
      expect(memoriesTool.schema.name).toBe('memories');

      const schema = memoriesTool.schema.parametersJsonSchema as {
        properties: { action: { enum: string[] } };
      };
      expect(schema.properties.action.enum).toContain('save');
    });

    it('should save a new memory with ID 1 in an empty file', async () => {
      const params = { action: 'save' as const, fact: 'the sky is blue' };
      const invocation = memoriesTool.build(params);
      const result = await invocation.execute(mockAbortSignal);

      const expectedFilePath = path.join(
        os.homedir(),
        GEMINI_DIR,
        'MEMORIES.md',
      );
      const expectedContent = `${MEMORY_SECTION_HEADER}\n\n- [ID: 1] the sky is blue\n`;

      expect(fs.writeFile).toHaveBeenCalledWith(
        expectedFilePath,
        expectedContent,
        'utf-8',
      );
      expect(result.returnDisplay).toBe(
        "Okay, I've saved that memory with ID 1.",
      );
    });

    it('should increment ID when saving to a file with existing memories', async () => {
      const existingContent = `${MEMORY_SECTION_HEADER}\n\n- [ID: 1] first fact\n- [ID: 5] fifth fact\n`;
      vi.mocked(fs.readFile).mockResolvedValue(existingContent);

      const params = { action: 'save' as const, fact: 'new fact' };
      const invocation = memoriesTool.build(params);
      const result = await invocation.execute(mockAbortSignal);

      const expectedContent = `${MEMORY_SECTION_HEADER}\n\n- [ID: 1] first fact\n- [ID: 5] fifth fact\n- [ID: 6] new fact\n`;
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expectedContent,
        'utf-8',
      );
      expect(result.returnDisplay).toBe(
        "Okay, I've saved that memory with ID 6.",
      );
    });

    it('should fetch a memory by ID', async () => {
      const existingContent = `${MEMORY_SECTION_HEADER}\n\n- [ID: 1] first fact\n- [ID: 2] second fact\n`;
      vi.mocked(fs.readFile).mockResolvedValue(existingContent);

      const params = { action: 'fetch' as const, id: '2' };
      const invocation = memoriesTool.build(params);
      const result = await invocation.execute(mockAbortSignal);

      expect(result.llmContent).toContain('"success":true');
      expect(result.llmContent).toContain('"fact":"second fact"');
      expect(result.returnDisplay).toBe('Memory [ID: 2]: second fact');
    });

    it('should delete a memory by ID', async () => {
      const existingContent = `${MEMORY_SECTION_HEADER}\n\n- [ID: 1] first fact\n- [ID: 2] second fact\n`;
      vi.mocked(fs.readFile).mockResolvedValue(existingContent);

      const params = { action: 'delete' as const, id: '1' };
      const invocation = memoriesTool.build(params);
      const result = await invocation.execute(mockAbortSignal);

      const expectedContent = `${MEMORY_SECTION_HEADER}\n\n- [ID: 2] second fact\n`;
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expectedContent,
        'utf-8',
      );
      expect(result.returnDisplay).toBe("Okay, I've deleted memory with ID 1.");
    });

    it('should update a memory by ID', async () => {
      const existingContent = `${MEMORY_SECTION_HEADER}\n\n- [ID: 1] first fact\n- [ID: 2] second fact\n`;
      vi.mocked(fs.readFile).mockResolvedValue(existingContent);

      const params = {
        action: 'update' as const,
        id: '2',
        fact: 'updated second fact',
      };
      const invocation = memoriesTool.build(params);
      const result = await invocation.execute(mockAbortSignal);

      const expectedContent = `${MEMORY_SECTION_HEADER}\n\n- [ID: 1] first fact\n- [ID: 2] updated second fact\n`;
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expectedContent,
        'utf-8',
      );
      expect(result.returnDisplay).toBe("Okay, I've updated memory with ID 2.");
    });

    it('should return error if fetching non-existent ID', async () => {
      const existingContent = `${MEMORY_SECTION_HEADER}\n\n- [ID: 1] first fact\n`;
      vi.mocked(fs.readFile).mockResolvedValue(existingContent);

      const params = { action: 'fetch' as const, id: '99' };
      const invocation = memoriesTool.build(params);
      const result = await invocation.execute(mockAbortSignal);

      expect(result.llmContent).toContain('"success":false');
      expect(result.returnDisplay).toBe('Memory with ID 99 not found.');
    });
  });

  describe('confirmation', () => {
    let memoriesTool: MemoriesTool;

    beforeEach(() => {
      memoriesTool = new MemoriesTool(createMockMessageBus());
    });

    it('should require confirmation for save but not for fetch', async () => {
      const saveInvocation = memoriesTool.build({
        action: 'save',
        fact: 'test',
      });
      const fetchInvocation = memoriesTool.build({ action: 'fetch', id: '1' });

      const saveConfirm =
        await saveInvocation.shouldConfirmExecute(mockAbortSignal);
      const fetchConfirm =
        await fetchInvocation.shouldConfirmExecute(mockAbortSignal);

      expect(saveConfirm).not.toBe(false);
      expect(fetchConfirm).toBe(false);
    });

    it('should show correct diff for deletion', async () => {
      const existingContent = `${MEMORY_SECTION_HEADER}\n\n- [ID: 1] fact to delete\n- [ID: 2] keep this\n`;
      vi.mocked(fs.readFile).mockResolvedValue(existingContent);

      const params = { action: 'delete' as const, id: '1' };
      const invocation = memoriesTool.build(params);
      const confirm = await invocation.shouldConfirmExecute(mockAbortSignal);

      expect(confirm).not.toBe(false);
      if (confirm && confirm.type === 'edit') {
        expect(confirm.fileDiff).toContain('- [ID: 1] fact to delete');
        expect(confirm.fileDiff).not.toContain('- [ID: 2] keep this');
      }
    });
  });
});
