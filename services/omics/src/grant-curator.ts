import { firebase } from "./firebase.js";

// Operator-only bootstrap. Never creates an identity or marks an email verified.
const [email, confirmation] = process.argv.slice(2);
const project = process.env.GCLOUD_PROJECT;
if (!project || !email || confirmation !== "--grant") {
  throw new Error("Set GCLOUD_PROJECT and run grant-curator EMAIL --grant using operator credentials.");
}
if (project === "rewire-it" && email !== "tim@rewire.it") {
  throw new Error("Production bootstrap is restricted to the initial Rewire curator.");
}
const { auth, db } = firebase();
try {
  const user = await auth.getUserByEmail(email);
  if (!user.emailVerified || user.disabled) {
    throw new Error("The curator must first complete email verification and have an active account.");
  }
  await auth.setCustomUserClaims(user.uid, { ...user.customClaims, curator: true });
  console.log("Curator role granted. Refresh the verified session before using the curator CLI.");
} finally {
  await db.terminate();
}
