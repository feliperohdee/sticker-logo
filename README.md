# sticker-logo

Sticker logos as SVG (and PNG): heavy letters, a round outline, a solid extrusion. Every version is a JSON config, so you, or an agent, make a new one by editing data, never the script.

```sh
yarn install
yarn build                    # every logo × theme in logo.config.json → out/
node logo.mjs --text "the way"   # quick: an inline and a stacked logo of any text
```

Open `out/preview.html` to see them all. `out/manifest.json` lists every file written, with its logo, theme and format.

## Flags

| Flag                  | What it does                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `-c, --config <file>` | The config (default `logo.config.json`).                                                                                                     |
| `-t, --text <text>`   | Quick mode: an `inline` logo of the text and a `stacked` one, one word per line. Uses the config's font, style and themes when there is one. |
| `-l, --logo <names>`  | Only these logos, comma separated: `--logo inline,navbar`.                                                                                   |
| `--theme <names>`     | Only these themes, comma separated.                                                                                                          |
| `-o, --out <dir>`     | Output folder.                                                                                                                               |
| `--png <sizes>`       | Also PNGs at these widths: `--png 512,1024`.                                                                                                 |
| `--list`              | Print the logos and themes in the config, write nothing.                                                                                     |

## Config

```jsonc
{
  "name": "embed-editor", // file prefix: <name>-<logo>-<theme>[-transparent].svg
  "font": { "fontsource": "inter", "weight": 900 },
  "style": {
    "size": 190, // letter size, px
    "tracking": -9, // space between letters (negative pulls them together)
    "wordSpacing": 30, // space between words on a line
    "lineHeight": 158, // baseline to baseline, stacked lines
    "indent": 60, // each stacked line starts this much further right
    "outline": 26, // outline width
    "extrusion": { "depth": 30, "direction": "down-left", "step": 1.5 },
    "fillGaps": true // solid ink between stacked lines: no background shows through
  },
  "themes": {
    "lime": { "background": "#A3E635", "ink": "#09090B", "fill": "#FFFFFF" }
  },
  "logos": [
    {
      "name": "stacked",
      "lines": ["embed", "editor"],
      "square": true,
      "padding": 150
    },
    { "name": "inline", "lines": ["embed editor"] },
    {
      "name": "navbar",
      "lines": ["embed editor"],
      "style": { "outline": 18, "extrusion": { "depth": 16 } }
    }
  ],
  "output": {
    "dir": "out",
    "background": true,
    "transparent": true,
    "padding": 70,
    "png": []
  }
}
```

- **Theme colours:** `ink` paints the outline and the extrusion, `fill` the letters, `background` the backdrop of the non-transparent files.
- **A logo overrides anything:** its own `style` or `font` merges over the config's, as the `navbar` logo does for a lighter outline at small sizes.
- **Lines:** a line is a string, or `{ "text": "editor", "x": 60, "y": 158 }` to place it by hand. Without `x` and `y`, line `i` sits at `i × indent`, `i × lineHeight`.
- **Extrusion direction:** `down-left`, `down-right`, `up-left`, `up-right`, `down`, `up`, `left`, `right`, or `[dx, dy]`.
- **Outputs:** `background` writes the file with its backdrop, padded by `padding` (square when the logo says `square`). `transparent` writes it without a backdrop, cropped tight. `png` lists the widths to render.
- **Fonts:**
  - `{ "fontsource": "<name>", "weight": 900 }` takes any [Fontsource](https://fontsource.org) family. Install it first with `yarn add @fontsource/<name>`. The weight must exist for that family.
  - `{ "file": "fonts/my-font.otf" }` takes a `.ttf`, `.otf` or `.woff` file, relative to the config. `.woff2` doesn't work.

## Recipes

- **A bolder sticker:** raise `outline` (30 to 34) and `extrusion.depth` (40 to 50).
- **Tighter lines:** lower `lineHeight` until the second line's ascenders touch the first line's outline, around `0.8 × size` for Inter.
- **A favicon or app icon:** add a logo with one short line (`["ee"]`), `"square": true`, and render `--png 512`.
- **Another brand:** copy `logo.config.json`, change `name`, `font`, `themes` and `logos`, then run `node logo.mjs -c that.json`.

## For agents

- Run `node logo.mjs --list` to see what a config makes. Change the config and run `node logo.mjs`, then read `out/manifest.json` for the paths. Every error goes to stderr with exit code 1 and names the field to fix.
- Don't edit `logo.mjs` to change a logo. Every visual parameter is in the config.
- To check a result visually, render a PNG (`--png 800`) and look at it.
