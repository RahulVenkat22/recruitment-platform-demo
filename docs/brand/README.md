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

The TalentOS logo comes from `talentos-logo-source.png`, a presentation sheet on black
(1536×1024): three people, the centre one white, over a lime node network, on a graphite
tile. The web-ready cut is `frontend/public/brand/talentos-mark.png` (512×512): the tile
from the top-left of the sheet, re-laid on the same graphite tile and lime hairline as the
rest of the brand set so it pairs with the "B" tile. The "TalentOS" wordmark is set in
text by `frontend/src/components/shared/TalentOSLogo.tsx`, with "OS" in lime as on the sheet.
