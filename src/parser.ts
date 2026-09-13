// Streaming CSV parser. Reads the input one chunk at a time and never
// buffers more than the current in-progress field/row, so a multi-gigabyte
// file costs the same memory as a small one.

export interface CsvParseOptions {
  /** Field separator. Defaults to ','. Must be a single character. */
  delimiter?: string;
  /** Quote character. Defaults to '"'. Must be a single character. */
  quote?: string;
  /**
   * Expected number of fields per row. If omitted, the field count of the
   * first row sets the expectation and every later row is checked against it.
   */
  columns?: number;
}

export class CsvValidationError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly char: number,
  ) {
    super(`line ${line}, char ${char}: ${message}`);
    this.name = 'CsvValidationError';
  }
}

/**
 * Decodes a stream of bytes into a stream of strings, correctly handling
 * multi-byte UTF-8 characters that get split across chunk boundaries.
 * Use this to feed a Node Readable (fs.createReadStream, an HTTP body, etc.)
 * into parseCsvStream without ever materializing the whole file as one string.
 */
export async function* toStrings(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder('utf-8');
  for await (const chunk of chunks) {
    const text = decoder.decode(chunk, { stream: true });
    if (text.length > 0) yield text;
  }
  const tail = decoder.decode();
  if (tail.length > 0) yield tail;
}

/**
 * Parses CSV text incrementally and yields one row (array of field strings)
 * at a time as soon as it is complete. Throws CsvValidationError as soon as
 * a row's field count disagrees with the established column count, without
 * waiting for the rest of the input.
 */
export async function* parseCsvStream(
  chunks: AsyncIterable<string>,
  options: CsvParseOptions = {},
): AsyncGenerator<string[]> {
  const delimiter = options.delimiter ?? ',';
  const quote = options.quote ?? '"';
  if (delimiter.length !== 1 || quote.length !== 1) {
    throw new Error('delimiter and quote must each be exactly one character');
  }
  if (delimiter === quote) {
    throw new Error('delimiter and quote must differ');
  }

  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let fieldStarted = false; // has any character (including an opening quote) been seen in the current field
  let rowStarted = false; // has any content been seen since the last row boundary
  let pendingCR = false; // a bare \r was just seen; a following \n belongs to the same line break
  let line = 1;
  let char = 1;
  let expectedColumns = options.columns;

  const finalizeRow = (): string[] => {
    row.push(field);
    field = '';
    fieldStarted = false;
    if (expectedColumns === undefined) {
      expectedColumns = row.length;
    } else if (row.length !== expectedColumns) {
      throw new CsvValidationError(
        `expected ${expectedColumns} fields but found ${row.length}`,
        line,
        char,
      );
    }
    const finished = row;
    row = [];
    rowStarted = false;
    return finished;
  };

  for await (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];

      if (pendingCR) {
        pendingCR = false;
        if (ch === '\n') continue; // second half of a \r\n line break, already handled
      }

      if (inQuotes) {
        if (ch === quote) {
          const next = i + 1 < chunk.length ? chunk[i + 1] : undefined;
          if (next === quote) {
            field += quote;
            i++;
            char += 2;
          } else {
            inQuotes = false;
            char++;
          }
        } else {
          field += ch;
          if (ch === '\n') {
            line++;
            char = 1;
          } else {
            char++;
          }
        }
        continue;
      }

      if (ch === quote && !fieldStarted) {
        inQuotes = true;
        fieldStarted = true;
        rowStarted = true;
        char++;
        continue;
      }

      if (ch === delimiter) {
        row.push(field);
        field = '';
        fieldStarted = false;
        rowStarted = true;
        char++;
        continue;
      }

      if (ch === '\r') {
        pendingCR = true;
        yield finalizeRow();
        line++;
        char = 1;
        continue;
      }

      if (ch === '\n') {
        yield finalizeRow();
        line++;
        char = 1;
        continue;
      }

      field += ch;
      fieldStarted = true;
      rowStarted = true;
      char++;
    }
  }

  if (inQuotes) {
    throw new CsvValidationError('unterminated quoted field at end of input', line, char);
  }

  if (rowStarted || field.length > 0) {
    yield finalizeRow();
  }
}

/**
 * Convenience wrapper over parseCsvStream that treats the first row as a
 * header and yields subsequent rows as objects keyed by that header.
 */
export async function* parseCsvRecords(
  chunks: AsyncIterable<string>,
  options: CsvParseOptions = {},
): AsyncGenerator<Record<string, string>> {
  let header: string[] | undefined;
  for await (const row of parseCsvStream(chunks, options)) {
    if (!header) {
      header = row;
      continue;
    }
    const record: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) {
      record[header[i]] = row[i];
    }
    yield record;
  }
}
