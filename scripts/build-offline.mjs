import fs from "node:fs/promises";
import { build } from "esbuild";

const htmlPath = new URL("../index.html", import.meta.url);
let html = await fs.readFile(htmlPath, "utf8");

const sourceMatch = html.match(/<script type="text\/plain" id="ca-tracker-jsx-source">([\s\S]*?)<\/script>/);
if (!sourceMatch) throw new Error("Could not find the embedded tracker JSX source.");

const entry = [
  'import React from "react";',
  'import * as ReactDOM from "react-dom/client";',
  'import ExcelJS from "exceljs";',
  'window.React = React;',
  'window.ReactDOM = ReactDOM;',
  'window.ExcelJS = ExcelJS;',
  sourceMatch[1]
].join("\n");

const result = await build({
  stdin: { contents: entry, resolveDir: process.cwd(), sourcefile: "tracker.jsx", loader: "jsx" },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  target: ["es2018"],
  minify: true,
  legalComments: "none",
  define: { "process.env.NODE_ENV": '"production"' }
});
const bundled = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

html = html.replace(sourceMatch[0], '<script>\n/* Self-contained offline application bundle. Built from pinned local dependencies. */\n' + bundled + '\n</script>');

const loaderPattern = /<script>\s*\/\/ Load core libraries sequentially[\s\S]*?<\/script>/;
if (!loaderPattern.test(html)) throw new Error("Could not find the old network-dependent startup loader.");
html = html.replace(loaderPattern, "");

html = html.replace(/\s*\/\/ Register service worker for offline support[\s\S]*?navigator\.serviceWorker\.register\(URL\.createObjectURL\(swBlob\)\)\.catch\(\(\)=>\{\}\);/, "\n// Single-file mode is self-contained; service workers require a separate HTTPS-served worker file.");

html = html.replace('if(!window.Babel) problems.push("Babel is unavailable");', "");
html = html.replace(/    var babelScripts=[\s\S]*?\.join\(" \| "\);/, '    var babelState="precompiled offline bundle";');
html = html.replace(' | babelScripts=" + (babelState || "none")', ' | startup=" + babelState');

await fs.writeFile(htmlPath, html, "utf8");
console.log("Offline build complete: " + bundled.length.toLocaleString() + " bundle characters; external runtime libraries removed.");
