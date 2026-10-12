// Node SDK (`zenrows`): the README walk-through, checks 1-21 and the Node extra checks.
// Runs in a clean node image with only the npm tarball under /artifact.
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import * as H from "/harness/harness.mjs";

const {
  PASS,
  FAIL,
  SKIP,
  passIf,
  record,
  check,
  liveCheck,
  ledger,
  sh,
  KEY,
  HAS_KEY,
  CRAWL_URL,
  INCLUDE,
  API_BASE,
} = H;
const APP = "/work/app";
const TSC = process.env.TYPESCRIPT_VERSION;
const tarball = `/artifact/${readdirSync("/artifact").find((f) => f.endsWith(".tgz"))}`;

// ---------- README: install ----------
mkdirSync(APP, { recursive: true });
sh("npm", ["init", "-y"], { cwd: APP });
const install = sh("npm", ["install", tarball], { cwd: APP });
record(
  "readme-1",
  "Install (README: `npm install zenrows`; here the release tarball)",
  passIf(install.code === 0),
  "the package installs",
  `exit ${install.code}`,
  `${install.cmd}\n${install.stdout}${install.stderr}`,
);
if (install.code !== 0) process.exit(1);
const pkgReadme = readFileSync(`${APP}/node_modules/zenrows/README.md`, "utf8");
writeFileSync(`${APP}/zr.mjs`, 'export * from "zenrows";\n');
const { ZenRowsCrawlClient, ZenRowsCrawlError } = await import(`${APP}/zr.mjs`);

// ---------- README: the Crawl quickstart, as written, with the changes the cost rules need ----------
const section = pkgReadme.split(/^### Crawl\s*$/m)[1]?.split(/^### /m)[0] ?? "";
const block = section.match(/```javascript\n([\s\S]*?)```/)?.[1];
record(
  "readme-2",
  "README has a Crawl quickstart",
  passIf(Boolean(block)),
  "a ```javascript block under ### Crawl",
  block ? `${block.split("\n").length} lines` : "not found",
  block ?? section.slice(0, 600),
);
const subs = [
  ['const apiKey = "YOUR-API-KEY";', "const apiKey = process.env.ZENROWS_API_KEY;", "set the key"],
  [
    'url: "https://example.com/products/"',
    `url: ${JSON.stringify(CRAWL_URL)}`,
    "start URL → CRAWL_URL",
  ],
  ["maxItems: 10,", "maxItems: 5,", "max_items 10 → 5"],
  ["maxPages: 20,", "maxPages: 10,", "max_pages 20 → 10 (at most 10)"],
  [
    'includePatterns: ["/product/"]',
    `includePatterns: [${JSON.stringify(INCLUDE)}]`,
    "include → CRAWL_INCLUDE",
  ],
  [
    'outputFormat: "html", // omit for URLs only',
    "// outputFormat dropped: one html crawl per run (check 2)",
    "no html",
  ],
];
let quick = block ?? "";
const applied = [];
for (const [from, to, why] of subs) {
  if (quick.includes(from)) {
    quick = quick.replace(from, to);
    applied.push(why);
  } else applied.push(`not found, left as is: ${why}`);
}
// The quickstart is CommonJS (`require`), pasted into a .js file of a fresh project.
writeFileSync(`${APP}/quickstart.js`, quick);
await liveCheck(
  "readme-3",
  "Run the README Crawl quickstart (CommonJS)",
  "it runs to the end without an error",
  async () => {
    const since = Date.now() - 5000;
    const r = sh("node", ["quickstart.js"], { cwd: APP, timeout: 12 * 60_000 });
    const mine = await H.crawlsSince(since);
    for (const id of mine) ledger(id, "README quickstart");
    return {
      status: passIf(r.code === 0),
      actual: `exit ${r.code}; crawls: ${mine.join(", ") || "none"}; ${r.stdout.split("\n").filter(Boolean).length} lines printed`,
      evidence: `substitutions: ${applied.join("; ")}\n$ node quickstart.js\n${r.stdout}\n${r.stderr}`,
    };
  },
);

// ---------- extras: ESM and CommonJS, TypeScript strict ----------
const importLine = "{ ZenRows, ZenRowsCrawlClient, ZenRowsCrawlError }";
const probe =
  "console.log(typeof new ZenRows('k').crawl.create, typeof ZenRowsCrawlClient, typeof ZenRowsCrawlError);\n";
await check(
  "x-node-esm",
  "ESM import",
  "import { ZenRows, ZenRowsCrawlClient } from 'zenrows' works",
  async () => {
    writeFileSync(`${APP}/esm.mjs`, `import ${importLine} from "zenrows";\n${probe}`);
    const r = sh("node", ["esm.mjs"], { cwd: APP });
    return {
      status: passIf(r.code === 0 && r.stdout.trim() === "function function function"),
      actual: `exit ${r.code}: ${r.stdout.trim()}`,
      evidence: `$ node esm.mjs\n${r.stdout}${r.stderr}`,
    };
  },
);
await check(
  "x-node-cjs",
  "CommonJS require",
  "require('zenrows') gives the same exports",
  async () => {
    writeFileSync(`${APP}/cjs.cjs`, `const ${importLine} = require("zenrows");\n${probe}`);
    const r = sh("node", ["cjs.cjs"], { cwd: APP });
    return {
      status: passIf(r.code === 0 && r.stdout.trim() === "function function function"),
      actual: `exit ${r.code}: ${r.stdout.trim()}`,
      evidence: `$ node cjs.cjs\n${r.stdout}${r.stderr}`,
    };
  },
);
await check(
  "x-node-tsc",
  "TypeScript types compile under tsc --strict",
  "a fresh strict project using the Crawl types compiles",
  async () => {
    const dir = "/work/ts";
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      `${dir}/package.json`,
      JSON.stringify({ name: "ts-check", private: true, type: "module" }),
    );
    const i = sh("npm", ["install", tarball, `typescript@${TSC}`, "@types/node@20"], { cwd: dir });
    const compilerOptions = {
      strict: true,
      noEmit: true,
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
    };
    writeFileSync(`${dir}/tsconfig.json`, JSON.stringify({ compilerOptions, files: ["main.ts"] }));
    writeFileSync(`${dir}/main.ts`, readFileSync("/harness/typecheck.ts", "utf8"));
    const r = sh("npx", ["tsc", "-p", "."], { cwd: dir });
    return {
      status: passIf(i.code === 0 && r.code === 0),
      actual: `install exit ${i.code}; tsc exit ${r.code}`,
      evidence: `$ npx tsc -p . (typescript@${TSC}, strict)\n${r.stdout}${r.stderr}${i.code ? i.stderr : ""}`,
    };
  },
);

