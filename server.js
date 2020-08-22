/* eslint-disable */

var webpack = require("webpack");
var WebpackDevServer = require("webpack-dev-server");
var config = require("./webpack.config");

config.mode = "development";

new WebpackDevServer(webpack(config), {
  publicPath: config.output.publicPath,
  hot: true,
  inline: true,
  historyApiFallback: true,
  sockPort: "5001",
  headers: { "Access-Control-Allow-Origin": "*" }
}).listen(5001, "0.0.0.0", function(err) {
  if (err) {
    console.PluginError(err);
  }
  console.log("Webpack HMR listening on port 5001");
});
