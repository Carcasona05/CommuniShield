# Argao map references

Run `argao_real_emergency_locations.sql` in Supabase SQL Editor for existing
databases, then redeploy the server/client. The migration updates the two named
stations in place, preserving IDs and unrelated facilities. Repeating it is safe.
No barangay SQL migration is necessary; the 45 area markers are bundled.

## Sources and precision

- Police: https://www.openstreetmap.org/way/627985721
  (`9.8807935, 123.6087917`, the mapped station building's bounding-box center).
- Fire: https://www.openstreetmap.org/way/558963703
  (`9.8819689, 123.6003262`, the mapped station building's bounding-box center).
  This lies inside user-supplied Plus Code `VJJ2+Q4, Argao, Cebu`, expanded to
  `6QX5VJJ2+Q4`. The cell is 9.881875–9.882000 N,
  123.600250–123.600375 E. A building reference is not a surveyed entrance.
- Station addresses/phone numbers: supplied by the project owner. They were not
  independently confirmed by telephone. `911` remains a general emergency number,
  not a substitute displayed as a station's direct phone number.
- Barangay areas: existing reference coordinates checked against all 45 bundled
  polygons in `clients/constants/argaoBarangayBoundaries.json`. The pinned source
  and 2019 boundary vintage are recorded in that file and
  `datasets/sync_argao_boundaries.mjs`. These are AREA markers, not verified hall
  entrances. Existing reporting/filtering coordinates are preserved.

Google Maps lookups were attempted but returned no usable place coordinates in
this environment. The station coordinates above were independently looked up via
OpenStreetMap/Nominatim instead. Do not claim Google verification. Each station
and barangay area has a Google Maps search link for visual cross-checking.
Existing medical-facility records are retained, not newly certified by this change.

The map already uses real OpenStreetMap tiles; it is not a fake basemap. The
correction prevents old database seed pins from overriding sourced locations,
hides explicitly sample/demo facility records from the user map, and stops showing
the default viewport as if it were the user's actual GPS location. Distances are
shown only when actual device coordinates are available. Nearby distinct hospitals
and clinics are no longer hidden by the old 2.5-km same-type deduplication rule.
