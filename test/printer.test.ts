import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCsvRow, printCsvStream, formatAsTable } from '../src/printer.js';
import { collect } from './helpers.js';

test('formatCsvRow leaves plain fields unquoted', () => {
  assert.equal(formatCsvRow(['a', 'b', 'c']), 'a,b,c');
});

test('formatCsvRow quotes a field containing the delimiter', () => {
  assert.equal(formatCsvRow(['a', 'b,c', 'd']), 'a,"b,c",d');
});

test('formatCsvRow escapes quote characters and wraps the field', () => {
  assert.equal(formatCsvRow(['a', 'say "hi"', 'b']), 'a,"say ""hi""",b');
});

test('formatCsvRow quotes a field containing a newline', () => {
  assert.equal(formatCsvRow(['a', 'b\nc']), 'a,"b\nc"');
});

test('formatCsvRow honors a custom delimiter and quote character', () => {
  assert.equal(formatCsvRow(['a', 'b;c'], { delimiter: ';', quote: "'" }), "a;'b;c'");
});

test('printCsvStream serializes each row on its own line', async () => {
  const rows = [
    ['sku', 'name', 'price'],
    ['1024', 'widget, deluxe', '19.99'],
  ];
  const lines = await collect(printCsvStream(rows));
  assert.equal(lines.join(''), 'sku,name,price\n1024,"widget, deluxe",19.99\n');
});

test('printCsvStream honors a custom line ending', async () => {
  const lines = await collect(printCsvStream([['a', 'b']], { lineEnding: '\r\n' }));
  assert.equal(lines.join(''), 'a,b\r\n');
});

test('formatAsTable returns an empty string for no rows', () => {
  assert.equal(formatAsTable([]), '');
});

test('formatAsTable pads columns to the widest cell', () => {
  const table = formatAsTable([
    ['sku', 'name', 'price'],
    ['1024', 'widget', '19.99'],
  ]);
  assert.equal(
    table,
    [
      '+------+--------+-------+',
      '| sku  | name   | price |',
      '+------+--------+-------+',
      '| 1024 | widget | 19.99 |',
      '+------+--------+-------+',
    ].join('\n'),
  );
});

test('formatAsTable fills in missing trailing cells on ragged rows', () => {
  const table = formatAsTable([
    ['a', 'b'],
    ['1'],
  ]);
  assert.equal(table, ['+---+---+', '| a | b |', '+---+---+', '| 1 |   |', '+---+---+'].join('\n'));
});
