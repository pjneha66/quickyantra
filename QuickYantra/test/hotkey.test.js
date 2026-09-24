"use strict";

var fs = require("fs");
var path = require("path");
var assert = require("assert");

var root = path.join(__dirname, "..");
var launcher = fs.readFileSync(path.join(root, "launcher", "index.html"), "utf8");
var shellPath = path.join(root, "host", "FxSearchShell");
var kysPath = path.join(root, "launcher", "kys-hotkey.js");

var shellMode = fs.statSync(shellPath).mode;
assert.ok(
  (shellMode & 0o111) !== 0,
  "host/FxSearchShell must be executable so Shift+Space can register"
);

assert.ok(
  /chmod\s+\+x/.test(launcher),
  "launcher must chmod +x the Mac shell before spawn"
);

assert.ok(
  !/fs\.writeFile\(\s*dst\s*,\s*src\.data\s*\)/.test(launcher),
  "launcher must not write into the user's Premiere .kys presets"
);

assert.ok(
  launcher.indexOf("installKeyboardPreset") === -1,
  "launcher must not install or overwrite a bundled Premiere keyboard preset"
);

assert.ok(
  /autolaunch\.txt/.test(launcher) === false || /isMac/.test(launcher),
  "Windows must not hide the panel via autolaunch; Premiere Keyboard Shortcuts opens it"
);

assert.ok(
  fs.existsSync(kysPath),
  "launcher/kys-hotkey.js must parse the user's Premiere keyboard preset"
);

var kys = require(kysPath);

assert.strictEqual(typeof kys.parseKysHotkey, "function");
assert.strictEqual(typeof kys.convertPremiereMods, "function");
assert.strictEqual(typeof kys.formatHotkeyLine, "function");
assert.strictEqual(typeof kys.decodeKysBuffer, "function");

assert.strictEqual(kys.convertPremiereMods(1), 4, "Premiere Shift -> shell Shift");
assert.strictEqual(kys.convertPremiereMods(2), 2, "Premiere Ctrl -> shell Ctrl");
assert.strictEqual(kys.convertPremiereMods(4), 1, "Premiere Alt -> shell Alt/Option");
assert.strictEqual(kys.convertPremiereMods(8), 8, "Premiere Cmd -> shell Cmd");
assert.strictEqual(kys.convertPremiereMods(1 | 2), 4 | 2, "Premiere Shift+Ctrl");

var xmlShiftSpace = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  "<PremiereData Version=\"3\">",
  "  <KeyBinding>",
  "    <CommandID>com.quickyantra.premiere.panel</CommandID>",
  "    <Key>32</Key>",
  "    <Modifiers>1</Modifiers>",
  "  </KeyBinding>",
  "</PremiereData>"
].join("\n");

var parsed = kys.parseKysHotkey(xmlShiftSpace, { isMac: true });
assert.ok(parsed, "must read Quick Yantra binding from a Premiere .kys");
assert.strictEqual(parsed.mods, 4);
assert.strictEqual(parsed.vk, 32);
assert.strictEqual(parsed.label, "Shift+Space");
assert.strictEqual(kys.formatHotkeyLine(parsed), "4,32,Shift+Space");

var xmlCustom = [
  "<PremiereData>",
  "  <KeyBinding>",
  "    <CommandName>Quick Yantra</CommandName>",
  "    <Key>70</Key>",
  "    <Modifiers>6</Modifiers>",
  "  </KeyBinding>",
  "</PremiereData>"
].join("\n");

var customWin = kys.parseKysHotkey(xmlCustom, { isMac: false });
assert.ok(customWin, "must match a custom Premiere preset shortcut");
assert.strictEqual(customWin.mods, 2 | 1);
assert.strictEqual(customWin.vk, 70);
assert.strictEqual(customWin.label, "Ctrl+Alt+F");
assert.strictEqual(kys.formatHotkeyLine(customWin), "3,70,Ctrl+Alt+F");

var customMac = kys.parseKysHotkey(xmlCustom, { isMac: true });
assert.strictEqual(customMac.label, "Ctrl+Option+F");

assert.strictEqual(
  kys.parseKysHotkey("<PremiereData/>", { isMac: true }),
  null,
  "no Quick Yantra binding means keep the default hotkey"
);

var utf16 = kys.decodeKysBuffer(Buffer.from("\ufeff" + xmlShiftSpace, "utf16le"));
var parsed16 = kys.parseKysHotkey(utf16, { isMac: true });
assert.ok(parsed16);
assert.strictEqual(parsed16.label, "Shift+Space");

assert.ok(
  /syncHotkeyFromUserPreset|parseKysHotkey|kys-hotkey/.test(launcher),
  "launcher must sync host/hotkey.txt from the user's Premiere preset"
);

assert.ok(
  launcher.indexOf("FX Search (Mac).kys") === -1 || /skip|ignore|read/i.test(launcher),
  "must not treat bundled FX Search preset names as the user's custom preset"
);

var exePath = path.join(root, "host", "FxSearchShell.exe");
assert.ok(fs.existsSync(exePath), "host/FxSearchShell.exe must exist for Windows users");
var exe = fs.readFileSync(exePath);
assert.ok(exe.length > 1024, "FxSearchShell.exe must not be an empty stub");
assert.strictEqual(exe.slice(0, 2).toString("ascii"), "MZ", "FxSearchShell.exe must be a Windows PE");
var peOff = exe.readUInt32LE(0x3c);
assert.ok(peOff > 0 && peOff < exe.length - 4, "PE header offset must be valid");
assert.strictEqual(exe.slice(peOff, peOff + 4).toString("ascii"), "PE\0\0", "FxSearchShell.exe must have a PE signature");
var exeText = exe.toString("binary");
assert.ok(exeText.indexOf("hotkey.txt") !== -1, "Windows shell must read host/hotkey.txt");
assert.ok(exeText.indexOf("__FXSHELL__") !== -1, "Windows shell must inject window.__FXSHELL__");
assert.ok(exeText.indexOf("client/index.html") !== -1, "Windows shell must load client/index.html");
assert.ok(exeText.indexOf("launcher-alive.txt") !== -1, "Windows shell must watch launcher heartbeat");
assert.ok(/RegisterHotKey/.test(exeText) || /user32/.test(exeText), "Windows shell must register a global hotkey");

assert.ok(
  /FxSearchShell\.exe/.test(launcher),
  "launcher must spawn host/FxSearchShell.exe on Windows"
);

console.log("hotkey tests passed");
