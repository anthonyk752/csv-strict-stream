import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvStream, parseCsvRecords, toStrings, CsvValidationError } from '../src/parser.js';
import { strings, bytes, collect } from './helpers.js';

test('parses plain rows separated by newlines', async () => {
  const rows = await collect(parseCsvStream(strings('a,b,c\n1,2,3\n')));
  assert.deepEqual(rows, [
    ['a', 'b', 'c'],
    ['1', '2', '3'],
  ]);
});

test('handles a quoted field containing the delimiter', async () => {
  const rows = await collect(parseCsvStream(strings('a,"b,c",d\n')));
  assert.deepEqual(rows, [['a', 'b,c', 'd']]);
});

test('handles a quoted field containing a newline', async () => {
  const rows = await collect(parseCsvStream(strings('a,"b\nc",d\n')));
  assert.deepEqual(rows, [['a', 'b\nc', 'd']]);
});

test('unescapes doubled quotes inside a quoted field', async () => {
  const rows = await collect(parseCsvStream(strings('a,"say ""hi""",b\n')));
  assert.deepEqual(rows, [['a', 'say "hi"', 'b']]);
});

test('treats \\r\\n as a single line break', async () => {
  const rows = await collect(parseCsvStream(strings('a,b\r\nc,d\r\n')));
  assert.deepEqual(rows, [
    ['a', 'b'],
    ['c', 'd'],
  ]);
});

test('treats a bare \\r as a line break', async () => {
  const rows = await collect(parseCsvStream(strings('a,b\rc,d\r')));
  assert.deepEqual(rows, [
    ['a', 'b'],
    ['c', 'd'],
  ]);
});

test('yields the final row when the input has no trailing newline', async () => {
  const rows = await collect(parseCsvStream(strings('a,b\nc,d')));
  assert.deepEqual(rows, [
    ['a', 'b'],
    ['c', 'd'],
  ]);
});

test('produces no rows for empty input', async () => {
  const rows = await collect(parseCsvStream(strings('')));
  assert.deepEqual(rows, []);
});

test('carries field state across a chunk boundary in the middle of a field', async () => {
  const rows = await collect(parseCsvStream(strings('a', 'b', 'c,d\n')));
  assert.deepEqual(rows, [['abc', 'd']]);
});

test('carries quote state across a chunk boundary inside a quoted field', async () => {
  const rows = await collect(parseCsvStream(strings('a,"hello', ' world",b\n')));
  assert.deepEqual(rows, [['a', 'hello world', 'b']]);
});

test('carries a bare \\r across a chunk boundary into the following \\n', async () => {
  const rows = await collect(parseCsvStream(strings('a,b\r', '\nc,d\r\n')));
  assert.deepEqual(rows, [
    ['a', 'b'],
    ['c', 'd'],
  ]);
});

test('supports a custom delimiter and quote character', async () => {
  const rows = await collect(parseCsvStream(strings("a;'b;c';d\n"), { delimiter: ';', quote: "'" }));
  assert.deepEqual(rows, [['a', 'b;c', 'd']]);
});

test('rejects a delimiter and quote that are the same character', async () => {
  await assert.rejects(
    collect(parseCsvStream(strings('a,b\n'), { delimiter: ',', quote: ',' })),
    /delimiter and quote must differ/,
  );
});

test('rejects a multi-character delimiter', async () => {
  await assert.rejects(
    collect(parseCsvStream(strings('a::b\n'), { delimiter: '::' })),
    /must each be exactly one character/,
  );
});

async function captureRejection(promise: Promise<unknown>): Promise<CsvValidationError> {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof CsvValidationError);
    return err;
  }
  throw new Error('expected promise to reject with a CsvValidationError');
}

test('raises CsvValidationError when a later row has too many fields', async () => {
  const err = await captureRejection(collect(parseCsvStream(strings('a,b\nc,d,e\n'))));
  assert.equal(err.line, 2);
  assert.equal(err.char, 6);
  assert.match(err.message, /expected 2 fields but found 3/);
});

test('raises CsvValidationError when a row does not match a preset column count', async () => {
  const err = await captureRejection(collect(parseCsvStream(strings('a,b\n'), { columns: 3 })));
  assert.equal(err.line, 1);
});

test('raises CsvValidationError for a quoted field left open at end of input', async () => {
  const err = await captureRejection(collect(parseCsvStream(strings('a,"bcd'))));
  assert.match(err.message, /unterminated quoted field/);
  assert.equal(err.line, 1);
  assert.equal(err.char, 7);
});

test('parseCsvRecords keys each row by the header row', async () => {
  const records = await collect(parseCsvRecords(strings('name,age\nAlice,30\nBob,25\n')));
  assert.deepEqual(records, [
    { name: 'Alice', age: '30' },
    { name: 'Bob', age: '25' },
  ]);
});

test('toStrings reassembles a multi-byte character split across chunks', async () => {
  const full = new TextEncoder().encode('a€b'); // splits the euro sign's 3 UTF-8 bytes
  const chunk1 = full.slice(0, 2);
  const chunk2 = full.slice(2);
  const decoded = (await collect(toStrings(bytes(chunk1, chunk2)))).join('');
  assert.equal(decoded, 'a€b');
});
