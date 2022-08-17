const path = require("path");
const webpack = require("webpack");
const BundleTracker = require("webpack-bundle-tracker");
const CircularDependencyPlugin = require("circular-dependency-plugin");

const isProduction = process.env.NODE_ENV === "production";

module.exports = {
  context: __dirname,
  entry: isProduction
    ? {
        app: ["@babel/polyfill", "whatwg-fetch", "./frontend/src/index"],
        vendor: [
          "react",
          "react-dom",
          "reselect",
          "styled-components",
          "@sentry/browser",
        ],
      }
    : {
        app: [
          "@babel/polyfill",
          "whatwg-fetch",
          "webpack-dev-server/client?http://127.0.0.1:5001",
          "webpack/hot/only-dev-server",
          "./frontend/src/index",
        ],
        vendor: [
          "react",
          "react-dom",
          "reselect",
          "styled-components",
          "@sentry/browser",
        ],
      },
  output: {
    path: path.resolve("./assets/bundles/"),
    chunkFilename: "[name]-[chunkhash].js",
    filename: "[name]-[hash].js",
    publicPath: isProduction
      ? "/static/bundles/"
      : "http://127.0.0.1:5001/static/bundles/", // Use hot-reloading in DEV, otherwise hosted by django
  },
  devtool: isProduction ? "source-map" : "cheap-module-eval-source-map",
  optimization: {
    splitChunks: {
      chunks: "all",
      cacheGroups: {
        vendor: {
          chunks: "initial",
          name: "vendor",
          test: "vendor",
          enforce: true,
        },
      },
    },
    runtimeChunk: true,
  },

  plugins: [
    new BundleTracker({ filename: "./webpack-stats.json" }),
    !isProduction && new webpack.HotModuleReplacementPlugin(),
    new webpack.NamedModulesPlugin(),
    new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),
    !isProduction &&
      new CircularDependencyPlugin({
        exclude: /a\.js|node_modules/,
        failOnError: false,
        cwd: process.cwd(),
      }),
  ].filter(Boolean),

  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: [{ loader: "babel-loader" }],
      },
      {
        // Preprocess our own .css files
        // This is the place to add your own loaders (e.g. sass/less etc.)
        // for a list of loaders, see https://webpack.js.org/loaders/#styling
        test: /\.css$/,
        exclude: /node_modules/,
        use: ["style-loader", "css-loader"],
      },
      {
        // Preprocess 3rd party .css files located in node_modules
        test: /\.css$/,
        include: /node_modules/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.(jpg|png|gif)$/,
        use: [
          {
            loader: "url-loader",
            options: {
              // Inline files smaller than 10 kB
              limit: 10 * 1024,
              name: "[path][name].[hash].[ext]",
              emit: false,
            },
          },
          {
            loader: "image-webpack-loader",
            options: {
              mozjpeg: {
                enabled: false,
                // NOTE: mozjpeg is disabled as it causes errors in some Linux environments
                // Try enabling it in your environment by switching the config to:
                // enabled: true,
                // progressive: true,
              },
              gifsicle: {
                interlaced: false,
              },
              optipng: {
                optimizationLevel: 7,
              },
              pngquant: {
                quality: [0.6, 0.95],
                speed: 4,
              },
            },
          },
        ],
      },
      {
        test: /\.(woff(2)?|ttf|eot|svg)(\?v=\d+\.\d+\.\d+)?$/,
        use: [
          {
            loader: "file-loader",
            options: {
              name: "[name].[ext]",
              outputPath: "assets/",
            },
          },
        ],
      },
    ],
  },

  resolve: {
    alias: {
      assets: path.resolve(__dirname, "assets"),
    },
    modules: [path.resolve(__dirname, "frontend"), "node_modules"],
    extensions: [".js", ".jsx"],
  },
};
