# herdr mods

Mods for the [Herdr](https://herdr.dev) app, used across our machines (macOS + an Ubuntu VPS). Install by pointing your agent at this repo, or copy a `mods/<name>/` folder into `~/.config/herdr-app/mods/`.

| Mod | What it does | Based on |
|---|---|---|
| [`auto-tabs`](mods/auto-tabs/) | Tab bar whose tabs name themselves from agent task titles, running programs, or folders | [longwave/herdr-auto-tabs](https://github.com/longwave/herdr-auto-tabs), patched for [omp (oh-my-pi)](https://github.com/can1357/oh-my-pi) agents |
| [`vitals`](mods/vitals/) | Live machine health window (⌘⌥V): CPU equalizer, memory/load/network meters, disks, any connected machine | [mrolafsson/herdr-vitals](https://github.com/mrolafsson/herdr-vitals) (MIT, vendored unmodified) |
| [`space-folders`](mods/space-folders/) | Spaces sidebar with colored folders, and each space's avatar taken from its repo's own favicon | [jankeesvw/herdr-space-folders](https://github.com/jankeesvw/herdr-space-folders) (MIT), patched with repo favicons |
| [`programs/`](programs/) | omp's π icon for every surface (tab bar, agents list, pane headers) | ours |

## Installing

Give your Herdr agent the repo URL (`https://github.com/m0d02x/herdr-mods`), or by hand:

```sh
cp -R mods/auto-tabs mods/space-folders ~/.config/herdr-app/mods/
herdr-app check ~/.config/herdr-app/mods/auto-tabs
```

`auto-tabs` and `space-folders` replace blocks of a layout. [`layouts/my-folders.json`](layouts/my-folders.json) is Herdr's `main` with both already wired in:

```sh
cp -R mods/auto-tabs mods/space-folders ~/.config/herdr-app/mods/
cp layouts/my-folders.json ~/.config/herdr-app/layouts/
herdr-app do layout.switch '{"name":"my-folders"}'
``` `vitals` opens with ⌘⌥V and provisions its sampler itself, per machine, on first view.

After a Herdr update the app may come back on its stock `main` layout; switch back with `herdr-app do layout.switch '{"name":"<your layout>"}'`.

## Adding a mod

One folder per mod under `mods/<name>/`: `main.js`, `mod.json`, a `README.md` and `preview.png`. Each folder is self-contained, as herdr.dev's registry expects.
