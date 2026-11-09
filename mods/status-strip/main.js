// The strip above the status bar. Left: each connected Linux machine's CPU
// (with a 5-minute sparkline), memory and load, read live from /proc. Right:
// 9router quota, one chip per active account (Claude, Codex, GLM, DeepSeek,
// …) with its tightest window — percent left and time to reset, or a credit
// balance — read from your 9router's own usage API.
//
// 9router setup: data/9router.conf in the app's home, mode 600, two lines:
//   https://router.example.com
//   <cli token>   (sha256(machine-id + "9r-cli-auth" + auth/cli-secret)[0:16],
//                  computed inside the 9router container; see README)
// The token never leaves this computer except to that 9router. No file: the
// quota side stays empty.

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, home, hc, exec } from "herdr";
import * as fs from "fs/promises";

// ── Machine vitals ────────────────────────────────────────────────────────
// Linux /proc: "cpu <busy> <total>", "mem <total kB> <available kB>", "load <1> <5> <15>", "cores <n>".
// ponytail: Linux machines only; this computer and Macs show none.
const VITALS_SH = `read -r _ u n s i w q sq st _ < /proc/stat
echo "cpu $((u+n+s+q+sq+st)) $((u+n+s+i+w+q+sq+st))"
awk '/^MemTotal:/{t=$2} /^MemAvailable:/{a=$2} END{print "mem", t, a}' /proc/meminfo
read -r l1 l5 l15 _ < /proc/loadavg; echo "load $l1 $l5 $l15"
echo "cores $(nproc)"`;

const TICK = 2000; // one read per machine this often: live, ~5 ms of /proc each
const BUCKET = 10000; // sparkline bar: the average CPU over this long
const HIST = 30; // bars kept: 5 minutes

// One sample plus the last -> { cpu, mem, load5, cores, hist, … }. CPU is busy
// since the last sample; the sparkline averages samples into BUCKET-long bars.
export function parseVitals(out, prev, now) {
  const f = Object.fromEntries(out.trim().split("\n").map((l) => { const [k, ...v] = l.split(" "); return [k, v.map(Number)]; }));
  if (!f.cpu || !f.mem || !f.load || !f.cores) return null;
  const [busy, total] = f.cpu;
  const dt = prev ? total - prev.total : 0;
  const cpu = dt > 0 ? Math.min(100, Math.max(0, (100 * (busy - prev.busy)) / dt)) : prev?.cpu ?? null;
  let hist = prev?.hist ?? [], acc = prev?.acc ?? [0, 0], since = prev?.since ?? now;
  if (dt > 0) acc = [acc[0] + cpu, acc[1] + 1];
  if (now - since >= BUCKET && acc[1]) { hist = [...hist, acc[0] / acc[1]].slice(-HIST); acc = [0, 0]; since = now; }
  return { busy, total, cpu, hist, acc, since, mem: 100 * (1 - f.mem[1] / f.mem[0]), load5: f.load[1], cores: f.cores[0] };
}

// Bar heights in px for a CPU history: at least 1 so the window shows, and
// scaled to the busiest of 25% and the window's own peak — so a calm server's
// 7–15% still has shape, and a real spike reads as one.
const SPARK_H = 12;
export const sparkHeights = (hist) => {
  const top = Math.max(25, ...hist);
  return hist.map((x) => Math.max(1, Math.round((x / top) * SPARK_H)));
};

// ── 9router quota ─────────────────────────────────────────────────────────

const CONF = "data/9router.conf"; // relative to the app's home
const EVERY = 60000; // quota moves slowly; the API asks upstream providers

