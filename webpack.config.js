var webpack = require("webpack");

module.exports = {
    entry: {
        app: "./src/app.tsx",
        globals: ["react", "react-dom"]
    },
    output: {
        filename: "[name].js",
        path: __dirname + "/dist/assets/js"
    },

    // Enable sourcemaps for debugging webpack's output.
    devtool: "source-map",

    resolve: {
        // Add '.ts' and '.tsx' as resolvable extensions.
        extensions: [".webpack.js", ".web.js", ".ts", ".tsx", ".js"]
    },

    module: {
        rules: [
            // All files with a '.ts' or '.tsx' extension will be handled by 'awesome-typescript-loader'.
            { test: /\.tsx?$/, loader: "awesome-typescript-loader" },

            // All output '.js' files will have any sourcemaps re-processed by 'source-map-loader'.
            { enforce: "pre", test: /\.js$/, loader: "source-map-loader" }
        ]
    },

    plugins: [new webpack.optimize.CommonsChunkPlugin({ name: "globals", filename: "globals.js" })]
};