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
const report = (file, v) => v.errors.forEach((e) => errors.push(`${file}: ${e.instancePath || "(root)"} ${e.message}`));
const tips = loadTips();
const ids = new Set(tips.map((t) => t.id));

for (const tip of tips) {
  const d = tip.data;
  if (!validateTip(d)) report(tip.file, validateTip);
  if (d.id !== tip.id) errors.push(`${tip.file}: id "${d.id}" must match the file name`);
  if (!tip.body) errors.push(`${tip.file}: body is empty`);

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

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):\n` + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}
console.log(`✓ ${tips.length} tips are valid in ${LANGUAGES.join(", ")}`);
