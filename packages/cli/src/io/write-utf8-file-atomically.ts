import { randomUUID } from 'node:crypto';
import { rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import { OutputFileError } from '../errors/operational-error.js';

/** Writes beside the destination and renames only after the complete UTF-8 document exists. */
export async function writeUtf8FileAtomically(filePath: string, contents: string): Promise<void> {
  const destination = resolve(filePath);
  const temporary = join(
    dirname(destination),
    `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    await writeFile(temporary, contents, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw new OutputFileError(filePath, error);
  }
}
