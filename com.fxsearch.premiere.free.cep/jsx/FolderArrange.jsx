/*
 * FX Search — Project Folder Arrangement (v1.2). Loaded by absolute path
 * alongside fxsearch.jsx (shared FXS__ok / FXS__err are already global).
 *
 * FXS_arrangeProject(): sweeps the top-level items in the Project panel and
 * moves each into a category bin by kind — Video / Image / Gif / Audio /
 * Sequences / Nest / Graphics / Premiere Items / Other. Non-destructive; runs
 * on the project root, reusing category bins if they already exist.
 *
 * Basic classification now (extension + isSequence + media-path presence);
 * the Graphics-vs-synthetic and Nest-vs-Sequence edge cases are heuristic and
 * will be refined after a probe.
 */

function FXS__faExt(path) {
  if (!path) return "";
  var s = String(path);
  var dot = s.lastIndexOf(".");
  if (dot < 0) return "";
  return s.substring(dot + 1).toLowerCase();
}

function FXS__faIn(ext, list) {
  for (var i = 0; i < list.length; i++) if (list[i] === ext) return true;
  return false;
}

var FXS__FA_VIDEO = ["mp4", "mov", "avi", "mkv", "mxf", "m4v", "mpg", "mpeg", "wmv", "webm", "mts", "m2ts", "ts", "3gp", "flv", "r3d", "braw"];
var FXS__FA_IMAGE = ["jpg", "jpeg", "png", "tif", "tiff", "psd", "bmp", "webp", "exr", "tga", "heic", "dpx", "ai", "svg"];
var FXS__FA_AUDIO = ["mp3", "wav", "aac", "m4a", "flac", "aif", "aiff", "ogg", "wma", "caf"];

function FXS__faIsBin(it) {
  try { if (it.type === 2) return true; } catch (e1) { /* fall through */ } // ProjectItemType.BIN
  // Fallback: has child items, no media, not a sequence → a bin/folder.
  try {
    if (it.children && it.children.numItems > 0 && (!it.isSequence || !it.isSequence())) {
      var mp = ""; try { mp = String(it.getMediaPath()); } catch (e2) { /* skip */ }
      if (!mp) return true;
    }
  } catch (e3) { /* skip */ }
  return false;
}

/* Returns the category bin name for a project item, or null to skip it. */
function FXS__faClassify(it) {
  if (FXS__faIsBin(it)) return null; // never move a bin into a bin

  var isSeq = false;
  try { isSeq = (it.isSequence && it.isSequence()); } catch (e1) { /* skip */ }
  if (isSeq) {
    var nm = ""; try { nm = String(it.name); } catch (e2) { /* skip */ }
    return /nest/i.test(nm) ? "Nest" : "Sequences";
  }

  var mp = ""; try { mp = String(it.getMediaPath()); } catch (e3) { /* skip */ }
  if (!mp) return "Premiere Items"; // adjustment layers, color mattes, in-app graphics…

  var ext = FXS__faExt(mp);
  if (ext === "gif") return "Gif";
  if (ext === "mogrt") return "Graphics";
  if (FXS__faIn(ext, FXS__FA_VIDEO)) return "Video";
  if (FXS__faIn(ext, FXS__FA_IMAGE)) return "Image";
  if (FXS__faIn(ext, FXS__FA_AUDIO)) return "Audio";
  if (ext === "prproj") return null; // referenced project — leave alone
  return "Other";
}

function FXS_arrangeProject() {
  try {
    var proj = app.project;
    if (!proj || !proj.rootItem) return FXS__err("No project");
    var root = proj.rootItem;

    // Reuse an existing top-level bin of the given name, else create one.
    var binCache = {};
    function getBin(name) {
      if (binCache[name]) return binCache[name];
      for (var i = 0; i < root.children.numItems; i++) {
        var ch = root.children[i];
        var chn = ""; try { chn = String(ch.name); } catch (e) { /* skip */ }
        if (chn === name && FXS__faIsBin(ch)) { binCache[name] = ch; return ch; }
      }
      var b = root.createBin(name);
      binCache[name] = b;
      return b;
    }

    // Snapshot first — moveBin mutates root.children mid-loop.
    var items = [];
    for (var i = 0; i < root.children.numItems; i++) items.push(root.children[i]);

    var moved = 0;
    for (var j = 0; j < items.length; j++) {
      var it = items[j];
      var cat = FXS__faClassify(it);
      if (!cat) continue;
      try {
        var bin = getBin(cat);
        if (bin && it.moveBin) { it.moveBin(bin); moved++; }
      } catch (eMove) { /* skip this item */ }
    }

    return moved ? FXS__ok(moved) : FXS__err("Nothing to arrange");
  } catch (e) {
    return FXS__err(e.toString());
  }
}
