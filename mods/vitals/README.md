# vitals

Live machine health in a window beside your work: CPU as a graphic equalizer, memory/load/network meters, disks, OK/WARN/HOT, any connected machine from a dropdown. Vendored unchanged from [mrolafsson/herdr-vitals](https://github.com/mrolafsson/herdr-vitals) (MIT — see `LICENSE`).

## Install

```sh
cp -R mods/vitals ~/.config/herdr-app/mods/
# merge its keys.json into ~/.config/herdr-app/keys.json:
#   global:  "cmd-alt-v": "mod.open:vitals"
#   mod:vitals: { "escape": "vitals.close" }
herdr-app check ~/.config/herdr-app/mods/vitals
```

Open with ⌘⌥V. On first view of each machine it fetches the herdr-vitals release it needs onto that machine (checksum-verified, `~/.local/share/herdr-vitals/app/<version>/`) — nothing to install by hand, anywhere. `herdr-app do vitals.demo` shows made-up machines.
