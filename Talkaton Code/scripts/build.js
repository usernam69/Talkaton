const { readFileSync, writeFileSync } = require("fs");
const { join } = require("path");

const root = join(__dirname, "..");
const swPath = join(root, "chat", "sw.js");
const version = `t${Date.now()}`;

const sw = readFileSync(swPath, "utf8").replace(
  /talkaton-(?:__BUILD_VERSION__|t\d+)/,
  `talkaton-${version}`
);
writeFileSync(swPath, sw);

console.log(`Cache version: ${version}`);
