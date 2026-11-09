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

import { View, div, svg } from "gpui-kit";
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

const SPARK = "▁▂▃▄▅▆▇█";
export const spark = (hist) => hist.map((x) => SPARK[Math.min(7, Math.floor((x / 100) * 8))]).join("");

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
  return { id: conn.id, provider: conn.provider, label: labelOf(conn, usage), ...worst, all: q };
}

// "claude", "codex", "glm", "deepseek", else the account's name.
function labelOf(conn, usage) {
  const p = conn.provider ?? "";
  if (!p.startsWith("openai-compatible")) return p;
  return conn.name ?? usage?.plan ?? "custom";
}

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
      .when(v.hist.length > 1, (el) => el.child(div().id(`v-${m}-spark`).flex_none().tooltip("CPU, last 5 min").text_color(cpuTone).font_family("JetBrains Mono").child(spark(v.hist))))
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
        this.rows = rows.filter(Boolean).sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101));
        this.error = null;
      } catch (e) {
        this.error = String(e?.message ?? e);
      }
      cx.notify();
    });
  }

  chip(r, t) {
    const color = r.pct == null ? t.muted : r.pct <= 10 ? t.ansi1 : r.pct <= 30 ? t.ansi3 : t.muted;
    const left = r.kind === "balance" ? r.text : `${Math.round(r.pct)}%`;
    const reset = r.resetAt ? untilText(r.resetAt - Date.now()) : "";
    const detail = Object.entries(r.all).map(([n, w]) => w.isCreditBalance
      ? `${n}: ${(w.total - (w.used ?? 0)).toFixed(2)} ${w.currency ?? ""}`
      : `${n}: ${Math.round(w.remainingPercentage ?? w.remaining ?? 0)}% left${w.resetAt ? `, resets in ${untilText(Date.parse(w.resetAt) - Date.now())}` : ""}`).join("\n");
    return h_flex().id(`q-${r.id}`).gap(4).flex_none().items_center().tooltip(`${r.label}\n${detail}`)
      .child(div().text_color(t.dim).child(r.label))
      .child(div().text_color(color).child(left))
      .when(Boolean(reset), (el) => el.child(svg("mods/workspace-chrome/clock.svg").size(11).text_color(t.dim)).child(div().text_color(t.dim).child(reset)));
  }

  render() {
    const t = theme();
    const machines = this.machines.map((m) => this.machineChip(m, t)).filter(Boolean);
    const quota = this.error ? [div().text_color(t.dim).child(`9router: ${this.error}`)]
      : this.rows.length ? this.rows.map((r) => this.chip(r, t))
      : [div().text_color(t.dim).child("9router: …")];
    return h_flex().size_full().px(14).gap(14).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.5).text_color(t.muted)
      .children(machines)
      .child(div().flex_1())
      .children(quota);
  }
}
