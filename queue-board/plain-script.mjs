// plain-script.mjs: loads one of the page's plain scripts (worker-count.js, fleet-logic.js) in node. They are written
// for a <script> tag and put their functions on the global object; this package is an ES module package, so node will
// not require them. loadPlain runs the file with its own object standing in for the global one and returns that object.
// It runs in this realm, so what the functions return compares equal to plain objects in the tests.
import fs from 'node:fs';
import vm from 'node:vm';

export function loadPlain(file) {
  const out = {};
  const src = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  vm.runInThisContext(`(function (globalThis) {\n${src}\n})`, { filename: file })(out);
  return out;
}
