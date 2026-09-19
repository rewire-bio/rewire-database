import { expect, it } from "vitest";
import { hostingVersion } from "../scripts/deployment-transaction.mjs";
it("captures the exact CLI Hosting version for both resource-name formats", () => {
  for (const prefix of ["sites/rewire-it", "projects/rewire-it/sites/rewire-it"]) {
    const listing = {result:{channels:[{name:`${prefix}/channels/live`, release:{version:{name:`${prefix}/versions/feff81cc64c82e46`}}}]}};
    expect(hostingVersion(listing, "rewire-it", "rewire-it")).toBe("feff81cc64c82e46");
    listing.result.channels[0].release.version.name = "projects/other/sites/rewire-it/versions/wrong";
    expect(() => hostingVersion(listing, "rewire-it", "rewire-it")).toThrow();
  }
  expect(() => hostingVersion({result:{channels:[]}}, "rewire-it", "rewire-it")).toThrow();
});
