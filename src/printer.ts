// Two ways to render rows back out: a streaming RFC4180 serializer that
// never needs the whole dataset, and a buffered table formatter for
// human-readable output (which inherently needs every row to size columns).

export interface CsvPrintOptions {
  delimiter?: string;
  quote?: string;
  lineEnding?: string;
}

function quoteField(field: string, delimiter: string, quote: string): string {
  const needsQuoting =
    field.includes(delimiter) || field.includes(quote) || field.includes('\n') || field.includes('\r');
  if (!needsQuoting) return field;
  const escaped = field.split(quote).join(quote + quote);
  return quote + escaped + quote;
}

export function formatCsvRow(fields: readonly string[], options: CsvPrintOptions = {}): string {
  const delimiter = options.delimiter ?? ',';
  const quote = options.quote ?? '"';
  return fields.map((f) => quoteField(f, delimiter, quote)).join(delimiter);
}

/**
 * Serializes rows back to valid CSV text, one line per row, as they arrive.
 * Suitable for piping a parsed-and-transformed stream straight to a file
 * without holding the whole output in memory either.
 */
export async function* printCsvStream(
  rows: AsyncIterable<readonly string[]> | Iterable<readonly string[]>,
  options: CsvPrintOptions = {},
): AsyncGenerator<string> {
  const lineEnding = options.lineEnding ?? '\n';
  for await (const row of rows) {
    yield formatCsvRow(row, options) + lineEnding;
  }
}

/**
 * Renders rows as an aligned, human-readable table. This requires every
 * row up front to compute column widths, so it is meant for previewing a
 * small result set, not for large files.
 */
export function formatAsTable(rows: readonly (readonly string[])[]): string {
  if (rows.length === 0) return '';

  const columnCount = Math.max(...rows.map((r) => r.length));
  const widths = new Array(columnCount).fill(0);
  for (const row of rows) {
    for (let i = 0; i < columnCount; i++) {
      const cell = row[i] ?? '';
      widths[i] = Math.max(widths[i], cell.length);
    }
  }

  const renderRow = (row: readonly string[]): string =>
    '| ' +
    Array.from({ length: columnCount }, (_, i) => (row[i] ?? '').padEnd(widths[i])).join(' | ') +
    ' |';

  const separator = '+' + widths.map((w) => '-'.repeat(w + 2)).join('+') + '+';

  const lines = [separator, renderRow(rows[0]), separator];
  for (const row of rows.slice(1)) {
    lines.push(renderRow(row));
  }
  lines.push(separator);
  return lines.join('\n');
}
