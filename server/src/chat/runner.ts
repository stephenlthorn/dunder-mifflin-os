// The only place the server starts a process. execFile, never a shell; argv is passed as-is.
import { execFile } from 'node:child_process';

export type ExecResult = { stdout: string; stderr: string; code: number | null; timedOut: boolean };
export type Runner = (file: string, args: ReadonlyArray<string>, opts: { timeoutMs: number }) => Promise<ExecResult>;

const MAX_BUFFER = 4 * 1024 * 1024;

export const execFileRunner: Runner = (file, args, opts) =>
  new Promise((resolve, reject) => {
    execFile(file, [...args], { timeout: opts.timeoutMs, maxBuffer: MAX_BUFFER, shell: false, windowsHide: true, killSignal: 'SIGTERM' },
      (error, stdout, stderr) => {
        if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') return reject(new Error('hermes executable not found'));
        const killed = Boolean(error && (error as { killed?: boolean }).killed);
        const code = error ? (typeof error.code === 'number' ? error.code : null) : 0;
        resolve({ stdout: String(stdout), stderr: String(stderr), code, timedOut: killed });
      });
  });
