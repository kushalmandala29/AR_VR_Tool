const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
  entry: "./index.html", // Ensure your entry file is correct
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js",
  },
  module: {
    rules: [
      {
        test: /\.html$/, // Match HTML files
        use: ["html-loader"], // Use html-loader
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "./index.html", // Use the HTML template
      filename: "index.html",
    }),
  ],
  mode: "development",
};
