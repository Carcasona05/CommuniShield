# Manual-only single-field profile address

Deploy the backend, then the client. **No SQL migration is required** for this
single-field form; it uses the existing `profiles.location` column.

`manual_profile_address.sql` is the superseded two-field migration. Do not run it
for this release. If already applied, leave its extra columns in place; no rollback
or deletion is needed. Existing full addresses in `location` remain visible and
eligible without reentry. The updated application does not use those extra columns.

Address is one free-text field, limited to 500 characters. Include street/purok,
barangay, city/municipality and province; house number is optional. Addresses
outside Argao are allowed. Validation checks nonempty text and its length, not
residency or the truth of each address component.

Saving Profile Details sends `location` in ONE `/profile` update, together with
the other edited details. It never requires
GPS permission or a location-verification row. Stored addresses are user-provided,
not independently verified. The old GPS verification table no longer gates access
and can be dropped with `drop_unused_profile_location_verifications.sql` after
deploying the latest code and backing up any history you need.

There is no profile location button, consent modal or geocoding request.
The `/profile/address-suggestion` endpoint and profile GPS helper are removed.
Only Save persists the manually typed full address. GPS remains available for
maps, nearby alerts and incident locations, independently of the profile address.

The 16+ birthdate and credibility requirements remain enforced. Report location
and nearby-alert location behavior are unchanged and remain separate from the
user's home/permanent address. No map provider is contacted to fill profile details.
