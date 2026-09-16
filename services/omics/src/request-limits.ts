export const MAX_REQUEST_BYTES = 64 * 1024;

// Firebase/Express parses request bodies before tRPC. The adapter's stream limit
// does not run for pre-parsed bodies, so measure actual bytes as well as headers.
export function requestTooLarge(request: {
  headers: { "content-length"?: string };
  rawBody?: Buffer;
  body?: unknown;
}) {
  if (Number(request.headers["content-length"] || 0) > MAX_REQUEST_BYTES)
    return true;
  if (request.rawBody) return request.rawBody.byteLength > MAX_REQUEST_BYTES;
  if (request.body !== undefined) {
    try {
      return (
        Buffer.byteLength(
          typeof request.body === "string"
            ? request.body
            : JSON.stringify(request.body),
        ) > MAX_REQUEST_BYTES
      );
    } catch {
      return true;
    }
  }
  return false;
}
