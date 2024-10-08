module.exports = {
    env: {
        browser: true,
        es2021: true,
        node: true,
    },
    extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
    overrides: [],
    parser: "@typescript-eslint/parser",

    plugins: ["@typescript-eslint"],
    rules: {
        indent: ["error", 4],
        "linebreak-style": ["error", "unix"],
        semi: ["error", "always"],
    },
};
