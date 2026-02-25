/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as Diff from 'diff';
import { WRITE_FILE_TOOL_NAME, WRITE_FILE_DISPLAY_NAME } from './tool-names.js';
import type { Config } from '../config/config.js';
import { ApprovalMode } from '../policy/types.js';

import type {
  ToolCallConfirmationDetails,
  ToolEditConfirmationDetails,
  ToolInvocation,
  ToolLocation,
  ToolResult,
  ToolConfirmationOutcome,
} from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { getErrorMessage, isNodeError } from '../utils/errors.js';
import {
  ensureCorrectEdit,
  ensureCorrectFileContent,
} from '../utils/editCorrector.js';
import { detectLineEnding } from '../utils/textUtils.js';
import { DEFAULT_DIFF_OPTIONS } from './diffOptions.js';
import { getDiffContextSnippet } from './diff-utils.js';
import type {
  ModifiableDeclarativeTool,
  ModifyContext,
} from './modifiable-tool.js';
import { IdeClient } from '../ide/ide-client.js';
import { logFileOperation } from '../telemetry/loggers.js';
import { FileOperationEvent } from '../telemetry/types.js';
import { FileOperation } from '../telemetry/metrics.js';
import { getSpecificMimeType } from '../utils/fileUtils.js';
import { getLanguageFromFilePath } from '../utils/language-detection.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { WRITE_FILE_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';
import { detectOmissionPlaceholders } from './omissionPlaceholderDetector.js';

/**
 * Parameters for the WriteFile tool
 */
export interface WriteFileToolParams {
  /**
   * The absolute path to the file to write to (single mode)
   */
  file_path?: string;

  /**
   * The content to write to the file (single mode)
   */
  content?: string;

  /**
   * Optional: List of files to write in parallel (bulk mode)
   */
  files?: Array<{
    file_path: string;
    content: string;
  }>;

  /**
   * Whether the proposed content was modified by the user.
   */
  modified_by_user?: boolean;

  /**
   * Initially proposed content.
   */
  ai_proposed_content?: string;
}

interface GetCorrectedFileContentResult {
  originalContent: string;
  correctedContent: string;
  fileExists: boolean;
  error?: { message: string; code?: string };
}

export async function getCorrectedFileContent(
  config: Config,
  filePath: string,
  proposedContent: string,
  abortSignal: AbortSignal,
): Promise<GetCorrectedFileContentResult> {
  let originalContent = '';
  let fileExists = false;
  let correctedContent = proposedContent;

  try {
    originalContent = await config
      .getFileSystemService()
      .readTextFile(filePath);
    fileExists = true; // File exists and was read
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      fileExists = false;
      originalContent = '';
    } else {
      // File exists but could not be read (permissions, etc.)
      fileExists = true; // Mark as existing but problematic
      originalContent = ''; // Can't use its content
      const error = {
        message: getErrorMessage(err),
        code: isNodeError(err) ? err.code : undefined,
      };
      // Return early as we can't proceed with content correction meaningfully
      return { originalContent, correctedContent, fileExists, error };
    }
  }

  if (fileExists) {
    // This implies originalContent is available
    const { params: correctedParams } = await ensureCorrectEdit(
      filePath,
      originalContent,
      {
        old_string: originalContent, // Treat entire current content as old_string
        new_string: proposedContent,
        file_path: filePath,
      },
      config.getGeminiClient(),
      config.getBaseLlmClient(),
      abortSignal,
      config.getDisableLLMCorrection(),
    );
    correctedContent = correctedParams.new_string;
  } else {
    // This implies new file (ENOENT)
    correctedContent = await ensureCorrectFileContent(
      proposedContent,
      config.getBaseLlmClient(),
      abortSignal,
      config.getDisableLLMCorrection(),
    );
  }
  return { originalContent, correctedContent, fileExists };
}

