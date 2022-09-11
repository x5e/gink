const path = require('path');

module.exports = {
    entry: './entry.ts',
    mode: "development",
    devtool: "inline-source-map",
    output: {
      filename: 'packed.js',
      path: path.resolve(__dirname, 'webpack.out'),
    },
    resolve: {
        extensions: [".ts", ".tsx", ".js"]
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
