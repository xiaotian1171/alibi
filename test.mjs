/* Tests for Alibi — the parts that break quietly.
 *
 * The starter case has to be answerable offline: every suspect answers every
 * question on the menu, holds one thing back until they are pressed, and then
 * lets it slip. A case written by the host has to be refused unless it is
 * complete. And the page and the script have to agree on every id and every
 * screen, because a missing wire shows up as a blank page rather than an error.
 *
 * Run: node test.mjs
 */

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

globalThis.window = globalThis;
globalThis.location = { origin: "https://example.test", pathname: "/", search: "", href: "" };
globalThis.document = {};
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__ALIBI_TEST__ = true;

const dir = mkdtempSync(join(tmpdir(), "alibi-"));

const packPath = join(dir, "pack.mjs");
writeFileSync(packPath, readFileSync(join(here, "pack.js"), "utf8"));
await import(pathToFileURL(packPath).href);

const source = readFileSync(join(here, "app.js"), "utf8");
const appPath = join(dir, "app.mjs");
writeFileSync(
    appPath,
    `${source}
export { menu, menuKeys, matchQuestion, validateCase, normalizeCase, answerFor, pressedCount, state };
`,
);
const app = await import(pathToFileURL(appPath).href);

let passed = 0;
const failures = [];

function ok(name, condition) {
    if (condition) {
        passed += 1;
        return;
    }
    failures.push(name);
}

function eq(name, actual, expected) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    ok(a === b ? name : `${name} — got ${a}, wanted ${b}`, a === b);
}

/* ------------------------------------------------------------- the question menu */

const menu = app.menu();
const keys = app.menuKeys();

eq("the menu holds nine questions", keys.length, 9);
eq("no question key is used twice", keys.length - new Set(keys).size, 0);
eq("every question has a key and a wording", menu.filter((item) => !item.key || !item.ask).length, 0);
eq("every question can be reached by typing it", menu.filter((item) => app.matchQuestion(item.ask) !== item.key).map((item) => item.key), []);

/* ------------------------------------------------------------ the starter case */

const pack = window.ALIBI_CASES[0];
eq("the starter case is complete", app.validateCase(pack), "");
eq("the starter case has four suspects", pack.suspects.length, 4);
eq("the culprit is one of the suspects", pack.suspects.some((suspect) => suspect.name === pack.culprit), true);

eq(
    "every suspect answers every question on the menu",
    pack.suspects.flatMap((suspect) => keys.filter((key) => !suspect.answers?.[key])).map((key) => key),
    [],
);
eq(
    "no answer is just the brush-off line",
    pack.suspects.flatMap((suspect) => keys.filter((key) => suspect.answers[key] === suspect.deflect)).map((key) => key),
    [],
);
eq(
    "every suspect holds something back",
    pack.suspects.filter((suspect) => !suspect.secret || !suspect.slip).map((suspect) => suspect.name),
    [],
);
eq(
    "the slip is not the same as the alibi",
    pack.suspects.filter((suspect) => suspect.slip === suspect.alibi).map((suspect) => suspect.name),
    [],
);
eq("the starter case explains every suspect", pack.suspects.filter((suspect) => !pack.breaks?.[suspect.name]).map((suspect) => suspect.name), []);
eq("the case names a killer in its verdict", pack.verdict.includes(pack.culprit), true);

/* --------------------------------------------------- pressing them for the truth */

const nell = pack.suspects[0];
app.state.transcript = [];
eq("a suspect brushes off the last question at first", app.answerFor(nell, "secret"), nell.deflect);
eq("but answers the ordinary ones", app.answerFor(nell, "where"), nell.answers.where);

app.state.transcript = [1, 2, 3].map((n) => ({ suspect: nell.name, ask: `q${n}`, reply: "a", kind: "menu" }));
eq("three questions is enough to press them", app.pressedCount(nell.name), 3);
eq("so the last question gets the real answer", app.answerFor(nell, "secret"), nell.answers.secret);

app.state.transcript = [{ suspect: "Someone Else", ask: "q", reply: "a", kind: "menu" }];
eq("pressing one suspect does not loosen another", app.answerFor(nell, "secret"), nell.deflect);
app.state.transcript = [];

/* --------------------------------------------------- typed questions offline */

