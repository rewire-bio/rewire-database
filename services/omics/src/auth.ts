import { TRPCError } from "@trpc/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { firebase } from "./firebase.js";

export type Context = { user: DecodedIdToken | null };
export async function context(authorization?: string): Promise<Context> {
  if (!authorization) return { user: null };
  if (!authorization.startsWith("Bearer "))
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Sign in with your verified email.",
    });
  try {
    const user = await firebase().auth.verifyIdToken(
      authorization.slice(7),
      true,
    );
    if (!user.email_verified || !user.email)
      throw new Error("Unverified email");
    return { user };
  } catch {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Sign in with your verified email.",
    });
  }
}
