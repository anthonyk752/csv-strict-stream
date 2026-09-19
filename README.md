# csv-strict-stream

Most CSV parsers force a choice: either they load the whole file into a
string/array before doing anything (fine until someone hands you a 4GB
export), or they stream but silently accept rows with the wrong number of
fields, which is usually a sign the file is corrupt or the wrong file
entirely. This library does both: it parses CSV as a stream of rows, using
only as much memory as the current row needs, and it validates that every
row has the same number of fields as the first one, raising immediately
when it doesn't.

It has no dependencies. Everything is built on async generators and
`TextDecoder`, both standard in Node and browsers.

## Parsing a file without loading it into memory

```ts
import { createReadStream } from 'node:fs';
import { toStrings, parseCsvStream } from 'csv-strict-stream';

const bytes = createReadStream('orders.csv');

for await (const row of parseCsvStream(toStrings(bytes))) {
  console.log(row); // ['1024', 'widget', '19.99']
}
```

`toStrings` decodes bytes to text as they arrive, handling multi-byte UTF-8
characters split across chunk boundaries correctly. `parseCsvStream` then
yields each row the moment it is complete: quoted fields, embedded commas,
embedded newlines inside quotes, and `\r\n` / `\n` line endings are all
handled.

If a row shows up with a different number of fields than the first row,
parsing throws a `CsvValidationError` with the line and character position,
instead of returning a ragged result:

```ts
import { parseCsvStream, CsvValidationError } from 'csv-strict-stream';

try {
  for await (const row of parseCsvStream(toStrings(bytes))) {
    // ...
  }
} catch (err) {
  if (err instanceof CsvValidationError) {
    console.error(`bad row at line ${err.line}: ${err.message}`);
  }
}
```

## Treating the first row as a header

```ts
import { parseCsvRecords } from 'csv-strict-stream';

for await (const record of parseCsvRecords(toStrings(bytes))) {
  console.log(record.sku, record.price);
}
```

## Writing CSV back out

```ts
import { printCsvStream } from 'csv-strict-stream';

const rows = [
  ['sku', 'name', 'price'],
  ['1024', 'widget, deluxe', '19.99'],
];

for await (const line of printCsvStream(rows)) {
  process.stdout.write(line);
}
```

Fields are only quoted when they need to be (they contain the delimiter,
the quote character, or a newline), matching RFC 4180.

## Pretty-printing a small result for a terminal

```ts
import { formatAsTable } from 'csv-strict-stream';

console.log(formatAsTable([
  ['sku', 'name', 'price'],
  ['1024', 'widget', '19.99'],
]));
```

```
+------+--------+-------+
| sku  | name   | price |
+------+--------+-------+
| 1024 | widget | 19.99 |
+------+--------+-------+
```

`formatAsTable` needs every row up front to compute column widths, so it's
meant for previewing a handful of rows, not a whole large file.

## Running tests

Tests use Node's built-in test runner, so there's nothing to install:

```
npm test
```

This compiles `src` and `test` to `dist-test` and runs everything under
`dist-test/test` with `node --test`.

## Status

Early skeleton. The parser and serializer are covered by an automated
suite exercising the usual edge cases (quoted commas, quoted newlines,
escaped quotes, missing trailing newline, `\r` and `\r\n` line endings,
field state carried across chunk boundaries, and column-count
validation), but there's no CLI yet and only comma/quote characters have
been exercised, not delimiter presets like TSV.
