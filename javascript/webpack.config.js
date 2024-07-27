const path = require('path');

module.exports = {
    entry: './javascript/web-entry.js',
    mode: "development",
    devtool: "inline-source-map",
    output: {
        filename: 'packed.js',
        path: path.resolve(__dirname, 'content_root', 'generated'),
    },
    resolve: {
        extensions: [".ts", ".tsx", ".js"],
        fallback: {
            "os": false,
            "child_process": false,
            "path": false,
            "fs": false,
            "https": false,
            "http": false,
            "crypto": require.resolve("crypto-browserify"),
            "stream": require.resolve("stream-browserify"),
            "vm": require.resolve("vm-browserify"),
        }

    },
    module: {
        rules: [
            {
                exclude: /node_modules/,
                test: /\.tsx?$/,
                loader: "ts-loader",
            }
        ]
    },
    devServer: {
        static: __dirname,
        port: 8080,
    }
};
