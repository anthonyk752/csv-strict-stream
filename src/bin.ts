#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { runCli } from './cli.js';

const code = await runCli(process.argv.slice(2), {
  open: (path) => createReadStream(path),
  stdin: process.stdin,
  out: (text) => {
    process.stdout.write(text);
  },
  err: (text) => {
    process.stderr.write(text);
  },
}).catch((err: unknown) => {
  // Typically a missing or unreadable file.
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  return 1;
});

process.exitCode = code;
