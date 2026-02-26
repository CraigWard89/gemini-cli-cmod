/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { type IdeContext, type MCPServerConfig } from '@google/gemini-cli-core';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { isNarrowWidth } from '../utils/isNarrowWidth.js';

interface ContextSummaryDisplayProps {
  geminiMdFileCount: number;
  memoryCount: number;
  chatHistoryCount: number;
  contextFileNames: string[];
  mcpServers?: Record<string, MCPServerConfig>;
  blockedMcpServers?: Array<{ name: string; extensionName: string }>;
  ideContext?: IdeContext;
  skillCount: number;
  backgroundProcessCount?: number;
}

export const ContextSummaryDisplay: React.FC<ContextSummaryDisplayProps> = ({
  geminiMdFileCount,
  memoryCount,
  chatHistoryCount,
  contextFileNames,
  mcpServers,
  blockedMcpServers,
  ideContext,
  skillCount,
  backgroundProcessCount = 0,
}) => {
  const { columns: terminalWidth } = useTerminalSize();
  const isNarrow = isNarrowWidth(terminalWidth);
  const mcpServerCount = Object.keys(mcpServers || {}).length;
  const blockedMcpServerCount = blockedMcpServers?.length || 0;
  const openFileCount = ideContext?.workspaceState?.openFiles?.length ?? 0;

  const openFilesText = (() =>
    `${openFileCount} open file${
      openFileCount !== 1 ? 's' : ''
    } (ctrl+g to view)`)();

  const geminiMdText = (() => {
    const allNamesTheSame =
      contextFileNames.length > 0 && new Set(contextFileNames).size < 2;
    const name = allNamesTheSame ? contextFileNames[0] : 'context';
    return `${geminiMdFileCount} ${name} file${
      geminiMdFileCount !== 1 ? 's' : ''
    }`;
  })();

  const memoryText = (() =>
    `${memoryCount} memor${memoryCount !== 1 ? 'ies' : 'y'}`)();

  const chatHistoryText = (() =>
    `${chatHistoryCount} message${chatHistoryCount !== 1 ? 's' : ''}`)();

  const mcpText = (() => {
    if (mcpServerCount === 0 && blockedMcpServerCount === 0) {
      return '0 MCP servers';
    }

    const parts = [];
    if (mcpServerCount > 0 || blockedMcpServerCount === 0) {
      parts.push(
        `${mcpServerCount} MCP server${mcpServerCount !== 1 ? 's' : ''}`,
      );
    }

    if (blockedMcpServerCount > 0) {
      let blockedText = `${blockedMcpServerCount} Blocked`;
      if (mcpServerCount === 0) {
        blockedText += ` MCP server${blockedMcpServerCount !== 1 ? 's' : ''}`;
      }
      parts.push(blockedText);
    }
    return parts.join(', ');
  })();

  const skillText = (() =>
    `${skillCount} skill${skillCount !== 1 ? 's' : ''}`)();

  const backgroundText = (() =>
    `${backgroundProcessCount} background process${
      backgroundProcessCount !== 1 ? 'es' : ''
    }`)();

  const summaryParts = [
    openFilesText,
    geminiMdText,
    memoryText,
    chatHistoryText,
    mcpText,
    skillText,
    backgroundText,
  ].filter(Boolean);

  if (isNarrow) {
    return (
      <Box flexDirection="column" paddingX={1}>
        {summaryParts.map((part, index) => (
          <Text key={index} color={theme.text.secondary}>
            - {part}
          </Text>
        ))}
      </Box>
    );
  }

  return (
    <Box paddingX={1}>
      <Text color={theme.text.secondary}>{summaryParts.join(' | ')}</Text>
    </Box>
  );
};
