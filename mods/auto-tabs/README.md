# auto-tabs (omp patch)

Herdr's tab bar with tabs that name themselves. Based on [longwave/herdr-auto-tabs](https://github.com/longwave/herdr-auto-tabs), **patched to read [omp (oh-my-pi)](https://github.com/can1357/oh-my-pi)'s task titles** (this fleet runs omp, not Claude Code).

## What changed upstream

`names.js` only, two changes:

1. **`TITLED`** — agents whose terminal title carries their task: `claude-code` **and `omp`** (upstream: Claude only). Used both when naming and when picking a tab's primary pane.
2. **Prefix strip** — omp titles start `π ⠋ 󰝜 ` (pi sign, braille spinner, plane-15 private-use model glyph). Upstream stripped "leading non-letters", which keeps `π`. Now strips punctuation/symbols, braille (`U+2800–28FF`), BMP private-use (`U+E000–F8FF`), plane-15 PUA (`U+F0000–FFFFD`), `π`, whitespace.

Everything else is upstream as-is: shells name from their folder at the prompt or their running program; your own renames win until you rename to "" or "Claude Code".

## Install

```sh
cp -R mods/auto-tabs ~/.config/herdr-app/mods/
herdr-app do layout.clone '{"name":"main","as":"my-main"}'
# point the clone's tabs block at this mod: "content": { "mod": "auto-tabs" }
herdr-app check ~/.config/herdr-app/mods/auto-tabs
```

Uninstall: Ctrl+Shift+L back to `main`, delete `mods/auto-tabs` and the cloned layout.

## License note

Upstream carries **no license file**, so this patched copy ships with full attribution and no license grant. Upstream also accepts the omp patch gladly via PR — see the upstream repo.
