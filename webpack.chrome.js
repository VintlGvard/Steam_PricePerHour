const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const webpack = require("webpack");
require("dotenv").config();

module.exports = (env, argv) => {
  const isProduction = argv.mode === "production";

  return {
    entry: {
      content: "./src/content.js",
      service_worker: "./src/service_worker.js",
      popup: "./src/popup.js",
    },
    output: {
      path: path.resolve(__dirname, "dist/chrome"),
      filename: "[name].js",
      clean: true,
    },
    devtool: isProduction ? false : "cheap-module-source-map",
    optimization: {
      minimize: isProduction,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            format: {
              comments: false,
            },
            compress: {
              drop_console: false,
              pure_funcs: isProduction ? ["console.log", "console.info", "console.debug"] : [],
              passes: 2,
            },
            mangle: {
              safari10: true,
            },
          },
          extractComments: false,
        }),
      ],
    },
    plugins: [
      new webpack.DefinePlugin({
        "process.env.SPH_API_BASE": JSON.stringify(
          process.env.SPH_API_BASE || "https://spph.vintlgvard.com",
        ),
        "process.env.SPH_API_KEY": JSON.stringify(process.env.SPH_API_KEY_CHROME || ""),
      }),
      new CopyPlugin({
        patterns: [
          { from: "src/popup.html", to: "popup.html" },
          { from: "src/popup.css", to: "popup.css" },
          { from: "src/styles.css", to: "styles.css" },
          { from: "src/manifests/chrome.json", to: "manifest.json" },
          { from: "icons", to: "icons" },
        ],
      }),
    ],
    resolve: {
      extensions: [".js"],
    },
    performance: {
      hints: false,
    },
    experiments: {
      outputModule: false,
    },
  };
};