eq("a typed question finds the question it means", app.matchQuestion("Where were you when the bell rang?"), "where");
eq("so does a looser one", app.matchQuestion("what did you argue about"), "argument");
eq("and one about the killer", app.matchQuestion("who do you think did it"), "accuse");
eq("nonsense finds nothing", app.matchQuestion("banana submarine"), "");
eq("an empty question finds nothing", app.matchQuestion("   "), "");

/* ------------------------------------------------- refusing a bad host case */

const clone = () => JSON.parse(JSON.stringify(pack));
const strip = (field) => {
    const data = clone();
    delete data[field];
    return app.validateCase(data);
};

ok("a case with no title is refused", strip("title"));
ok("a case with no solution is refused", strip("solution"));
ok("a case with no suspects is refused", app.validateCase({ ...clone(), suspects: [] }));
ok("a case with too many suspects is refused", app.validateCase({ ...clone(), suspects: pack.suspects.concat(pack.suspects) }));
ok("a case whose culprit is a stranger is refused", app.validateCase({ ...clone(), culprit: "Nobody At All" }));
ok("a case with a nameless suspect is refused", app.validateCase({ ...clone(), suspects: [{ ...nell, name: "" }] }));
ok(
    "a case with a suspect who cannot answer is refused",
    app.validateCase({ ...clone(), suspects: [{ ...nell, answers: { where: "somewhere" } }] }),
);
ok(
    "a case with two suspects of the same name is refused",
    app.validateCase({ ...clone(), suspects: [nell, { ...pack.suspects[1], name: nell.name }] }),
);
ok("something that is not a case at all is refused", app.validateCase("hello"));
eq("a complete case is accepted", app.validateCase(clone()), "");

const loose = app.normalizeCase({ ...clone(), breaks: {} });
eq("a case with no explanations borrows the slips", Object.keys(loose.breaks).length, pack.suspects.length);
eq("a case with no brush-off line gets one", typeof loose.suspects[0].deflect, "string");
eq("normalising keeps the culprit", loose.culprit, pack.culprit);
eq("normalising keeps the answers", loose.suspects[0].answers.where, nell.answers.where);

/* ------------------------------------------- the page and the script agree */

const html = readFileSync(join(here, "index.html"), "utf8");
const htmlIds = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
eq("no id is used twice in the page", htmlIds.length - new Set(htmlIds).size, 0);

const camel = (id) => id.replace(/-(\w)/g, (_, letter) => letter.toUpperCase());
const wiring = source.match(/for \(const id of \[([\s\S]*?)\]\)/);
ok("the page wiring list is where the tests expect it", Boolean(wiring));
const wired = new Set([...wiring[1].matchAll(/"([^"]+)"/g)].map((match) => camel(match[1])));

const reached = new Set([...source.matchAll(/\bel\.(\w+)/g)].map((match) => match[1]));
eq("every element the app reaches for is wired up", [...reached].filter((name) => !wired.has(name)), []);
eq("every id in the wiring list is really in the page", [...wired].filter((name) => !htmlIds.some((id) => camel(id) === name)), []);
eq("the wiring list holds ids, not keys", [...wiring[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]).filter((id) => !htmlIds.includes(id)), []);

const screens = source.match(/const SCREENS = \[([\s\S]*?)\]/);
ok("the screen list is where the tests expect it", Boolean(screens));
const screenNames = [...screens[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
eq("every screen the renderer switches is in the page", screenNames.filter((name) => !htmlIds.includes(name)), []);
eq("every screen the renderer switches is wired up", screenNames.filter((name) => !wired.has(name)), []);
eq("every screen it switches is reachable", screenNames.filter((name) => !source.includes(`state.screen = "${name}"`)), []);
eq("the app starts on a screen it can switch to", screenNames.includes(app.state.screen), true);
eq("every screen in the page is switched by the renderer", ["setup", "briefing", "room", "notebook", "accuse", "reveal"].filter((name) => !screenNames.includes(name)), []);

/* ------------------------------------------------------------- the report */

if (failures.length) {
    console.error(`\n${failures.length} failed, ${passed} passed:\n`);
    for (const name of failures) console.error(`  ✗ ${name}`);
    process.exit(1);
}
console.log(`ok — ${passed} checks passed`);