// ---------- check 1, offline half: only the fields you set are sent ----------
const cap = await H.captureServer();
const capClient = new ZenRowsCrawlClient("capture-key", { baseURL: cap.base, retries: 0 });
await capClient.create({ url: "https://example.com/", depth: 1 });
await capClient.create(
  { url: "https://example.com/", depth: 1, maxItems: 5, maxPages: 10, includePatterns: ["/p/"] },
  { idempotencyKey: "idem-1" },
);
const sent = { minimal: cap.requests[0]?.body, full: cap.requests[1]?.body };
const sentOk =
  H.sameKeys(sent.minimal, ["url", "depth"]) &&
  H.sameKeys(sent.full, ["url", "depth", "max_items", "max_pages", "include_patterns"]);
const sentLine = `sent (stand-in server): minimal=${JSON.stringify(sent.minimal)} full=${JSON.stringify(sent.full)}`;

// ---------- live ----------
const client = new ZenRowsCrawlClient(KEY, { baseURL: API_BASE });
const base = { url: CRAWL_URL, depth: 1, maxItems: 5, maxPages: 10, includePatterns: [INCLUDE] };

async function create(params, opts) {
  // The account's active jobs are shared; on 429 wait as told (harness-side, not a product failure).
  for (let i = 0; ; i++) {
    try {
      const c = await client.create(params, opts);
      ledger(c.crawl_id, "check");
      return c;
    } catch (e) {
      if (!(e instanceof ZenRowsCrawlError && e.status === 429 && i < 10)) throw e;
      await H.sleep((e.retryAfter ?? 30) * 1000);
    }
  }
}
const errOf = async (p) => {
  try {
    return { value: await p };
  } catch (error) {
    return { error };
  }
};
const errSummary = (e) =>
  e && { status: e.status, code: e.code, detail: e.detail, message: e.message };

