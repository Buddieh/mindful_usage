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
  var form = document.querySelector(".filters");
  var q = document.getElementById("q");
  var category = document.getElementById("category");
  var cost = document.getElementById("cost");
  var stability = document.getElementById("stability");
  var nolandlord = document.getElementById("nolandlord");
  var cited = document.getElementById("cited");
  var count = document.getElementById("count");
  var empty = document.getElementById("empty");
  var more = document.getElementById("more");
  var unit = count.textContent.replace(/^\d+\s*/, "");

  function picked(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : "";
  }

  // The ladder is cumulative: a card shows when its rung is at or below the chosen one.
  function apply() {
    var words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    var rung = Number(picked("rung")) || 5;
    var who = picked("who");
    var shown = 0, higher = 0;
    cards.forEach(function (c) {
      var ok =
        (!category.value || c.dataset.category === category.value) &&
        (!cost.value || Number(c.dataset.cost) <= Number(cost.value)) &&
        (!stability.value || c.dataset.stability === stability.value) &&
        (!who || (" " + c.dataset.who + " ").indexOf(" " + who + " ") !== -1) &&
        (!nolandlord.checked || c.dataset.landlord === "false") &&
        (!cited.checked || c.dataset.cited === "true") &&
        words.every(function (w) { return c.dataset.text.indexOf(w) !== -1; });
      var inReach = Number(c.dataset.rung) <= rung;
      c.hidden = !(ok && inReach);
      if (ok && inReach) shown++;
      else if (ok) higher++;
    });
    count.textContent = shown + " " + unit;
    empty.hidden = shown !== 0;
    more.hidden = higher === 0;
    more.textContent = higher === 1 ? more.dataset.one : more.dataset.many.replace("{n}", higher);
  }

  form.addEventListener("input", apply);
  form.addEventListener("change", apply);
  apply();
})();
