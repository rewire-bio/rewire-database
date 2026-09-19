import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

/** Hash arbitrary-size files with a fixed-size read buffer. */
export function fileSha256(file: string): string {
  const hash = createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytes: number;
    while ((bytes = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0)
      hash.update(buffer.subarray(0, bytes));
    return hash.digest("hex");
  } finally {
    fs.closeSync(fd);
  }
}
export function chunksSha256(chunks: Iterable<string>): string {
  const hash = createHash("sha256");
  for (const chunk of chunks) hash.update(chunk);
  return hash.digest("hex");
}
/** Stage exact UTF-8 bytes, reject immutable drift, then install atomically. */
export function writeImmutableChunks(
  file: string,
  chunks: Iterable<string>,
): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${randomUUID()}.tmp`,
  );
  const fd = fs.openSync(temp, "wx");
  const hash = createHash("sha256");
  try {
    for (const chunk of chunks) {
      fs.writeFileSync(fd, chunk, "utf8");
      hash.update(chunk);
    }
    fs.fsyncSync(fd);
  } catch (error) {
    fs.closeSync(fd);
    fs.unlinkSync(temp);
    throw error;
  }
  fs.closeSync(fd);
  const digest = hash.digest("hex");
  try {
    if (fs.existsSync(file)) {
      if (fileSha256(file) !== digest)
        throw Error(`Attempt to overwrite immutable release ${file}`);
    } else {
      // Hard-link installation cannot overwrite a concurrent writer's file.
      try {
        fs.linkSync(temp, file);
      } catch (error) {
        if (!fs.existsSync(file) || fileSha256(file) !== digest) throw error;
      }
    }
  } finally {
    fs.unlinkSync(temp);
  }
  return digest;
}