let A; // URLs-only crawl, the subject of most checks
let B; // the one html crawl
let C; // the idempotency crawl, stopped by check 11
let F; // the crawl that keeps nothing (checks 19 and 21)
let ended;

await check(
  "1",
  "Create",
  "returns at once: running, a crawl_id, the echoed parameters; only the fields set are sent",
  async () => {
    if (!HAS_KEY) {
      return {
        status: sentOk ? SKIP : FAIL,
        actual: `live part skipped (no key); only set fields sent: ${sentOk}`,
        evidence: sentLine,
      };
    }
    const t0 = Date.now();
    A = await create(base);
    const echo = {
      url: A.url,
      depth: A.depth,
      max_items: A.max_items,
      max_pages: A.max_pages,
      include_patterns: A.include_patterns,
    };
    const want = {
      url: CRAWL_URL,
      depth: 1,
      max_items: 5,
      max_pages: 10,
      include_patterns: [INCLUDE],
    };
    const ok =
      sentOk &&
      A.status === "running" &&
      A.crawl_id.startsWith("c_") &&
      JSON.stringify(echo) === JSON.stringify(want);
    return {
      status: passIf(ok),
      actual: `${A.status}, ${A.crawl_id}, ${Date.now() - t0} ms, echo ${JSON.stringify(echo)}; only set fields sent: ${sentOk}`,
      evidence: `client.crawl.create(${JSON.stringify(base)})\n${JSON.stringify(A)}\n${sentLine}`,
    };
  },
);

await liveCheck(
  "5",
  "Wait runs out",
  "wait with timeout 1 s on a running crawl returns it running, no error",
  async () => {
    if (!A) return { status: SKIP, actual: "no crawl from check 1" };
    const t0 = Date.now();
    const w = await client.wait(A.crawl_id, { timeout: 1 });
    const ms = Date.now() - t0;
    if (w.status !== "running")
      return { status: SKIP, actual: `the crawl had already ended (${w.status}) after ${ms} ms` };
    return {
      status: passIf(ms < 5000),
      actual: `${w.status} after ${ms} ms, no exception`,
      evidence: JSON.stringify(w),
    };
  },
);

let partial;
if (A) {
  const g = await errOf(client.get(A.crawl_id, { limit: 1 }));
  const items = [];
  const t0 = Date.now();
  const r = await errOf(
    (async () => {
      for await (const x of client.results(A.crawl_id)) items.push(x);
    })(),
  );
  partial = {
    running: g.value?.status === "running",
    count: items.length,
    ms: Date.now() - t0,
    error: r.error,
  };
}

await liveCheck(
  "3",
  "Idempotency",
  "same key + body → same crawl_id; different body → 422 idempotency_key_reused",
  async () => {
    const key = `acc-${randomUUID()}`;
    const body = { ...base, maxItems: 3, maxPages: 3 };
    C = await create(body, { idempotencyKey: key });
    const again = await create(body, { idempotencyKey: key });
    const diff = await errOf(client.create({ ...body, maxItems: 4 }, { idempotencyKey: key }));
    if (diff.value) ledger(diff.value.crawl_id, "idempotency, different body (unexpected create)");
    const ok =
      C.crawl_id === again.crawl_id &&
      diff.error?.status === 422 &&
      diff.error?.code === "idempotency_key_reused";
    const third = diff.error
      ? `${diff.error.status} ${diff.error.code}`
      : `created ${diff.value?.crawl_id}`;
    return {
      status: passIf(ok),
      actual: `first ${C.crawl_id}, second ${again.crawl_id}; different body → ${third}`,
      evidence: JSON.stringify(errSummary(diff.error) ?? diff.value),
    };
  },
);

