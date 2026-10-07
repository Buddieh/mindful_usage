# Contributing

Thanks for helping. Everything on the site comes from the files in `content/tips/`, so most contributions are a small edit to one Markdown file.

## Fix or improve a tip

Open the tip on the website and click "Suggest an improvement to this tip". GitHub opens the file in an editor and turns your change into a pull request.

## Add a tip

1. Copy an existing file in `content/tips/` and rename it to a new kebab-case id, for example `content/tips/close-fridge-door.md`. Set `id` to the same name.
2. Fill in the fields (see `content/README.md`) and write the explanation in your own words.
3. Add at least one source: the exact page URL, its publisher and type, the date you checked it, and what it backs (`supports`). Don't copy text or tables from the source.
4. Add the Dutch version in `content/tips/nl/` with the same file name. If you can't write Dutch, open the pull request anyway and say so; someone else can translate.
5. If something is uncertain, set `verification.status: needs-check` and explain why in `flags`.

Run `npm run validate` before you open the pull request. The same check runs automatically on every pull request.

## Not sure?

Open an issue describing the tip and its source, and we'll take it from there.
