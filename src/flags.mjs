// Small flags for the region choice on the home page. Belgium's tricolour is drawn
// as it is; the three regional flags are simplified to their colours, with a disc
// standing in for the lion (Flanders), the iris (Brussels) and the rooster (Wallonia).
const FLAGS = {
  "": `<rect width="3" height="2" fill="#000"/><rect x="1" width="1" height="2" fill="#fdda24"/><rect x="2" width="1" height="2" fill="#ef3340"/>`,
  "BE-VLG": `<rect width="3" height="2" fill="#ffe936"/><circle cx="1.5" cy="1" r=".55" fill="#000"/>`,
  "BE-BRU": `<rect width="3" height="2" fill="#1a58a8"/><circle cx="1.5" cy="1" r=".62" fill="#fff"/><circle cx="1.5" cy="1" r=".5" fill="#f7d117"/>`,
  "BE-WAL": `<rect width="3" height="2" fill="#ffe936"/><circle cx="1.5" cy="1" r=".55" fill="#e2001a"/>`,
};

export function flag(region) {
  return `<svg class="flag-icon" width="36" height="24" viewBox="0 0 3 2" aria-hidden="true">${FLAGS[region]}</svg>`;
}