// One line per active account: its tightest window, for the chip.
// A quota entry is either a window ({ remaining|remainingPercentage, resetAt })
// or a credit balance ({ isCreditBalance, total, currency }).
export function summarize(conn, usage) {
  const q = usage?.quotas;
  if (!q || typeof q !== "object") return null;
  let worst = null;
  for (const [name, w] of Object.entries(q)) {
    if (!w || w.unlimited) continue;
    if (w.isCreditBalance) {
      const left = w.total - (w.used ?? 0);
      const item = { kind: "balance", name, text: `${w.currency === "USD" ? "$" : ""}${left.toFixed(2)}`, pct: null, resetAt: null };
      if (!worst) worst = item;
      continue;
    }
    const pct = w.remainingPercentage ?? (w.total ? (100 * (w.remaining ?? w.total - (w.used ?? 0))) / w.total : null);
    if (pct == null) continue;
    const item = { kind: "window", name, pct, resetAt: w.resetAt ? Date.parse(w.resetAt) : null };
    if (!worst || worst.kind === "balance" || pct < worst.pct) worst = item;
  }
  if (!worst) return null;
  return { id: conn.id, provider: conn.provider, label: labelOf(conn, usage), account: conn.name || conn.email || null, ...worst, all: q };
}

// The rows as chips: one per provider, tightest provider first.
export function groupRows(rows) {
  const groups = new Map();
  for (const r of rows) {
    const k = brandOf(r)?.icon ?? r.label;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const sorted = [...groups.values()].map((g) => g.sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101)));
  return sorted.sort((a, b) => (pool(a).pct ?? 101) - (pool(b).pct ?? 101));
}

// A provider's accounts as one: 9router falls over to the next account when
// one runs out, so what's left is the pool. Windows: the mean percent left
// and the soonest reset; balances: their sum.
// ponytail: the mean treats every account as the same plan size; weight by
// plan if accounts on different tiers ever share a provider.
export function pool(group) {
  const windows = group.filter((r) => r.kind === "window");
  const balances = group.filter((r) => r.kind === "balance");
  if (windows.length) {
    const resets = windows.map((r) => r.resetAt).filter(Boolean);
    return { kind: "window", pct: windows.reduce((s, r) => s + r.pct, 0) / windows.length, resetAt: resets.length ? Math.min(...resets) : null };
  }
  const sum = balances.reduce((s, r) => s + Number(String(r.text).replace(/[^0-9.]/g, "")), 0);
  return { kind: "balance", pct: null, text: `${String(balances[0]?.text ?? "").startsWith("$") ? "$" : ""}${sum.toFixed(2)}`, resetAt: null };
}

export function shortName(account, i) {
  const s = String(account ?? "").trim();
  if (!s) return `#${i + 1}`;
  const n = /^account\s*(\d+)$/i.exec(s);
  if (n) return `Account ${n[1]}`;
  return s;
}

// "claude", "codex", "glm", "deepseek", else the account's name.
function labelOf(conn, usage) {
  const p = conn.provider ?? "";
  if (!p.startsWith("openai-compatible")) return p;
  return conn.name ?? usage?.plan ?? "custom";
}

// Each provider's own mark and brand color (icons: LobeHub, MIT), by the
// provider id or, for an openai-compatible account, by its name. Unknown
// accounts keep the plain label.
const BRANDS = {
  claude: { icon: "claude", color: "#D97757", name: "Claude" },
  codex: { icon: "codex", color: "#7A9DFF", name: "Codex" },
  glm: { icon: "glm", color: "#3859FF", name: "GLM" },
  deepseek: { icon: "deepseek", color: "#4D6BFE", name: "DeepSeek" },
  kimi: { icon: "kimi", color: "#1783FF", name: "Kimi" },
  qwen: { icon: "qwen", color: "#615CED", name: "Qwen" },
};
export const brandOf = (r) => BRANDS[r.provider] ?? BRANDS[String(r.label).toLowerCase()] ?? null;

