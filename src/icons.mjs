// Filled icons from Phosphor Icons v2.1.1 (https://phosphoricons.com), MIT License,
// Copyright (c) 2023 Phosphor Icons. Full licence text: src/icons/LICENSE-phosphor.txt.
// They take the text colour, so they follow light and dark mode. The width and height
// attributes keep them text-sized even if the stylesheet fails to load.
const PATHS = {
  medal: "M216,96A88,88,0,1,0,72,163.83V240a8,8,0,0,0,11.58,7.16L128,225l44.43,22.21A8.07,8.07,0,0,0,176,248a8,8,0,0,0,8-8V163.83A87.85,87.85,0,0,0,216,96ZM56,96a72,72,0,1,1,72,72A72.08,72.08,0,0,1,56,96Zm16,0a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z",
  tree: "M128,187.85a72.44,72.44,0,0,0,8,4.62V232a8,8,0,0,1-16,0V192.47A72.44,72.44,0,0,0,128,187.85ZM198.1,62.59a76,76,0,0,0-140.2,0A71.71,71.71,0,0,0,16,127.8C15.9,166,48,199,86.14,200A72.22,72.22,0,0,0,120,192.47V156.94L76.42,135.16a8,8,0,1,1,7.16-14.32L120,139.06V88a8,8,0,0,1,16,0v27.06l36.42-18.22a8,8,0,1,1,7.16,14.32L136,132.94v59.53A72.17,72.17,0,0,0,168,200l1.82,0C208,199,240.11,166,240,127.8A71.71,71.71,0,0,0,198.1,62.59Z",
};

// label: text for screen readers and the tooltip; leave it out for a decorative icon.
export function icon(name, label) {
  const a11y = label ? `role="img" aria-label="${label}"` : `aria-hidden="true"`;
  const title = label ? `<title>${label}</title>` : "";
  return `<svg class="icon" width="1em" height="1em" viewBox="0 0 256 256" fill="currentColor" ${a11y}>${title}<path d="${PATHS[name]}"/></svg>`;
}
