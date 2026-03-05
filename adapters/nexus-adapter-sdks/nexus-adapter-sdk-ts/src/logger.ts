import util from "node:util";

export type AdapterLogger = {
  error: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
};

export type AdapterLoggerOptions = {
  verbose: boolean;
  stderr?: NodeJS.WriteStream;
};

export function createAdapterLogger(opts: AdapterLoggerOptions): AdapterLogger {
  const stderr = opts.stderr ?? process.stderr;
  const verbose = opts.verbose;

  // All logs must go to stderr. Stdout is reserved for protocol output.
  const write = (prefix: string, message: string, ...args: unknown[]) => {
    const rendered = args.length > 0 ? util.format(message, ...args) : message;
    stderr.write(`${prefix}${rendered}\n`);
  };

  return {
    error: (message: string, ...args: unknown[]) => write("[ERROR] ", message, ...args),
    info: (message: string, ...args: unknown[]) => write("[INFO] ", message, ...args),
    debug: (message: string, ...args: unknown[]) => {
      if (!verbose) {
        return;
      }
      write("[DEBUG] ", message, ...args);
    },
  };
}

export function patchConsoleToStderr(log: AdapterLogger): void {
  // Prevent accidental console.log() from corrupting the adapter stdout protocol.
  console.log = (...args: unknown[]) => log.info("%s", util.format(...args));
  console.info = (...args: unknown[]) => log.info("%s", util.format(...args));
  console.warn = (...args: unknown[]) => log.info("%s", util.format(...args));
  console.error = (...args: unknown[]) => log.error("%s", util.format(...args));
}

