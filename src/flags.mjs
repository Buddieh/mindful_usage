// Flags for the region choice on the home page. The files live in src/flags/ (sources in
// its README) and are served from /flags/, so pages don't repeat their drawings.
const FILES = { "": "be", "BE-VLG": "be-vlg", "BE-BRU": "be-bru", "BE-WAL": "be-wal" };

// rel: from the page up to the language root.
export function flag(region, rel) {
  return `<img class="flag-icon" src="${rel}../flags/${FILES[region]}.svg" width="36" height="24" alt="">`;
}
