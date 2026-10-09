// Remembers the reader's language choice, and runs search and filters on the
// tip list. Every page works without this script.
(function () {
  Array.prototype.forEach.call(document.querySelectorAll(".lang a[data-lang]"), function (a) {
    a.addEventListener("click", function () {
      try { localStorage.setItem("lang", a.dataset.lang); } catch (e) {}
    });
  });

  var list = document.getElementById("cards");
  if (!list) return;
  var cards = Array.prototype.slice.call(list.querySelectorAll(".card"));
  var groups = Array.prototype.slice.call(list.querySelectorAll(".group"));
  var form = document.querySelector(".filters");
  var q = document.getElementById("q");
  var category = document.getElementById("category");
  var cost = document.getElementById("cost");
  var stability = document.getElementById("stability");
  var impact = document.getElementById("impact");
  var nolandlord = document.getElementById("nolandlord");
  var cited = document.getElementById("cited");
  var moreFilters = document.getElementById("more-filters");
  var active = document.getElementById("active");
  var count = document.getElementById("count");
  var clear = document.getElementById("clear");
  var empty = document.getElementById("empty");
  var more = document.getElementById("more");
  var nextLevel = document.getElementById("next-level");
  var moreText = document.getElementById("more-text");
  var names = JSON.parse(nextLevel.dataset.names);
  var local = document.getElementById("local");
  var localTitle = local.querySelector(".title");
  var localDefault = localTitle.textContent;
  var regionNames = JSON.parse(local.dataset.names);
  var coverage = Array.prototype.slice.call(local.querySelectorAll(".coverage"));
  // The reader's region is remembered on this device, unless a link sets one.
  var savedRegion = "";
  try { savedRegion = localStorage.getItem("region") || ""; } catch (e) {}
  var DEFAULT_RUNG = (form.querySelector('input[name="rung"][checked]') || {}).value || "5";

  function radio(name) {
    return form.querySelector('input[name="' + name + '"]:checked');
  }
  function setRadio(name, value) {
    var el = form.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (el) el.checked = true;
  }

  // Filters live in the address bar, so a filtered view can be bookmarked or shared.
  // Each entry: URL key, how to read the control, how to set it, and its "off" value.
  var fields = [
    ["where", function () { return radio("where").value; }, function (v) { setRadio("where", v); }, "", true],
    ["level", function () { return radio("rung").value; }, function (v) { setRadio("rung", v); }, DEFAULT_RUNG, true],
    ["who", function () { return radio("who").value; }, function (v) { setRadio("who", v); }, "", true],
    ["q", function () { return q.value.trim(); }, function (v) { q.value = v; }, "", true],
    ["topic", function () { return category.value; }, function (v) { category.value = v; }, "", false],
    ["budget", function () { return cost.value; }, function (v) { cost.value = v; }, "", false],
    ["impact", function () { return impact.value; }, function (v) { impact.value = v; }, "", false],
    ["kind", function () { return stability.value; }, function (v) { stability.value = v; }, "", false],
    ["nolandlord", function () { return nolandlord.checked ? "1" : ""; }, function (v) { nolandlord.checked = v === "1"; }, "", false],
    ["cited", function () { return cited.checked ? "1" : ""; }, function (v) { cited.checked = v === "1"; }, "", false],
  ];

  function readUrl() {
    var params = new URLSearchParams(location.search);
    var hidden = 0;
    fields.forEach(function (f) {
      if (params.has(f[0])) {
        f[2](params.get(f[0]));
        if (!f[4] && f[1]() !== f[3]) hidden++;
      }
    });
    return hidden;
  }

  function writeUrl() {
    var params = new URLSearchParams();
    fields.forEach(function (f) { if (f[1]() !== f[3]) params.set(f[0], f[1]()); });
    var s = params.toString();
    try { history.replaceState(null, "", s ? "?" + s : location.pathname); } catch (e) {}
  }

  function clearAll() {
    // The reader's region is where they live, not a filter, so it stays.
    fields.forEach(function (f) { if (f[0] !== "where") f[2](f[3]); });
    apply();
  }

  // The ladder is cumulative: a card shows when its rung is at or below the chosen one.
  function apply() {
    var words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    var rung = Number(radio("rung").value) || 5;
    var who = radio("who").value;
    var where = radio("where").value;
    var shown = 0, higher = 0, byRung = {};
    cards.forEach(function (c) {
      var ok =
        (!category.value || c.dataset.category === category.value) &&
        (!cost.value || Number(c.dataset.cost) <= Number(cost.value)) &&
        (!stability.value || c.dataset.stability === stability.value) &&
        (!impact.value || (impact.value === "big" ? c.dataset.big === "true" : Number(c.dataset.impact) >= Number(impact.value))) &&
        (!where || (" " + c.dataset.regions + " ").search(" (BE|" + where + ") ") !== -1) &&
        (!who || (" " + c.dataset.who + " ").indexOf(" " + who + " ") !== -1) &&
        (!nolandlord.checked || c.dataset.landlord === "false") &&
        (!cited.checked || c.dataset.cited === "true") &&
        words.every(function (w) { return c.dataset.text.indexOf(w) !== -1; });
      var r = Number(c.dataset.rung);
      c.hidden = !(ok && r <= rung);
      if (ok && r <= rung) shown++;
      else if (ok) { higher++; byRung[r] = (byRung[r] || 0) + 1; }
    });
    localTitle.textContent = where ? local.dataset.heading.replace("{region}", regionNames[where]) : localDefault;
    coverage.forEach(function (p) { p.hidden = p.dataset.region !== where; });
    groups.forEach(function (g) {
      var n = g.querySelectorAll(".card:not([hidden])").length;
      g.querySelector(".n").textContent = n ? "(" + n + ")" : "";
      g.hidden = !n && !g.querySelector(".coverage:not([hidden])");
    });
    try { localStorage.setItem("region", where); } catch (e) {}

    count.textContent = count.dataset.template.replace("{n}", shown).replace("{total}", cards.length);
    empty.hidden = shown !== 0;

    // Offer the next level that has matching tips, so readers don't have to scroll back up.
    var next = 0;
    for (var n = rung + 1; n <= 5; n++) if (byRung[n]) { next = n; break; }
    more.hidden = higher === 0;
    if (next) {
      nextLevel.dataset.level = next;
      nextLevel.textContent = nextLevel.dataset.template
        .replace("{n}", next).replace("{name}", names[next]).replace("{k}", byRung[next]);
    }
    moreText.textContent = higher === 1 ? more.dataset.one : more.dataset.many.replace("{n}", higher);

    var hiddenActive = fields.filter(function (f) { return !f[4] && f[1]() !== f[3]; }).length;
    active.hidden = hiddenActive === 0;
    active.textContent = hiddenActive;
    clear.hidden = !fields.some(function (f) { return f[0] !== "where" && f[1]() !== f[3]; });
    writeUrl();
  }

  // "More filters" starts open on wide screens, or when a link set one of its filters.
  if (savedRegion && !new URLSearchParams(location.search).has("where")) setRadio("where", savedRegion);
  var hiddenFromUrl = readUrl();
  if (hiddenFromUrl || window.matchMedia("(min-width: 700px)").matches) moreFilters.open = true;

  nextLevel.addEventListener("click", function () {
    setRadio("rung", nextLevel.dataset.level);
    apply();
  });
  clear.addEventListener("click", clearAll);
  Array.prototype.forEach.call(document.querySelectorAll("[data-clear]"), function (b) {
    b.addEventListener("click", clearAll);
  });
  form.addEventListener("input", apply);
  form.addEventListener("change", apply);
  apply();
})();
