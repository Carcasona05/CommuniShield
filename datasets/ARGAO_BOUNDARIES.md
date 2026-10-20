# Argao barangay assignment

The two generated `argaoBarangayBoundaries.json` files contain the same 45
Argao barangay polygons (WGS84 longitude/latitude). Separate copies let Expo
and the Vercel server deploy independently. Tests check that they stay identical.

Source: [faeldon/philippines-json-maps, 2019 high-resolution Argao GeoJSON](https://github.com/faeldon/philippines-json-maps/blob/master/2019/geojson/barangays/hires/barangays-municity-ph072205000.0.1.json).
Pinned Git blob: `f399a677989cad33235169e0e8f5954c42f23df9`.
Upstream provides PSA/PSGC-derived administrative boundaries under MIT (notice below).
These are indicative, simplified boundaries, not a legal cadastral survey;
pins near disputed/shared boundaries need local verification. Do not claim
street-level survey accuracy or use nearest barangay-hall distance as a boundary.

Regenerate both snapshots with `node datasets/sync_argao_boundaries.mjs`.
The script validates the municipality, count, and coordinate system and does not
further simplify or round coordinates.

Assignment rules:

- A pin uniquely inside a polygon uses that barangay, regardless of street name.
- Polygon holes and locations outside Argao do not get an invented assignment.
- A shared-edge/overlap match uses an explicit address barangay only when it is
  one of the matching polygons; otherwise it stays unresolved.
- Missing/invalid coordinates can use an explicit recognized barangay. A street
  name alone is insufficient. No whole-street aliases are used.
- Existing reports are resolved on read: no destructive data migration is needed.

## Upstream license

The MIT License (MIT)

Copyright (c) James Faeldon

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
