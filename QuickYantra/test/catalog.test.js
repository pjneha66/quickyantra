"use strict";

var fs = require("fs");
var path = require("path");
var assert = require("assert");

var root = path.join(__dirname, "..");
var clientJs = fs.readFileSync(path.join(root, "client", "index.js"), "utf8");
var fxsearch = fs.readFileSync(path.join(root, "jsx", "fxsearch.jsx"), "utf8");

function commandIdsFromAm(src) {
  var start = src.indexOf('const am=[');
  assert.notStrictEqual(start, -1, "command catalog am is missing");
  var end = src.indexOf("],Lu=", start);
  assert.notStrictEqual(end, -1, "command catalog am is truncated");
  var block = src.slice(start, end);
  var ids = [];
  var re = /commandId:"([^"]+)"/g;
  var m;
  while ((m = re.exec(block))) ids.push(m[1]);
  return ids;
}

var ids = commandIdsFromAm(clientJs);

assert.ok(ids.length >= 30, "expected the full scripted command catalog, got " + ids.length);
assert.ok(ids.indexOf("marker.add") !== -1, "Add Marker must be in the catalog");
assert.ok(ids.indexOf("clip.rename") !== -1, "Rename must be in the catalog");
assert.ok(ids.indexOf("trim.in") !== -1, "Trim In must be in the catalog");
assert.ok(ids.indexOf("clip.rippleDelete") !== -1, "Ripple Delete must be in the catalog");

assert.ok(
  clientJs.indexOf('am.filter(m=>m.commandId==="project.arrange")') === -1,
  "search must not inject only Arrange Project"
);

assert.ok(
  /t\(\[\.\.\.y,\.\.\.am/.test(clientJs),
  "search results must merge the full command catalog am"
);

assert.ok(
  clientJs.indexOf("];[...um.map") === -1,
  "Set Label keycmds must be assigned, not discarded"
);
assert.ok(
  /Qm=\[\.\.\.um\.map/.test(clientJs),
  "Set Label keycmds must be stored in Qm"
);

assert.ok(
  clientJs.indexOf("];[...cm.map") === -1,
  "Clip keycmds must be assigned, not discarded"
);
assert.ok(
  /Rm=\[\.\.\.cm\.map/.test(clientJs),
  "Clip keycmds must be stored in Rm"
);

assert.ok(
  /t\(\[\.\.\.y,\.\.\.am,\.\.\.Qm,\.\.\.Rm\]\)/.test(clientJs),
  "search results must merge commands plus label and clip keycmds"
);

assert.ok(
  /commandId:"clip.rippleDelete"/.test(clientJs),
  "Ripple Delete must be searchable"
);
assert.ok(
  /case "clip.rippleDelete"/.test(fxsearch),
  "Ripple Delete must be handled in ExtendScript"
);
assert.ok(
  /function FXS__rippleDelete/.test(fxsearch),
  "Ripple Delete must have an ExtendScript implementation"
);

console.log("catalog tests passed (" + ids.length + " scripted commands)");
