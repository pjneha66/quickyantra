/*
 * FX Search — Anchor Tool module (v1.2). Loaded by absolute path alongside
 * fxsearch.jsx (shared helpers FXS__ok / FXS__err are already global).
 *
 * Sets the Motion > Anchor Point of every selected video clip to one of the
 * nine grid positions, and COMPENSATES Position so the clip does not jump on
 * screen (same idea as the AE tool: new position = old position +
 * Scale·Rotation·(newAnchor − oldAnchor)).
 *
 * Two modes:
 *   - "object":   anchor placed relative to each clip's OWN source frame size.
 *   - "sequence": anchor placed relative to the current sequence frame size
 *     (same value for every selected clip).
 *
 * pos is a two-letter code: row (t/m/b) + column (l/c/r), e.g. "tl", "mc".
 */

function FXS__anchorFactors(pos) {
  var rowCh = pos.charAt(0), colCh = pos.charAt(1);
  var fy = rowCh === "t" ? 0 : (rowCh === "b" ? 1 : 0.5);
  var fx = colCh === "l" ? 0 : (colCh === "r" ? 1 : 0.5);
  return [fx, fy];
}

function FXS__sequenceFrameSize(seq) {
  try {
    var s = seq.getSettings();
    if (s && s.videoFrameWidth) return [Number(s.videoFrameWidth), Number(s.videoFrameHeight)];
  } catch (e1) { /* fall through */ }
  try {
    if (seq.frameSizeHorizontal) return [Number(seq.frameSizeHorizontal), Number(seq.frameSizeVertical)];
  } catch (e2) { /* fall through */ }
  return [1920, 1080];
}

/* Source pixel size of a clip, read from its media XMP (videoFrameSize /
 * stDim). Falls back to the sequence size when the metadata is unavailable. */
function FXS__xmpDim(xmp) {
  if (!xmp) return null;
  // videoFrameSize carries both dims in one tag (order can vary)
  var vfs = xmp.match(/videoFrameSize[^>]*?w="(\d+)"[^>]*?h="(\d+)"/);
  if (vfs) return [Number(vfs[1]), Number(vfs[2])];
  // Premiere private columns store the frame size as "W x H" in one field
  var wh = xmp.match(/(?:VideoInfo|GraphicSize|MediaResolution|FrameSize|ImageSize)[^>]*>\s*(\d+)\s*[xX×]\s*(\d+)/);
  if (wh) return [Number(wh[1]), Number(wh[2])];
  // Otherwise pair a width pattern with a height pattern (video + still images)
  var wPats = [/stDim:w="(\d+)"/, /tiff:ImageWidth>(\d+)/, /exif:PixelXDimension>(\d+)/,
               /MediaWidth>(\d+)/, /[: ]width="(\d+)"/, /FrameWidth>(\d+)/];
  var hPats = [/stDim:h="(\d+)"/, /tiff:ImageLength>(\d+)/, /exif:PixelYDimension>(\d+)/,
               /MediaHeight>(\d+)/, /[: ]height="(\d+)"/, /FrameHeight>(\d+)/];
  var w = null, h = null, i;
  for (i = 0; i < wPats.length && !w; i++) { var mw = xmp.match(wPats[i]); if (mw) w = Number(mw[1]); }
  for (i = 0; i < hPats.length && !h; i++) { var mh = xmp.match(hPats[i]); if (mh) h = Number(mh[1]); }
  if (w && h) return [w, h];
  // Last resort: any plausible "W x H" anywhere in the metadata (private
  // project metadata rarely contains another NxN with an x/× separator).
  var any = xmp.match(/(\d{2,5})\s*[xX×]\s*(\d{2,5})/);
  if (any) {
    var aw = Number(any[1]), ah = Number(any[2]);
    if (aw >= 16 && aw <= 20000 && ah >= 16 && ah <= 20000) return [aw, ah];
  }
  return null;
}

function FXS__clipSourceSize(clip, seqSize) {
  try {
    var pi = clip.projectItem;
    if (pi) {
      // The private project metadata reliably carries "VideoInfo = W x H".
      // Embedded XMP often has no dimensions, so parse it only as a fallback —
      // and crucially, check BOTH sources (a present-but-dimensionless XMP must
      // not shadow the project metadata, which was the image-drift bug).
      var d = null;
      try { if (pi.getProjectMetadata) d = FXS__xmpDim(String(pi.getProjectMetadata())); } catch (e1) { /* skip */ }
      if (!d) { try { if (pi.getXMPMetadata) d = FXS__xmpDim(String(pi.getXMPMetadata())); } catch (e2) { /* skip */ } }
      if (d) return d;
    }
  } catch (e) { /* fall through */ }
  return seqSize;
}

function FXS__selectedVideoClips(seq) {
  var out = [];
  var tracks = seq.videoTracks;
  if (!tracks) return out;
  for (var t = 0; t < tracks.numTracks; t++) {
    var clips = tracks[t].clips;
    if (!clips) continue;
    for (var c = 0; c < clips.numItems; c++) {
      if (clips[c].isSelected && clips[c].isSelected()) out.push(clips[c]);
    }
  }
  return out;
}

