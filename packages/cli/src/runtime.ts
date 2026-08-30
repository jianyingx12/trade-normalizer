import { writeUtf8FileAtomically } from './io/write-utf8-file-atomically.js';

export interface CliRuntime {
  writeStdout(contents: string): void;
  writeStderr(contents: string): void;
  writeOutputFile(filePath: string, contents: string): Promise<void>;
}

export const processCliRuntime: CliRuntime = {
  writeStdout: (contents) => process.stdout.write(contents),
  writeStderr: (contents) => process.stderr.write(contents),
  writeOutputFile: writeUtf8FileAtomically,
};
