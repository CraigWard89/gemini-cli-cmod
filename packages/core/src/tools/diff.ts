/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { ToolInvocation, ToolLocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { DIFF_TOOL_NAME } from './tool-names.js';
import { DIFF_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';
import type { Config } from '../config/config.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as diff from 'diff';
import { fdir } from 'fdir';

/**
 * Parameters for the Diff tool
 */
export interface DiffToolParams {
  path1: string;
  path2: string;
  recursive?: boolean;
}

class DiffToolInvocation extends BaseToolInvocation<
  DiffToolParams,
  ToolResult
> {
  private readonly resolvedPath1: string;
  private readonly resolvedPath2: string;

  constructor(
    private config: Config,
    params: DiffToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
    this.resolvedPath1 = path.resolve(
      this.config.getTargetDir(),
      this.params.path1,
    );
    this.resolvedPath2 = path.resolve(
      this.config.getTargetDir(),
      this.params.path2,
    );
  }

  getDescription(): string {
    return `Comparing ${this.params.path1} and ${this.params.path2}`;
  }

  override toolLocations(): ToolLocation[] {
    return [{ path: this.resolvedPath1 }, { path: this.resolvedPath2 }];
  }

  async execute(): Promise<ToolResult> {
    try {
      const stats1 = await fs.stat(this.resolvedPath1);
      const stats2 = await fs.stat(this.resolvedPath2);

      if (stats1.isDirectory() && stats2.isDirectory()) {
        return await this.diffDirectories();
      } else if (stats1.isFile() && stats2.isFile()) {
        return await this.diffFiles();
      } else {
        return {
          llmContent: 'Error: Cannot compare a file with a directory.',
          returnDisplay: 'Diff Error: Type mismatch',
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Diff Error: ${errorMessage}`,
      };
    }
  }

  private async diffFiles(): Promise<ToolResult> {
    const content1 = await fs.readFile(this.resolvedPath1, 'utf8');
    const content2 = await fs.readFile(this.resolvedPath2, 'utf8');

    const patch = diff.createTwoFilesPatch(
      this.params.path1,
      this.params.path2,
      content1,
      content2,
    );

    if (content1 === content2) {
      return {
        llmContent: 'Files are identical.',
        returnDisplay: 'Files are identical.',
      };
    }

    return {
      llmContent: patch,
      returnDisplay: `Diff produced for ${this.params.path1} vs ${this.params.path2}`,
    };
  }

  private async diffDirectories(): Promise<ToolResult> {
    const recursive = this.params.recursive !== false;

    const getFiles = async (dir: string): Promise<string[]> => {
      if (!recursive) {
        // fdir doesn't have a simple "non-recursive" mode that just returns names in root easily with relative paths
        const entries = await fs.readdir(dir, { withFileTypes: true });
        return entries.filter((e) => e.isFile()).map((e) => e.name);
      }
      return (await new fdir()
        .withRelativePaths()
        .crawl(dir)
        .withPromise()) as string[];
    };

    const files1 = new Set(await getFiles(this.resolvedPath1));
    const files2 = new Set(await getFiles(this.resolvedPath2));

    const onlyIn1 = [...files1].filter((f) => !files2.has(f)).sort();
    const onlyIn2 = [...files2].filter((f) => !files1.has(f)).sort();
    const inBoth = [...files1].filter((f) => files2.has(f)).sort();

    const modified = [];
    for (const file of inBoth) {
      const content1 = await fs.readFile(
        path.join(this.resolvedPath1, file),
        'utf8',
      );
      const content2 = await fs.readFile(
        path.join(this.resolvedPath2, file),
        'utf8',
      );
      if (content1 !== content2) {
        modified.push(file);
      }
    }

    let llmContent = `Directory comparison: ${this.params.path1} vs ${this.params.path2}
`;
    if (onlyIn1.length > 0)
      llmContent += `
Only in ${this.params.path1}:
- ${onlyIn1.join('\n- ')}
`;
    if (onlyIn2.length > 0)
      llmContent += `
Only in ${this.params.path2}:
- ${onlyIn2.join('\n- ')}
`;
    if (modified.length > 0)
      llmContent += `
Modified files:
- ${modified.join('\n- ')}
`;

    if (onlyIn1.length === 0 && onlyIn2.length === 0 && modified.length === 0) {
      llmContent += '\nDirectories are identical.';
    }

    return {
      llmContent,
      returnDisplay: `Compared directories: ${onlyIn1.length} only in P1, ${onlyIn2.length} only in P2, ${modified.length} modified.`,
    };
  }
}

/**
 * Implementation of the Diff tool logic
 */
export class DiffTool extends BaseDeclarativeTool<DiffToolParams, ToolResult> {
  static readonly Name = DIFF_TOOL_NAME;

  constructor(
    private config: Config,
    messageBus: MessageBus,
  ) {
    super(
      DiffTool.Name,
      'Diff',
      DIFF_DEFINITION.base.description!,
      Kind.Read,
      DIFF_DEFINITION.base.parametersJsonSchema,
      messageBus,
      true,
      false,
    );
  }

  protected createInvocation(
    params: DiffToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<DiffToolParams, ToolResult> {
    return new DiffToolInvocation(
      this.config,
      params,
      messageBus ?? this.messageBus,
      _toolName,
      _toolDisplayName,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(DIFF_DEFINITION, modelId);
  }
}
