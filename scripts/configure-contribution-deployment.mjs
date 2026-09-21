import { writeFile } from "node:fs/promises";
import { contributionDeployment, serviceEnvironment } from "./contribution-deployment.mjs";

const config = contributionDeployment();
if (!process.argv.includes("--validate-only")) {
  await writeFile(new URL("../services/omics/.env", import.meta.url), serviceEnvironment(config), { mode: 0o600, flag: "wx" });
}
console.log(`Contribution configuration validated: backend=${config.backend}, frontend=${config.frontend}, mail=${config.mail}`);
