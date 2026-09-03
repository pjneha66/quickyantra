/*
 * Quick Yantra — ExtendScript (QE DOM) bridge for the CEP panel.
 * Loaded via ScriptPath in CSXS/manifest.xml. ES3 only — no JSON object here,
 * so responses are serialized by hand.
 */

if (typeof app !== "undefined" && app.enableQE) {
  try { app.enableQE(); } catch (eInit) { /* ignore */ }
}

// The Rename module (cep/jsx/rename.jsx) is loaded separately with an explicit
// absolute path by the launcher and by the page's ensureJSX — $.fileName is
// unreliable here (empty when Premiere loads us via the manifest ScriptPath).

function FXS__escape(s) {
  s = String(s);
  var out = "";
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (c === "\\") out += "\\\\";
    else if (c === '"') out += '\\"';
    else if (c === "\n") out += "\\n";
    else if (c === "\r") out += "\\r";
    else if (c === "\t") out += "\\t";
    else out += c;
  }
  return out;
}

function FXS__strArray(arr) {
  var parts = [];
  if (arr) {
    for (var i = 0; i < arr.length; i++) {
      parts.push('"' + FXS__escape(arr[i]) + '"');
    }
  }
  return "[" + parts.join(",") + "]";
}

function FXS__err(msg) {
  return '{"ok":false,"error":"' + FXS__escape(msg) + '"}';
}

function FXS__ok(clips) {
  return '{"ok":true,"clips":' + clips + "}";
}

/** All effect + transition display names known to Premiere. */
function FXS_getEffects() {
  try {
    app.enableQE();
    var p = qe.project;
    return "{" +
      '"videoEffects":' + FXS__strArray(p.getVideoEffectList()) + "," +
      '"audioEffects":' + FXS__strArray(p.getAudioEffectList()) + "," +
      '"videoTransitions":' + FXS__strArray(p.getVideoTransitionList()) + "," +
      '"audioTransitions":' + FXS__strArray(p.getAudioTransitionList()) +
      "}";
  } catch (e) {
    return FXS__err(e.toString());
  }
}

function FXS__getByName(kind, name) {
  if (kind === "video-effect") return qe.project.getVideoEffectByName(name);
  if (kind === "audio-effect") return qe.project.getAudioEffectByName(name);
  if (kind === "video-transition") return qe.project.getVideoTransitionByName(name);
  if (kind === "audio-transition") return qe.project.getAudioTransitionByName(name);
  return null;
}

/* The QE DOM has no selection info, so selected clips are found in the
 * official DOM and matched to QE items by their start ticks. */
function FXS__findQEItem(qeTrack, startTicks) {
  for (var i = 0; i < qeTrack.numItems; i++) {
    var it = qeTrack.getItemAt(i);
    if (it && it.type !== "Empty" && it.start && String(it.start.ticks) === String(startTicks)) {
      return it;
    }
  }
  return null;
}

/**
 * Apply an effect/transition to all selected clips.
 * kind: video-effect | audio-effect | video-transition | audio-transition
 * mode: both | start | end  (transitions only)
 */
