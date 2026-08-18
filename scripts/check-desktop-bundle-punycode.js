'use strict';

const fs = require('fs');
const path = require('path');

const sourceMapPath = path.join(__dirname, '..', 'dist', 'extension.js.map');
const sourceMap = JSON.parse(fs.readFileSync(sourceMapPath, 'utf8'));
const punycodeSources = sourceMap.sources.filter((source) => source.includes('punycode'));

if (punycodeSources.some((source) => source.includes('external node-commonjs'))) {
  throw new Error('Desktop bundle still loads the deprecated Node.js punycode module.');
}

if (!punycodeSources.some((source) => source.includes('node_modules/punycode/punycode.js'))) {
  throw new Error('Desktop bundle does not contain the userland punycode implementation.');
}