/* The Motion fixed effect = the component that carries an "Anchor Point"
 * property. (Matched by the English property name; a localized UI differs.) */
function FXS__motionComponent(clip) {
  var comps = clip.components;
  if (!comps) return null;
  for (var i = 0; i < comps.numItems; i++) {
    var props = null;
    try { props = comps[i].properties; } catch (eC) { continue; }
    if (!props) continue;
    for (var p = 0; p < props.numItems; p++) {
      var pdn = "";
      try { pdn = String(props[p].displayName); } catch (eP) { /* skip */ }
      if (pdn === "Anchor Point") return comps[i];
    }
  }
  return null;
}

function FXS__param(comp, name) {
  var props = comp.properties;
  for (var p = 0; p < props.numItems; p++) {
    var pdn = "";
    try { pdn = String(props[p].displayName); } catch (e) { /* skip */ }
    if (pdn === name) return props[p];
  }
  return null;
}

/* Per-clip shape size cache (component-normalized W/seqW, H/seqH). A shape's
 * size can only be derived from its anchor while that anchor is at the default
 * center; once we move it the relation is lost. So we measure once (first time
 * we see a clip — i.e. a fresh graphic, anchor centered) and remember it, which
 * makes repeated corner picks idempotent. Persists for the Premiere session. */
var FXS__sizeCache = {};

function FXS__shapeKey(clip) {
  try {
    var pi = clip.projectItem;
    var id = (pi && pi.nodeId) ? String(pi.nodeId) : "";
    var st = (clip.start && clip.start.ticks) ? String(clip.start.ticks) : "";
    if (id || st) return id + "@" + st;
  } catch (e) { /* no key */ }
  return null;
}

/* Shape size in component-normalized units. Cached; first encounter assumes the
 * anchor is at the shape's default center, so size = 2 * anchor. */
function FXS__shapeSize(clip, a0) {
  var key = FXS__shapeKey(clip);
  if (key && FXS__sizeCache[key]) return FXS__sizeCache[key];
  var size = [2 * a0[0], 2 * a0[1]];
  if (key) FXS__sizeCache[key] = size;
  return size;
}

/* The transform component to drive. A Motion Graphic clip carries several:
 *   Motion (clip) → Vector Motion (graphic group) → Shape/Text (each layer).
 * The user wants the INNER layer, so when an inner layer is present (any
 * Anchor-Point component that is not the clip Motion, the Vector-Motion graphic
 * group, or Opacity — covers Shape, Text, …) we use it; a regular video/image
 * clip only has Motion, so we use that. */
function FXS__transformComponent(clip) {
  var comps = clip.components;
  if (!comps) return null;
  var motion = null, inner = null;
  for (var i = 0; i < comps.numItems; i++) {
    if (!FXS__param(comps[i], "Anchor Point")) continue;
    var mn = "";
    try { mn = String(comps[i].matchName); } catch (eM) { /* skip */ }
    if (mn === "AE.ADBE Motion") { if (!motion) motion = comps[i]; continue; }
    if (mn === "AE.ADBE Graphic Group") continue; // Vector Motion (outer) — skip
    if (!inner) inner = comps[i];                  // Shape / Text / other inner layer
  }
  return inner || motion;
}

function FXS__point(prop) {
  try {
    var v = prop.getValue();
    if (v == null) return null;
    if (typeof v.length === "number" && v.length >= 2) return [Number(v[0]), Number(v[1])];
    if (typeof v.x !== "undefined") return [Number(v.x), Number(v.y)];
  } catch (e) { /* fall through */ }
  return null;
}

function FXS__num(prop, def) {
  try {
    var v = prop.getValue();
    if (v == null) return def;
    if (typeof v.length === "number" && v.length >= 1) return Number(v[0]);
    return Number(v);
  } catch (e) { return def; }
}

function FXS__set(prop, value) {
  // updateUI = true: reflects in the UI and gives the best chance of an undo step
  try { prop.setValue(value, true); return true; }
  catch (e1) { try { prop.setValue(value); return true; } catch (e2) { return false; } }
}

/* Place the anchor at a grid corner while keeping the clip visually fixed.
 * Position and Anchor are both normalized (0.5,0.5 = center).
 *   - mode "object":   anchor → the OBJECT's own corner [fx,fy]; Position is
 *     compensated:  P = P0 + R(θ)·diag(sW·ratioX, sH·ratioY)·([fx,fy] − A0).
 *   - mode "sequence": the pivot lands on the SEQUENCE frame corner, so
 *     Position = [fx,fy] and the anchor is back-solved to hold the object:
 *     A = A0 + (R(θ)·diag(sW·ratioX, sH·ratioY))^-1 · ([fx,fy] − P0).
 * ratio = source/sequence size ratio (1 when the clip matches the sequence). */
