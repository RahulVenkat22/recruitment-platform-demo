# Brand artwork

Source files for the Buro Happold logos, kept out of `frontend/public/` so they
are not shipped with the production build.

| File | What it is |
| --- | --- |
| `burohappold-wordmark-source.png` | The BURO HAPPOLD wordmark (2170×725, transparent): black letters between two lime bars. |
| `burohappold-mark-source.png` | The lime "B" tile (1254×1254, transparent). |

The web-ready cuts derived from these live in `frontend/public/brand/`:

- `burohappold-logo.png` — wordmark at 1086×362 for light surfaces.
- `burohappold-logo-for-dark-bg.png` — same, with the letters recoloured white for graphite surfaces (the bars are untouched).
- `burohappold-b-mark.png` — the tile at 320×320 (sidebar, splash).
- `burohappold-favicon.png` — the tile at 64×64 (browser tab).

The current TalentOS identity uses a geometric folded "T" ribbon with a shaded fold.
The transparent SVG artwork scales to the sidebar, login header, and welcome loader:

- `frontend/public/brand/talentos-mark.svg` — pale sage for dark surfaces.
- `frontend/public/brand/talentos-mark-light.svg` — forest green for light surfaces.

`frontend/src/components/shared/TalentOSLogo.tsx` selects the surface variant and pairs
it with the TalentOS wordmark. The "OS" uses a lighter weight and a sage accent.
The earlier people-and-network artwork (`talentos-logo-source.png` and
`frontend/public/brand/talentos-mark.png`) is retained as source history and is no
longer used by the shared logo component.
