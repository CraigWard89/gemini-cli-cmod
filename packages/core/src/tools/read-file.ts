/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import path from 'node:path';
import { makeRelative, shortenPath } from '../utils/paths.js';
import type { ToolInvocation, ToolLocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';

import {
  processSingleFileContent,
  getSpecificMimeType,
} from '../utils/fileUtils.js';
import type { Config } from '../config/config.js';
import { FileOperation } from '../telemetry/metrics.js';
import { getProgrammingLanguage } from '../telemetry/telemetry-utils.js';
import { logFileOperation } from '../telemetry/loggers.js';
import { FileOperationEvent } from '../telemetry/types.js';
import { READ_FILE_TOOL_NAME, READ_FILE_DISPLAY_NAME } from './tool-names.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { READ_FILE_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';

/**
 * Parameters for the ReadFile tool
 */
export interface ReadFileToolParams {
  /**
   * The path to the file to read (single mode)
   */
  file_path?: string;

  /**
   * The line number to start reading from (optional, 1-based, single mode)
   */
  start_line?: number;

  /**
   * The line number to end reading at (optional, 1-based, inclusive, single mode)
   */
  end_line?: number;

  /**
   * Optional: List of files to read in parallel (bulk mode)
   */
  files?: Array<{
    file_path: string;
    start_line?: number;
    end_line?: number;
  }>;
}

class ReadFileToolInvocation extends BaseToolInvocation<
  ReadFileToolParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: ReadFileToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    if (this.params.files && this.params.files.length > 0) {
      return `Reading ${this.params.files.length} files in parallel`;
    }
    const filePath = this.params.file_path || 'unknown';
    const relativePath = makeRelative(
      path.resolve(this.config.getTargetDir(), filePath),
      this.config.getTargetDir(),
    );
    return shortenPath(relativePath);
  }

  override toolLocations(): ToolLocation[] {
    if (this.params.files && this.params.files.length > 0) {
      return this.params.files.map((f) => ({
        path: path.resolve(this.config.getTargetDir(), f.file_path),
        line: f.start_line,
      }));
    }
    return [
      {
        path: path.resolve(
          this.config.getTargetDir(),
          this.params.file_path || '',
        ),
        line: this.params.start_line,
      },
    ];
  }

  async execute(): Promise<ToolResult> {
    const filesToRead = this.params.files || [
      {
        file_path: this.params.file_path!,
        start_line: this.params.start_line,
        end_line: this.params.end_line,
      },
    ];

    const readPromises = filesToRead.map(async (f) => {
      const resolvedPath = path.resolve(
        this.config.getTargetDir(),
        f.file_path,
      );
      const validationError = this.config.validatePathAccess(
        resolvedPath,
        'read',
      );
      if (validationError) {
        return { error: validationError, file_path: f.file_path };
      }

      const result = await processSingleFileContent(
        resolvedPath,
        this.config.getTargetDir(),
        this.config.getFileSystemService(),
        f.start_line,
        f.end_line,
      );

      if (result.error) {
        return { error: result.error, file_path: f.file_path };
      }

      let content: string;
      if (result.isTruncated) {
        const [start, end] = result.linesShown!;
        const total = result.originalLineCount!;
        content = `
IMPORTANT: The file content has been truncated.
Status: Showing lines ${start}-${end} of ${total} total lines.
Action: To read more of the file, you can use the 'read_file' tool on this specific file with 'start_line' set to ${end + 1}.

--- FILE CONTENT (truncated) ---
${result.llmContent}`;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        content = (result.llmContent as string) || '';
      }

      // Telemetry
      const lines = content.split('\n').length;
      const mimetype = getSpecificMimeType(resolvedPath);
      const programming_language = getProgrammingLanguage({
        file_path: resolvedPath,
      });
      logFileOperation(
        this.config,
        new FileOperationEvent(
          READ_FILE_TOOL_NAME,
          FileOperation.READ,
          lines,
          mimetype,
          path.extname(resolvedPath),
          programming_language,
        ),
      );

      return {
        file_path: f.file_path,
        content: `--- ${f.file_path} ---\n\n${content}\n`,
      };
    });

    const results = await Promise.all(readPromises);
    const successfulReads = results.filter((r) => !('error' in r));
    const failedReads = results.filter(
      (r): r is { error: string; file_path: string } => 'error' in r,
    );

    let llmContent = successfulReads
      .map((r) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const res = r as { file_path: string; content: string };
        return res.content;
      })
      .join('\n');
    if (failedReads.length > 0) {
      llmContent += `\n\nErrors encountered:\n${failedReads.map((f) => `${f.file_path}: ${f.error}`).join('\n')}`;
    }

    const display =
      successfulReads.length > 0
        ? `Read ${successfulReads.length} file(s).`
        : `Failed to read files.`;

    return {
      llmContent,
      returnDisplay: display,
    };
  }
}

/**
 * Implementation of the ReadFile tool logic
 */
export class ReadFileTool extends BaseDeclarativeTool<
  ReadFileToolParams,
  ToolResult
> {
  static readonly Name = READ_FILE_TOOL_NAME;
  private readonly fileDiscoveryService: FileDiscoveryService;

  constructor(
    private config: Config,
    messageBus: MessageBus,
  ) {
    super(
      ReadFileTool.Name,
      READ_FILE_DISPLAY_NAME,
      READ_FILE_DEFINITION.base.description!,
      Kind.Read,
      READ_FILE_DEFINITION.base.parametersJsonSchema,
      messageBus,
      true,
      false,
    );
    this.fileDiscoveryService = new FileDiscoveryService(
      config.getTargetDir(),
      config.getFileFilteringOptions(),
    );
  }

  protected override validateToolParamValues(
    params: ReadFileToolParams,
  ): string | null {
    const filesToValidate = params.files || [
      {
        file_path: params.file_path,
        start_line: params.start_line,
        end_line: params.end_line,
      },
    ];

    for (const f of filesToValidate) {
      if (!f.file_path || f.file_path.trim() === '') {
        return "The 'file_path' parameter must be non-empty.";
      }

      const resolvedPath = path.resolve(
        this.config.getTargetDir(),
        f.file_path,
      );

      const validationError = this.config.validatePathAccess(
        resolvedPath,
        'read',
      );
      if (validationError) {
        return validationError;
      }

      if (f.start_line !== undefined && f.start_line < 1) {
        return `start_line for ${f.file_path} must be at least 1`;
      }
      if (f.end_line !== undefined && f.end_line < 1) {
        return `end_line for ${f.file_path} must be at least 1`;
      }
      if (
        f.start_line !== undefined &&
        f.end_line !== undefined &&
        f.start_line > f.end_line
      ) {
        return `start_line cannot be greater than end_line for ${f.file_path}`;
      }

      const fileFilteringOptions = this.config.getFileFilteringOptions();
      if (
        this.fileDiscoveryService.shouldIgnoreFile(
          resolvedPath,
          fileFilteringOptions,
        )
      ) {
        return `File path '${resolvedPath}' is ignored by configured ignore patterns.`;
      }
    }

    return null;
  }

  protected createInvocation(
    params: ReadFileToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<ReadFileToolParams, ToolResult> {
    return new ReadFileToolInvocation(
      this.config,
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(READ_FILE_DEFINITION, modelId);
  }
}
