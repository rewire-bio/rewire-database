/** Optional cross-repository contract test: install the reviewed SDK wheel in
 * REWIRE_SDK_PYTHON's environment, then run this script under local emulators.
 * Normal builds/tests never require the runner repository or model dependencies.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import {
  contributionHttpHandler,
  deployedContributionHttpHandler,
} from "../src/http-handler.js";
import { sdkBundle } from "./fixtures.js";
import { firebase } from "../src/firebase.js";

const python = process.env.REWIRE_SDK_PYTHON;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
assert.ok(
  python && authHost && firestoreHost,
  "Set REWIRE_SDK_PYTHON and run under Auth/Firestore emulators",
);
for (const host of [authHost, firestoreHost])
  assert.match(
    host,
    /^(127\.0\.0\.1|localhost):\d+$/,
    "Only local emulators may be used",
  );
const project = process.env.GCLOUD_PROJECT || "demo-rewire-omics";
assert.ok(project.startsWith("demo-"), "Use a demo project for SDK validation");
async function authRequest(path: string, body: unknown) {
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:${path}?key=demo-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  assert.equal(response.status, 200);
  return (await response.json()) as any;
}
const email = `${randomUUID()}@example.org`;
await authRequest("sendOobCode", {
  requestType: "EMAIL_SIGNIN",
  email,
  continueUrl: "http://localhost:3000/contribute/",
  canHandleCodeInApp: true,
});
const codes = (await fetch(
  `http://${authHost}/emulator/v1/projects/${project}/oobCodes`,
).then((r) => r.json())) as any;
const code = codes.oobCodes.findLast((c: any) => c.email === email).oobCode;
const signed = await authRequest("signInWithEmailLink", {
  email,
  oobCode: code,
});
const server = createServer(contributionHttpHandler);
const disabledServer = createServer(deployedContributionHttpHandler);
delete process.env.OMICS_CONTRIBUTIONS_ENABLED;
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
await new Promise<void>((resolve) =>
  disabledServer.listen(0, "127.0.0.1", resolve),
);
const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/trpc`;
const disabledEndpoint = `http://127.0.0.1:${(disabledServer.address() as { port: number }).port}/api/trpc`;
try {
  const { stdout } = await promisify(execFile)(
    python!,
    [
      "-c",
      String.raw`
import json, os
from rewirebench import submit
from rewirebench.submission import SubmissionError
bundle=json.loads(os.environ['REWIRE_TEST_BUNDLE'])
kwargs=dict(title='Private local SDK test', summary='Local SDK and emulator contract test only.', source_url='https://example.org/rewire-sdk-test',metric='AUROC',value='0.77',source_locator='Synthetic fixture',endpoint=os.environ['REWIRE_TEST_ENDPOINT'])
preview=submit(bundle,dry_run=True,**kwargs)
assert preview['contribution']['details']['rewire_bundle']==bundle
first=submit(bundle,token=os.environ['REWIRE_TEST_TOKEN'],**kwargs)
second=submit(bundle,token=os.environ['REWIRE_TEST_TOKEN'],**kwargs)
assert first==second
assert first['submission']['status']=='submitted'
assert first['publication_status']=='pending_review'
for endpoint, token, message in [(os.environ['REWIRE_DISABLED_ENDPOINT'],os.environ['REWIRE_TEST_TOKEN'],'disabled'),(os.environ['REWIRE_TEST_ENDPOINT'],'invalid','Verify your email')]:
    try:
        submit(bundle,token=token,**{**kwargs,'endpoint':endpoint})
        raise AssertionError('Expected a safe submission failure')
    except SubmissionError as error:
        assert message in str(error)
        assert os.environ['REWIRE_TEST_TOKEN'] not in str(error)
print(json.dumps({'python_sdk_to_emulator':'passed','idempotent_retry':'passed','verified_email':'passed','production_disabled':'passed','invalid_token_redacted':'passed'}))
`,
    ],
    {
      env: {
        ...process.env,
        REWIRE_TEST_TOKEN: signed.idToken,
        REWIRE_TEST_ENDPOINT: endpoint,
        REWIRE_DISABLED_ENDPOINT: disabledEndpoint,
        REWIRE_TEST_BUNDLE: JSON.stringify(sdkBundle),
      },
      timeout: 60000,
    },
  );
  console.log(stdout.trim());
} finally {
  for (const instance of [server, disabledServer]) {
    instance.closeAllConnections();
    await new Promise<void>((resolve) => instance.close(() => resolve()));
  }
  await firebase().db.terminate();
}
