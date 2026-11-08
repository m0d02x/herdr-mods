# space-folders (repo favicons, dev links)

Herdr's spaces sidebar with colored, foldable folders — from [jankeesvw/herdr-space-folders](https://github.com/jankeesvw/herdr-space-folders) (MIT, see `LICENSE`) — **patched so each space's avatar is its repo's own favicon, and a ↗ on its row opens the repo's running frontend**.

## What changed upstream

`main.js` only:

- After the git pass finds a space's repo, `git ls-files` there (on whichever machine it lives) for a committed favicon. Best first: `apple-touch-icon*.png`, `favicon-192/512*.png`, `icon.png|svg`, `favicon.svg`, `favicon*.png`, `favicon.ico`; ties go to the shorter path; `node_modules`, `vendor`, `dist` and test folders skipped.
- The file is read as base64 through `exec` (binary-safe, works for remote machines) and cached once per repo in `~/.config/herdr-app/data/favicons/`. `.ico` becomes PNG with macOS `sips`.
- `row()` draws it with `image()`; spaces without a favicon (or not repos) keep the colored letter.

A changed favicon needs its cached file deleted.

### Dev links (↗)

- Every 30 s, on the space's machine, finds frontend dev servers (vite, next, astro, nuxt, remix, webpack, preview) listening from inside the repo — via `ss` + `/proc`, so pm2, tmux or a bare `bun dev` all count. Ports ≥ 32768 (HMR sockets, stray copies) are ignored unless served.
- A click opens, first that exists: the public domain a running `cloudflared` tunnel routes to that port (read from each tunnel's `--config`), its `tailscale serve` URL, `http://<machine>:<port>` when it listens on all interfaces.
- Otherwise ↗ is dimmed and offers **Expose on tailnet**: `tailscale serve --bg` on the next free HTTPS port, then opens it. Needs `sudo tailscale set --operator=$USER` once on that machine.
- Several frontends in one repo open a short menu.

Linux machines only; a Mac's own spaces show no links.

## Install

```sh
cp -R mods/space-folders ~/.config/herdr-app/mods/
# in your cloned layout, set the spaces block: "content": { "mod": "space-folders" }
herdr-app check ~/.config/herdr-app/mods/space-folders
```

Upstream ships keys for stepping through spaces in folder order (`space-folders.next` / `.prev`, bound per layout); add them from its repo if you want them.
