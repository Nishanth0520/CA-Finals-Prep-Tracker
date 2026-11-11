import fs from "node:fs/promises";
import { build } from "esbuild";

const htmlPath = new URL("../index.html", import.meta.url);
const shellPath = new URL("../offline-shell.html", import.meta.url);
const sourcePath = new URL("../src/tracker.jsx", import.meta.url);
const [shell, source] = await Promise.all([
  fs.readFile(shellPath, "utf8"),
  fs.readFile(sourcePath, "utf8")
]);

const entry = [
  'import React from "react";',
  'import * as ReactDOM from "react-dom/client";',
  'import ExcelJS from "exceljs";',
  'window.React = React;',
  'window.ReactDOM = ReactDOM;',
  'window.ExcelJS = ExcelJS;',
  source
].join("\n");

const result = await build({
  stdin: { contents: entry, resolveDir: new URL("../", import.meta.url).pathname, sourcefile: "tracker.jsx", loader: "jsx" },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  target: ["es2018"],
  minify: false,
  legalComments: "none",
  define: { "process.env.NODE_ENV": '"production"' }
});
const bundled = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
if (!shell.includes("<!-- APP_BUNDLE -->")) throw new Error("Offline shell is missing the app bundle marker.");
let html = shell.replace("<!-- APP_BUNDLE -->", '<script>\n/* Self-contained offline application bundle. Built from pinned local dependencies. */\n' + bundled + '\n</script>');

const loaderPattern = /<script>\s*\/\/ Load core libraries sequentially[\s\S]*?<\/script>/;
if (!loaderPattern.test(html)) throw new Error("Could not find the old network-dependent startup loader.");
html = html.replace(loaderPattern, "");
html = html.replace(/\s*\/\/ Register service worker for offline support[\s\S]*?navigator\.serviceWorker\.register\(URL\.createObjectURL\(swBlob\)\)\.catch\(\(\)=>\{\}\);/, "\n// Single-file mode is self-contained; service workers require a separate HTTPS-served worker file.");
html = html.replace('if(!window.Babel) problems.push("Babel is unavailable");', "");
html = html.replace(/<script>\s*\/\/ PWA Manifest \(inline\)[\s\S]*?<\/script>/, "");
html = html.replace(/    var babelScripts=[\s\S]*?\.join\(" \| "\);/, '    var babelState="precompiled offline bundle";');
html = html.replace(' | babelScripts=" + (babelState || "none")', ' | startup=" + babelState');

await fs.writeFile(htmlPath, html, "utf8");
console.log("Offline build complete: " + bundled.length.toLocaleString() + " bundle characters; source and shell are now reproducible.");
