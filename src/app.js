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
  var q = document.getElementById("q");
  var category = document.getElementById("category");
  var effort = document.getElementById("effort");
  var cost = document.getElementById("cost");
  var nolandlord = document.getElementById("nolandlord");
  var cited = document.getElementById("cited");
  var count = document.getElementById("count");
  var empty = document.getElementById("empty");
  var unit = count.textContent.replace(/^\d+\s*/, "");

  function apply() {
    var words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    var shown = 0;
    cards.forEach(function (c) {
      var ok =
        (!category.value || c.dataset.category === category.value) &&
        (!effort.value || c.dataset.effort === effort.value) &&
        (!cost.value || c.dataset.cost === cost.value) &&
        (!nolandlord.checked || c.dataset.landlord === "false") &&
        (!cited.checked || c.dataset.cited === "true") &&
        words.every(function (w) { return c.dataset.text.indexOf(w) !== -1; });
      c.hidden = !ok;
      if (ok) shown++;
    });
    count.textContent = shown + " " + unit;
    empty.hidden = shown !== 0;
  }

  [q, category, effort, cost, nolandlord, cited].forEach(function (el) {
    el.addEventListener("input", apply);
    el.addEventListener("change", apply);
  });
})();