class WriteFileToolInvocation extends BaseToolInvocation<
  WriteFileToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: WriteFileToolParams,
    messageBus: MessageBus,
    toolName?: string,
    displayName?: string,
  ) {
    super(params, messageBus, toolName, displayName);
  }

  override toolLocations(): ToolLocation[] {
    if (this.params.files && this.params.files.length > 0) {
      return this.params.files.map((f) => ({
        path: path.resolve(this.config.getTargetDir(), f.file_path),
      }));
    }
    return [
      {
        path: path.resolve(
          this.config.getTargetDir(),
          this.params.file_path || '',
        ),
      },
    ];
  }

  override getDescription(): string {
    if (this.params.files && this.params.files.length > 0) {
      return `Writing ${this.params.files.length} files in parallel`;
    }
    const relativePath = makeRelative(
      path.resolve(this.config.getTargetDir(), this.params.file_path || ''),
      this.config.getTargetDir(),
    );
    return `Writing to ${shortenPath(relativePath)}`;
  }

  protected override async getConfirmationDetails(
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    if (this.params.files && this.params.files.length > 0) {
      // Bulk mode doesn't support rich diff confirmation yet, falling back to simple prompt
      return {
        type: 'info',
        title: 'Confirm Bulk Write',
        prompt: `Write ${this.params.files.length} files in parallel?`,
        onConfirm: async () => {},
      };
    }

    const correctedContentResult = await getCorrectedFileContent(
      this.config,
      path.resolve(this.config.getTargetDir(), this.params.file_path!),
      this.params.content!,
      abortSignal,
    );

    if (correctedContentResult.error) {
      return false;
    }

    const { originalContent, correctedContent } = correctedContentResult;
    const resolvedPath = path.resolve(
      this.config.getTargetDir(),
      this.params.file_path!,
    );
    const relativePath = makeRelative(resolvedPath, this.config.getTargetDir());
    const fileName = path.basename(resolvedPath);

    const fileDiff = Diff.createPatch(
      fileName,
      originalContent,
      correctedContent,
      'Current',
      'Proposed',
      DEFAULT_DIFF_OPTIONS,
    );

    const ideClient = await IdeClient.getInstance();
    const ideConfirmation =
      this.config.getIdeMode() && ideClient.isDiffingEnabled()
        ? ideClient.openDiff(resolvedPath, correctedContent)
        : undefined;

    const confirmationDetails: ToolEditConfirmationDetails = {
      type: 'edit',
      title: `Confirm Write: ${shortenPath(relativePath)}`,
      fileName,
      filePath: resolvedPath,
      fileDiff,
      originalContent,
      newContent: correctedContent,
      onConfirm: async (_outcome: ToolConfirmationOutcome) => {
        if (ideConfirmation) {
          const result = await ideConfirmation;
          if (result.status === 'accepted' && result.content) {
            this.params.content = result.content;
          }
        }
      },
      ideConfirmation,
    };
    return confirmationDetails;
  }

  async execute(abortSignal: AbortSignal): Promise<ToolResult> {
    const filesToWrite = this.params.files || [
      {
        file_path: this.params.file_path!,
        content: this.params.content!,
      },
    ];

    const writePromises = filesToWrite.map(async (f) => {
      const resolvedPath = path.resolve(
        this.config.getTargetDir(),
        f.file_path,
      );
      const validationError = this.config.validatePathAccess(resolvedPath);
      if (validationError) {
        return { error: validationError, file_path: f.file_path };
      }

      const correctedContentResult = await getCorrectedFileContent(
        this.config,
        resolvedPath,
        f.content,
        abortSignal,
      );

      if (correctedContentResult.error) {
        return {
          error: correctedContentResult.error.message,
          file_path: f.file_path,
        };
      }

      const {
        originalContent,
        correctedContent: fileContent,
        fileExists,
      } = correctedContentResult;
      const isNewFile = !fileExists;

      try {
        const dirName = path.dirname(resolvedPath);
        try {
          await fsPromises.access(dirName);
        } catch {
          await fsPromises.mkdir(dirName, { recursive: true });
        }

        let finalContent = fileContent;
        const useCRLF =
          !isNewFile && originalContent
            ? detectLineEnding(originalContent) === '\r\n'
            : os.EOL === '\r\n';

        if (useCRLF) {
          finalContent = finalContent.replace(/\r?\n/g, '\r\n');
        }

        await this.config
          .getFileSystemService()
          .writeTextFile(resolvedPath, finalContent);

        // Telemetry
        const mimetype = getSpecificMimeType(resolvedPath);
        const programmingLanguage = getLanguageFromFilePath(resolvedPath);
        const operation = isNewFile
          ? FileOperation.CREATE
          : FileOperation.UPDATE;

        logFileOperation(
          this.config,
          new FileOperationEvent(
            WRITE_FILE_TOOL_NAME,
            operation,
            fileContent.split('\n').length,
            mimetype,
            path.extname(resolvedPath),
            programmingLanguage,
          ),
        );

        const snippet = getDiffContextSnippet(
          isNewFile ? '' : originalContent,
          finalContent,
          5,
        );

        return {
          file_path: f.file_path,
          llmContent: `${isNewFile ? 'Created' : 'Updated'} ${f.file_path}.\nUpdated code:\n${snippet}\n`,
        };
      } catch (err) {
        return { error: getErrorMessage(err), file_path: f.file_path };
      }
    });

    const results = await Promise.all(writePromises);
    const successful = results.filter((r) => !('error' in r));
    const failed = results.filter(
      (r): r is { error: string; file_path: string } => 'error' in r,
    );

    let llmContent = successful
      .map(
        (r) =>
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          (r as { file_path: string; llmContent: string }).llmContent,
      )
      .join('\n');
    if (failed.length > 0) {
      llmContent += `\nErrors:\n${failed.map((f) => `${f.file_path}: ${f.error}`).join('\n')}`;
    }

    return {
      llmContent,
      returnDisplay:
        successful.length > 0
          ? `Wrote ${successful.length} file(s).`
          : `Failed to write files.`,
    };
  }
}

