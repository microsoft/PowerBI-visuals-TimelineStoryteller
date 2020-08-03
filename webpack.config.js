const webpack = require('webpack');
const path = require('path');
const ENTRY = './src/TimelineStoryteller.ts';
const regex = path.normalize(ENTRY).replace(/\\/g, '\\\\').replace(/\./g, '\\.');

module.exports = {
    entry: ENTRY,
    devtool: 'eval',
    resolve: {
       extensions: ['.webpack.js', '.web.js', '.js', '.ts', '.css'],
       modules: [path.join(__dirname, 'node_modules')]
    },
    module: {
        rules: [
            {
                test: /\.css?$/,
                use: ['style-loader', 'css-loader'],
            },
            {
                test: new RegExp(regex),
                loader: path.join(__dirname, 'bin', 'pbiPluginLoader'),
            },
            {
                test: /\.ts?$/,
                loader: 'ts-loader',
            }, {
                test: /\.(png|svg)$/,
                loader: "binary-loader"
            }, {
                test: require.resolve("powerbi-visuals-utils-dataviewutils"),
                loader: "script-loader"
            }
        ]
    },
    externals: [
        {
            jquery: "jQuery",
            "lodash": "_"
        },
    ],
    plugins: [
        new webpack.IgnorePlugin(/socket.io/)
    ]
};
