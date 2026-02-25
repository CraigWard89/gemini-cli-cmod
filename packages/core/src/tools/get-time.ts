/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { GET_TIME_TOOL_NAME } from './tool-names.js';
import { GET_TIME_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';

/**
 * Parameters for the GetTime tool
 */
export type GetTimeToolParams = Record<string, never>;

class GetTimeToolInvocation extends BaseToolInvocation<
  GetTimeToolParams,
  ToolResult
> {
  /**
   * Gets a description of the operation
   * @returns A string describing the operation
   */
  getDescription(): string {
    return 'Getting current time and date';
  }

  /**
   * Executes the GetTime operation
   * @returns Result of the GetTime operation
   */
  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const now = new Date();
    const timeString = now.toString();
    const isoString = now.toISOString();
    const localString = now.toLocaleString();

    return {
      llmContent: `Current system time:
Local: ${localString}
ISO: ${isoString}
Full: ${timeString}`,
      returnDisplay: `Time: ${localString}`,
    };
  }
}

/**
 * Implementation of the GetTime tool logic
 */
export class GetTimeTool extends BaseDeclarativeTool<
  GetTimeToolParams,
  ToolResult
> {
  static readonly Name = GET_TIME_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      GetTimeTool.Name,
      'GetTime',
      GET_TIME_DEFINITION.base.description!,
      Kind.Search,
      GET_TIME_DEFINITION.base.parametersJsonSchema,
      messageBus,
      false, // Does not require confirmation
      false, // Does not require plan mode
    );
  }

  protected createInvocation(
    params: GetTimeToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<GetTimeToolParams, ToolResult> {
    return new GetTimeToolInvocation(
      params,
      messageBus ?? this.messageBus,
      _toolName,
      _toolDisplayName,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(GET_TIME_DEFINITION, modelId);
  }
}