/**
 * Implementation of the WriteFile tool logic
 */
export class WriteFileTool
  extends BaseDeclarativeTool<WriteFileToolParams, ToolResult>
  implements ModifiableDeclarativeTool<WriteFileToolParams>
{
  static readonly Name = WRITE_FILE_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      WriteFileTool.Name,
      WRITE_FILE_DISPLAY_NAME,
      WRITE_FILE_DEFINITION.base.description!,
      Kind.Edit,
      WRITE_FILE_DEFINITION.base.parametersJsonSchema,
      messageBus,
      true,
      false,
    );
  }

  protected override validateToolParamValues(
    params: WriteFileToolParams,
  ): string | null {
    const filesToValidate = params.files || [
      {
        file_path: params.file_path,
        content: params.content,
      },
    ];

    for (const f of filesToValidate) {
      if (!f.file_path || f.file_path.trim() === '') {
        return `Missing or empty "file_path"`;
      }

      const resolvedPath = path.resolve(
        this.config.getTargetDir(),
        f.file_path,
      );

      const validationError = this.config.validatePathAccess(resolvedPath);
      if (validationError) {
        return validationError;
      }

      try {
        if (fs.existsSync(resolvedPath)) {
          const stats = fs.lstatSync(resolvedPath);
          if (stats.isDirectory()) {
            return `Path is a directory, not a file: ${resolvedPath}`;
          }
        }
      } catch (statError: unknown) {
        return `Error accessing path: ${resolvedPath}. Reason: ${getErrorMessage(statError)}`;
      }

      if (f.content) {
        const omissionPlaceholders = detectOmissionPlaceholders(f.content);
        if (omissionPlaceholders.length > 0) {
          return `Content for ${f.file_path} contains omission placeholders. Provide complete file content.`;
        }
      }
    }

    return null;
  }

  protected createInvocation(
    params: WriteFileToolParams,
    messageBus: MessageBus,
  ): ToolInvocation<WriteFileToolParams, ToolResult> {
    return new WriteFileToolInvocation(
      this.config,
      params,
      messageBus ?? this.messageBus,
      this.name,
      this.displayName,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(WRITE_FILE_DEFINITION, modelId);
  }

  getModifyContext(
    abortSignal: AbortSignal,
  ): ModifyContext<WriteFileToolParams> {
    return {
      getFilePath: (params: WriteFileToolParams) => params.file_path || '',
      getCurrentContent: async (params: WriteFileToolParams) => {
        if (params.files) return ''; // Bulk mode not modifiable in UI yet
        const correctedContentResult = await getCorrectedFileContent(
          this.config,
          params.file_path!,
          params.content!,
          abortSignal,
        );
        return correctedContentResult.originalContent;
      },
      getProposedContent: async (params: WriteFileToolParams) => {
        if (params.files) return ''; // Bulk mode not modifiable in UI yet
        const correctedContentResult = await getCorrectedFileContent(
          this.config,
          params.file_path!,
          params.content!,
          abortSignal,
        );
        return correctedContentResult.correctedContent;
      },
      createUpdatedParams: (
        _oldContent: string,
        modifiedProposedContent: string,
        originalParams: WriteFileToolParams,
      ) => {
        const content = originalParams.content;
        return {
          ...originalParams,
          ai_proposed_content: content,
          content: modifiedProposedContent,
          modified_by_user: true,
        };
      },
    };
  }
}
