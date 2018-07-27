var path = require('path')
var webpack = require('webpack')
var BundleTracker = require('webpack-bundle-tracker')

module.exports = {
    context: __dirname,

    entry: './frontend/src/index.js', // entry point of our src. frontend/src/index.js should require other js modules and dependencies it needs

    output: {
        path: path.resolve('./committee_admissions/admissions/static/bundles/'), // I'd rather move this out of backend folder, but couldn't get it to work.
        filename: "[name].js",
        publicPath: '/static/bundles/', // Tell django to use this URL to load packages and not use STATIC_URL + bundle_name
    },

    plugins: [
        new BundleTracker({filename: './webpack-stats.json'}),
    ],

    module: {
        rules: [
            {
                test: /\.jsx?$/,
                exclude: /node_modules/,
                use: ['babel-loader']
            },
        ],
    },

    resolve: {
        modules: ['node_modules'],
        extensions: ['.js', '.jsx']
    },
}