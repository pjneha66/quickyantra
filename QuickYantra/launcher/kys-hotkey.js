(function (root) {
  var SHELL_ALT = 1;
  var SHELL_CTRL = 2;
  var SHELL_SHIFT = 4;
  var SHELL_CMD = 8;
  var PRE_SHIFT = 1;
  var PRE_CTRL = 2;
  var PRE_ALT = 4;
  var PRE_CMD = 8;

  function convertPremiereMods(premiereMods) {
    var n = parseInt(premiereMods, 10) || 0;
    var out = 0;
    if (n & PRE_SHIFT) out |= SHELL_SHIFT;
    if (n & PRE_CTRL) out |= SHELL_CTRL;
    if (n & PRE_ALT) out |= SHELL_ALT;
    if (n & PRE_CMD) out |= SHELL_CMD;
    return out;
  }

  function keyName(vk) {
    if (vk === 32) return "Space";
    if (vk >= 112 && vk <= 123) return "F" + (vk - 111);
    if ((vk >= 65 && vk <= 90) || (vk >= 48 && vk <= 57)) {
      return String.fromCharCode(vk);
    }
    return String(vk);
  }

  function formatLabel(mods, vk, isMac) {
    var parts = [];
    if (mods & SHELL_CTRL) parts.push("Ctrl");
    if (mods & SHELL_ALT) parts.push(isMac ? "Option" : "Alt");
    if (mods & SHELL_SHIFT) parts.push("Shift");
    if (mods & SHELL_CMD) parts.push("Cmd");
    parts.push(keyName(vk));
    return parts.join("+");
  }

  function formatHotkeyLine(cfg) {
    if (!cfg || !cfg.vk) return "0,0,";
    return cfg.mods + "," + cfg.vk + "," + (cfg.label || "");
  }

  function decodeKysBuffer(input) {
    if (input == null) return "";
    if (typeof input === "string") {
      return input.replace(/^\uFEFF/, "").replace(/\u0000/g, "");
    }
    var hasBuffer = typeof Buffer !== "undefined";
    var buf = hasBuffer && Buffer.isBuffer(input) ? input : null;
    if (!buf && input && typeof input.length === "number") {
      var copy = [];
      for (var b = 0; b < input.length; b++) copy.push(input[b] & 255);
      if (hasBuffer) buf = Buffer.from(copy);
      else {
        var s = "";
        for (var c = 0; c < copy.length; c++) s += String.fromCharCode(copy[c]);
        return s.replace(/^\uFEFF/, "").replace(/\u0000/g, "");
      }
    }
    if (!buf || !buf.length) return "";
    if (buf[0] === 0xff && buf[1] === 0xfe) {
      return buf.slice(2).toString("utf16le");
    }
    if (buf[0] === 0xfe && buf[1] === 0xff) {
      var swapped = Buffer.alloc(buf.length - 2);
      for (var i = 2; i + 1 < buf.length; i += 2) {
        swapped[i - 2] = buf[i + 1];
        swapped[i - 1] = buf[i];
      }
      return swapped.toString("utf16le");
    }
    if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
      return buf.slice(3).toString("utf8");
    }
    var n = Math.min(buf.length, 200);
    var zeros = 0;
    for (var z = 0; z < n; z++) if (buf[z] === 0) zeros++;
    if (zeros > n / 4) return buf.toString("utf16le").replace(/^\uFEFF/, "");
    return buf.toString("utf8").replace(/^\uFEFF/, "");
  }

  function tagInt(xml, names) {
    for (var i = 0; i < names.length; i++) {
      var re = new RegExp("<" + names[i] + "[^>]*>\\s*(\\d+)\\s*</" + names[i] + ">", "i");
      var m = re.exec(xml);
      if (m) return parseInt(m[1], 10);
      var attr = new RegExp("\\b" + names[i] + "\\s*=\\s*\"(\\d+)\"", "i");
      var a = attr.exec(xml);
      if (a) return parseInt(a[1], 10);
    }
    return NaN;
  }

  function parseBlock(block, isMac) {
    var vk = tagInt(block, ["Key", "VirtualKey", "virtualKey", "VK"]);
    if (!vk) return null;
    var modsRaw = tagInt(block, ["Modifiers", "modifiers", "Modifier"]);
    if (isNaN(modsRaw)) modsRaw = 0;
    var mods = convertPremiereMods(modsRaw);
    return {
      mods: mods,
      vk: vk,
      label: formatLabel(mods, vk, isMac)
    };
  }

  function looksLikeOurs(text) {
    return /com\.quickyantra\.premiere\.panel/i.test(text) || /Quick\s*Yantra/i.test(text);
  }

  function parseKysHotkey(xml, opts) {
    if (!xml) return null;
    var isMac = !!(opts && opts.isMac);
    var text = decodeKysBuffer(xml);
    if (!looksLikeOurs(text)) return null;

    var blockRe = /<(KeyBinding|shortcut|Shortcut|commandbinding)[\s\S]*?<\/\1>/gi;
    var block;
    while ((block = blockRe.exec(text))) {
      if (!looksLikeOurs(block[0])) continue;
      var parsed = parseBlock(block[0], isMac);
      if (parsed) return parsed;
    }

    var markers = [
      "com.quickyantra.premiere.panel",
      "Quick Yantra",
      "QuickYantra"
    ];
    for (var i = 0; i < markers.length; i++) {
      var idx = text.toLowerCase().indexOf(markers[i].toLowerCase());
      if (idx < 0) continue;
      var window = text.slice(Math.max(0, idx - 400), idx + 800);
      var parsedNear = parseBlock(window, isMac);
      if (parsedNear) return parsedNear;
    }
    return null;
  }

  var api = {
    parseKysHotkey: parseKysHotkey,
    convertPremiereMods: convertPremiereMods,
    formatHotkeyLine: formatHotkeyLine,
    decodeKysBuffer: decodeKysBuffer,
    formatLabel: formatLabel
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.KysHotkey = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
