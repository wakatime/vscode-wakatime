'use strict';

const path = require('path');
const webpack = require('webpack');
const { builtinModules } = require('module');

// Webpack's Node preset externalizes punycode before aliases run. Preserve its
// treatment of every other Node module while bundling the userland replacement.
const desktopExternalNodeModules = new Set(builtinModules.filter((module) => module !== 'punycode'));

const webConfig = /** @type WebpackConfig */ {
  name: 'Web',
  context: __dirname,
  target: 'webworker', // web extensions run in a webworker context
  entry: './src/web/extension.ts',
  output: {
    path: path.join(__dirname, 'dist', 'web'),
    filename: 'extension.js',
    libraryTarget: 'commonjs',
  },
  resolve: {
    mainFields: ['browser', 'module', 'main'], // look for `browser` entry point in imported node modules
    extensions: ['.ts', '.js'], // support ts-files and js-files
    fallback: {
      // Webpack 5 no longer polyfills Node.js core modules automatically.
      // see https://webpack.js.org/configuration/resolve/#resolvefallback
      // for the list of Node.js core module polyfills.
      assert: require.resolve('assert'),
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: [
          '/node_modules/',
          '/src/extension.ts',
          '/src/wakatime.ts',
        ],
        use: [
          {
            loader: 'ts-loader',
          },
        ],
      },
    ],
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: 'process/browser', // provide a shim for the global `process` variable
    }),
  ],
  externals: {
    vscode: 'commonjs vscode', // ignored because it doesn't exist
  },
  performance: {
    hints: false,
  },
  devtool: 'nosources-source-map', // create a source map that points to the original source file
};

/**@type {import('webpack').Configuration}*/
const nodeConfig = /** @type WebpackConfig */ {
  name: 'Desktop',
  target: 'node',
  externalsPresets: {
    node: false,
  },
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]',
  },
  devtool: 'source-map',
  externals: [
    async ({ request }) => {
      if (request && (request.startsWith('node:') || desktopExternalNodeModules.has(request))) {
        return `commonjs ${request}`;
      }
    },
    {
      vscode: 'commonjs vscode',
      azdata: 'commonjs azdata',
    },
  ],
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      punycode: require.resolve('punycode/'),
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: [
          '/node_modules/',
          '/web/',
        ],
        use: [
          {
            loader: 'ts-loader',
          },
        ],
      },
    ],
  },
};

module.exports = [webConfig, nodeConfig];
