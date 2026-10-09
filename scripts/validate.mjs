// Validates every tip against content/tip.schema.json and every translation
// against content/translation.schema.json. Exits non-zero on any error.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { loadTips, translationLangs, ROOT, TIPS_DIR } from "./tips.mjs";
import { LANGUAGES } from "../src/i18n.mjs";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const schema = (f) => ajv.compile(JSON.parse(readFileSync(join(ROOT, "content", f), "utf8")));
const validateTip = schema("tip.schema.json");
const validateTranslation = schema("translation.schema.json");

const errors = [];
const warnings = [];
const today = new Date().toISOString().slice(0, 10);
const countNocite = (text) => text.split("{nocite}").length - 1;
const report = (file, v) => v.errors.forEach((e) => errors.push(`${file}: ${e.instancePath || "(root)"} ${e.message}`));
const tips = loadTips();
const ids = new Set(tips.map((t) => t.id));

for (const tip of tips) {
  const d = tip.data;
  if (!validateTip(d)) report(tip.file, validateTip);
  if (d.id !== tip.id) errors.push(`${tip.file}: id "${d.id}" must match the file name`);
  if (!tip.body) errors.push(`${tip.file}: body is empty`);
  for (const id of d.pairs_with || []) {
    if (!ids.has(id) || id === tip.id) errors.push(`${tip.file}: pairs_with "${id}" is not another tip's id`);
  }
  // "BE" already covers every region, so it stands alone.
  if (d.regions.includes("BE") && d.regions.length > 1) errors.push(`${tip.file}: regions "BE" covers all of Belgium, so list no other region`);

  // Variable tips must be checked again by review_by; overdue ones are flagged on the site.
  if (d.stability === "variable" && d.review_by < today) warnings.push(`${tip.file}: review_by ${d.review_by} has passed; check the tip again`);

  // A yearly kWh figure for the whole home must fall inside its impact band.
  const { kwh, kwh_min, per } = d.impact;
  if (kwh_min && !(kwh > kwh_min)) errors.push(`${tip.file}: impact.kwh_min ${kwh_min} needs a larger impact.kwh`);
  if (kwh && !per) {
    const band = kwh >= 1000 ? "large" : kwh >= 250 ? "medium" : "small";
    if (band !== d.impact.band) errors.push(`${tip.file}: impact.kwh ${kwh} belongs in band "${band}", not "${d.impact.band}"`);
  }

  // A payback time must come from one of the tip's sources, and depends on prices, so the tip is variable.
  if (d.payback) {
    if (d.payback.source >= d.sources.length) errors.push(`${tip.file}: payback.source ${d.payback.source} is not a source index (0 to ${d.sources.length - 1})`);
    if (d.payback.min_years > d.payback.max_years) errors.push(`${tip.file}: payback.min_years is above max_years`);
    if (d.stability !== "variable") errors.push(`${tip.file}: has a payback time, so stability must be "variable"`);
  }

  // Uncited text must be visible: {nocite} markers need a no-citation flag, and neither can be "verified".
  const markers = countNocite(tip.body);
  const noCitationFlag = d.verification.flags.some((f) => f.type === "no-citation");
  if (markers && !noCitationFlag) errors.push(`${tip.file}: has {nocite} markers but no "no-citation" flag explaining them`);
  if ((markers || noCitationFlag) && d.verification.status === "verified") errors.push(`${tip.file}: has uncited content, so status can't be "verified"`);

  // Every site language needs the tip's text, either in the main file or a translation.
  for (const lang of LANGUAGES) {
    if (d.lang === lang) continue;
    const tr = tip.translations[lang];
    if (!tr) { errors.push(`${tip.file}: missing ${lang} translation (content/tips/${lang}/${tip.file})`); continue; }
    const t = tr.data;
    if (!validateTranslation(t)) report(tr.file, validateTranslation);
    if (t.id !== tip.id) errors.push(`${tr.file}: id must be "${tip.id}"`);
    if (t.lang !== lang) errors.push(`${tr.file}: lang must be "${lang}"`);
    if (!tr.body) errors.push(`${tr.file}: body is empty`);
    if (countNocite(tr.body) !== markers) errors.push(`${tr.file}: needs the same number of {nocite} markers as the main file (${markers})`);
    if (Boolean(d.impact.basis) !== Boolean(t.impact_basis)) errors.push(`${tr.file}: impact_basis ${d.impact.basis ? "missing" : "is set but the main file has no impact.basis"}`);
    if (d.region_notes && !t.region_notes) errors.push(`${tr.file}: region_notes missing`);
    if ((t.flags || []).length !== d.verification.flags.length) errors.push(`${tr.file}: flags must match the main file (${d.verification.flags.length})`);
    if (t.supports && t.supports.length !== d.sources.length) errors.push(`${tr.file}: supports must have one entry per source (${d.sources.length})`);
  }
}

// Translations without a main file.
for (const lang of translationLangs()) {
  for (const f of readdirSync(join(TIPS_DIR, lang)).filter((f) => f.endsWith(".md"))) {
    if (!ids.has(f.slice(0, -3))) errors.push(`${lang}/${f}: no matching tip in content/tips/`);
  }
}

if (warnings.length) console.warn(`! ${warnings.length} warning(s):\n` + warnings.map((w) => `  - ${w}`).join("\n"));
if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):\n` + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}
console.log(`✓ ${tips.length} tips are valid in ${LANGUAGES.join(", ")}`);
