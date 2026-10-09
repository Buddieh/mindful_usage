# Energy Ladder

An open, searchable collection of practical energy-saving tips, each linked to the official source it comes from. It covers homes in **Belgium**: advice that works everywhere, plus the rules, premiums and services of each region. It covers Flanders, Brussels and Wallonia, and is published in Dutch, French and English. The nine German-speaking municipalities run their own housing support; the site links to it, and a German version is not planned yet.

## How it works

- Every tip is a Markdown file in [`content/tips/`](content/tips/) with structured fields (topic, effort, cost, estimated saving, who acts, sources). Dutch and French translations are in [`content/tips/nl/`](content/tips/nl/) and [`content/tips/fr/`](content/tips/fr/).
- [`content/README.md`](content/README.md) explains the fields and the rules for tips: every tip cites at least one source, and every number must be traceable to it.
- A small Node script turns the files into a static website (no framework), published with GitHub Pages. The raw data is also published as `tips.json`.

## Made with AI

The content was gathered and the site was built with Claude, an AI model by Anthropic. The maintainer decides what goes on the site and approves every change before it is published. Because AI can get things wrong, every tip links to its sources so readers can check it. The site says this in all its languages in its footer and on the impact page.

## Run it locally

```sh
npm install
npm run build    # validates every tip, then builds into dist/
npm run serve    # serves dist/ on http://localhost:3000
```

## Contributing

Suggestions are very welcome, from a typo fix to a new tip. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Code: [MIT](LICENSE). Tip content: [CC BY 4.0](content/LICENSE.md). The tree and medal icons come from [Phosphor Icons](https://phosphoricons.com) ([MIT](src/icons/LICENSE-phosphor.txt)).
