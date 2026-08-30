import { readFile } from 'node:fs/promises';

import { InputFileError } from '../errors/operational-error.js';

export async function readUtf8File(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    throw new InputFileError(filePath, error);
  }
}
