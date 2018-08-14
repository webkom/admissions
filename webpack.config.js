var path = require("path");
var webpack = require("webpack");
var BundleTracker = require("webpack-bundle-tracker");

const isProduction = process.env.NODE_ENV === "production";

module.exports = {
  context: __dirname,
  entry: isProduction
    ? {
        app: "./frontend/src/index",
        vendor: [
          "react",
          "react-dom",
          "reselect",
          "styled-components",
          "raven-js"
        ]
      }
    : {
        app: [
          "webpack-dev-server/client?http://localhost:3000",
          "webpack/hot/only-dev-server",
          "./frontend/src/index"
        ],
        vendor: [
          "react",
          "react-dom",
          "reselect",
          "styled-components",
          "raven-js"
        ]
      },
  output: {
    path: path.resolve("./assets/bundles/"),
    chunkFilename: "[name]-[chunkhash].js",
    filename: "[name]-[hash].js",
    publicPath: isProduction
      ? "/static/bundles/"
      : "http://localhost:3000/static/bundles/" // Use hot-reloading in DEV, otherwise hosted by django
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
          enforce: true
        }
      }
    },
    runtimeChunk: true
  },

  plugins: [
    new BundleTracker({ filename: "./webpack-stats.json" }),
    !isProduction && new webpack.HotModuleReplacementPlugin(),
    new webpack.NamedModulesPlugin(),
    new webpack.DefinePlugin({
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
      "process.env.RELEASE": JSON.stringify(process.env.RELEASE),
      "process.env.RAVEN_DSN": JSON.stringify(process.env.RAVEN_DSN),
      "process.env.ENVIRONMENT": JSON.stringify(process.env.ENVIRONMENT)
    }),
    new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/)
  ].filter(Boolean),

  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: [{ loader: "babel-loader" }]
      },
      {
        // Preprocess our own .css files
        // This is the place to add your own loaders (e.g. sass/less etc.)
        // for a list of loaders, see https://webpack.js.org/loaders/#styling
        test: /\.css$/,
        exclude: /node_modules/,
        use: ["style-loader", "css-loader"]
      },
      {
        // Preprocess 3rd party .css files located in node_modules
        test: /\.css$/,
        include: /node_modules/,
        use: ["style-loader", "css-loader"]
      },
      {
        test: /\.svg$/,
        use: [
          {
            loader: "svg-url-loader",
            options: {
              // Inline files smaller than 10 kB
              limit: 10 * 1024,
              noquotes: true
            }
          }
        ]
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
              emit: false
            }
          },
          {
            loader: "image-webpack-loader",
            options: {
              mozjpeg: {
                enabled: false
                // NOTE: mozjpeg is disabled as it causes errors in some Linux environments
                // Try enabling it in your environment by switching the config to:
                // enabled: true,
                // progressive: true,
              },
              gifsicle: {
                interlaced: false
              },
              optipng: {
                optimizationLevel: 7
              },
              pngquant: {
                quality: "65-90",
                speed: 4
              }
            }
          }
        ]
      }
    ]
  },

  resolve: {
    alias: {
      assets: path.resolve(__dirname, "assets")
    },
    modules: [path.resolve(__dirname, "frontend"), "node_modules"],
    extensions: [".js", ".jsx"]
  }
};
