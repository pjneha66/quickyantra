/*
 * Quicky Antra — Trim / Move / Remove-Transition (v1.2). Loaded by absolute path
 * alongside quickyantra.jsx (shared FXS__ok / FXS__err already global).
 *
 * trackItem exposes writable start/end (timeline) + inPoint/outPoint (source),
 * all Time objects with .ticks. projectItem.getInPoint()/getOutPoint() give the
 * available source range (extend limit). Transitions live in the DOM
 * track.transitions collection.
 *
 *   - Trim In/Out to Playhead: move one edge to the playhead — shorten when the
 *     playhead is inside the clip, EXTEND when it is outside on that side,
 *     clamped by the source range and the neighbouring clip.
 *   - Move Start/End to Playhead: shift the whole clip (keep duration/source),
 *     clamped so it butts against a neighbour instead of overwriting it.
 *   - Remove Transition: drop track.transitions overlapping the selected clips.
 */

var FXS__BIG = 1e30; // stand-in for "no right neighbour"

function FXS__trimSelected(seq) {
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

function FXS__trackOf(seq, clip) {
  var mt = "Video"; try { mt = String(clip.mediaType); } catch (e1) { /* default */ }
  var idx = 0; try { idx = Number(clip.parentTrackIndex); } catch (e2) { /* default */ }
  return (mt === "Audio" ? seq.audioTracks : seq.videoTracks)[idx];
}

/* Closest neighbour edges on the clip's own track: [leftEnd, rightStart]. */
function FXS__neighbors(seq, clip, sT, eT) {
  var track = FXS__trackOf(seq, clip);
  var leftEnd = 0, rightStart = FXS__BIG;
  if (track && track.clips) {
    for (var c = 0; c < track.clips.numItems; c++) {
      var o = track.clips[c];
      var os = Number(o.start.ticks), oe = Number(o.end.ticks);
      if (os === sT && oe === eT) continue;         // the clip itself (unique on a track)
      if (oe <= sT && oe > leftEnd) leftEnd = oe;    // nearest clip to the left
      if (os >= eT && os < rightStart) rightStart = os; // nearest clip to the right
    }
  }
  return [leftEnd, rightStart];
}

/* Finite media (real video/audio) is limited by its source range; still images,
 * gifs, graphics and synthetic items (color matte, adjustment layer…) extend
 * freely. */
var FXS__FINITE = ["mp4", "mov", "avi", "mkv", "mxf", "m4v", "mpg", "mpeg", "wmv", "webm",
  "mts", "m2ts", "ts", "3gp", "flv", "r3d", "braw",
  "mp3", "wav", "aac", "m4a", "flac", "aif", "aiff", "ogg", "wma", "caf"];

function FXS__isFinite(mp) {
  if (!mp) return false; // synthetic → unlimited
  var s = String(mp), dot = s.lastIndexOf(".");
  if (dot < 0) return false;
  var ext = s.substring(dot + 1).toLowerCase();
  for (var i = 0; i < FXS__FINITE.length; i++) if (FXS__FINITE[i] === ext) return true;
  return false; // images / gif / graphics → unlimited
}

/* Available source range in ticks: [min inPoint, max outPoint]. Unlimited for
 * anything that is not real finite video/audio. */
function FXS__sourceRange(clip) {
  try {
    var pi = clip.projectItem;
    if (!pi) return [0, FXS__BIG];
    var mp = ""; try { mp = String(pi.getMediaPath()); } catch (e0) { mp = ""; }
    if (!FXS__isFinite(mp)) return [0, FXS__BIG];
    var lo = 0, hi = FXS__BIG;
    try { lo = Number(pi.getInPoint().ticks); } catch (e1) { lo = 0; }
    try { hi = Number(pi.getOutPoint().ticks); } catch (e2) { hi = FXS__BIG; }
    return [lo, hi];
  } catch (e) { return [0, FXS__BIG]; }
}

function FXS__setTicks(clip, field, ticksNum) {
  var v = clip[field];
  v.ticks = String(Math.round(ticksNum));
  clip[field] = v;
}

/* which: "in" | "out" */
function FXS__trim(seq, which) {
  var pT = Number(seq.getPlayerPosition().ticks);
  var clips = FXS__trimSelected(seq);
  if (!clips.length) return FXS__err("No clips selected");
  var n = 0, skipped = 0;
  for (var i = 0; i < clips.length; i++) {
    var clip = clips[i];
    var sT = Number(clip.start.ticks), eT = Number(clip.end.ticks);
    var inT = Number(clip.inPoint.ticks), outT = Number(clip.outPoint.ticks);
    var nb = FXS__neighbors(seq, clip, sT, eT);
    var src = FXS__sourceRange(clip);

    try {
      if (which === "in") {
        if (pT >= eT) { skipped++; continue; }          // playhead behind the clip → invalid
        // furthest-left the start may reach: source headroom + left neighbour
        var lower = Math.max(sT - (inT - src[0]), nb[0]);
        var newStart = Math.max(pT, lower);
        if (newStart === sT) { skipped++; continue; }
        var newIn = inT + (newStart - sT);
        FXS__setTicks(clip, "inPoint", newIn);
        FXS__setTicks(clip, "start", newStart);
        n++;
      } else {
        if (pT <= sT) { skipped++; continue; }           // playhead in front of the clip → invalid
        var upper = Math.min(eT + (src[1] - outT), nb[1]);
        var newEnd = Math.min(pT, upper);
        if (newEnd === eT) { skipped++; continue; }
        var newOut = outT - (eT - newEnd);
        FXS__setTicks(clip, "outPoint", newOut);
        FXS__setTicks(clip, "end", newEnd);
        n++;
      }
    } catch (e) { skipped++; }
  }
  if (n) return FXS__ok(n);
  return FXS__err(which === "in" ? "Can't trim in (playhead behind clip or no room)"
                                 : "Can't trim out (playhead in front of clip or no room)");
}

function FXS_trimIn() {
  var seq = app.project.activeSequence;
  if (!seq) return FXS__err("No active sequence");
  try { return FXS__trim(seq, "in"); } catch (e) { return FXS__err(e.toString()); }
}
function FXS_trimOut() {
  var seq = app.project.activeSequence;
  if (!seq) return FXS__err("No active sequence");
  try { return FXS__trim(seq, "out"); } catch (e) { return FXS__err(e.toString()); }
}

/* Selected-clip bookkeeping: members carry {clip,s,e,mt,idx}; selKeySet keys
 * each selected clip as "mt:idx:start_end" so the neighbour scan can skip them. */
function FXS__members(sel) {
  var out = [];
  for (var i = 0; i < sel.length; i++) {
    var c = sel[i];
    var mt = "Video"; try { mt = String(c.mediaType); } catch (e1) { /* default */ }
    var idx = 0; try { idx = Number(c.parentTrackIndex); } catch (e2) { /* default */ }
    out.push({ clip: c, s: Number(c.start.ticks), e: Number(c.end.ticks), mt: mt, idx: idx });
  }
  return out;
}
function FXS__selKeySet(members) {
  var set = {};
  for (var i = 0; i < members.length; i++) set[members[i].mt + ":" + members[i].idx + ":" + members[i].s + "_" + members[i].e] = true;
  return set;
}

/* True if shifting every member by delta would OVERLAP (not merely touch) a
 * non-selected clip on its track — i.e. a clip is trapped inside the move. */
function FXS__moveOverlaps(seq, members, selKeySet, delta) {
  for (var i = 0; i < members.length; i++) {
    var m = members[i];
    var track = (m.mt === "Audio" ? seq.audioTracks : seq.videoTracks)[m.idx];
    if (!track || !track.clips) continue;
    var ns = m.s + delta, ne = m.e + delta;
    for (var c = 0; c < track.clips.numItems; c++) {
      var o = track.clips[c];
      var os = Number(o.start.ticks), oe = Number(o.end.ticks);
      if (selKeySet[m.mt + ":" + m.idx + ":" + os + "_" + oe]) continue; // moves with us
      if (ns < oe && ne > os) return true;
    }
  }
  return false;
}

/* Move a set of members by ONE shared delta toward the playhead. Reference edge
 * (start = nearest start, end = farthest end) is the global span of `members`.
 * Clamped to butt against outer non-selected neighbours on every track touched;
 * refuses (returns "blocked") if a trapped clip would be overwritten or it can't
 * move at all. Returns the moved count otherwise. */
function FXS__moveMembers(seq, which, members, selKeySet) {
  var pT = Number(seq.getPlayerPosition().ticks);
  var gMin = FXS__BIG, gMax = 0;
  for (var i = 0; i < members.length; i++) { if (members[i].s < gMin) gMin = members[i].s; if (members[i].e > gMax) gMax = members[i].e; }
  var desired = (which === "start") ? (pT - gMin) : (pT - gMax);

  // Per-track span of the members, then the intersection of each track's room.
  var tracks = {};
  for (var i2 = 0; i2 < members.length; i2++) {
    var m = members[i2], key = m.mt + ":" + m.idx;
    if (!tracks[key]) tracks[key] = { mt: m.mt, idx: m.idx, sMin: FXS__BIG, sMax: 0 };
    if (m.s < tracks[key].sMin) tracks[key].sMin = m.s;
    if (m.e > tracks[key].sMax) tracks[key].sMax = m.e;
  }
  var deltaMin = -FXS__BIG, deltaMax = FXS__BIG;
  for (var tk in tracks) {
    var tr = tracks[tk];
    var track = (tr.mt === "Audio" ? seq.audioTracks : seq.videoTracks)[tr.idx];
    var leftEnd = 0, rightStart = FXS__BIG;
    if (track && track.clips) {
      for (var c = 0; c < track.clips.numItems; c++) {
        var o = track.clips[c];
        var os = Number(o.start.ticks), oe = Number(o.end.ticks);
        if (selKeySet[tr.mt + ":" + tr.idx + ":" + os + "_" + oe]) continue;
        if (oe <= tr.sMin && oe > leftEnd) leftEnd = oe;
        if (os >= tr.sMax && os < rightStart) rightStart = os;
      }
    }
    var dMin = leftEnd - tr.sMin, dMax = rightStart - tr.sMax;
    if (dMin > deltaMin) deltaMin = dMin;
    if (dMax < deltaMax) deltaMax = dMax;
  }

  var delta = desired;
  if (delta < deltaMin) delta = deltaMin;
  if (delta > deltaMax) delta = deltaMax;
  if (gMin + delta < 0) delta = -gMin;
  if (Math.abs(delta) < 1) return "blocked";
  if (FXS__moveOverlaps(seq, members, selKeySet, delta)) return "blocked"; // trapped clip in the middle

  var arr = members.slice();
  arr.sort(function (a, b) { return a.s - b.s; });
  if (delta > 0) arr.reverse();
  var n = 0;
  for (var k = 0; k < arr.length; k++) {
    var cl = arr[k].clip, ns = arr[k].s + delta, ne = arr[k].e + delta;
    try {
      if (delta > 0) { FXS__setTicks(cl, "end", ne); FXS__setTicks(cl, "start", ns); }
      else { FXS__setTicks(cl, "start", ns); FXS__setTicks(cl, "end", ne); }
      n++;
    } catch (e) { /* skip */ }
  }
  return n;
}

/* Per-track move: each track's selected clips form their own cluster. */
function FXS__move(seq, which) {
  var sel = FXS__trimSelected(seq);
  if (!sel.length) return FXS__err("No clips selected");
  var members = FXS__members(sel);
  var selKeySet = FXS__selKeySet(members);
  var byTrack = {};
  for (var i = 0; i < members.length; i++) {
    var k = members[i].mt + ":" + members[i].idx;
    if (!byTrack[k]) byTrack[k] = [];
    byTrack[k].push(members[i]);
  }
  var moved = 0, blocked = 0;
  for (var key in byTrack) {
    var r = FXS__moveMembers(seq, which, byTrack[key], selKeySet);
    if (r === "blocked") blocked++; else moved += r;
  }
  if (moved) return FXS__ok(moved);
  return blocked ? FXS__err("Blocked by another clip") : FXS__err("Could not move");
}

/* Group move: ALL selected clips move rigidly as one cross-track block. */
function FXS__moveGroup(seq, which) {
  var sel = FXS__trimSelected(seq);
  if (!sel.length) return FXS__err("No clips selected");
  var members = FXS__members(sel);
  var selKeySet = FXS__selKeySet(members);
  var r = FXS__moveMembers(seq, which, members, selKeySet);
  if (r === "blocked") return FXS__err("Blocked by another clip");
  return r ? FXS__ok(r) : FXS__err("Could not move");
}

function FXS_moveStart() {
  var seq = app.project.activeSequence;
  if (!seq) return FXS__err("No active sequence");
  try { return FXS__move(seq, "start"); } catch (e) { return FXS__err(e.toString()); }
}
function FXS_moveEnd() {
  var seq = app.project.activeSequence;
  if (!seq) return FXS__err("No active sequence");
  try { return FXS__move(seq, "end"); } catch (e) { return FXS__err(e.toString()); }
}
function FXS_moveGroupStart() {
  var seq = app.project.activeSequence;
  if (!seq) return FXS__err("No active sequence");
  try { return FXS__moveGroup(seq, "start"); } catch (e) { return FXS__err(e.toString()); }
}
function FXS_moveGroupEnd() {
  var seq = app.project.activeSequence;
  if (!seq) return FXS__err("No active sequence");
  try { return FXS__moveGroup(seq, "end"); } catch (e) { return FXS__err(e.toString()); }
}

/* ── Offset Layer ───────────────────────────────────────────────────────────
 * One clip per track; each track above is offset by N frames relative to the
 * one below (cumulative from the bottom). Playhead before the cluster → operate
 * on the IN edge, after → the OUT edge. Move shifts the whole clip to the
 * cascaded edge; Trim trims that edge. */

var FXS__TICKS = 254016000000;

function FXS__frameTicks(seq) {
  try {
    var s = seq.getSettings();
    if (s && s.videoFrameRate != null) {
      var vfr = s.videoFrameRate;
      if (typeof vfr === "object") { var tk = Number(vfr.ticks); if (tk > 0) return tk; }
      var fps = Number(vfr); if (fps > 0 && fps < 1000) return Math.round(FXS__TICKS / fps);
    }
  } catch (e1) { /* fall through */ }
  try { var tb = Number(seq.timebase); if (tb > 1e8) return tb; } catch (e2) { /* fall through */ }
  return Math.round(FXS__TICKS / 30);
}

/* Vertical position (bigger = higher on screen): video stacks up, audio below. */
function FXS__vpos(mt, idx) { return (mt === "Audio") ? (-1 - idx) : idx; }

/* Apply a one-frame-cascade edge to one clip (move shifts the whole clip; trim
 * trims the edge). targetEdge is the absolute start (in) or end (out) in ticks. */
function FXS__offsetClip(m, inMode, mode, targetEdge) {
  if (inMode) {
    if (mode === "trim") {
      FXS__setTicks(m.clip, "inPoint", Number(m.clip.inPoint.ticks) + (targetEdge - m.s));
      FXS__setTicks(m.clip, "start", targetEdge);
    } else {
      var d = targetEdge - m.s;
      if (d > 0) { FXS__setTicks(m.clip, "end", m.e + d); FXS__setTicks(m.clip, "start", m.s + d); }
      else { FXS__setTicks(m.clip, "start", m.s + d); FXS__setTicks(m.clip, "end", m.e + d); }
    }
  } else {
    if (mode === "trim") {
      FXS__setTicks(m.clip, "outPoint", Number(m.clip.outPoint.ticks) - (m.e - targetEdge));
      FXS__setTicks(m.clip, "end", targetEdge);
    } else {
      var d2 = targetEdge - m.e;
      if (d2 > 0) { FXS__setTicks(m.clip, "end", m.e + d2); FXS__setTicks(m.clip, "start", m.s + d2); }
      else { FXS__setTicks(m.clip, "start", m.s + d2); FXS__setTicks(m.clip, "end", m.e + d2); }
    }
  }
}

function FXS_offsetLayer(framesStr, mode) {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return FXS__err("No active sequence");
    var fs = String(framesStr).replace(/^\s+|\s+$/g, "");
    if (!/^[+-]?\d+$/.test(fs)) return FXS__err("Enter an integer number of frames (e.g. -2)");
    var frames = parseInt(fs, 10);

    var members = FXS__members(FXS__trimSelected(seq));
    if (!members.length) return FXS__err("No clips selected");
    var perTrack = {};
    for (var i = 0; i < members.length; i++) {
      var key = members[i].mt + ":" + members[i].idx;
      perTrack[key] = (perTrack[key] || 0) + 1;
    }
    for (var pk in perTrack) if (perTrack[pk] > 1) return FXS__err("Select only one clip per track");

    // Each VIDEO clip is one layer/rank (bottom→top). Linked audio is paired to
    // it by track order (lowest video ↔ highest audio) so a duplicated A/V layer
    // cascades together; two stacked video copies stay SEPARATE layers.
    var vids = [], auds = [];
    for (var s1 = 0; s1 < members.length; s1++) {
      if (members[s1].mt === "Audio") auds.push(members[s1]); else vids.push(members[s1]);
    }
    vids.sort(function (a, b) { return FXS__vpos(a.mt, a.idx) - FXS__vpos(b.mt, b.idx); }); // bottom→top
    auds.sort(function (a, b) { return FXS__vpos(b.mt, b.idx) - FXS__vpos(a.mt, a.idx); }); // top→bottom

    var units = [];
    if (vids.length) {
      for (var v1 = 0; v1 < vids.length; v1++) {
        var u = { clips: [vids[v1]], s: vids[v1].s, e: vids[v1].e };
        if (auds[v1]) { u.clips.push(auds[v1]); if (auds[v1].s < u.s) u.s = auds[v1].s; if (auds[v1].e > u.e) u.e = auds[v1].e; }
        units.push(u);
      }
    } else {
      auds.sort(function (a, b) { return FXS__vpos(a.mt, a.idx) - FXS__vpos(b.mt, b.idx); });
      for (var a1 = 0; a1 < auds.length; a1++) units.push({ clips: [auds[a1]], s: auds[a1].s, e: auds[a1].e });
    }
    if (units.length < 2) return FXS__err("Select clips on 2+ tracks");

    var anchor = units[0]; // bottom-most layer
    var ft = FXS__frameTicks(seq);

    var minStart = FXS__BIG, maxEnd = 0;
    for (var u2 = 0; u2 < units.length; u2++) { if (units[u2].s < minStart) minStart = units[u2].s; if (units[u2].e > maxEnd) maxEnd = units[u2].e; }
    var pT = Number(seq.getPlayerPosition().ticks);
    var inMode = (pT <= minStart) ? true : (pT >= maxEnd ? false : ((pT - minStart) <= (maxEnd - pT)));

    var n = 0;
    for (var r = 0; r < units.length; r++) {
      var unit = units[r];
      var off = r * frames * ft;
      var targetEdge = (inMode ? anchor.s : anchor.e) + off;
      for (var c = 0; c < unit.clips.length; c++) {
        try { FXS__offsetClip(unit.clips[c], inMode, mode, targetEdge); n++; } catch (e) { /* skip */ }
      }
    }
    return n ? FXS__ok(n) : FXS__err("Could not offset");
  } catch (e) {
    return FXS__err(e.toString());
  }
}