function FXS__applyAnchor(clip, fx, fy, mode, ratio) {
  var motion = FXS__transformComponent(clip);
  if (!motion) return false;
  var pAnchor = FXS__param(motion, "Anchor Point");
  if (!pAnchor) return false;
  var pPos = FXS__param(motion, "Position");

  // A graphic Shape/Text layer (anything but the clip Motion). Its Anchor and
  // Position are BOTH normalized to the sequence (anchor = shapeLocalPx/seq),
  // so the size ratio is 1; and an "object" corner is derived from the anchor.
  var isInner = false;
  try { isInner = (String(motion.matchName) !== "AE.ADBE Motion"); } catch (eMN) { /* keep false */ }

  var a0 = FXS__point(pAnchor);
  var p0 = pPos ? FXS__point(pPos) : null;

  // Without readable current values: a plain clip's object mode can still set
  // the anchor; everything else needs them, so it bails.
  if (!a0 || !p0 || !pPos) {
    if (mode === "sequence" || isInner) return false;
    return FXS__set(pAnchor, [fx, fy]);
  }

  // Vertical/uniform scale. When "Uniform Scale" is ON (the default), the
  // "Scale Width" param is stale (often stuck at 100) and must be ignored —
  // using it made the X axis over-compensate at any scale other than 100%.
  var pScale = FXS__param(motion, "Scale");
  var sH = pScale ? FXS__num(pScale, 100) / 100 : 1;
  var sW = sH;
  var uniform = true;
  var pUniform = FXS__param(motion, "Uniform Scale");
  if (pUniform) {
    var uv = null;
    try { uv = pUniform.getValue(); } catch (eU) { /* assume uniform */ }
    uniform = (uv === true || uv === 1 || (uv && typeof uv.length === "number" && uv[0]));
  }
  if (!uniform) {
    // Motion calls it "Scale Width"; a graphic Shape calls it "Horizontal Scale"
    var pScaleW = FXS__param(motion, "Scale Width") || FXS__param(motion, "Horizontal Scale");
    if (pScaleW) sW = FXS__num(pScaleW, 100) / 100;
  }

  var theta = 0;
  var pRot = FXS__param(motion, "Rotation");
  if (pRot) theta = FXS__num(pRot, 0) * Math.PI / 180;
  var cos = Math.cos(theta), sin = Math.sin(theta);

  // Inner layers: anchor & position share the sequence-normalized space → ratio 1.
  var rX = isInner ? 1 : ratio[0];
  var rY = isInner ? 1 : ratio[1];
  var denX = sW * rX, denY = sH * rY;

  // The "object" corner (absolute, so repeated picks are idempotent). A plain
  // clip's anchor is normalized to its own source → corner is just [fx,fy]. A
  // shape's anchor is shapeLocalPx/seq and the shape spans [0..size]; size is
  // measured once (cached) so corner = [fx*sizeX, fy*sizeY].
  var objX = fx, objY = fy;
  if (isInner) {
    var size = FXS__shapeSize(clip, a0);
    objX = fx * size[0];
    objY = fy * size[1];
  }

  var ok;
  if (mode === "sequence") {
    if (Math.abs(denX) < 1e-6 || Math.abs(denY) < 1e-6) return false;
    var dx = fx - p0[0], dy = fy - p0[1];     // sequence-normalized offset
    var rx = cos * dx + sin * dy;             // inverse rotation
    var ry = -sin * dx + cos * dy;
    var na = [a0[0] + rx / denX, a0[1] + ry / denY];
    ok = FXS__set(pAnchor, na);
    FXS__set(pPos, [fx, fy]);
  } else {
    var sdx = denX * (objX - a0[0]);          // scaled anchor delta
    var sdy = denY * (objY - a0[1]);
    var np = [p0[0] + (cos * sdx - sin * sdy), p0[1] + (sin * sdx + cos * sdy)];
    ok = FXS__set(pAnchor, [objX, objY]);
    FXS__set(pPos, np);
  }
  return ok;
}

/** mode: "object" | "sequence"; pos: "tl".."br". */
function FXS_setAnchor(mode, pos) {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return FXS__err("No active sequence");
    var clips = FXS__selectedVideoClips(seq);
    if (!clips.length) return FXS__err("No clips selected");

    var f = FXS__anchorFactors(pos);
    var seqSize = FXS__sequenceFrameSize(seq);
    var n = 0, problem = "";
    for (var i = 0; i < clips.length; i++) {
      // Real source/sequence size ratio (1 when the clip fills the frame);
      // both modes need it to convert screen units to anchor units.
      var sz = FXS__clipSourceSize(clips[i], seqSize);
      var ratio = [sz[0] / seqSize[0], sz[1] / seqSize[1]];
      if (FXS__applyAnchor(clips[i], f[0], f[1], mode, ratio)) n++;
      else if (!problem) problem = "Could not set anchor (no Motion/Anchor Point on clip)";
    }
    if (n === 0) return FXS__err(problem || "No clips selected");
    return FXS__ok(n);
  } catch (e) {
    return FXS__err(e.toString());
  }
}
