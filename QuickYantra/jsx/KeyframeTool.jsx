/*
 * Quick Yantra — Keyframe Tools module (v1.2). Loaded by absolute path alongside
 * fxsearch.jsx (shared FXS__ok / FXS__err are already global).
 *
 * Premiere ExtendScript does not expose keyframe ease handles, spatial
 * tangents, or which keyframes are selected — so a real motion-curve tool is
 * not feasible. What is reliable:
 *   - FXS_kfClearAll(): remove every keyframe on the selected clips.
 */

function FXS__kfSelectedClips(seq) {
  var out = [];
  var groups = [seq.videoTracks, seq.audioTracks];
  for (var g = 0; g < groups.length; g++) {
    var tracks = groups[g];
    if (!tracks) continue;
    for (var t = 0; t < tracks.numTracks; t++) {
      var clips = tracks[t].clips;
      if (!clips) continue;
      for (var c = 0; c < clips.numItems; c++) {
        if (clips[c].isSelected && clips[c].isSelected()) out.push(clips[c]);
      }
    }
  }
  return out;
}

/* Run fn(prop) for every keyframe-bearing (time-varying) property on the
 * selected clips. Returns the number of properties touched. */
function FXS__kfEachAnimated(fn) {
  var seq = app.project.activeSequence;
  if (!seq) return -1;
  var clips = FXS__kfSelectedClips(seq);
  if (!clips.length) return -2;
  var n = 0;
  for (var i = 0; i < clips.length; i++) {
    var comps = clips[i].components;
    for (var ci = 0; ci < comps.numItems; ci++) {
      var props = null;
      try { props = comps[ci].properties; } catch (eP) { /* skip */ }
      if (!props) continue;
      for (var p = 0; p < props.numItems; p++) {
        var prop = props[p];
        var tv = false;
        try { tv = prop.isTimeVarying(); } catch (eT) { /* skip */ }
        if (tv) { try { if (fn(prop)) n++; } catch (eF) { /* skip */ } }
      }
    }
  }
  return n;
}

function FXS_kfClearAll() {
  try {
    var n = FXS__kfEachAnimated(function (prop) {
      prop.setTimeVarying(false); // drops every keyframe, keeps the current value
      return true;
    });
    if (n === -1) return FXS__err("No active sequence");
    if (n === -2) return FXS__err("No clips selected");
    return n ? FXS__ok(n) : FXS__err("No keyframes to clear");
  } catch (e) {
    return FXS__err(e.toString());
  }
}