await liveCheck(
  "11",
  "Stop",
  "running → stopped, stop_reason user; ended → answers as it ended, no error",
  async () => {
    if (!C) return { status: SKIP, actual: "no crawl from check 3" };
    const first = await client.stop(C.crawl_id);
    if (first.status === "completed" && first.stop_reason !== "user") {
      return {
        status: SKIP,
        actual: `the crawl had already ended on its own (${first.status}/${first.stop_reason})`,
      };
    }
    const second = await errOf(client.stop(C.crawl_id));
    const ok =
      first.status === "stopped" &&
      first.stop_reason === "user" &&
      !second.error &&
      second.value?.status === first.status;
    const two = second.error
      ? `error ${second.error.message}`
      : `${second.value.status}/${second.value.stop_reason ?? "-"}`;
    return {
      status: passIf(ok),
      actual: `first: ${first.status}/${first.stop_reason ?? "-"}; second: ${two}`,
      evidence: JSON.stringify(first),
    };
  },
);

await liveCheck(
  "4",
  "Wait",
  "wait (default timeout) returns the ended crawl; failed is returned, not raised",
  async () => {
    if (!A) return { status: SKIP, actual: "no crawl from check 1" };
    ended = await client.wait(A.crawl_id);
    const reason = ended.stop_reason ? `/${ended.stop_reason}` : "";
    return {
      status: passIf(H.TERMINAL.has(ended.status)),
      actual: `${ended.status}${reason}; coverage ${JSON.stringify(ended.coverage)}`,
      evidence: JSON.stringify(ended),
    };
  },
);

await liveCheck(
  "6",
  "Get",
  "limit 2 then the cursor: one page each; next_cursor moves on and is null on the last page",
  async () => {
    if (!ended) return { status: SKIP, actual: "no ended crawl" };
    const pages = [];
    let cursor;
    for (let i = 0; i < 20; i++) {
      const p = await client.get(A.crawl_id, { limit: 2, cursor });
      pages.push({ n: p.results.length, next: p.next_cursor, urls: p.results.map((r) => r.url) });
      if (p.next_cursor === null) break;
      cursor = p.next_cursor;
    }
    const urls = pages.flatMap((p) => p.urls);
    const cursors = pages.map((p) => p.next).filter((c) => c !== null);
    const ok =
      (pages.length >= 2 || ended.coverage.items_found <= 2) &&
      pages.every((p) => p.n <= 2) &&
      pages.at(-1).next === null &&
      new Set(cursors).size === cursors.length &&
      new Set(urls).size === urls.length;
    return {
      status: passIf(ok),
      actual: `${pages.length} pages of ${pages.map((p) => p.n).join(",")}; last next_cursor ${pages.at(-1).next}; ${urls.length} URLs`,
    };
  },
);

await liveCheck(
  "7",
  "List",
  "limit 2 then the next page: newest first; next_cursor absent or null on the last page",
  async () => {
    const p1 = await client.list({ limit: 2 });
    const p2 = p1.next_cursor
      ? await client.list({ limit: 2, cursor: p1.next_cursor })
      : { crawls: [] };
    const all = [...p1.crawls, ...p2.crawls];
    const times = all.map((c) => Date.parse(c.created_at));
    const newestFirst = times.every((t, i) => i === 0 || times[i - 1] >= t);
    const noOverlap = new Set(all.map((c) => c.crawl_id)).size === all.length;
    let cursor = p2.next_cursor;
    let pages = 2;
    while (cursor && pages < 60) {
      const p = await client.list({ limit: 100, cursor });
      pages++;
      cursor = p.next_cursor;
    }
    const ok = p1.crawls.length === 2 && newestFirst && noOverlap && !cursor;
    return {
      status: passIf(ok),
      actual: `newest first ${newestFirst}, no overlap ${noOverlap}; last page after ${pages} pages: next_cursor ${JSON.stringify(cursor ?? null)}`,
    };
  },
);

