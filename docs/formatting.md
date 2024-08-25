# Formatting

## TypeScript/JavaScript

Gink uses Prettier for all Javascript formatting. The Prettier configuration files will already be checked out as a part of this repo, and installed when you install the javascript dependencies. \
\
If you don't use VSCode or just need more information/guidance, head to the [prettier docs](https://prettier.io/docs/en/install). \
\
To enable Pretter format on save in VSCode:

1. Install the "Prettier - Code Formatter" extension in VSCode extensions.
2. Press "Cmd + Shift + P" or "Ctrl + Shift + P" to open the command palette and type "user settings".
3. Paste the following into your user settings.json file:

```json
"[javascript]": {
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "esbenp.prettier-vscode"
},
```

If you would like to format all files from the CLI: \
First, ensure you are in the gink/javascript directory. \
Use the command

```sh
npx prettier . --write
```

To simply check if your files are formatted correctly without building, use

```sh
npx prettier . --check
```

A Prettier formatting check is part of the build process. The build will fail if files are not properly formatted. If you are using formatOnSave or similar, you shouldn't have to worry about it.

## Python

The only formatting rule currently in place in Python is "max-line-length" of 120. There are no auto python formatters set up for Gink (yet), so just make sure to not have lines longer than 120, or the build will fail.
