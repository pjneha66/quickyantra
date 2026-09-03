/*
 * Quick Yantra — Rename module (v1.2). Loaded by fxsearch.jsx via $.evalFile, so
 * the shared helpers (FXS__ok / FXS__err / FXS__selectedProjectItems) are
 * already defined in the global scope by the time these run.
 *
 * Two targets, different rules:
 *   - "timeline": every selected clip on the timeline gets the SAME name
 *     (the trackItem instance name, NOT the source). No numbering.
 *   - "source":  the unique source project items behind the selection are
 *     renamed; with more than one distinct source a zero-padded suffix
 *     ("-01", "-02"…) is appended in track/time order (true click order is
 *     not exposed by the API).
 */

function FXS__pad2(n) {
  return (n < 10 ? "0" : "") + n;
}

/* Setting a timeline clip's instance name is not uniform across Premiere
 * builds — try the known routes and verify it actually changed. */
function FXS__setClipName(clip, name) {
  try {
    if (typeof clip.setName === "function") { clip.setName(name); return true; }
  } catch (e1) { /* fall through */ }
  try {
    clip.name = name;
    if (String(clip.name) === String(name)) return true;
  } catch (e2) { /* fall through */ }
  return false;
}

function FXS__renameTimeline(name) {
  var seq = app.project.activeSequence;
  if (!seq) return FXS__err("No active sequence");
  var n = 0, problem = "";
  var groups = [seq.videoTracks, seq.audioTracks];
  for (var g = 0; g < groups.length; g++) {
    var tracks = groups[g];
    if (!tracks) continue;
    for (var t = 0; t < tracks.numTracks; t++) {
      var clips = tracks[t].clips;
      if (!clips) continue;
      for (var c = 0; c < clips.numItems; c++) {
        var clip = clips[c];
        if (clip.isSelected && clip.isSelected()) {
          if (FXS__setClipName(clip, name)) n++;
          else if (!problem) problem = "This Premiere version does not allow renaming timeline clips via script";
        }
      }
    }
  }
  if (n === 0) return FXS__err(problem || "No clips selected");
  return FXS__ok(n);
}

function FXS__renameSources(name) {
  var seq = app.project.activeSequence;
  if (!seq) return FXS__err("No active sequence");
  var items = FXS__selectedProjectItems(seq); // unique, track/time order
  if (!items.length) return FXS__err("No clip selected");

  if (items.length === 1) {
    items[0].name = name;
    return FXS__ok(1);
  }
  // Multiple distinct sources → numbered suffix in selection order
  for (var i = 0; i < items.length; i++) {
    items[i].name = name + "-" + FXS__pad2(i + 1);
  }
  return FXS__ok(items.length);
}

/* Items selected in the Project panel (across all project views), de-duped by
 * nodeId. Needs no active sequence. */
function FXS__projectPanelSelection() {
  var out = [], seen = {};
  try {
    if (typeof app.getProjectViewIDs !== "function") return out;
    var ids = app.getProjectViewIDs();
    for (var v = 0; v < ids.length; v++) {
      var sel = null;
      try { sel = app.getProjectViewSelection(ids[v]); } catch (e1) { /* skip view */ }
      if (!sel) continue;
      for (var i = 0; i < sel.length; i++) {
        var it = sel[i];
        if (!it) continue;
        var id = it.nodeId || ("p" + out.length);
        if (!seen[id]) { seen[id] = true; out.push(it); }
      }
    }
  } catch (e) { /* API unavailable */ }
  return out;
}

/* Project-panel rename: same numbering rule as Source (suffix only when more
 * than one item is selected). */
function FXS__renameProject(name) {
  var items = FXS__projectPanelSelection();
  if (!items.length) return FXS__err("No items selected in the Project panel");
  if (items.length === 1) {
    items[0].name = name;
    return FXS__ok(1);
  }
  for (var i = 0; i < items.length; i++) {
    items[i].name = name + "-" + FXS__pad2(i + 1);
  }
  return FXS__ok(items.length);
}

/** target: "timeline" | "source" | "project"; name: the new base name. */
function FXS_rename(target, name) {
  try {
    if (!name) return FXS__err("No new name given");
    if (target === "source") return FXS__renameSources(name);
    if (target === "project") return FXS__renameProject(name);
    return FXS__renameTimeline(name);
  } catch (e) {
    return FXS__err(e.toString());
  }
}
