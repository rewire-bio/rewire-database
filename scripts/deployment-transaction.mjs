/** A correction retains its first publication when carried into later releases. */
export function verifyResolutionPublications(actual, published) {
  const expected = new Map(published.map((row) => [row.id, row.published_release_id]));
  for (const row of actual) {
    if (!expected.has(row.id) || expected.get(row.id) !== row.published_release_id)
      throw new Error(`Correction publication differs from the release artifact: ${row.id}`);
  }
}

/** Roll back both surfaces even when a deploy command fails after publishing. */
export async function deployCatalogue(actions) {
  const previous = await actions.capture();
  if (!previous.release_id || !previous.hosting_version)
    throw new Error(
      "An existing catalogue release and Hosting version are required for rollback.",
    );
  // The preflight must settle before any rollback tracking: a stale UI build
  // must not restore an older version over an intervening publication.
  const reuseCatalogue = actions.canReuseCatalogue
    ? await actions.canReuseCatalogue(previous) : false;
  if (!reuseCatalogue) await actions.importRelease();
  let activationAttempted = false;
  let hostingAttempted = false;
  try {
    if (!reuseCatalogue) {
      activationAttempted = true;
      await actions.activate();
    }
    await actions.verifyApi();
    if (actions.publishHosting) {
      // REST drafts do not affect live traffic. Mark only the final release
      // request, including an ambiguous response that may already be live.
      await actions.publishHosting(previous, () => { hostingAttempted = true; });
    } else {
      hostingAttempted = true;
      await actions.deployHosting();
    }
    await actions.verifyWebsite();
  } catch (cause) {
    const failures = [cause];
    if (hostingAttempted) {
      try {
        await actions.restoreHosting(previous.hosting_version);
      } catch (error) {
        failures.push(error);
      }
    }
    if (activationAttempted) {
      try {
        await actions.restoreRelease(previous.release_id);
      } catch (error) {
        failures.push(error);
      }
    }
    throw new AggregateError(
      failures,
      failures.length === 1
        ? "Deployment failed; previous Hosting version and catalogue pointer retained or restored."
        : "Deployment failed and rollback needs operator attention.",
    );
  }
}

/** Retry only transient transport/server failures; contract mismatches fail immediately. */
export async function fetchWithRetry(url, options = {}) {
  const {
    fetchImpl = fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    attempts = 3,
    timeoutMs = 30_000,
    expectedStatus = 200,
    expectedContentType,
    ...request
  } = options;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchImpl(url, {
        ...request,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (
        (response.status === expectedStatus &&
          (!expectedContentType ||
            response.headers
              .get("content-type")
              ?.includes(expectedContentType))) ||
        ![429, 500, 502, 503, 504].includes(response.status) ||
        attempt === attempts - 1
      )
        return response;
      await response.body?.cancel();
    } catch (error) {
      if (attempt === attempts - 1) throw error;
    }
    await sleep(1000 * 2 ** attempt);
  }
  throw new Error("No probe attempts configured");
}
/** Firebase CLI may return either project-qualified or site-qualified names. */
export function hostingVersion(listing, project, site) {
  const prefixes = [`sites/${site}`, `projects/${project}/sites/${site}`];
  const live = listing.result?.channels?.find(channel =>
    prefixes.some(prefix => channel.name === `${prefix}/channels/live`));
  const name = live?.release?.version?.name;
  if (typeof name !== "string") throw new Error("Cannot capture current Hosting version");
  const prefix = prefixes.find(value => name.startsWith(`${value}/versions/`));
  const version = prefix && name.slice(`${prefix}/versions/`.length);
  if (!version || !/^[a-zA-Z0-9_-]+$/.test(version)) throw new Error("Invalid Hosting version identity");
  return version;
}