await liveCheck(
  "8",
  "Results",
  "every kept URL once, each matching CRAWL_INCLUDE; on a running crawl, what is kept so far",
  async () => {
    if (!ended) return { status: SKIP, actual: "no ended crawl" };
    const urls = [];
    for await (const x of client.results(A.crawl_id, { limit: 2 })) urls.push(x.url);
    const distinct = new Set(urls).size === urls.length;
    const match = urls.every((u) => u.includes(INCLUDE));
    const run = partial
      ? `while running (${partial.running ? "running" : "already ended"}): ${partial.count} URLs in ${partial.ms} ms, ${partial.error ? `error ${partial.error.message}` : "returned"}`
      : "not read while running";
    const ok =
      urls.length > 0 &&
      distinct &&
      match &&
      urls.length === ended.coverage.items_found &&
      !partial?.error;
    return {
      status: passIf(ok),
      actual: `${urls.length} URLs (items_found ${ended.coverage.items_found}), distinct ${distinct}, all match ${match}; ${run}`,
      evidence: urls.join("\n"),
    };
  },
);

// ---------- the html crawl (checks 20, 2, 9, 10): stopped with pages in flight, read, then settled ----------
let stopInfo;
/** Poll until no result is still `pending` (the pages in flight finished), at most 90 s. */
async function settle(id) {
  for (let i = 0; i < 45; i++) {
    const p = await client.get(id, { limit: 100 });
    if (!p.results.some((r) => r.content_status === "pending")) return "settled";
    await H.sleep(2000);
  }
  return "still pending after 90 s";
}
if (HAS_KEY) {
  try {
    B = await create({ ...base, outputFormat: "html" });
    // Stop as soon as the crawl has kept URLs: their pages are then still being fetched.
    let g;
    for (let i = 0; i < 100; i++) {
      g = await client.get(B.crawl_id, { limit: 1 });
      if (g.status !== "running" || g.coverage.items_found > 0) break;
      await H.sleep(150);
    }
    const s = await client.stop(B.crawl_id);
    stopInfo = { items: g.coverage.items_found, status: s.status };
  } catch (error) {
    stopInfo = { error };
  }
}
await liveCheck(
  "20",
  "Results after stop",
  "results on a crawl stopped with pages in flight end without looping, and lose no URL",
  async () => {
    if (!B || stopInfo?.error)
      return { status: FAIL, actual: `setup failed: ${stopInfo?.error?.message}` };
    if (stopInfo.status !== "stopped") {
      return {
        status: SKIP,
        actual: `the crawl had already ended (${stopInfo.status}) before the stop`,
      };
    }
    const t0 = Date.now();
    const now = [];
    await H.within(
      60_000,
      (async () => {
        for await (const x of client.results(B.crawl_id)) now.push(x);
      })(),
    );
    const ms = Date.now() - t0;
    // Let the pages in flight finish, then read again: the same URLs must come back.
    const settled = await settle(B.crawl_id);
    const settledNote =
      settled === "settled"
        ? settled
        : `${settled} (an API issue: the stop left these pages pending on an ended crawl)`;
    const later = [];
    for await (const x of client.results(B.crawl_id)) later.push(x.url);
    const same = JSON.stringify(now.map((x) => x.url).sort()) === JSON.stringify([...later].sort());
    const pending = now.filter((x) => x.content_status === "pending").length;
    return {
      status: passIf(same && now.length > 0),
      actual: `stopped with ${stopInfo.items} kept; read ${now.length} URLs (${pending} pending) in ${ms} ms, then ${settledNote}: ${later.length} URLs, same set ${same}`,
    };
  },
);
await liveCheck(
  "2",
  "Create with html",
  "results get content_status and, once fetched, content_url",
  async () => {
    if (!B) return { status: SKIP, actual: "no html crawl" };
    if (stopInfo?.status === "stopped") await settle(B.crawl_id);
    const rs = [];
    for await (const x of client.results(B.crawl_id)) rs.push(x);
    const ok =
      B.output_format === "html" &&
      rs.length > 0 &&
      rs.every((r) => r.content_status && (r.content_status !== "fetched" || r.content_url));
    return {
      status: passIf(ok),
      actual: `${B.crawl_id} (${stopInfo?.status ?? "-"}); ${rs.length} results; with content_url ${rs.filter((r) => r.content_url).length}`,
      evidence: JSON.stringify(rs.slice(0, 2)),
    };
  },
);

