# Tip content

Each tip is one Markdown file in `tips/`, named after its `id`. The YAML front matter holds the structured fields the website filters on; the Markdown body is the longer explanation shown on the tip's page.

The fields are defined in [`tip.schema.json`](tip.schema.json) (JSON Schema). A CI check should validate every file against it on each pull request.

## Fields at a glance

| Field | What it is |
|---|---|
| `id` | kebab-case slug, equal to the file name |
| `title`, `summary` | card title and one or two sentence summary |
| `audience` | tenant, homeowner, landlord, architect, building-professional |
| `regions` | ISO 3166-2 codes, e.g. `BE-VLG` for Flanders |
| `category` | heating, hot-water, ventilation-moisture, electricity, appliances, lighting, renewables, contracts-billing, rights-rules, help-subsidies |
| `effort` | low / medium / high |
| `upfront_cost` | none (€0), low (<€50), medium (€50–500), high (>€500) |
| `estimated_savings` | `kind`, optional `value` + `unit`, the `basis` behind the number, and `confidence` |
| `responsibility` | tenant, landlord or shared |
| `needs_landlord_permission` | true/false |
| `region_notes` | rules that only hold in the listed regions |
| `sources` | at least one; each has title, publisher, exact page url, accessed date, and optionally `locator` (where on the page) and `supports` (which claim it backs) |
| `verification` | `status` (verified, needs-check, needs-source) and `flags` with open questions |
| `lang`, `last_reviewed` | language and date of last review |

## Languages

The site is published in Dutch and English, with an NL | EN switch on every page. The main tip file (`tips/<id>.md`) holds all structured data plus the English text. The Dutch text lives in `tips/nl/<id>.md`, which only contains the reader-facing fields (`title`, `summary`, `savings_basis`, `region_notes`, `flags`, `supports`) and the translated body. Its format is defined in [`translation.schema.json`](translation.schema.json). The build fails if a tip is missing a translation.

## Rules for contributors

- Every tip cites at least one source, and every number in it must be traceable to a cited page. Use `locator` to say where on the page (section heading, or page and tip number in a PDF) and `supports` to say which claim it backs.
- Write the essence in your own words. Don't copy text or tables of figures from the source; readers who want the detail follow the link.
- Link to the exact page, not a home page.
- Prefer primary sources (vlaanderen.be, VREG, Fluvius, VEKA, FOD Economie). Set `type` on each source (official, consumer-organisation, commercial, media, other) so readers can see what kind of source it is.
- Advice that is our own reasoning rather than the source's gets a flag and `status: needs-check`.
- Figures that change yearly (tariffs, income limits, premiums) get a flag reminding reviewers to recheck them.
- Region-specific rules go in `region_notes`, and `regions` must list only regions where the tip holds.

## Planned checks (once the repository exists)

- On every pull request: validate front matter against the schema, which rejects a tip without a source.
- Monthly: check every source link and open an issue listing broken ones.

## Status of the first batch (Flanders, tenants, 2026-10-07)

30 tips in English and Dutch: 23 verified, 7 need checking (search for `needs-check`). Every source page was opened on 2026-10-07 and the cited content confirmed.
