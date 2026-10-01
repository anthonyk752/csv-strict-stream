// Command line front end. All file and process access goes through the Io
// object so the command logic can be tested without touching the real
// filesystem; bin.ts supplies the real one.

import { parseCsvStream, toStrings, CsvValidationError } from './parser.js';
import type { CsvParseOptions } from './parser.js';
import { formatAsTable } from './printer.js';

export interface Io {
  /** Opens a file path for reading. */
  open(path: string): AsyncIterable<Uint8Array>;
  stdin: AsyncIterable<Uint8Array>;
  out(text: string): void;
  err(text: string): void;
}

const USAGE = `usage: csv-strict-stream <command> [options] <file | ->

commands:
  validate   check that every row has the same number of fields
  pretty     print the first rows as an aligned table

options:
  -d, --delimiter <char>   field separator (default ,)
  -q, --quote <char>       quote character (default ")
  -c, --columns <n>        expected field count (default: taken from row 1)
  -n, --limit <n>          rows to show with pretty, including the header (default 20)
  -h, --help               show this text

Use - as the file to read from standard input.
`;

interface Parsed {
  command: string;
  file: string;
  parse: CsvParseOptions;
  limit: number;
}

class UsageError extends Error {}

function parseCount(name: string, value: string | undefined): number {
  if (value === undefined || !/^[1-9][0-9]*$/.test(value)) {
    throw new UsageError(`${name} needs a positive integer`);
  }
  return Number(value);
}

function parseArgs(argv: readonly string[]): Parsed {
  const positional: string[] = [];
  const parse: CsvParseOptions = {};
  let limit = 20;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];
    switch (arg) {
      case '-d':
      case '--delimiter':
        if (value === undefined || value.length !== 1) {
          throw new UsageError(`${arg} needs a single character`);
        }
        parse.delimiter = value;
        i++;
        break;
      case '-q':
      case '--quote':
        if (value === undefined || value.length !== 1) {
          throw new UsageError(`${arg} needs a single character`);
        }
        parse.quote = value;
        i++;
        break;
      case '-c':
      case '--columns':
        parse.columns = parseCount(arg, value);
        i++;
        break;
      case '-n':
      case '--limit':
        limit = parseCount(arg, value);
        i++;
        break;
      default:
        // A lone "-" means stdin, so only longer dash-words are flags.
        if (arg.length > 1 && arg.startsWith('-')) {
          throw new UsageError(`unknown option ${arg}`);
        }
        positional.push(arg);
    }
  }

  if (positional.length !== 2) {
    throw new UsageError('expected a command and exactly one file');
  }
  const [command, file] = positional;
  if (command !== 'validate' && command !== 'pretty') {
    throw new UsageError(`unknown command ${command}`);
  }
  if (parse.delimiter !== undefined && parse.delimiter === (parse.quote ?? '"')) {
    throw new UsageError('delimiter and quote must differ');
  }
  return { command, file, parse, limit };
}

/** Runs the CLI and returns the process exit code: 0 ok, 1 invalid CSV, 2 bad usage. */
export async function runCli(argv: readonly string[], io: Io): Promise<number> {
  if (argv.includes('-h') || argv.includes('--help')) {
    io.out(USAGE);
    return 0;
  }

  let args: Parsed;
  try {
    args = parseArgs(argv);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    io.err(`${err.message}\n\n${USAGE}`);
    return 2;
  }

  const source = args.file === '-' ? io.stdin : io.open(args.file);
  const rows = parseCsvStream(toStrings(source), args.parse);

  try {
    if (args.command === 'validate') {
      let count = 0;
      let columns = 0;
      for await (const row of rows) {
        if (count === 0) columns = row.length;
        count++;
      }
      io.out(`ok: ${count} rows, ${columns} columns\n`);
      return 0;
    }

    const shown: string[][] = [];
    let truncated = false;
    for await (const row of rows) {
      if (shown.length === args.limit) {
        truncated = true;
        break; // stops the parser; the rest of the file is never read
      }
      shown.push(row);
    }
    if (shown.length > 0) io.out(formatAsTable(shown) + '\n');
    if (truncated) io.out(`(showing first ${args.limit} rows)\n`);
    return 0;
  } catch (err) {
    if (err instanceof CsvValidationError) {
      io.err(`${args.file}: ${err.message}\n`);
      return 1;
    }
    throw err;
  }
}
