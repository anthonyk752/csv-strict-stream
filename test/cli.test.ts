import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCli } from '../src/cli.js';
import type { Io } from '../src/cli.js';
import { bytes } from './helpers.js';

const enc = new TextEncoder();

function fakeIo(files: Record<string, string>, stdin = ''): Io & { stdout: string; stderr: string } {
  const io = {
    stdout: '',
    stderr: '',
    stdin: bytes(enc.encode(stdin)),
    open(path: string) {
      if (!(path in files)) throw new Error(`no such file: ${path}`);
      return bytes(enc.encode(files[path]));
    },
    out(text: string) {
      io.stdout += text;
    },
    err(text: string) {
      io.stderr += text;
    },
  };
  return io;
}

test('validate reports row and column counts', async () => {
  const io = fakeIo({ 'a.csv': 'x,y\n1,2\n3,4\n' });
  assert.equal(await runCli(['validate', 'a.csv'], io), 0);
  assert.equal(io.stdout, 'ok: 3 rows, 2 columns\n');
});

test('validate exits 1 and names the file on a ragged row', async () => {
  const io = fakeIo({ 'bad.csv': 'x,y\n1,2,3\n' });
  assert.equal(await runCli(['validate', 'bad.csv'], io), 1);
  assert.match(io.stderr, /^bad\.csv: line 2/);
  assert.equal(io.stdout, '');
});

test('validate honours --columns and --delimiter', async () => {
  const io = fakeIo({ 'a.tsv': 'x;y;z\n1;2;3\n' });
  assert.equal(await runCli(['validate', '-d', ';', '-c', '2', 'a.tsv'], io), 1);
  assert.match(io.stderr, /expected 2 fields but found 3/);
});

test('pretty prints a table', async () => {
  const io = fakeIo({ 'a.csv': 'sku,name\n1024,widget\n' });
  assert.equal(await runCli(['pretty', 'a.csv'], io), 0);
  assert.equal(
    io.stdout,
    ['+------+--------+', '| sku  | name   |', '+------+--------+', '| 1024 | widget |', '+------+--------+', ''].join('\n'),
  );
});

test('pretty --limit truncates and says so', async () => {
  const io = fakeIo({ 'a.csv': 'h\n1\n2\n3\n' });
  assert.equal(await runCli(['pretty', '-n', '2', 'a.csv'], io), 0);
  assert.match(io.stdout, /\| h \|\n\+---\+\n\| 1 \|\n\+---\+\n\(showing first 2 rows\)\n$/);
});

test('a dash reads standard input', async () => {
  const io = fakeIo({}, 'a,b\n1,2\n');
  assert.equal(await runCli(['validate', '-'], io), 0);
  assert.equal(io.stdout, 'ok: 2 rows, 2 columns\n');
});

test('usage errors exit 2', async () => {
  for (const argv of [[], ['validate'], ['frobnicate', 'a.csv'], ['validate', '--nope', 'a.csv'], ['validate', '-d', ',,', 'a.csv'], ['validate', '-n', '0', 'a.csv']]) {
    const io = fakeIo({ 'a.csv': 'a\n' });
    assert.equal(await runCli(argv, io), 2, argv.join(' '));
    assert.match(io.stderr, /usage:/);
  }
});

test('--help prints usage and exits 0', async () => {
  const io = fakeIo({});
  assert.equal(await runCli(['--help'], io), 0);
  assert.match(io.stdout, /^usage:/);
});
