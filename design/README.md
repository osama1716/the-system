# design

Source artwork, at the resolution it was made. Nothing here is served or
loaded by the app — everything the app uses lives in `icons/`, generated from
these.

They are kept because the generated files are one-way: `icons/icon-512-v2.png`
cannot be turned back into something you can crop, recolour, or re-export at a
different size. Losing the sources means the next change to the mark starts
from scratch.

## What belongs here

| File | What it is |
|---|---|
| `mark-source-light-body.png` | The light-bodied mark — the one that sits on dark backgrounds |
| `mark-source-dark-body.png` | The dark-bodied mark — the one that sits on light backgrounds |

Named by the colour of the mark itself, with the background it belongs on
spelled out, because "dark logo" alone is ambiguous and the two get swapped
exactly once before somebody notices the contrast is inverted.

## How `icons/` was generated from these

No image tooling is installed and none is needed. The browser's canvas
resamples well, so each size was rendered there and the bytes written to disk
through a throwaway local endpoint. The steps, if it has to be done again:

1. Trim the transparent border, so a CSS width is all mark and no padding.
2. In-app marks (`mark-on-dark.png`, `mark-on-light.png`): 176px wide,
   transparent, both bodies. CSS shows one based on `data-theme`.
3. App icons and favicon: centred on a solid `#100d0a` tile, **not**
   transparent — a home screen or tab strip can be either colour and an
   unbacked mark disappears into one of them.
4. Maskable: the same tile, content inside the central ~62%, because Android
   crops it to a circle.
5. Filenames carry a version suffix. Rewriting the same path leaves browsers
   serving the old bytes from cache; a new path cannot be stale.

Contrast was measured rather than eyeballed: 11.1:1 and 13.0:1 on the
backgrounds each belongs on, against 1.4:1 and 1.2:1 if the two are swapped.
