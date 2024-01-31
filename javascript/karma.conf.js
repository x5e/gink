const path = require('path');

module.exports = function (config) {
    config.set({
        basePath: '.',
        exclude: ['unit-tests/LogBackedStore.test.ts'],
        files: [
            { pattern: 'unit-tests/*.ts', watched: true, served: true, included: true, type: 'js' },
        ],
        client: {
            jasmine: {
                random: false
            }
        },
        autoWatch: false,
        singleRun: true,
        logLevel: config.LOG_WARN,
        frameworks: ['jasmine', 'webpack'],
        // for the tests to run as intended, set env CHROME_BIN
        // to the path to the chrome binary. Chromium works too.
        // ex: export CHROME_BIN=/bin/chromium-browser
        browsers: ['ChromeHeadlessNS'],
        customLaunchers: {
            ChromeHeadlessNS: {
                base: 'ChromeHeadless',
                flags: ['--no-sandbox', '--disable-gpu']
            }
        },
        // uncomment this for more verbosity within the tests
        // reporters: ['mocha', 'kjhtml'],
        webpack: {
            output: {
                filename: 'packed-tests.js',
                path: path.resolve(__dirname, 'content_root/generated/unit-tests'),
            },
            externals: {
                "node:repl": "node:repl"
            },
            resolve: {
                extensions: [".ts", ".tsx", ".js", ".node"],
                modules: ['node_modules'],
                fallback: {
                    "path": false,
                    "fs": false,
                    "http": false,
                    "url": false,
                    "util": false,
                    "https": false,
                    "readline": false,
                    "console": false,
                    "stream": false,
                    "assert": false,
                    "crypto": false,
                    "os": false,
                    "querystring": false,
                    "child_process": false,
                    "net": false,
                    "tls": false
                }
            },
            module: {
                rules: [
                    {
                        test: /\.tsx?$/i,
                        exclude: /(node_modules)/,
                        loader: 'ts-loader'
                    },
                    {
                        test: /\.node$/,
                        loader: "node-loader",
                    },

                ]
            }
        },
        preprocessors: {
            //add webpack as preprocessor to support require() in test-suits .js files
            './unit-tests/*.ts': ['webpack']
        }
    });
};
