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
| `category` | heating, hot-water, ventilation-moisture, electricity, appliances, lighting, renewables, contracts-billing, rights-rules, help-subsidies, insulation, windows-doors, indoor-air, smart-home-monitoring, building-rules |
| `kind` | practice (something to do), explainer (a rule explained, e.g. EPB or EPC), service (a pointer to an existing tool or service) |
| `stage` | living-in, renovating, building-new |
| `stability` | constant (good practice that barely changes with laws or prices) or variable (depends on rules, premiums, tariffs or a service that can change) |
| `review_by` | required for variable tips: the date by which the tip must be checked again |
| `rung` | the effort level, 1 to 5 (see below) |
| `time_needed` | minutes, hours, days, weeks |
| `upfront_cost` | none (€0), under-100, 100-2500, 2500-25000, over-25000 (euro) |
| `estimated_savings` | `kind`, optional `value` + `unit`, the `basis` behind the number, and `confidence` |
| `responsibility` | tenant, landlord or shared |
| `needs_landlord_permission` | true/false |
| `pairs_with` | ids of tips to do together with this one, or first |
| `region_notes` | rules that only hold in the listed regions |
| `sources` | at least one; each has title, publisher, exact page url, accessed date, and optionally `locator` (where on the page) and `supports` (which claim it backs) |
| `verification` | `status` (verified, needs-check, needs-source) and `flags` with open questions |
| `lang`, `last_reviewed` | language and date of last review |

## The effort ladder

`rung` places a tip on a five-level ladder. The site shows everything up to the level a reader picks, so raising it adds harder options without hiding the easy ones. Set it by hand: cost and time are shown separately, because some things are easy but expensive and others cheap but hard.

| Level | Name | What it takes |
|---|---|---|
| 1 | Habit | A change in routine, minutes, nothing to buy |
| 2 | Quick fix | An afternoon of DIY, usually under €100 |
| 3 | Upgrade | One product or one technician visit |
| 4 | Renovation | One building element with a contractor, often with a premium |
| 5 | Deep renovation | Several elements at once, an architect, EPB rules apply |

## Constant and variable

Mark a tip `variable` when acting on it depends on something that can change: a law or rental rule, a premium, a tariff, a price, or an existing service. Variable tips need a `review_by` date. The site tells readers to check the source before acting, and flags the tip as overdue once that date passes. A `constant` tip still needs a citation like every other tip.

## Languages

The site is published in Dutch and English, with an NL | EN switch on every page. The main tip file (`tips/<id>.md`) holds all structured data plus the English text. The Dutch text lives in `tips/nl/<id>.md`, which only contains the reader-facing fields (`title`, `summary`, `savings_basis`, `region_notes`, `flags`, `supports`) and the translated body. Its format is defined in [`translation.schema.json`](translation.schema.json). The build fails if a tip is missing a translation.

## Rules for contributors

- Every tip cites at least one source, and every number in it must be traceable to a cited page. Use `locator` to say where on the page (section heading, or page and tip number in a PDF) and `supports` to say which claim it backs.
- Write the essence in your own words. Don't copy text or tables of figures from the source; readers who want the detail follow the link.
- Link to the exact page, not a home page.
- Prefer primary sources (vlaanderen.be, VREG, Fluvius, VEKA, FOD Economie). Set `type` on each source (official, consumer-organisation, commercial, media, other) so readers can see what kind of source it is.
- Anything not backed by a cited source (our own advice or reasoning) gets `{nocite}` right after the sentence, in every language, plus a `no-citation` flag explaining it. The site shows those sentences with a "No citation" label, and the build refuses to mark such a tip as verified.
- Figures that change yearly (tariffs, income limits, premiums) get a flag reminding reviewers to recheck them.
- Region-specific rules go in `region_notes`, and `regions` must list only regions where the tip holds.

## Planned checks (once the repository exists)

- On every pull request: validate front matter against the schema, which rejects a tip without a source.
- Monthly: check every source link and open an issue listing broken ones.

## Status of the first batch (Flanders, tenants, 2026-10-07)

30 tips in English and Dutch: 23 verified, 7 need checking (search for `needs-check`). Every source page was opened on 2026-10-07 and the cited content confirmed.

## Second batch (Flanders, owners, 2026-10-07)

11 items for owners and people renovating, at levels 1 to 5: roof and attic floor, cavity walls, glazing, ventilation, a CO2 meter, heat-pump readiness, the Zonnekaart, EPB when renovating, the renovation obligation after buying, the Woningpas, and free renovation coaching. Every source page was opened on 2026-10-07. Cost bands are editorial estimates, like the levels.

## Third batch (Flanders, owners, 2026-10-07)

10 more items for owners, at levels 1 to 4: a heat-pump boiler, a solar water heater, pipe and pump insulation, radiator valves and a room thermostat, the EPC label explained, floor insulation, outer-wall insulation (outside versus inside), airtightness, Mijn VerbouwPremie for owners and Mijn VerbouwLening. Every source page was opened on 2026-10-07. The premium and loan items name no amounts or rates; they point to the official simulators.

## Fourth batch (Flanders, 2026-10-07)

7 items: renovating in the right order, heat pump types, summer comfort without airco, damp and mould, burning wood cleanly, asbestos before renovating, and home batteries. Damp and wood burning are for tenants too. Sealing an unused chimney was left out because no official source covers it. Every source page was opened on 2026-10-07.

## Fifth batch (Flanders, 2026-10-07)

5 items: deciding on new heating before the boiler breaks, heat networks, minimum energy rules for landlords, RESCert-certified installers, and cooking on gas. The cooking item is for tenants too. Draughts at the front door, letterbox and attic hatch were left out because no official Flemish source covers them. Every source page was opened on 2026-10-07.
