// Names each tab after what's in it: a Claude Code tab after the title Claude
// sets, a terminal tab after its running program, or its folder at the prompt.
// Leaves a tab alone once you rename it yourself.

import { spaces, panes, shared, setShared, run } from "herdr";

// Names the new-tab menu gives agent tabs; we may replace these.
const DEFAULTS = new Set(["Claude Code"]);
const KEY = "tab-titles.set"; // tab id -> the name we gave it

// Agents whose terminal title carries their task: Claude Code, and omp
// ("π ⠋ 󰝜 TABS: fix login" — icon, spinner, then the task).
const TITLED = new Set(["claude-code", "omp"]);

function nameFor(p) {
  // Claude prefixes a spinner or ✳; omp prefixes π, a braille spinner and a
  // model glyph (private-use). Strip them: punctuation, symbols, braille,
  // private-use, π and spaces, from the start.
  if (TITLED.has(p.app)) return (p.title ?? "").replace(/^[\p{P}\p{S}\u2800-\u28FF\uE000-\uF8FF\u{F0000}-\u{FFFFD}π\s]+/u, "").trim();
  if (!p.program?.shell) return p.program?.name;
  if (!p.cwd) return null;
  return p.cwd === homeOf(p.cwd) ? "~" : p.cwd.split("/").filter(Boolean).pop();
}

// shortcut: assumes /home/<user> or /root homes, read $HOME if remote machines differ.
function homeOf(cwd) {
  return cwd.match(/^\/home\/[^/]+|^\/root/)?.[0];
}

export function syncNames() {
  const saved = shared(KEY) ?? {};
  const ours = { ...saved };
  const tabs = new Map(spaces().flatMap(s => s.tabs).map(t => [t.id, t]));
  // One pane per tab: its title-reporting agent if it has one, else its
  // first terminal.
  const pick = new Map();
  for (const p of panes()) {
    if (!p.terminal) continue;
    const cur = pick.get(p.tab);
    if (!cur || (TITLED.has(p.app) && !TITLED.has(cur.app))) pick.set(p.tab, p);
  }
  for (const [id, p] of pick) {
    const tab = tabs.get(id);
    const name = nameFor(p);
    if (!tab || !name || tab.name === name) continue;
    if (tab.named && !DEFAULTS.has(tab.name) && ours[tab.id] !== tab.name) continue;
    run("tab.rename", { id: tab.id, name });
    ours[tab.id] = name;
  }
  for (const id of Object.keys(ours)) if (!tabs.has(id)) delete ours[id];
  if (JSON.stringify(ours) !== JSON.stringify(saved)) setShared(KEY, ours);
}
