const webpack = require('webpack');
const path = require('path');
const ENTRY = './src/TimelineStoryteller.ts';
const regex = path.normalize(ENTRY).replace(/\\/g, '\\\\').replace(/\./g, '\\.');

module.exports = {
    entry: ENTRY,
    devtool: 'eval',
    resolve: {
        extensions: ['', '.webpack.js', '.web.js', '.js', '.ts', '.css', '.png', '.svg', '.gif']
    },
    module: {
        loaders: [
            {
                test: /\.css?$/,
                loaders: ['style-loader', 'css-loader'],
            },
            {
                test: new RegExp(regex),
                loader: path.join(__dirname, 'bin', 'pbiPluginLoader'),
            },
            {
                test: /\.ts?$/,
                loader: 'ts-loader',
            },
            {
                test: /timelinestoryteller-component\/.*\/app\/.*\.js$/,
                loader: 'script-loader'
            },
            {
                test:  require.resolve("intro.js"),
                loader: 'script-loader'
            },
            {
                test: /\.(png|gif|svg)?$/,
                loader: 'url-loader',
                options: {
                    limit: 10000000
                }
            }
        ]
    },
    externals: [
        {
            jquery: "jQuery",
            "lodash": "_"
        },
    ]
};
