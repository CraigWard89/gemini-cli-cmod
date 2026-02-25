/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';

/**
 * Interface for file system operations that may be delegated to different implementations
 */
export interface FileSystemService {
  /**
   * Read text content from a file
   *
   * @param filePath - The path to the file to read
   * @returns The file content as a string
   */
  readTextFile(filePath: string): Promise<string>;

  /**
   * Write text content to a file
   *
   * @param filePath - The path to the file to write
   * @param content - The content to write
   */
  writeTextFile(filePath: string, content: string): Promise<void>;
}

/**
 * Standard file system implementation
 */
export class StandardFileSystemService implements FileSystemService {
  async readTextFile(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath, 'utf-8');
    // Strip BOM if present
    return content.startsWith('\uFEFF') ? content.slice(1) : content;
  }

  async writeTextFile(filePath: string, content: string): Promise<void> {
    // Strip BOM from content before writing if it somehow got in there
    const cleanContent = content.startsWith('\uFEFF')
      ? content.slice(1)
      : content;
    await fs.writeFile(filePath, cleanContent, 'utf-8');
  }
}