// "2h 14m", "3d 5h", "41m" until a reset.
export function untilText(ms) {
  if (ms == null) return "";
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export default class StatusStrip extends View {
  init(_props, cx) {
    this.rows = [];
    this.error = null;
    this.load(cx);
    cx.timer.every(EVERY, (cx) => this.load(cx));
    cx.timer.every(30000, (cx) => cx.notify()); // reset countdowns
    this.machines = [];
    this.vitals = {};
    this.sampling = new Set(); // machines whose last read hasn't come back
    this.refreshMachines(cx);
    cx.timer.every(15000, (cx) => this.refreshMachines(cx));
    cx.timer.every(TICK, (cx) => this.sampleVitals(cx));
  }

  refreshMachines(cx) {
    cx.spawn(async (cx) => {
      try {
        const r = await hc(["machine", "ls", "--json"]);
        if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary && m.state === "connected").map((m) => m.name);
      } catch {}
      for (const m of Object.keys(this.vitals)) if (!this.machines.includes(m)) delete this.vitals[m];
      cx.notify();
    });
  }

  // One /proc read per machine every TICK; a machine still answering the last is skipped.
  sampleVitals(cx) {
    const names = this.machines.filter((m) => !this.sampling.has(m));
    if (!names.length) return;
    cx.spawn(async (cx) => {
      await Promise.all(names.map(async (m) => {
        this.sampling.add(m);
        try {
          const r = await exec("sh", ["-c", VITALS_SH], { on: m }).catch(() => null);
          if (!r || r.code !== 0) return;
          const v = parseVitals(r.stdout, this.vitals[m], Date.now());
          if (v) this.vitals[m] = v;
        } finally { this.sampling.delete(m); }
      }));
      cx.notify();
    });
  }

  // The last 5 minutes of CPU as real bars, oldest left: each 10 s average,
  // tinted by its own level, bottom-aligned in a SPARK_H-tall box.
  spark(m, hist, t, tone) {
    const hs = sparkHeights(hist);
    return h_flex().id(`v-${m}-spark`).h(SPARK_H).gap(1).flex_none().items_end().tooltip(`CPU, last 5 min (peak ${Math.round(Math.max(...hist))}%)`)
      .children(hist.map((x, i) => div().w(3).h(hs[i]).rounded(1).flex_none().bg(tone(x, 70, 90))));
  }

  machineChip(m, t) {
    const v = this.vitals[m];
    if (!v) return null;
    const tone = (x, warn, hot) => (x >= hot ? t.ansi1 : x >= warn ? t.ansi3 : t.muted);
    const cpuTone = tone(v.cpu ?? 0, 70, 90);
    // Each stat: its icon, tinted like its value, and the value; the name on hover.
    const stat = (icon, name, value, color) => h_flex().id(`v-${m}-${icon}`).gap(3).flex_none().items_center().tooltip(name)
      .child(svg(`mods/status-strip/icons/${icon}.svg`).size(11).flex_none().text_color(color)).child(div().text_color(color).child(value));
    return h_flex().id(`v-${m}`).gap(9).flex_none().items_center()
      .child(svg("mods/workspace-chrome/server.svg").size(11).flex_none().text_color(t.dim))
      .child(div().text_color(t.dim).child(m))
      .child(stat("cpu", "CPU, last 2 s", v.cpu == null ? "—" : `${Math.round(v.cpu)}%`, cpuTone))
      .when(v.hist.length > 1, (el) => el.child(this.spark(m, v.hist, t, tone)))
      .child(stat("memory", "Memory in use", `${Math.round(v.mem)}%`, tone(v.mem, 80, 92)))
      .child(stat("gauge", `Load, 5 min average, ${v.cores} cores`, `${v.load5.toFixed(1)}/${v.cores}`, tone((100 * v.load5) / v.cores, 80, 120)));
  }

  async conf() {
    const raw = await fs.readFile(`${home()}/.config/herdr-app/${CONF}`, "utf8");
    const [base, token] = raw.split("\n").map((l) => l.trim());
    if (!base?.startsWith("https://") || !/^[0-9a-f]{16}$/.test(token ?? "")) throw new Error(`${CONF}: URL then token`);
    return { base: base.replace(/\/+$/, ""), token };
  }

  load(cx) {
    cx.spawn(async (cx) => {
      try {
        const { base, token } = await this.conf();
        const headers = { "x-9r-cli-token": token };
        const r = await fetch(`${base}/api/providers`, { headers });
        if (!r.ok) throw new Error(r.status === 401 ? "token refused" : `providers ${r.status}`);
        const conns = ((await r.json()).connections ?? []).filter((c) => c.isActive !== false);
        const rows = await Promise.all(conns.map(async (c) => {
          const u = await fetch(`${base}/api/usage/${encodeURIComponent(c.id)}`, { headers }).catch(() => null);
          return u?.ok ? summarize(c, await u.json().catch(() => null)) : null;
        }));
        this.rows = rows.filter(Boolean);
        this.error = null;
      } catch (e) {
        this.error = String(e?.message ?? e);
      }
      cx.notify();
    });
  }

  // One provider: its mark and name in brand color, then the pool's left
  // and soonest reset. Hover lists each account: its tightest window, then
  // every window it has.
  chip(group, t) {
    const brand = brandOf(group[0]);
    const p = pool(group);
    const color = p.pct == null ? t.muted : p.pct <= 10 ? t.ansi1 : p.pct <= 30 ? t.ansi3 : t.muted;
    const left = p.kind === "balance" ? p.text : `${Math.round(p.pct)}%`;
    const reset = p.resetAt ? untilText(p.resetAt - Date.now()) : "";
    const windowLine = (n, w) => w.isCreditBalance
      ? `    ${n}: ${(w.total - (w.used ?? 0)).toFixed(2)} ${w.currency ?? ""}`
      : `    ${n}: ${Math.round(w.remainingPercentage ?? w.remaining ?? 0)}% left${w.resetAt ? `, resets in ${untilText(Date.parse(w.resetAt) - Date.now())}` : ""}`;
    const accountLines = group.map((r, i) => {
      const head = r.kind === "balance" ? r.text : `${Math.round(r.pct)}% left${r.resetAt ? `, resets in ${untilText(r.resetAt - Date.now())}` : ""}`;
      return [`${shortName(r.account, i)} — ${head}`, ...Object.entries(r.all).filter(([, w]) => w && !w.unlimited).map(([n, w]) => windowLine(n, w))].join("\n");
    });
    const title = `${brand?.name ?? group[0].label}${group.length > 1 ? ` · ${group.length} accounts, ${left} pooled` : ""}`;
    return h_flex().id(`qg-${group[0].id}`).gap(4).flex_none().items_center()
      .tooltip([title, ...accountLines].join("\n"))
      .when(Boolean(brand), (el) => el.child(image(`mods/status-strip/icons/providers/${brand.icon}.svg`).size(12).flex_none()))
      .child(div().text_color(brand?.color ?? t.dim).child(brand?.name ?? group[0].label))
      .when(group.length > 1, (el) => el.child(div().px(3).rounded(3).bg(t.hover).text_size(10).text_color(t.muted).child(`×${group.length}`)))
      .child(div().text_color(color).child(left))
      .when(Boolean(reset), (el) => el.child(svg("mods/workspace-chrome/clock.svg").size(11).text_color(t.dim)).child(div().text_color(t.dim).child(reset)));
  }

  render() {
    const t = theme();
    const machines = this.machines.map((m) => this.machineChip(m, t)).filter(Boolean);
    const quota = this.error ? [div().text_color(t.dim).child(`9router: ${this.error}`)]
      : this.rows.length ? groupRows(this.rows).map((g) => this.chip(g, t))
      : [div().text_color(t.dim).child("9router: …")];
    return h_flex().size_full().px(14).gap(14).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.5).text_color(t.muted)
      .children(machines)
      .child(div().flex_1())
      .children(quota);
  }
}
