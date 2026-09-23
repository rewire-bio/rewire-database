// The production workflow must not silently drop analytics on a future build.
if (!/^G-[A-Z0-9]+$/.test(process.env.NEXT_PUBLIC_GA_ID || "")) {
  throw new Error("Set repository variable NEXT_PUBLIC_GA_ID to the approved public GA4 measurement ID before building for deployment.");
}
console.log("Public analytics measurement ID configured; visitor consent remains required.");