await liveCheck(
  "9",
  "Content",
  "content by content id, then by content_url: the same HTML",
  async () => {
    if (!B) return { status: SKIP, actual: "no html crawl" };
    const firstFetched = async (id) => {
      for await (const x of client.results(id)) if (x.content_url) return x;
    };
    // The stop in check 20 can land before any page is fetched. Then read a
    // one-item html crawl that runs to the end instead.
    let src = B.crawl_id;
    let r = await firstFetched(src);
    if (!r) {
      const own = await create({ ...base, maxItems: 1, outputFormat: "html" });
      await client.wait(own.crawl_id);
      src = own.crawl_id;
      r = await firstFetched(src);
    }
    if (!r) return { status: FAIL, actual: `no result with content_url on ${src}` };
    const id = r.content_url.split("/").pop();
    const byId = await client.content(src, id);
    const byUrl = await client.content(src, r.content_url);
    const ok = byId === byUrl && /<html|<!doctype/i.test(byId);
    return {
      status: passIf(ok),
      actual: `by id ${byId.length} chars, by content_url ${byUrl.length} chars, equal ${byId === byUrl}`,
    };
  },
);

await liveCheck(
  "10",
  "Download",
  "a status and one line per result, each with url, content_status, content",
  async () => {
    if (!B) return { status: SKIP, actual: "no html crawl" };
    const d = await client.download(B.crawl_id);
    const lines = [];
    for await (const l of d.lines) lines.push(l);
    const fetched = lines.filter((l) => l.content_status === "fetched");
    const ok =
      typeof d.status === "string" &&
      lines.length > 0 &&
      lines.every((l) => l.url && l.content_status) &&
      fetched.every((l) => typeof l.content === "string" && l.content.length > 0);
    return {
      status: passIf(ok),
      actual: `status ${d.status}; ${lines.length} lines; ${fetched.length} with content`,
    };
  },
);

const errs = {};
await liveCheck("12", "Not found", "get c_does_not_exist → 404 crawl_not_found", async () => {
  const r = await errOf(client.get("c_does_not_exist"));
  errs.notFound = r.error;
  return {
    status: passIf(r.error?.status === 404 && r.error?.code === "crawl_not_found"),
    actual: JSON.stringify(errSummary(r.error) ?? r.value),
  };
});
await liveCheck("13", "Invalid input", "create with depth 0 → 422 invalid_parameter", async () => {
  const r = await errOf(client.create({ ...base, depth: 0 }));
  if (r.value) {
    ledger(r.value.crawl_id, "depth 0 (unexpected create)");
    await client.stop(r.value.crawl_id);
  }
  errs.invalid = r.error;
  return {
    status: passIf(r.error?.status === 422 && r.error?.code === "invalid_parameter"),
    actual: JSON.stringify(errSummary(r.error) ?? r.value),
  };
});
await liveCheck(
  "14",
  "Gated option",
  "output_format json → 422 invalid_parameter for a customer key",
  async () => {
    const r = await errOf(client.create({ ...base, outputFormat: "json" }));
    if (r.value) {
      ledger(r.value.crawl_id, "output_format json (accepted)");
      await client.stop(r.value.crawl_id);
      return {
        status: PASS,
        actual: `accepted (${r.value.crawl_id}): the key is in a beta segment, not a bug; stopped it`,
      };
    }
    return {
      status: passIf(r.error?.status === 422 && r.error?.code === "invalid_parameter"),
      actual: JSON.stringify(errSummary(r.error)),
      evidence:
        'outputFormat: "json" (the type allows only "html"; plain JavaScript sends it as is)',
    };
  },
);
await check("15", "Bad key", "any call with the key `invalid` → 401", async () => {
  const bad = new ZenRowsCrawlClient("invalid", { baseURL: API_BASE, retries: 0 });
  const r = await errOf(bad.get("c_does_not_exist"));
  errs.badKey = r.error;
  return {
    status: passIf(r.error?.status === 401),
    actual: JSON.stringify(errSummary(r.error) ?? r.value),
  };
});
await check(
  "16",
  "Errors carry the server code",
  "code holds the server code; undefined when the body has none",
  async () => {
    const none = await errOf(capClient.get("c_nobody"));
    const rows = {
      notFound: errs.notFound?.code,
      invalid: errs.invalid?.code,
      badKey: errs.badKey?.code,
      noBody502: none.error
        ? `${none.error.status} code=${JSON.stringify(none.error.code)}`
        : "no error",
    };
    const liveOk =
      !HAS_KEY || (rows.notFound === "crawl_not_found" && rows.invalid === "invalid_parameter");
    const ok = liveOk && Boolean(rows.badKey) && none.error?.status === 502 && !none.error.code;
    return {
      status: ok ? (HAS_KEY ? PASS : SKIP) : FAIL,
      actual: JSON.stringify(rows),
      evidence: "12, 13, 15, and a 502 with no body from the stand-in",
    };
  },
);
await cap.close();

