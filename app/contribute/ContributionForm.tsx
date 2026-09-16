"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { getApps, initializeApp } from "firebase/app";
import {
  Auth,
  User,
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  setPersistence,
  signInWithEmailLink,
  signOut,
} from "firebase/auth";
import { createContributionClient } from "@/lib/omics-contributions";
import { displayValue } from "@/lib/omics";
import styles from "../database/database.module.css";

type ContributionType = "model" | "benchmark" | "result" | "correction";
interface Draft {
  type: ContributionType;
  title: string;
  summary: string;
  source_urls: string[];
  target_id?: string;
  name?: string;
  affiliation?: string;
  orcid?: string;
  public_credit: boolean;
  details: Record<string, string>;
}
interface Submission extends Draft {
  id: string;
  status: string;
  revisions?: {
    id: string;
    created_at: string;
    actor: string;
    status: string;
    note?: string;
    payload?: Partial<Draft>;
  }[];
  review_notes?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}
const apiUrl = process.env.NEXT_PUBLIC_OMICS_API_URL || "/api/trpc";
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
const configured = process.env.NEXT_PUBLIC_OMICS_CONTRIBUTIONS_ENABLED === "true" && !!(
  apiUrl &&
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);
const emailStorageKey = "rewire-omics-signin-email";
const emptyDraft: Draft = {
  type: "model",
  title: "",
  summary: "",
  source_urls: [],
  public_credit: false,
  details: {},
};
const resultFields = [
  "model",
  "benchmark",
  "protocol",
  "metric",
  "value",
  "source_locator",
];
function readDraft(record: Submission): Draft {
  return {
    type: record.type,
    title: record.title,
    summary: record.summary,
    source_urls: record.source_urls,
    target_id: record.target_id,
    name: record.name,
    affiliation: record.affiliation,
    orcid: record.orcid,
    public_credit: record.public_credit,
    details: record.details || {},
  };
}
export default function ContributionForm() {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [email, setEmail] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [pendingLink, setPendingLink] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [active, setActive] = useState<Submission | null>(null);
  const authRef = useRef<Auth | null>(null);
  const sessionEpoch = useRef(0);
  const createAttempt = useRef<{ payload: string; key: string } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type");
    const storedDraft = window.sessionStorage.getItem("rewire-omics-draft");
    if (storedDraft) {
      try {
        setDraft(JSON.parse(storedDraft) as Draft);
      } catch {
        /* Discard an invalid local draft. */
      }
      window.sessionStorage.removeItem("rewire-omics-draft");
    }
    const target = params.get("target_id");
    setDraft((current) => ({
      ...current,
      ...(type && ["model", "benchmark", "result", "correction"].includes(type)
        ? { type: type as ContributionType }
        : {}),
      ...(target ? { target_id: target } : {}),
    }));
    if (!configured) {
      setAuthReady(true);
      return;
    }
    const app =
      getApps().find((item) => item.name === "omics-contributions") ||
      initializeApp(firebaseConfig, "omics-contributions");
    const auth = getAuth(app);
    authRef.current = auth;
    const emulator = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL;
    if (
      emulator &&
      ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
      !auth.emulatorConfig
    )
      connectAuthEmulator(auth, emulator, { disableWarnings: true });
    let disposed = false;
    let unsubscribe = () => {};
    void (async () => {
      try {
        await setPersistence(auth, browserSessionPersistence);
        if (disposed) return;
        const href = window.location.href;
        if (isSignInWithEmailLink(auth, href)) {
          window.history.replaceState(null, "", window.location.pathname);
          const savedEmail = window.sessionStorage.getItem(emailStorageKey);
          if (savedEmail) {
            await signInWithEmailLink(auth, savedEmail, href);
            window.sessionStorage.removeItem(emailStorageKey);
            if (!disposed)
              setMessage(
                "Email verified. You can now submit evidence and view your contributions.",
              );
          } else if (!disposed) {
            setPendingLink(href);
            setMessage(
              "Enter the email address that received this link to finish verification.",
            );
          }
        }
        if (!disposed) {
          unsubscribe = onAuthStateChanged(auth, (current) => {
            setUser(current);
            setAuthReady(true);
          });
        }
      } catch {
        if (!disposed) {
          setError(
            "This sign-in link could not be verified. Request a new link below.",
          );
          setAuthReady(true);
        }
      }
    })();
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);
  function client(current: User) {
    return createContributionClient(apiUrl!, () => current.getIdToken());
  }
  async function refresh(current: User) {
    const epoch = sessionEpoch.current;
    const records = await client(current).submission.list.query();
    if (
      epoch === sessionEpoch.current &&
      authRef.current?.currentUser?.uid === current.uid
    )
      setSubmissions(records as unknown as Submission[]);
  }
  useEffect(() => {
    if (user)
      void refresh(user).catch(() =>
        setError(
          "Your contributions could not be loaded. Try signing in again.",
        ),
      );
    else {
      setSubmissions([]);
      setActive(null);
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  async function authenticate(event: FormEvent) {
    event.preventDefault();
    if (!authRef.current) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (pendingLink) {
        await signInWithEmailLink(authRef.current, email, pendingLink);
        setPendingLink("");
        window.sessionStorage.removeItem(emailStorageKey);
        setMessage("Email verified.");
      } else {
        window.sessionStorage.setItem(
          "rewire-omics-draft",
          JSON.stringify(draft),
        );
        await sendSignInLinkToEmail(authRef.current, email, {
          url: `${window.location.origin}/contribute/`,
          handleCodeInApp: true,
        });
        window.sessionStorage.setItem(emailStorageKey, email);
        setMessage(
          "Check your email for a sign-in link. Use the link to verify your address before submitting.",
        );
      }
    } catch {
      setError(
        "We could not complete email verification. Check your address or request a new link.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!configured || !user) return;
    const epoch = sessionEpoch.current;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const rpc = client(user);
      let id: string;
      const contribution = {
        ...draft,
        source_urls: draft.source_urls.map((url) => url.trim()).filter(Boolean),
      };
      if (active) {
        const { type: unused, ...patch } = contribution;
        void unused;
        await rpc.submission.update.mutate({ id: active.id, patch });
        id = active.id;
      } else {
        const payload = JSON.stringify(contribution);
        if (createAttempt.current?.payload !== payload)
          createAttempt.current = { payload, key: crypto.randomUUID() };
        id = (
          await rpc.submission.create.mutate({
            contribution,
            idempotencyKey: createAttempt.current.key,
          })
        ).id;
      }
      const record = await rpc.submission.get.query({ id });
      if (
        epoch !== sessionEpoch.current ||
        authRef.current?.currentUser?.uid !== user.uid
      )
        return;
      setActive(record as unknown as Submission);
      setMessage(
        active
          ? "Your revision has been saved for review."
          : "Your contribution has been submitted for review. It is not public yet.",
      );
      await refresh(user);
    } catch {
      setError(
        "The contribution could not be saved. Check the required fields and source links, then try again. Your text remains in this form.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function openSubmission(id: string) {
    if (!user) return;
    const epoch = sessionEpoch.current;
    setBusy(true);
    setError("");
    try {
      const record = (await client(user).submission.get.query({
        id,
      })) as unknown as Submission;
      if (
        epoch !== sessionEpoch.current ||
        authRef.current?.currentUser?.uid !== user.uid
      )
        return;
      setActive(record);
      setDraft(readDraft(record));
      setMessage("");
    } catch {
      setError("This contribution could not be loaded.");
    } finally {
      setBusy(false);
    }
  }
  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  const editable =
    !active ||
    ["unverified", "submitted", "changes_requested"].includes(active.status);
  function downloadDraft() {
    const blob = new Blob([JSON.stringify(draft, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rewire-contribution-draft.json";
    link.click();
    URL.revokeObjectURL(url);
    setMessage("Draft downloaded to your device. Nothing has been submitted.");
  }
  return (
    <>
      {!configured && (
        <div className={styles.notice}>
          <strong>Submissions are not open yet.</strong> You can prepare and
          download a draft below. Nothing is sent from this form while the
          contribution service is unconfigured.
        </div>
      )}
      <p>
        We cover omics and molecular models, including protein and DNA language
        models. Clinical chatbots, medical question answering and
        general-purpose assistants are outside this catalogue.
      </p>
      <p className={styles.muted}>
        Your email stays private and is used only for verification and
        contribution updates. There is no newsletter enrolment. Public credit is
        optional.
      </p>
      {configured && !user && (
        <form className={styles.form} onSubmit={authenticate}>
          <label className={styles.label}>
            Email for private access
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button className={styles.button} disabled={busy || !authReady}>
            {pendingLink ? "Verify this email" : "Email me a sign-in link"}
          </button>
        </form>
      )}
      {configured && user && (
        <div className={styles.notice}>
          <p>
            Signed in as {user.email}. Your contributions are visible only to
            you and the review team until publication.
          </p>
          <button
            className={styles.button}
            onClick={() => {
              sessionEpoch.current += 1;
              if (authRef.current) void signOut(authRef.current);
              setSubmissions([]);
              setActive(null);
              setEmail("");
              setPendingLink("");
              window.sessionStorage.removeItem(emailStorageKey);
              window.sessionStorage.removeItem("rewire-omics-draft");
              setDraft(emptyDraft);
              setMessage("");
            }}
          >
            Sign out
          </button>
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className={styles.notice} role="status">
          {message}
        </p>
      )}
      {submissions.length > 0 && (
        <section className={styles.section}>
          <h2>Your contributions</h2>
          <ul className={styles.list}>
            {submissions.map((item) => (
              <li key={item.id}>
                <button
                  className={styles.button}
                  disabled={busy}
                  onClick={() => void openSubmission(item.id)}
                >
                  {item.title} · {item.status.replace(/_/g, " ")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {active && (
        <section className={styles.section}>
          <h2>Contribution status: {active.status.replace(/_/g, " ")}</h2>
          <p className={styles.muted}>Reference: {active.id}</p>
          {!!active.review_notes && (
            <p>Review notes: {displayValue(active.review_notes)}</p>
          )}
          {!!active.revisions && (
            <details>
              <summary>Revision history</summary>
              <ol className={styles.list}>
                {active.revisions.map((revision) => (
                  <li key={revision.id}>
                    <strong>
                      {new Date(revision.created_at).toLocaleString("en-GB")}
                    </strong>
                    {" · "}
                    {revision.actor === "curator"
                      ? "Review team"
                      : "Contributor"}
                    {" · "}
                    {revision.status.replace(/_/g, " ")}
                    {revision.note && <p>{revision.note}</p>}
                    {revision.payload?.summary && (
                      <p>{revision.payload.summary}</p>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          )}
          {!editable && (
            <p>
              This contribution is currently locked for editing. Submit a
              correction if further changes are needed.
            </p>
          )}
          <button
            className={styles.button}
            onClick={() => {
              setActive(null);
              setDraft(emptyDraft);
              setMessage("");
            }}
          >
            Start a new contribution
          </button>
        </section>
      )}
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.label}>
          Contribution type
          <select
            value={draft.type}
            disabled={!!active}
            onChange={(event) =>
              update("type", event.target.value as ContributionType)
            }
          >
            <option value="model">Model</option>
            <option value="benchmark">Benchmark</option>
            <option value="result">Result</option>
            <option value="correction">Correction</option>
          </select>
        </label>
        <label className={styles.label}>
          Title
          <input
            required
            maxLength={300}
            value={draft.title}
            disabled={!editable}
            onChange={(event) => update("title", event.target.value)}
          />
        </label>
        <label className={styles.label}>
          Existing record ID{" "}
          {draft.type === "correction" ? "(required)" : "(optional)"}
          <input
            required={draft.type === "correction"}
            maxLength={200}
            value={draft.target_id || ""}
            disabled={!editable}
            onChange={(event) =>
              update("target_id", event.target.value || undefined)
            }
          />
        </label>
        <label className={styles.label}>
          What should we add or change?
          <textarea
            required
            minLength={10}
            maxLength={10000}
            value={draft.summary}
            disabled={!editable}
            onChange={(event) => update("summary", event.target.value)}
          />
        </label>
        <label className={styles.label}>
          Source URLs (one per line)
          <textarea
            required
            value={draft.source_urls.join("\n")}
            disabled={!editable}
            onChange={(event) =>
              update("source_urls", event.target.value.split("\n"))
            }
            placeholder="https://doi.org/…"
          />
        </label>
        {draft.type === "result" &&
          resultFields.map((field) => (
            <label className={styles.label} key={field}>
              {field === "source_locator"
                ? "Evidence location (table, figure, page or artifact row)"
                : field.replace(/_/g, " ")}
              <input
                required
                value={draft.details[field] || ""}
                disabled={!editable}
                onChange={(event) =>
                  update("details", {
                    ...draft.details,
                    [field]: event.target.value,
                  })
                }
              />
            </label>
          ))}
        <label className={styles.label}>
          Your name (optional)
          <input
            maxLength={200}
            value={draft.name || ""}
            disabled={!editable}
            onChange={(event) =>
              update("name", event.target.value || undefined)
            }
          />
        </label>
        <label className={styles.label}>
          Affiliation (optional)
          <input
            maxLength={300}
            value={draft.affiliation || ""}
            disabled={!editable}
            onChange={(event) =>
              update("affiliation", event.target.value || undefined)
            }
          />
        </label>
        <label className={styles.label}>
          ORCID URL (optional)
          <input
            type="url"
            value={draft.orcid || ""}
            disabled={!editable}
            onChange={(event) =>
              update("orcid", event.target.value || undefined)
            }
            placeholder="https://orcid.org/…"
          />
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={draft.public_credit}
            disabled={!editable}
            onChange={(event) => update("public_credit", event.target.checked)}
          />
          Credit me publicly if this contribution is published. This does not
          publish my email.
        </label>
        {configured ? (
          <>
            <button
              className={styles.button}
              type="submit"
              disabled={!user || busy || !editable}
            >
              {active ? "Save revision" : "Submit for review"}
            </button>
            {!user && (
              <p className={styles.muted}>
                Verify your email above to submit. Your draft stays in this page
                until then.
              </p>
            )}
          </>
        ) : (
          <button
            className={styles.button}
            type="button"
            onClick={downloadDraft}
          >
            Download draft
          </button>
        )}
      </form>
    </>
  );
}
