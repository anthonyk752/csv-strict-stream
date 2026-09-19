// Shared plumbing for turning fixture data into the async iterables the
// library expects, and for draining an async iterable back into an array
// so assertions can compare against a plain value.

export async function* strings(...parts: string[]): AsyncGenerator<string> {
  for (const part of parts) yield part;
}

export async function* bytes(...parts: Uint8Array[]): AsyncGenerator<Uint8Array> {
  for (const part of parts) yield part;
}

export async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iter) out.push(item);
  return out;
}