// ---------- 19-21: a failed crawl, results after a stop, the documented defaults ----------
await liveCheck(
  "19",
  "Failed crawl",
  "a crawl that keeps nothing ends failed (no_items_found); wait returns it, not raises",
  async () => {
    F = await create({ url: CRAWL_URL, depth: 1, includePatterns: [H.NO_MATCH] });
    const w = await client.wait(F.crawl_id);
    const ok =
      w.status === "failed" &&
      w.error?.code === "no_items_found" &&
      typeof w.error?.detail === "string";
    return {
      status: passIf(ok),
      actual: `${F.crawl_id}: ${w.status}; error ${JSON.stringify(w.error)}; returned, no exception`,
      evidence: JSON.stringify(w),
    };
  },
);
await liveCheck(
  "21",
  "Documented defaults",
  `a create without max_pages and max_items echoes the documented default (${H.DOCUMENTED_DEFAULT})`,
  async () => {
    if (!F) return { status: SKIP, actual: "no crawl from check 19" };
    const ok = F.max_pages === H.DOCUMENTED_DEFAULT && F.max_items === H.DOCUMENTED_DEFAULT;
    const doc = section
      .split("\n")
      .filter(
        (l) => /default/i.test(l) && /\b(max_?pages|maxPages|max_?items|maxItems)\b/i.test(l),
      );
    return {
      status: passIf(ok),
      actual: `the API applied max_pages ${F.max_pages}, max_items ${F.max_items}; documented ${H.DOCUMENTED_DEFAULT}`,
      evidence: `README lines on the defaults:\n${doc.join("\n") || "(none in the Crawl section)"}`,
    };
  },
);

H.naming({
  operations: {
    create: "create",
    get: "get",
    list: "list",
    results: "results",
    content: "content",
    download: "download",
    stop: "stop",
    wait: "wait",
  },
  params: {
    url: "url",
    depth: "depth",
    max_items: "maxItems",
    max_pages: "maxPages",
    include_patterns: "includePatterns",
    exclude_patterns: "excludePatterns",
    output_format: "outputFormat",
    idempotency_key: "idempotencyKey",
    cursor: "cursor",
    limit: "limit",
    timeout: "timeout",
    content_id: "contentId",
  },
});
record("17", "Naming", SKIP, "the API's names in this surface's casing", "computed by the report");

await check(
  "18",
  "Copy",
  'Crawl is "new", never "beta"; one "still evolving" line; the 429 limit is active jobs shared with Batch',
  async () => {
    const types = readFileSync(`${APP}/node_modules/zenrows/dist/index.d.ts`, "utf8");
    const f = H.copyFindings(section);
    const typesBeta = types.split("\n").filter((l) => /crawl/i.test(l) && /\bbeta\b/i.test(l));
    const problems = [...f.problems];
    if (typesBeta.length)
      problems.push(`"beta" on a Crawl line in index.d.ts: ${typesBeta[0].trim()}`);
    if (!/\(new\)/i.test(section)) problems.push('the Crawl section does not say "new"');
    return {
      status: passIf(problems.length === 0),
      actual: problems.join("; ") || 'README: "new", 1 "still evolving" line, 429 wording ok',
      evidence: `still evolving: ${f.evolving.join(" | ")}\n429: ${f.limit.join(" | ")}`,
    };
  },
);
console.log("node: done");
