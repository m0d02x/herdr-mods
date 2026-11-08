# space-folders (repo favicons)

Herdr's spaces sidebar with colored, foldable folders — from [jankeesvw/herdr-space-folders](https://github.com/jankeesvw/herdr-space-folders) (MIT, see `LICENSE`) — **patched so each space's avatar is its repo's own favicon**.

## What changed upstream

`main.js` only:

- After the git pass finds a space's repo, `git ls-files` there (on whichever machine it lives) for a committed favicon. Best first: `apple-touch-icon*.png`, `favicon-192/512*.png`, `icon.png|svg`, `favicon.svg`, `favicon*.png`, `favicon.ico`; ties go to the shorter path; `node_modules`, `vendor`, `dist` and test folders skipped.
- The file is read as base64 through `exec` (binary-safe, works for remote machines) and cached once per repo in `~/.config/herdr-app/data/favicons/`. `.ico` becomes PNG with macOS `sips`.
- `row()` draws it with `image()`; spaces without a favicon (or not repos) keep the colored letter.

A changed favicon needs its cached file deleted.

## Install

```sh
cp -R mods/space-folders ~/.config/herdr-app/mods/
# in your cloned layout, set the spaces block: "content": { "mod": "space-folders" }
herdr-app check ~/.config/herdr-app/mods/space-folders
```

Upstream ships keys for stepping through spaces in folder order (`space-folders.next` / `.prev`, bound per layout); add them from its repo if you want them.
