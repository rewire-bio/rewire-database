/** Shared public-release boundary for static exports, rendering and API reads.
 * Reject forbidden keys recursively; never include private values in errors.
 */
export const privateFieldNames = [
  "email",
  "email_address",
  "contact_email",
  "token",
  "token_hash",
  "private_correspondence",
  "owner_uid",
  "id_token",
  "session_token",
  "access_token",
  "private_notes",
  "password",
  "verification_token",
] as const;
const privateFields = new Set<string>(privateFieldNames);

export function assertNoPrivateFields(
  value: unknown,
  message = "Private data cannot enter a public catalogue release.",
): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (privateFields.has(key.toLowerCase())) throw new Error(message);
    assertNoPrivateFields(child, message);
  }
}