/* Remove transitions (DOM track.transitions) overlapping any selected clip. */
function FXS__removeTrans(tr) {
  try { tr.remove(false, true); return true; } catch (e1) { /* next */ }
  try { tr.remove(); return true; } catch (e2) { /* next */ }
  return false;
}

function FXS_removeTransition() {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return FXS__err("No active sequence");
    var sel = FXS__trimSelected(seq);
    if (!sel.length) return FXS__err("No clips selected");
    var ranges = [];
    for (var i = 0; i < sel.length; i++) ranges.push([Number(sel[i].start.ticks), Number(sel[i].end.ticks)]);
    function overlaps(s, e) {
      for (var r = 0; r < ranges.length; r++) if (s < ranges[r][1] && e > ranges[r][0]) return true;
      return false;
    }

    var n = 0;
    var groups = [seq.videoTracks, seq.audioTracks];
    for (var g = 0; g < groups.length; g++) {
      var tracks = groups[g];
      if (!tracks) continue;
      for (var t = 0; t < tracks.numTracks; t++) {
        var trans = null;
        try { trans = tracks[t].transitions; } catch (eT) { trans = null; }
        if (!trans || !trans.numItems) continue;
        for (var k = trans.numItems - 1; k >= 0; k--) {
          var tr = trans[k];
          var s = 0, e = 0;
          try { s = Number(tr.start.ticks); e = Number(tr.end.ticks); } catch (eR) { continue; }
          if (overlaps(s, e)) { if (FXS__removeTrans(tr)) n++; }
        }
      }
    }
    return n ? FXS__ok(n) : FXS__err("No transitions on the selected clips");
  } catch (e) {
    return FXS__err(e.toString());
  }
}
