/**
 * Minimal streaming ZIP writer (STORE method).
 *
 * Images are already compressed, so storing them avoids wasting CPU on deflate
 * while keeping the archive fully standard. UTF-8 file names are enabled.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * Computes a ZIP/PNG-compatible CRC32 checksum.
 * @param data - Decoded image or binary bytes.
 * @param seed - Initial CRC value.
 * @returns The CRC32 checksum.
 */
export function crc32(data: Uint8Array, seed = 0): number {
  let c = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;
const FLAG_UTF8 = 0x0800;
const VERSION = 20;

type CentralEntry = {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
};

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(fn, fn);
    this.tail = result.then(
      () => null,
      () => null,
    );
    return result;
  }
}

/** Writes ZIP entries one by one and finishes with the central directory. */
export class ZipWriter {
  private sink: ReturnType<ReturnType<typeof Bun.file>["writer"]>;
  private entries: CentralEntry[] = [];
  private offset = 0;
  private closed = false;
  private lock = new Mutex();

  /**
   * Creates a writer for a new ZIP archive.
   * @param path - ZIP archive output path.
   */
  constructor(private readonly path: string) {
    this.sink = Bun.file(path).writer();
  }

  /**
   * Appends one stored entry; safe to call concurrently.
   * @param name - ZIP entry name.
   * @param data - Decoded image or binary bytes.
   * @returns A promise resolved when the entry is written.
   */
  add(name: string, data: Uint8Array): Promise<void> {
    return this.lock.run(async () => {
      if (this.closed) throw new Error("ZIP đã được đóng");
      const encodedName = new TextEncoder().encode(name);
      const crc = crc32(data);
      const { time, date } = dosDateTime(new Date());
      const offset = this.offset;

      const header = new Uint8Array(30 + encodedName.length);
      const view = new DataView(header.buffer);
      view.setUint32(0, LOCAL_HEADER, true);
      view.setUint16(4, VERSION, true);
      view.setUint16(6, FLAG_UTF8, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, time, true);
      view.setUint16(12, date, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, data.length, true);
      view.setUint32(22, data.length, true);
      view.setUint16(26, encodedName.length, true);
      view.setUint16(28, 0, true);
      header.set(encodedName, 30);

      this.sink.write(header);
      this.sink.write(data);
      this.offset += header.length + data.length;
      this.entries.push({ name: encodedName, crc, size: data.length, offset, time, date });
    });
  }

  /** Writes the central directory and flushes the file. */
  async close(): Promise<void> {
    await this.lock.run(async () => {
      if (this.closed) return;
      this.closed = true;
      const centralStart = this.offset;

      for (const entry of this.entries) {
        const header = new Uint8Array(46 + entry.name.length);
        const view = new DataView(header.buffer);
        view.setUint32(0, CENTRAL_HEADER, true);
        view.setUint16(4, VERSION, true);
        view.setUint16(6, VERSION, true);
        view.setUint16(8, FLAG_UTF8, true);
        view.setUint16(10, 0, true);
        view.setUint16(12, entry.time, true);
        view.setUint16(14, entry.date, true);
        view.setUint32(16, entry.crc, true);
        view.setUint32(20, entry.size, true);
        view.setUint32(24, entry.size, true);
        view.setUint16(28, entry.name.length, true);
        view.setUint16(30, 0, true);
        view.setUint16(32, 0, true);
        view.setUint16(34, 0, true);
        view.setUint16(36, 0, true);
        view.setUint32(38, 0, true);
        view.setUint32(42, entry.offset, true);
        header.set(entry.name, 46);
        this.sink.write(header);
        this.offset += header.length;
      }

      const centralSize = this.offset - centralStart;
      const end = new Uint8Array(22);
      const endView = new DataView(end.buffer);
      endView.setUint32(0, END_OF_CENTRAL, true);
      endView.setUint16(4, 0, true);
      endView.setUint16(6, 0, true);
      endView.setUint16(8, this.entries.length, true);
      endView.setUint16(10, this.entries.length, true);
      endView.setUint32(12, centralSize, true);
      endView.setUint32(16, centralStart, true);
      endView.setUint16(20, 0, true);
      this.sink.write(end);
      this.offset += end.length;

      await this.sink.end();
    });
  }

  /**
   * Returns the number of bytes written to the ZIP archive.
   * @returns Number of bytes written so far.
   */
  get bytesWritten(): number {
    return this.offset;
  }
}
