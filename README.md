# herdr mods

Mods for the [Herdr](https://herdr.dev) app, used across our machines (macOS + an Ubuntu VPS). Install by pointing your agent at this repo, or copy a `mods/<name>/` folder into `~/.config/herdr-app/mods/`.

| Mod | What it does | Based on |
|---|---|---|
| [`auto-tabs`](mods/auto-tabs/) | Tab bar whose tabs name themselves from agent task titles, running programs, or folders | [longwave/herdr-auto-tabs](https://github.com/longwave/herdr-auto-tabs), patched for [omp](https://github.com/)? agents |
| [`vitals`](mods/vitals/) | Live machine health window (⌘⌥V): CPU equalizer, memory/load/network meters, disks, any connected machine | [mrolafsson/herdr-vitals](https://github.com/mrolafsson/herdr-vitals) (MIT, vendored unmodified) |

## Installing

Give your Herdr agent the repo URL (`https://github.com/m0d02x/herdr-mods`), or by hand:

```sh
cp -R mods/auto-tabs ~/.config/herdr-app/mods/
herdr-app check ~/.config/herdr-app/mods/auto-tabs
```

`auto-tabs` is a tab-bar replacement: clone your layout first and point its tabs block at it (see [its README](mods/auto-tabs/README.md)). `vitals` opens with ⌘⌥V and provisions its sampler itself, per machine, on first view.

## Adding a mod

One folder per mod under `mods/<name>/`: `main.js`, `mod.json`, a `README.md` and `preview.png`. Each folder is self-contained, as herdr.dev's registry expects.
