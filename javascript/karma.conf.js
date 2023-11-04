module.exports = function (config) {
    config.set({
        basePath: '.',
        exclude: [],
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
        failOnEmptyTestSuite: false,
        logLevel: config.LOG_WARN,
        frameworks: ['jasmine', 'webpack'],
        browsers: ['ChromeHeadlessNS'],
        customLaunchers: {
            ChromeHeadlessNS: {
                base: 'ChromeHeadless',
                flags: ['--no-sandbox', '--disable-gpu']
            }
        },
        reporters: ['mocha', 'kjhtml'],
        port: 9876,
        webpack: {
            resolve: {
                extensions: [".ts", ".tsx", ".js", ".node"],
                modules: ['node_modules'],
                fallback: {
                    "path": false,
                    "fs": false,
                    "http": false,
                    "https": false,
                    "readline": false,
                    "console": false,
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