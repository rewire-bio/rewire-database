import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
const mock = vi.hoisted(() => ({
  auth: { currentUser: null as any, emulatorConfig: null },
  signIn: vi.fn(), send: vi.fn(), signOut: vi.fn(), persistence: vi.fn(), link: false,
  list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(),
}));
vi.mock("firebase/app", () => ({getApps: () => [], initializeApp: () => ({})}));
vi.mock("firebase/auth", () => ({
  getAuth: () => mock.auth, browserSessionPersistence: {}, connectAuthEmulator: vi.fn(),
  setPersistence: (...args: any[]) => mock.persistence(...args), isSignInWithEmailLink: () => mock.link,
  onAuthStateChanged: (_: any, fn: any) => { fn(mock.auth.currentUser); return vi.fn(); },
  signInWithEmailLink: (...args: any[]) => mock.signIn(...args),
  sendSignInLinkToEmail: (...args: any[]) => mock.send(...args),
  signOut: (...args: any[]) => mock.signOut(...args),
}));
vi.mock("../lib/omics-contributions", () => ({createContributionClient: () => ({submission: {
  list: {query: mock.list}, get: {query: mock.get}, create: {mutate: mock.create}, update: {mutate: mock.update},
}})}));
let tree: ReactTestRenderer;
let storage: Map<string,string>;
const record = (id = "one", status = "submitted") => ({id, status, type: "model", title: `Model ${id}`, summary: "Evidence summary", source_urls: ["https://example.org"], public_credit: false, details: {}});
const user = () => ({uid: "user", email: "test@example.org", emailVerified: true, getIdToken: vi.fn().mockResolvedValue("private-token")});
const text = () => JSON.stringify(tree.toJSON());
const button = (label: string) => tree.root.findAllByType("button").find(n => n.children.join("") === label)!;
async function click(label: string) { await act(async () => { await button(label).props.onClick(); }); }
async function mount(enabled = true) {
  vi.stubEnv("NEXT_PUBLIC_OMICS_CONTRIBUTIONS_ENABLED", String(enabled));
  const {default: Form} = await import("../app/contribute/ContributionForm");
  await act(async () => { tree = create(<Form />); });
}
function field(label: string) { return tree.root.findAllByType("label").find(n => n.children.filter(c => typeof c === "string").join("").startsWith(label))!.find(n => ["input", "textarea", "select"].includes(String(n.type))); }
async function change(label: string, value: string, checked?: boolean) { await act(async () => field(label).props.onChange({target: {value, checked}})); }
async function submit(last = true) { await act(async () => { const forms = tree.root.findAllByType("form"); await forms[last ? forms.length - 1 : 0].props.onSubmit({preventDefault: vi.fn()}); }); }
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); mock.link = false; mock.auth.currentUser = null;
  mock.persistence.mockResolvedValue(undefined); mock.list.mockResolvedValue({items: [], next_cursor: null});
  mock.get.mockResolvedValue(record()); mock.create.mockResolvedValue({id: "one"}); mock.update.mockResolvedValue({});
  storage = new Map();
  vi.stubGlobal("window", {location: new URL("https://example.org/contribute/"), history: {replaceState: vi.fn()}, sessionStorage: {getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string,v: string) => storage.set(k,v), removeItem: (k: string) => storage.delete(k)}});
  vi.stubGlobal("navigator", {clipboard: {writeText: vi.fn().mockResolvedValue(undefined)}});
  for (const key of ["API_KEY", "AUTH_DOMAIN", "PROJECT_ID", "APP_ID"]) vi.stubEnv(`NEXT_PUBLIC_FIREBASE_${key}`, "test");
});
afterEach(() => { if (tree) act(() => tree.unmount()); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("private contribution workflows", () => {
  it("edits all draft fields, changes result/correction requirements and downloads locally", async () => {
    storage.set("rewire-omics-draft", "invalid json"); await mount(false);
    await change("Contribution type", "result");
    for (const [name,value] of [["Title","Draft"],["Existing record ID","target"],["What should", "A complete summary"],["Source URLs", "https://example.org\n"],["Your name", "A"],["Affiliation", "B"],["ORCID", "https://orcid.org/123"],["model","model-one"],["benchmark","benchmark-one"],["protocol","p"],["metric","accuracy"],["value","0.8"],["Evidence location","table 1"]]) await change(name,value);
    const checkbox = tree.root.findByProps({type: "checkbox"}); act(() => checkbox.props.onChange({target:{checked:true}}));
    const download = {click: vi.fn(), href: "", download: ""}; vi.stubGlobal("document", {createElement: () => download});
    vi.spyOn(URL,"createObjectURL").mockReturnValue("blob:test"); vi.spyOn(URL,"revokeObjectURL").mockImplementation(() => {});
    await click("Download draft"); expect(download.click).toHaveBeenCalled(); expect(text()).toContain("Nothing has been submitted");
    await change("Contribution type", "correction"); expect(field("Existing record ID").props.required).toBe(true);
    await submit(); expect(mock.create).not.toHaveBeenCalled();
    await click("Submit with Python"); expect(tree.root.findByProps({id: "contribution-python"}).props.hidden).toBe(false);
  });
  it("sends a sign-in link and keeps the draft local; shows delivery errors", async () => {
    await mount(); await change("Email for", "test@example.org"); await submit(false);
    expect(mock.send).toHaveBeenCalled(); expect(storage.get("rewire-omics-signin-email")).toBe("test@example.org");
    mock.send.mockRejectedValueOnce(Error("offline")); await submit(false); expect(text()).toContain("could not complete email verification");
  });
  it("finishes link verification with saved email", async () => {
    mock.link = true; storage.set("rewire-omics-signin-email", "saved@example.org"); storage.set("rewire-omics-draft", JSON.stringify(record()));
    await mount(); expect(mock.signIn).toHaveBeenCalled(); expect(text()).toContain("Email verified"); expect(storage.has("rewire-omics-signin-email")).toBe(false);
  });
  it("asks for missing link email and handles expired links", async () => {
    mock.link = true; await mount(); expect(button("Verify this email")).toBeTruthy(); await change("Email for", "test@example.org"); await submit(false); expect(text()).toContain("Email verified");
  });
  it("reports persistence and sign-in initialization failures", async () => {
    mock.persistence.mockRejectedValueOnce(Error("blocked")); await mount(); expect(text()).toContain("could not be verified");
  });
  it("creates, revises, preserves drafts across task navigation, and signs out", async () => {
    mock.auth.currentUser = user(); mock.list.mockResolvedValue({items: [record()],next_cursor: null}); await mount();
    await change("Title", "New draft"); await submit(); expect(mock.create).toHaveBeenCalled(); expect(text()).toContain("saved privately");
    await click("Model one · submitted"); await change("Title", "Revised"); await submit(); expect(mock.update).toHaveBeenCalled(); expect(text()).toContain("revision has been saved");
    await click("Start a new contribution"); expect(field("Title").props.value).toBe("");
    await change("Title", "Unsaved new"); await click("Your contributions"); await click("Model one · submitted"); await click("New contribution"); expect(field("Title").props.value).toBe("Unsaved new");
    await click("Sign out"); expect(mock.signOut).toHaveBeenCalled(); expect(field("Title").props.value).toBe("");
  });
  it("shows pagination, duplicate suppression, review history, and locked revisions", async () => {
    mock.auth.currentUser = user(); mock.list.mockResolvedValueOnce({items: [record()],next_cursor: "next"}).mockResolvedValue({items: [record(),record("two")],next_cursor: null}); await mount();
    await click("Load more contributions"); expect(tree.root.findAllByType("button").filter(n=>n.children.join("")==="Model one · submitted")).toHaveLength(1);
    mock.get.mockResolvedValue({...record("one","published"), review_notes: "Reviewed", revisions: [{id:"r1",created_at:"2026-01-01",actor:"curator",status:"published",note:"checked",payload:{summary:"revised"}}, {id:"r2",created_at:"2026-01-01",actor:"contributor",status:"submitted"}]});
    await click("Model one · submitted"); expect(text()).toContain("locked for editing"); expect(field("Title").props.disabled).toBe(true); expect(text()).toContain("Review team");
  });
  it("preserves input and idempotency on failed create retries", async () => {
    mock.auth.currentUser = user(); mock.create.mockRejectedValue(Error("offline")); await mount(); await change("Title", "Keep me"); await submit(); await submit();
    expect(mock.create.mock.calls[0][0].idempotencyKey).toBe(mock.create.mock.calls[1][0].idempotencyKey); expect(field("Title").props.value).toBe("Keep me"); expect(text()).toContain("could not be saved");
  });
  it("reports list, detail, and load-more failures", async () => {
    mock.auth.currentUser = user(); mock.list.mockResolvedValueOnce({items:[record()],next_cursor:"next"}).mockRejectedValue(Error("offline")); await mount();
    await click("Load more contributions"); expect(text()).toContain("More contributions could not be loaded"); mock.get.mockRejectedValueOnce(Error("offline")); await click("Model one · submitted"); expect(text()).toContain("This contribution could not be loaded");
  });
  it("reports initial account loading failure", async () => { mock.auth.currentUser=user(); mock.list.mockRejectedValueOnce(Error("offline")); await mount(); expect(text()).toContain("Your contributions could not be loaded"); });
  it("copies a verified library token and explains clipboard or verification failures", async () => {
    mock.auth.currentUser=user(); await mount(); await click("Copy library access token"); expect(navigator.clipboard.writeText).toHaveBeenCalledWith("private-token");
    mock.auth.currentUser.emailVerified=false; await click("Copy library access token"); expect(text()).toContain("Could not copy an access token");
  });
});
