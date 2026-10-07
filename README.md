# Mindful Usage

An open, searchable collection of practical energy-saving tips, each linked to the official source it comes from. It starts with **tenants in Flanders, Belgium**, in Dutch and English, and is meant to grow to homeowners, landlords, architects and building professionals.

## How it works

- Every tip is a Markdown file in [`content/tips/`](content/tips/) with structured fields (topic, effort, cost, estimated saving, who acts, sources). Dutch translations are in [`content/tips/nl/`](content/tips/nl/).
- [`content/README.md`](content/README.md) explains the fields and the rules for tips: every tip cites at least one source, and every number must be traceable to it.
- A small Node script turns the files into a static website (no framework), published with GitHub Pages. The raw data is also published as `tips.json`.

## Run it locally

```sh
npm install
npm run build    # validates every tip, then builds into dist/
npm run serve    # serves dist/ on http://localhost:3000
```

## Contributing

Suggestions are very welcome, from a typo fix to a new tip. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Code: [MIT](LICENSE). Tip content: [CC BY 4.0](content/LICENSE.md).
