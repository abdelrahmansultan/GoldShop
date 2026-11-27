const fs = require("fs");
const path = require("path");
const src = path.join(__dirname, "..", "..", "frontend", "dist");
const dst = path.join(__dirname, "..", "web");
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
console.log("Copied web build to", dst);
