// Builds the static site into dist/: an index with search and filters,
// one page per tip, and tips.json for anyone who wants the raw data.
import { mkdirSync, writeFileSync, copyFileSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { marked } from "marked";
import { loadTips, localize, ROOT } from "./tips.mjs";
import { t as tr, label as lb, LANGUAGES, DEFAULT_LANG } from "../src/i18n.mjs";
import { icon } from "../src/icons.mjs";

const DIST = join(ROOT, "dist");
// Set per language in the build loop at the bottom.
let LANG = DEFAULT_LANG;
const t = (key) => tr(LANG, key);
const label = (group, value) => lb(LANG, group, value);
// French puts a non-breaking space before a colon.
const COLON = () => (LANG === "fr" ? "\u00a0: " : ": ");
// Set automatically in GitHub Actions; used for "suggest an edit" links.
const REPO = process.env.GITHUB_REPOSITORY;
const REPO_URL = REPO ? `https://github.com/${REPO}` : null;
const BRANCH = process.env.GITHUB_REF_NAME || "main";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function savingsText(s) {
  if (s.kind === "qualitative" || s.value == null) return null;
  return t(`savings.${s.kind}`).replace("{v}", s.value);
}

// A content hash in the URL makes browsers fetch a changed stylesheet or script at once,
// instead of pairing new pages with a cached old copy.
const version = (f) => createHash("sha256").update(readFileSync(join(ROOT, "src", f))).digest("hex").slice(0, 8);
const ASSET_VERSION = { "style.css": version("style.css"), "app.js": version("app.js") };

function page({ title, description, rel, path, body }) {
  // rel: from this page up to the language root; path: this page below the language root.
  const toggle = LANGUAGES.map((l) => l === LANG
    ? `<span aria-current="true">${l.toUpperCase()}</span>`
    : `<a href="${rel}../${l}/${path}" hreflang="${l}" lang="${l}" data-lang="${l}" title="${esc(tr(l, "lang.name"))}">${l.toUpperCase()}</a>`).join(`<span class="sep">|</span>`);
  const alternates = LANGUAGES.map((l) => `<link rel="alternate" hreflang="${l}" href="${rel}../${l}/${path}">`).join("\n");
  return `<!doctype html>
<html lang="${LANG}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="stylesheet" href="${rel}../style.css?v=${ASSET_VERSION["style.css"]}">
${alternates}
</head>
<body>
<header class="site-header"><div class="wrap">
  <a class="brand" href="${rel}">${esc(t("site.name"))}</a>
  <span class="tagline">${esc(t("site.tagline"))}</span>
  <nav class="lang" aria-label="${esc(t("lang.switch"))}">${toggle}</nav>
</div></header>
<main class="wrap">
${body}
</main>
<footer class="site-footer"><div class="wrap">
  <p>${t("footer.license")}${REPO_URL ? ` · <a href="${REPO_URL}">${esc(t("footer.source"))}</a>` : ""}</p>
  <p>${esc(t("footer.ai"))} <a href="${rel}impact/#ai">${esc(t("footer.aiHow"))}</a></p>
  <p>${esc(t("footer.disclaimer"))}</p>
</div></footer>
<script src="${rel}../app.js?v=${ASSET_VERSION["app.js"]}"></script>
</body>
</html>
`;
}

const hasNoCitation = (d) => d.verification.flags.some((f) => f.type === "no-citation");

// Cost bands from cheapest to dearest; the budget filter shows everything up to the chosen band.
const COSTS = ["none", "under-100", "100-2500", "2500-25000", "over-25000"];
const RUNGS = [1, 2, 3, 4, 5];
const DEFAULT_RUNG = 2;
// "Who are you?" options and the tips each one shows.
const WHO = {
  rent: (d) => d.audience.includes("tenant"),
  own: (d) => d.audience.includes("homeowner") || d.audience.includes("landlord"),
  build: (d) => d.stage.includes("renovating") || d.stage.includes("building-new"),
  flat: (d) => d.tags.includes("apartment"),
};
// Where a reader can live. "BE" items apply in every region.
const REGIONS = ["BE-VLG", "BE-BRU", "BE-WAL"];
// "Do it yourself": stable good practice that holds in all of Belgium. Everything else
// depends on a region's or the federal rules and shows under the reader's region.
const isDiy = (d) => d.stability === "constant" && d.regions.includes("BE");
// Regions the site doesn't cover yet point readers to an official advice service meanwhile.
const COVERAGE = {
  "BE-WAL": { name: "ostbelgienlive.be", url: {}, fallback: "https://ostbelgienlive.be/desktopdefault.aspx/tabid-8275/", language: "de" },
};
// Impact bands from largest to smallest; "unrated" and "indirect" rank last.
const IMPACT = { large: 3, medium: 2, small: 1, unrated: 0, indirect: 0 };
const impactRank = (d) => IMPACT[d.impact.band];
// A big win saves a lot of energy for free or under €100.
const isBigWin = (d) => d.impact.band === "large" && COSTS.indexOf(d.upfront_cost) <= 1;
// kg of CO2 per kWh saved and per forest tree per year, all cited on the impact page:
// natural gas (VEKA-VMM standard factor), electricity (VEKA's fixed factor for a kWh not made
// in a gas-fired STEG plant) and trees (Klimaathelpdesk, from the Dutch forest inventory).
const CO2_PER_KWH = { gas: 0.202, electricity: 0.381 };
const TREE_CO2 = 11;
const roundKg = (kg) => kg >= 100 ? Math.round(kg / 10) * 10 : Math.round(kg / 5) * 5;
const roundTrees = (n) => n >= 10 ? Math.round(n / 5) * 5 : Math.max(1, Math.round(n));
function co2(d) {
  const { energy, kwh, kwh_min, up_to, per } = d.impact;
  if (!CO2_PER_KWH[energy] || !kwh) return null;
  const kg = (k) => k * CO2_PER_KWH[energy];
  return {
    kg: roundKg(kg(kwh)), trees: roundTrees(kg(kwh) / TREE_CO2),
    ...(kwh_min ? { kgMin: roundKg(kg(kwh_min)), treesMin: roundTrees(kg(kwh_min) / TREE_CO2) } : {}),
    upTo: Boolean(up_to), per,
  };
}
// "chip" puts a tree icon after the count (20×🌳); "long" spells it out for the tip page.
function co2Text(c, key) {
  const n = new Intl.NumberFormat(LOCALES[LANG] || LANG);
  const range = (min, max) => (min != null ? `${n.format(min)}–` : "") + n.format(max);
  return t(`co2.${key}${c.upTo ? "UpTo" : ""}${c.per ? "Per" : ""}`)
    .replace("{kg}", range(c.kgMin, c.kg)).replace("{trees}", range(c.treesMin, c.trees))
    .replace("{per}", c.per ? label("per", c.per) : "")
    .replace("{tree}", t(c.trees === 1 ? "co2.tree" : "co2.trees"));
}
function co2Chip(c) {
  const text = esc(co2Text(c, "chip")).replace("{treeIcon}", icon("tree", esc(t(c.trees === 1 ? "co2.tree" : "co2.trees"))));
  return `<span class="chip co2" title="${esc(co2Text(c, "long"))}">${text}</span>`;
}
const TODAY = new Date().toISOString().slice(0, 10);
const isOverdue = (d) => d.stability === "variable" && d.review_by < TODAY;
const levelText = (n) => t("chip.level").replace("{n}", n).replace("{name}", label("rung", n));
// Dates read as "7 Oct 2026" / "7 okt 2026"; the ISO date stays in the markup.
const LOCALES = { nl: "nl-BE", fr: "fr-BE", en: "en-GB" };
const date = (iso) => `<time datetime="${esc(iso)}">${esc(new Intl.DateTimeFormat(LOCALES[LANG] || LANG,
  { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso)))}</time>`;

// "{nocite}" after a sentence in a tip body marks it as not backed by any cited source.
const NOCITE = "{nocite}";
function renderBody(md) {
  const badge = `<span class="nocite-tag" title="${esc(t("nocite.title"))}">${esc(t("nocite.inline"))}</span>`;
  return marked.parse(md).split(NOCITE).join(badge);
}

// A paired tip that only holds in some regions says which, unless the reader's tip is from the same regions.
const regionSuffix = (from, to) => to.regions.includes("BE") || to.regions.join() === from.regions.join()
  ? "" : ` <span class="muted">(${esc(to.regions.map((r) => label("region", r)).join(", "))})</span>`;

// The label at the top of a card: "Do it yourself", or where the item applies and whether it can change.
function tag(d) {
  if (isDiy(d)) return `<span class="tag diy" title="${esc(t("tag.diyTitle"))}">${esc(t("tag.diy"))}</span>`;
  const where = d.regions.map((r) => label("region", r)).join(", ");
  const text = d.stability === "variable" ? `${where} · ${label("stability", "variable")}` : where;
  return `<span class="tag local" title="${esc(t(`stability.${d.stability}`))}">${esc(text)}</span>`;
}

// Cards show only what tells tips apart (saving, cost, warnings); tip pages show everything.
function chips(d, full) {
  const s = savingsText(d.estimated_savings);
  const impact = [
    ...(isBigWin(d) ? [`<span class="chip bigwin" title="${esc(t("impact.bigWinTitle"))}">${icon("medal")}${esc(t("impact.bigWin"))}</span>`] : []),
    // On cards a big win already says "large", so only tip pages show both.
    ...(impactRank(d) && (full || !isBigWin(d)) ? [`<span class="chip impact ${d.impact.band}">${esc(label("impactChip", d.impact.band))}</span>`] : []),
  ];
  const c = co2(d);
  const carbon = c ? [co2Chip(c)] : [];
  const out = full ? [
    ...impact,
    ...carbon,
    `<span class="chip cat">${esc(label("category", d.category))}</span>`,
    `<span class="chip level">${esc(levelText(d.rung))}</span>`,
    `<span class="chip">${esc(t("field.cost"))}${COLON()}${esc(label("cost", d.upfront_cost))}</span>`,
    `<span class="chip">${esc(label("time", d.time_needed))}</span>`,
  ] : [
    `<span class="chip level">${esc(levelText(d.rung))}</span>`,
    ...impact,
    ...carbon,
    ...(s ? [`<span class="chip save">${esc(s)}</span>`] : []),
    `<span class="chip">${esc(t("field.cost"))}${COLON()}${esc(label("cost", d.upfront_cost))}</span>`,
  ];
  if (isOverdue(d)) out.push(`<span class="chip warn">${esc(t("chip.overdue"))}</span>`);
  if (full && s) out.push(`<span class="chip save">${esc(s)}</span>`);
  if (d.needs_landlord_permission) out.push(`<span class="chip warn">${esc(t("chip.landlord"))}</span>`);
  if (hasNoCitation(d)) out.push(`<span class="chip nocite">${esc(t("chip.nocite"))}</span>`);
  else if (d.verification.status !== "verified") out.push(`<span class="chip review">${esc(t("chip.review"))}</span>`);
  return out.join("");
}

function card(tip) {
  const d = tip.data;
  const l = localize(tip, LANG);
  const haystack = [l.title, l.summary, ...(d.tags || []), label("category", d.category)].join(" ").toLowerCase();
  const who = Object.keys(WHO).filter((w) => WHO[w](d)).join(" ");
  return `<li class="card" data-category="${esc(d.category)}" data-rung="${d.rung}" data-cost="${COSTS.indexOf(d.upfront_cost)}" data-impact="${impactRank(d)}" data-big="${isBigWin(d)}" data-who="${who}" data-stability="${d.stability}" data-regions="${esc(d.regions.join(" "))}" data-landlord="${d.needs_landlord_permission}" data-cited="${d.verification.status === "verified"}" data-text="${esc(haystack)}">
  ${tag(d)}
  <h3><a href="tips/${esc(tip.id)}/">${esc(l.title)}</a></h3>
  <p>${esc(l.summary)}</p>
  <div class="chips">${chips(d, false)}</div>
</li>`;
}

function options(group, values) {
  return values.map((v) => `<option value="${v}">${esc(label(group, v))}</option>`).join("");
}

function indexPage(tips) {
  const cats = [...new Set(tips.map((x) => x.data.category))].sort((a, b) =>
    label("category", a).localeCompare(label("category", b)));
  // Only offer "who are you" choices that have at least one tip yet.
  const whoOptions = Object.keys(WHO).filter((w) => tips.some((x) => WHO[w](x.data)));
  const body = `
<section class="intro">
  <h1>${esc(t("index.heading"))}</h1>
  <p>${esc(t("index.intro"))}</p>
  <p class="impact-intro">${esc(t("index.impactIntro"))} <a href="impact/">${esc(t("impact.how"))}</a></p>
</section>
<form class="filters" role="search" onsubmit="return false">
  <fieldset class="where" id="where">
    <legend>${esc(t("filter.where"))}</legend>
    <div class="steps">${["", ...REGIONS].map((r) => `<label class="step">
      <input type="radio" name="where" value="${r}"${r ? "" : " checked"}>
      <span>${esc(r ? label("region", r) : t("where.all"))}</span></label>`).join("")}</div>
  </fieldset>
  <fieldset class="ladder" id="ladder">
    <legend>${esc(t("filter.level"))} <span class="hint">${esc(t("filter.levelHint"))}</span></legend>
    <div class="steps">${RUNGS.map((n) => `<label class="step">
      <input type="radio" name="rung" value="${n}"${n === DEFAULT_RUNG ? " checked" : ""}>
      <span><b>${n}</b> ${esc(label("rung", n))} <small>(${tips.filter((x) => x.data.rung === n).length})</small></span></label>`).join("")}</div>
  </fieldset>
  ${whoOptions.length > 1 ? `<fieldset class="who" id="who">
    <legend>${esc(t("filter.who"))}</legend>
    <div class="steps">${["all", ...whoOptions].map((w) => `<label class="step">
      <input type="radio" name="who" value="${w === "all" ? "" : w}"${w === "all" ? " checked" : ""}>
      <span>${esc(t(`who.${w}`))}</span></label>`).join("")}</div>
  </fieldset>` : ""}
  <label class="search"><span>${esc(t("filter.search"))}</span>
    <input type="search" id="q" placeholder="${esc(t("filter.searchPlaceholder"))}"></label>
  <details class="more-filters" id="more-filters">
  <summary>${esc(t("filter.more"))} <span class="badge" id="active" hidden></span></summary>
  <div class="more-grid">
  <label><span>${esc(t("filter.category"))}</span>
    <select id="category"><option value="">${esc(t("filter.all"))}</option>${options("category", cats)}</select></label>
  <label><span>${esc(t("filter.budget"))}</span>
    <select id="cost"><option value="">${esc(t("filter.all"))}</option>${COSTS.slice(0, -1).map((c, i) => `<option value="${i}">${esc(label("budget", c))}</option>`).join("")}</select></label>
  <label><span>${esc(t("filter.impact"))}</span>
    <select id="impact"><option value="">${esc(t("filter.all"))}</option>${["big", "3", "2"].map((v) => `<option value="${v}">${esc(t(`filter.impact.${v}`))}</option>`).join("")}</select></label>
  <label><span>${esc(t("filter.stability"))}</span>
    <select id="stability"><option value="">${esc(t("filter.all"))}</option>${options("stability", ["constant", "variable"])}</select></label>
  <label class="check"><input type="checkbox" id="nolandlord"> ${esc(t("filter.noLandlord"))}</label>
  <label class="check"><input type="checkbox" id="cited"> ${esc(t("filter.cited"))}</label>
  </div>
  </details>
</form>
<div class="count-row">
  <p class="count" id="count" aria-live="polite" data-template="${esc(t("index.count"))}">${tips.length} ${esc(t("index.tips"))}</p>
  <button type="button" class="link-button" id="clear" hidden>${esc(t("filter.clear"))}</button>
</div>
<div id="cards">
<section class="group diy">
<h2>${esc(t("section.diy"))} <small class="n"></small></h2>
<ul class="cards">
${tips.filter((x) => isDiy(x.data)).map(card).join("\n")}
</ul>
</section>
<section class="group local" id="local" data-heading="${esc(t("section.localIn"))}"
  data-names="${esc(JSON.stringify(Object.fromEntries(REGIONS.map((r) => [r, label("region", r)]))))}">
<h2><span class="title">${esc(t("section.local"))}</span> <small class="n"></small></h2>
${Object.entries(COVERAGE).map(([r, c]) => `<p class="coverage" data-region="${r}" hidden>${esc(t(`coverage.${r}`))}
  <a href="${esc(c.url[LANG] || c.fallback)}" rel="noopener">${esc(c.name)}</a>${c.url[LANG] ? "" : ` (${esc(label("inLanguage", c.language))})`}.</p>`).join("\n")}
<ul class="cards">
${tips.filter((x) => !isDiy(x.data)).map(card).join("\n")}
</ul>
</section>
</div>
<p class="empty" id="empty" hidden>${esc(t("index.empty"))} <button type="button" class="link-button" data-clear>${esc(t("filter.clear"))}</button></p>
<div class="more" id="more" hidden data-one="${esc(t("index.more1"))}" data-many="${esc(t("index.moreN"))}">
  <button type="button" class="more-button" id="next-level" data-template="${esc(t("index.showLevel"))}"
    data-names="${esc(JSON.stringify(Object.fromEntries(RUNGS.map((n) => [n, label("rung", n)]))))}"></button>
  <p id="more-text"></p>
</div>`;
  return page({ title: t("site.name"), description: t("index.intro"), rel: "", path: "", body });
}

function tipPage(tip) {
  const d = tip.data;
  const l = localize(tip, LANG);
  const s = d.estimated_savings;
  const savings = savingsText(s);
  // Level, time and cost are already in the chips at the top, so the table skips them.
  const impactText = impactRank(d)
    ? `<strong>${esc(label("impact", d.impact.band))}</strong> · ${esc(l.impact_basis)}`
    : `<strong>${esc(label("impact", d.impact.band))}</strong> · ${esc(t(`impact.${d.impact.band}Text`))}`;
  const pb = d.payback;
  const paybackText = pb && `<strong>${esc(t(pb.min_years != null ? "payback.range" : "payback.max")
    .replace("{min}", pb.min_years).replace("{max}", pb.max_years))}</strong> · ${esc(t("payback.according"))} <a href="${esc(d.sources[pb.source].url)}" rel="noopener">${esc(d.sources[pb.source].publisher)}</a>. ${esc(t("payback.note"))}`;
  const facts = [
    [t("field.impact"), `${impactText} <a href="../../impact/">${esc(t("impact.how"))}</a>`],
    ...(co2(d) ? [[t("field.co2"), `<strong>${esc(co2Text(co2(d), "long"))}</strong> <a href="../../impact/#co2">${esc(t("co2.how"))}</a>`]] : []),
    ...(pb ? [[t("field.payback"), paybackText]] : []),
    [t("field.savings"), `${savings ? `<strong>${esc(savings)}</strong> · ` : ""}${esc(l.basis)} <span class="muted">(${esc(t("field.confidence"))}${COLON()}${esc(label("confidence", s.confidence))})</span>`],
    [t("field.who"), label("responsibility", d.responsibility)],
    [t("field.landlord"), d.needs_landlord_permission ? t("yes") : t("no")],
    [t("field.kind"), label("kind", d.kind)],
    // Variable tips explain themselves in the notice under the chips.
    ...(d.stability === "constant"
      ? [[t("field.stability"), `<strong>${esc(label("stability", d.stability))}</strong> · ${esc(t("stability.constant"))}`]] : []),
  ].map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${v.includes("<") ? v : esc(v)}</td></tr>`).join("");

  // Open points, uncited ones first, each labelled with its kind.
  const order = { "no-citation": 0, "secondary-source": 1, "to-verify": 2 };
  const points = d.verification.flags.map((f, i) => ({ type: f.type, note: l.flags[i] }))
    .sort((a, b) => order[a.type] - order[b.type]);
  const uncited = hasNoCitation(d);
  const review = d.verification.status !== "verified"
    ? `<aside class="notice ${uncited ? "nocite" : "review"}"><strong>${esc(t(uncited ? "tip.nociteHeading" : "tip.reviewHeading"))}</strong>
       <p>${esc(t(uncited ? "tip.nociteText" : "tip.reviewText"))}</p>
       <ul class="points">${points.map((p) => `<li><span class="flag ${p.type}">${esc(label("flag", p.type))}</span> ${esc(p.note)}</li>`).join("")}</ul></aside>`
    : "";

  // Variable tips depend on rules or prices that change: say so, with the next check date.
  const variable = d.stability === "variable"
    ? `<aside class="notice variable"><strong>${esc(t("tip.variableHeading"))}</strong>
       <p>${esc(t("stability.variable"))}</p>
       <p>${esc(t(isOverdue(d) ? "tip.overdue" : "tip.nextCheck")).replace("{d}", date(d.review_by))}</p></aside>`
    : "";

  const pairs = (d.pairs_with || []).length
    ? `<section class="pairs"><h2>${esc(t("tip.pairs"))}</h2><ul>${d.pairs_with.map((id) =>
        `<li><a href="../${esc(id)}/">${esc(localize(byId.get(id), LANG).title)}</a>${regionSuffix(d, byId.get(id).data)}</li>`).join("")}</ul></section>`
    : "";

  const regionNotes = l.region_notes
    ? `<aside class="notice"><strong>${esc(t("tip.regionNotes"))}</strong><p>${esc(l.region_notes)}</p></aside>` : "";

  const sources = d.sources.map((src, i) => {
    // Link the reader's language version of the page when there is one.
    const v = src.language === LANG ? src : (src.alternates || []).find((a) => a.language === LANG) || src;
    return `<li>
    <a href="${esc(v.url)}" rel="noopener" hreflang="${v.language}" lang="${v.language}">${esc(v.title)}</a>${v.language !== LANG ? ` <span class="muted">(${esc(label("inLanguage", v.language))})</span>` : ""} <span class="muted">· ${esc(src.publisher)} (${esc(label("sourceType", src.type))}) · ${esc(t("tip.accessedShort"))} ${date(src.accessed)}</span>
    ${l.supports[i] ? `<div class="src-meta">${esc(t("tip.supports"))}${COLON()}${esc(l.supports[i])}</div>` : ""}
    ${src.locator ? `<div class="src-meta">${esc(t("tip.locator"))}${COLON()}${esc(src.locator)}</div>` : ""}
  </li>`;
  }).join("");

  const file = l.lang === d.lang ? tip.file : `${LANG}/${tip.file}`;
  const edit = REPO_URL
    ? `<p class="edit"><a href="${REPO_URL}/edit/${BRANCH}/content/tips/${esc(file)}">${esc(t("tip.edit"))}</a></p>` : "";

  const body = `
<p class="back"><a href="../../">← ${esc(t("tip.back"))}</a></p>
<article class="tip">
  <h1 lang="${l.lang}">${esc(l.title)}</h1>
  <p class="lead">${esc(l.summary)}</p>
  <p class="tag-row">${tag(d)}</p>
  <div class="chips">${chips(d, true)}</div>
  ${variable}
  <div class="prose">${renderBody(l.body)}</div>
  ${review}
  ${regionNotes}
  <section class="details">
    <h2>${esc(t("tip.details"))}</h2>
    <table class="facts"><tbody>${facts}</tbody></table>
  </section>
  ${pairs}
  <section class="sources">
    <h2>${esc(t("tip.sources"))}</h2>
    <ol>${sources}</ol>
  </section>
  <p class="muted">${esc(t("tip.lastReviewed"))} ${date(d.last_reviewed)}</p>
  ${edit}
</article>`;
  return page({ title: `${l.title} · ${t("site.name")}`, description: l.summary, rel: "../../", path: `tips/${tip.id}/`, body });
}

// How the impact bands are set, from content/pages/impact.<lang>.md.
function impactPage() {
  const html = marked.parse(readFileSync(join(ROOT, "content", "pages", `impact.${LANG}.md`), "utf8"));
  const body = `
<p class="back"><a href="../">← ${esc(t("tip.back"))}</a></p>
<article class="tip prose">${html}</article>`;
  return page({ title: `${t("impact.how")} · ${t("site.name")}`, description: t("index.impactIntro"), rel: "../", path: "impact/", body });
}

// The site root sends readers to their saved or browser language.
function rootRedirect() {
  return `<!doctype html>
<html lang="${DEFAULT_LANG}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(tr(DEFAULT_LANG, "site.name"))}</title>
<noscript><meta http-equiv="refresh" content="0; url=${DEFAULT_LANG}/"></noscript>
<script>
  var langs = ${JSON.stringify(LANGUAGES)}, pick = "${DEFAULT_LANG}";
  try { var saved = localStorage.getItem("lang"); } catch (e) {}
  if (saved && langs.indexOf(saved) !== -1) pick = saved;
  else (navigator.languages || [navigator.language || ""]).some(function (l) {
    var c = String(l).slice(0, 2).toLowerCase();
    if (langs.indexOf(c) !== -1) { pick = c; return true; }
  });
  location.replace(pick + "/");
</script>
</head>
<body>${LANGUAGES.map((l) => `<a href="${l}/">${esc(tr(l, "lang.name"))}</a>`).join(" · ")}</body>
</html>
`;
}

// Easiest wins first: ladder rung, then the largest impact, then cost, then title.
const tips = loadTips().sort((a, b) =>
  a.data.rung - b.data.rung ||
  impactRank(b.data) - impactRank(a.data) ||
  COSTS.indexOf(a.data.upfront_cost) - COSTS.indexOf(b.data.upfront_cost) ||
  a.id.localeCompare(b.id));
const byId = new Map(tips.map((x) => [x.id, x]));

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
for (const lang of LANGUAGES) {
  LANG = lang;
  const out = join(DIST, lang);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "index.html"), indexPage(tips));
  for (const tip of tips) {
    mkdirSync(join(out, "tips", tip.id), { recursive: true });
    writeFileSync(join(out, "tips", tip.id, "index.html"), tipPage(tip));
  }
  mkdirSync(join(out, "impact"), { recursive: true });
  writeFileSync(join(out, "impact", "index.html"), impactPage());
}
writeFileSync(join(DIST, "index.html"), rootRedirect());
writeFileSync(join(DIST, "tips.json"), JSON.stringify(tips.map((x) => ({
  ...x.data, body: x.body,
  translations: Object.fromEntries(Object.entries(x.translations).map(([l, v]) => [l, { ...v.data, body: v.body }])),
})), null, 2));
for (const f of ["style.css", "app.js"]) copyFileSync(join(ROOT, "src", f), join(DIST, f));
// The icons are inlined in every page, so their licence ships with the site.
copyFileSync(join(ROOT, "src", "icons", "LICENSE-phosphor.txt"), join(DIST, "LICENSE-phosphor-icons.txt"));
writeFileSync(join(DIST, ".nojekyll"), "");

// Every language must look the same: one shared stylesheet, no page-level styles,
// and no CSS rules aimed at a single language. The build fails otherwise.
const css = readFileSync(join(ROOT, "src", "style.css"), "utf8");
if (/:lang\(|\[lang|\[hreflang/.test(css)) throw new Error("style.css has a language-specific selector; all languages must share one look");
const pages = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? pages(join(dir, e.name)) : e.name.endsWith(".html") ? [join(dir, e.name)] : []);
const counts = LANGUAGES.map((lang) => {
  const files = pages(join(DIST, lang));
  for (const f of files) {
    const html = readFileSync(f, "utf8");
    const sheets = html.match(/<link rel="stylesheet" href="[^"]*"/g) || [];
    if (sheets.length !== 1 || !sheets[0].endsWith(`style.css?v=${ASSET_VERSION["style.css"]}"`) || /<style|\sstyle="/.test(html))
      throw new Error(`${f}: must use only the shared stylesheet, like every other language`);
  }
  return files.length;
});
if (new Set(counts).size !== 1) throw new Error(`languages have different page counts: ${counts.join(", ")}`);
console.log(`✓ built ${tips.length} tips in ${LANGUAGES.join(", ")} into dist/`);