function FXS_apply(name, kind, mode) {
  try {
    app.enableQE();
    var seq = app.project.activeSequence;
    if (!seq) return FXS__err("No active sequence");
    var qeSeq = qe.project.getActiveSequence();
    if (!qeSeq) return FXS__err("No active sequence (QE)");

    var isAudio = kind === "audio-effect" || kind === "audio-transition";
    var isTransition = kind === "video-transition" || kind === "audio-transition";

    // Validate the name up-front so "not found" beats "no clips selected"
    if (!FXS__getByName(kind, name)) {
      return FXS__err('Not found in Premiere: "' + name + '"');
    }

    var domTracks = isAudio ? seq.audioTracks : seq.videoTracks;
    var clips = 0;
    var firstError = "";

    for (var t = 0; t < domTracks.numTracks; t++) {
      var domTrack = domTracks[t];
      var qeTrack = isAudio ? qeSeq.getAudioTrackAt(t) : qeSeq.getVideoTrackAt(t);
      if (!qeTrack) continue;

      for (var c = 0; c < domTrack.clips.numItems; c++) {
        var clip = domTrack.clips[c];
        if (!clip.isSelected()) continue;
        var qeItem = FXS__findQEItem(qeTrack, clip.start.ticks);
        if (!qeItem) continue;

        try {
          if (!isTransition) {
            // Fresh effect object per clip — QE effect objects are not
            // reliably reusable across multiple addEffect calls
            if (isAudio) qeItem.addAudioEffect(FXS__getByName(kind, name));
            else qeItem.addVideoEffect(FXS__getByName(kind, name));
            clips++;
          } else {
            var did = false;
            if (mode === "both" || mode === "start") {
              qeItem.addTransition(FXS__getByName(kind, name), true);
              did = true;
            }
            if (mode === "both" || mode === "end") {
              qeItem.addTransition(FXS__getByName(kind, name), false);
              did = true;
            }
            if (did) clips++;
          }
        } catch (e2) {
          if (!firstError) firstError = e2.toString();
        }
      }
    }

    if (clips === 0) return FXS__err(firstError || "No clips selected");
    return FXS__ok(clips);
  } catch (e) {
    return FXS__err(e.toString());
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * MENU COMMANDS (v1.2, Phase 1) — executed purely through the documented DOM
 * and QE DOM, so they need no keyboard shortcuts and no OS-level permissions.
 * Each command returns the same {ok,clips}/{ok,error} envelope as FXS_apply,
 * so the page hides instantly on success just like applying an effect.
 *
 * Only commands with a reliable scripting path live here. Items that depend
 * on UI state (Undo/Cut/Copy/Paste, View toggles, razor/Add-Edit, clip
 * enable…) are deferred to a later phase that synthesizes keystrokes from the
 * native shell — they are NOT scriptable safely and are intentionally absent.
 * ════════════════════════════════════════════════════════════════════════ */

function FXS__activeSeq() {
  return (typeof app !== "undefined" && app.project) ? app.project.activeSequence : null;
}

/* Selection helpers ─ select / deselect every clip on every track. */
function FXS__setAllSelected(seq, val) {
  var n = 0;
  var groups = [seq.videoTracks, seq.audioTracks];
  for (var g = 0; g < groups.length; g++) {
    var tracks = groups[g];
    if (!tracks) continue;
    for (var t = 0; t < tracks.numTracks; t++) {
      var clips = tracks[t].clips;
      if (!clips) continue;
      for (var c = 0; c < clips.numItems; c++) {
        try { clips[c].setSelected(val, true); n++; } catch (eSel) { /* skip */ }
      }
    }
  }
  return n;
}

/* Markers ─ the playhead position drives add / navigate / clear. */
function FXS__addMarker(seq) {
  var pos = seq.getPlayerPosition();
  seq.markers.createMarker(pos.seconds);
  return 1;
}

function FXS__gotoMarker(seq, forward) {
  var cur = seq.getPlayerPosition().seconds;
  var best = null;
  var m = seq.markers.getFirstMarker();
  while (m) {
    var s = m.start.seconds;
    if (forward) {
      if (s > cur + 0.0001 && (best === null || s < best.start.seconds)) best = m;
    } else {
      if (s < cur - 0.0001 && (best === null || s > best.start.seconds)) best = m;
    }
    m = seq.markers.getNextMarker(m);
  }
  if (!best) return 0;
  seq.setPlayerPosition(best.start.ticks);
  return 1;
}

function FXS__clearAllMarkers(seq) {
  var n = 0;
  var m = seq.markers.getFirstMarker();
  while (m) {
    var nx = seq.markers.getNextMarker(m); // capture before delete reindexes
    seq.markers.deleteMarker(m);
    n++;
    m = nx;
  }
  return n;
}

function FXS__clearMarkerAtPlayhead(seq) {
  var cur = seq.getPlayerPosition().seconds;
  var m = seq.markers.getFirstMarker();
  while (m) {
    var nx = seq.markers.getNextMarker(m);
    if (Math.abs(m.start.seconds - cur) < 0.02) {
      seq.markers.deleteMarker(m);
      return 1;
    }
    m = nx;
  }
  return 0;
}

/* Sequence ─ add one empty track via the QE DOM. Signature varies slightly
 * across Premiere builds (addTracks(numVid, vidIdx, numAud, audType, audIdx,
 * numSubmix)); wrapped so a mismatch surfaces as a clean error, never a crash. */
function FXS__addTrack(isVideo) {
  app.enableQE();
  var qeSeq = qe.project.getActiveSequence();
  if (!qeSeq) return 0;
  if (isVideo) qeSeq.addTracks(1, 0, 0, 0, 0, 0);
  else qeSeq.addTracks(0, 0, 1, 1, 0, 0); // 1 stereo audio track
  return 1;
}

/* Playhead / in-out helpers. */
function FXS__sequenceEndTicks(seq) {
  var maxT = 0, maxStr = "0";
  var groups = [seq.videoTracks, seq.audioTracks];
  for (var g = 0; g < groups.length; g++) {
    var tracks = groups[g];
    if (!tracks) continue;
    for (var t = 0; t < tracks.numTracks; t++) {
      var clips = tracks[t].clips;
      if (!clips) continue;
      for (var c = 0; c < clips.numItems; c++) {
        var e = clips[c].end; // Time
        if (e) {
          var v = Number(e.ticks);
          if (v > maxT) { maxT = v; maxStr = String(e.ticks); }
        }
      }
    }
  }
  return maxStr;
}

/* The project item backing the first selected clip (for Reveal in Explorer). */
function FXS__firstSelectedProjectItem(seq) {
  var groups = [seq.videoTracks, seq.audioTracks];
  for (var g = 0; g < groups.length; g++) {
    var tracks = groups[g];
    if (!tracks) continue;
    for (var t = 0; t < tracks.numTracks; t++) {
      var clips = tracks[t].clips;
      if (!clips) continue;
      for (var c = 0; c < clips.numItems; c++) {
        if (clips[c].isSelected && clips[c].isSelected()) return clips[c].projectItem;
      }
    }
  }
  return null;
}

/* Every selected clip's source project item, de-duplicated by nodeId (one
 * source can back several clips) — for Make Offline. */
function FXS__selectedProjectItems(seq) {
  var out = [], seen = {};
  var groups = [seq.videoTracks, seq.audioTracks];
  for (var g = 0; g < groups.length; g++) {
    var tracks = groups[g];
    if (!tracks) continue;
    for (var t = 0; t < tracks.numTracks; t++) {
      var clips = tracks[t].clips;
      if (!clips) continue;
      for (var c = 0; c < clips.numItems; c++) {
        var clip = clips[c];
        if (clip.isSelected && clip.isSelected() && clip.projectItem) {
          var id = clip.projectItem.nodeId || ("i" + out.length);
          if (!seen[id]) { seen[id] = true; out.push(clip.projectItem); }
        }
      }
    }
  }
  return out;
}

/**
 * Run a menu command by id. See src/lib/commands-db.ts for the catalog.
 */
function FXS_runCommand(commandId, arg, target) {
  try {
    // ── Project-level commands (no active sequence required) ──
    if (commandId === "file.saveProject") {
      app.project.save();
      return FXS__ok(1);
    }
    if (commandId === "project.newBin") {
      var root = app.project.rootItem;
      if (!root || !root.createBin) return FXS__err("Cannot create bin");
      root.createBin("Bin");
      return FXS__ok(1);
    }
    // Rename routes to the separate module. Project-panel rename needs no
    // sequence; the timeline/source paths self-check for an active sequence.
    if (commandId === "clip.rename") {
      if (typeof FXS_rename !== "function") return FXS__err("Rename module not loaded — reinstall");
      return FXS_rename(target || "timeline", arg);
    }
    // Anchor Tool (separate module): arg = position code, target = object|sequence.
    if (commandId === "anchor.set") {
      if (typeof FXS_setAnchor !== "function") return FXS__err("Anchor module not loaded — reinstall");
      return FXS_setAnchor(target || "object", arg);
    }
    // Keyframe tools (separate module).
    if (commandId === "kf.clearAll") {
      if (typeof FXS_kfClearAll !== "function") return FXS__err("Keyframe module not loaded — reinstall");
      return FXS_kfClearAll();
    }
    // Project folder arrangement (separate module, no sequence needed).
    if (commandId === "project.arrange") {
      if (typeof FXS_arrangeProject !== "function") return FXS__err("Arrange module not loaded — reinstall");
      return FXS_arrangeProject();
    }
    // Trim / Move / Remove-transition (separate module).
    if (commandId === "trim.in") {
      if (typeof FXS_trimIn !== "function") return FXS__err("Trim module not loaded — reinstall");
      return FXS_trimIn();
    }
    if (commandId === "trim.out") {
      if (typeof FXS_trimOut !== "function") return FXS__err("Trim module not loaded — reinstall");
      return FXS_trimOut();
    }
    if (commandId === "clip.moveStart") {
      if (typeof FXS_moveStart !== "function") return FXS__err("Trim module not loaded — reinstall");
      return FXS_moveStart();
    }
    if (commandId === "clip.moveEnd") {
      if (typeof FXS_moveEnd !== "function") return FXS__err("Trim module not loaded — reinstall");
      return FXS_moveEnd();
    }
    if (commandId === "clip.moveGroupStart") {
      if (typeof FXS_moveGroupStart !== "function") return FXS__err("Trim module not loaded — reinstall");
      return FXS_moveGroupStart();
    }
    if (commandId === "clip.moveGroupEnd") {
      if (typeof FXS_moveGroupEnd !== "function") return FXS__err("Trim module not loaded — reinstall");
      return FXS_moveGroupEnd();
    }
    if (commandId === "clip.removeTransition") {
      if (typeof FXS_removeTransition !== "function") return FXS__err("Trim module not loaded — reinstall");
      return FXS_removeTransition();
    }
    if (commandId === "clip.offset") {
      if (typeof FXS_offsetLayer !== "function") return FXS__err("Trim module not loaded — reinstall");
      return FXS_offsetLayer(arg, target || "move");
    }

    // ── Sequence-scoped commands ──
    var seq = FXS__activeSeq();
    if (!seq) return FXS__err("No active sequence");

    switch (commandId) {
      case "marker.add":
        return FXS__ok(FXS__addMarker(seq));
      case "marker.next":
        return FXS__gotoMarker(seq, true) ? FXS__ok(1) : FXS__err("No next marker");
      case "marker.prev":
        return FXS__gotoMarker(seq, false) ? FXS__ok(1) : FXS__err("No previous marker");
      case "marker.clearAtPlayhead":
        return FXS__clearMarkerAtPlayhead(seq) ? FXS__ok(1) : FXS__err("No marker at playhead");
      case "marker.clearAll":
        var cleared = FXS__clearAllMarkers(seq);
        return cleared ? FXS__ok(cleared) : FXS__err("No markers to clear");
      case "marker.markIn":
        seq.setInPoint(seq.getPlayerPosition().seconds);
        return FXS__ok(1);
      case "marker.markOut":
        seq.setOutPoint(seq.getPlayerPosition().seconds);
        return FXS__ok(1);
      case "edit.selectAll":
        var sel = FXS__setAllSelected(seq, true);
        return sel ? FXS__ok(sel) : FXS__err("No clips in sequence");
      case "edit.deselectAll":
        return FXS__ok(FXS__setAllSelected(seq, false));
      case "seq.addVideoTrack":
        return FXS__addTrack(true) ? FXS__ok(1) : FXS__err("Could not add track");
      case "seq.addAudioTrack":
        return FXS__addTrack(false) ? FXS__ok(1) : FXS__err("Could not add track");
      case "playback.goToStart":
        seq.setPlayerPosition("0");
        return FXS__ok(1);
      case "playback.goToEnd":
        seq.setPlayerPosition(FXS__sequenceEndTicks(seq));
        return FXS__ok(1);
      case "clip.revealInExplorer":
        var pi = FXS__firstSelectedProjectItem(seq);
        if (!pi || !pi.getMediaPath) return FXS__err("No clip selected");
        var mp = pi.getMediaPath();
        if (!mp) return FXS__err("Clip has no media file");
        var parent = new File(mp).parent;
        if (!parent || !parent.execute()) return FXS__err("Could not open folder");
        return FXS__ok(1);
      case "clip.makeOffline":
        var items = FXS__selectedProjectItems(seq);
        if (!items.length) return FXS__err("No clip selected");
        var nOff = 0;
        for (var oi = 0; oi < items.length; oi++) {
          try { if (items[oi].setOffline) { items[oi].setOffline(); nOff++; } } catch (eOff) { /* skip */ }
        }
        return nOff ? FXS__ok(nOff) : FXS__err("Could not make offline");
      case "clip.linkMedia":
        var lpi = FXS__firstSelectedProjectItem(seq);
        if (!lpi) return FXS__err("No clip selected");
        if (lpi.canChangeMediaPath && !lpi.canChangeMediaPath()) return FXS__err("Cannot relink this clip");
        var picked = File.openDialog("Select media file to link");
        if (!picked) return FXS__err("Link cancelled");
        lpi.changeMediaPath(picked.fsName);
        return FXS__ok(1);
      default:
        return FXS__err('Unknown command: "' + commandId + '"');
    }
  } catch (e) {
    return FXS__err(e.toString());
  }
}
