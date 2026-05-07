/**
 * 2D Perlin noise (gradient noise). Returns value in roughly [-1, 1].
 * Input coordinates: use zoom to scale (higher zoom = finer detail).
 */
const PERM = (() => {
  const p = new Uint8Array(256);
  let n = 256;
  const seed = 12345;
  const rnd = () => { const x = Math.sin(seed + n++) * 10000; return x - Math.floor(x); };
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  return perm;
})();

function grad2(hash, dx, dy) {
  return ((hash & 1) ? -dx : dx) + ((hash & 2) ? -dy : dy);
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function perlin2(x, y) {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  const u = fade(x);
  const v = fade(y);
  const aa = PERM[PERM[X] + Y];
  const ab = PERM[PERM[X] + Y + 1];
  const ba = PERM[PERM[X + 1] + Y];
  const bb = PERM[PERM[X + 1] + Y + 1];
  return (
    (1 - u) * (1 - v) * grad2(aa, x, y) +
    u * (1 - v) * grad2(ba, x - 1, y) +
    (1 - u) * v * grad2(ab, x, y - 1) +
    u * v * grad2(bb, x - 1, y - 1)
  );
}

/** Deterministic value noise at (x, y) in [-1, 1] */
function valueNoise2(x, y) {
  const ix = Math.floor(x) & 255;
  const iy = Math.floor(y) & 255;
  const fx = x - Math.floor(x);
  const fy = y - Math.floor(y);
  const u = fade(fx);
  const v = fade(fy);
  const a = (PERM[ix] + iy) & 255;
  const b = (PERM[ix + 1] + iy) & 255;
  const c = (PERM[ix] + iy + 1) & 255;
  const d = (PERM[ix + 1] + iy + 1) & 255;
  const va = (PERM[a] / 127.5) - 1;
  const vb = (PERM[b] / 127.5) - 1;
  const vc = (PERM[c] / 127.5) - 1;
  const vd = (PERM[d] / 127.5) - 1;
  return (1 - u) * (1 - v) * va + u * (1 - v) * vb + (1 - u) * v * vc + u * v * vd;
}

/** Deterministic per-pixel noise at integer coordinates in [-1, 1]. */
function pixelNoise2(x, y) {
  const ix = Math.floor(x) & 255;
  const iy = Math.floor(y) & 255;
  const h = PERM[(PERM[ix] + iy) & 255];
  return (h / 127.5) - 1;
}

/** Parse hex color to [r, g, b] (0-255). */
function parseBgHex(hex) {
  const m = hex.replace(/^#/, '').match(/.{2}/g);
  if (!m) return [255, 255, 255];
  return m.map((c) => parseInt(c, 16));
}

/** True if pixel at (x,y) is content: not fully transparent and not equal to bg color. Out of bounds => false. */
function isContentPixel(data, x, y, width, height, bgRgb) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || ix >= width || iy < 0 || iy >= height) return false;
  const i = (iy * width + ix) * 4;
  const a = data[i + 3] !== undefined ? data[i + 3] : 255;
  if (a < 1) return false;
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  return r !== bgRgb[0] || g !== bgRgb[1] || b !== bgRgb[2];
}

/** Seeded random in [0, 1) for reproducible line placement. */
function seededRand(seed, base = 0) {
  const x = Math.sin((seed + base) * 7919) * 10000;
  return x - Math.floor(x);
}

/** Create a new particle at a random position (on content if maskOn). Used for respawn/drip. */
function spawnParticleOnContent(data, width, height, bgRgb, maskOn, rotationRad, seed, baseSeed = 0) {
  for (let t = 0; t < 200; t++) {
    const x = seededRand(seed + t * 11, baseSeed) * width;
    const y = seededRand(seed + t * 13 + 4096, baseSeed) * height; // offset so x,y not same (was causing diagonal spawn line)
    if (!maskOn || isContentPixel(data, x, y, width, height, bgRgb)) {
      return {
        x, y,
        angle: seededRand(seed + t * 17, baseSeed) * Math.PI * 2 + rotationRad,
        active: true,
        stepsWithoutContent: 0,
        path: [],
        steps: 0,
      };
    }
  }
  return {
    x: width / 2,
    y: height / 2,
    angle: seededRand(seed, baseSeed) * Math.PI * 2 + rotationRad,
    active: true,
    stepsWithoutContent: 0,
    path: [],
    steps: 0,
  };
}

/** Create a particle at (x, y) with given angle. Used for respawn: 2 at same spot, opposite directions. */
function spawnParticleAtPosition(x, y, angle) {
  return {
    x, y,
    angle,
    active: true,
    stepsWithoutContent: 0,
    path: [],
    steps: 0,
  };
}

/**
 * Line Y positions: regularity 100 = even spacing, 0 = random, in-between = jittered.
 */
function getLineYs(yMin, yMax, lineSpacing, regularity, seedBase = 0) {
  const r = regularity ?? 100;
  const n = Math.max(1, Math.ceil((yMax - yMin) / lineSpacing));
  if (r >= 100) {
    const out = [];
    for (let y = yMin; y < yMax; y += lineSpacing) out.push(y);
    return out;
  }
  if (r <= 0) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(yMin + (yMax - yMin) * seededRand(i, seedBase));
    out.sort((a, b) => a - b);
    return out;
  }
  const jitterScale = (1 - r / 100) * lineSpacing;
  const out = [];
  let i = 0;
  for (let y = yMin; y < yMax; y += lineSpacing) out.push(y + jitterScale * (2 * seededRand(i++, seedBase) - 1));
  out.sort((a, b) => a - b);
  return out;
}

/**
 * Luminance from ImageData at (x, y). Out of bounds => 255 (bright).
 */
function getLuminance(data, x, y, width, height) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || ix >= width || iy < 0 || iy >= height) return 255;
  const i = (iy * width + ix) * 4;
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const a = data[i + 3] !== undefined ? data[i + 3] : 255;
  if (a < 1) return 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Apply generative "lines" effect: draw horizontal lines with vertical noise
 * driven by color value (darker = more noise).
 * When linesPerspective is true, lines radiate from (centerX, centerY) in perspective.
 * @param {CanvasRenderingContext2D} ctx - context to draw on (will be modified)
 * @param {number} width - canvas width
 * @param {number} height - canvas height
 * @param {ImageData} imageData - current canvas image data (for luminance)
 * @param {Object} options - dislocate, noiseAmplitude, perlinAmplitude, perlinFrequency, sineAmplitude, sineFrequency; dpr, density, strokeStyle, backgroundColor; linesPerspective, centerX, centerY
 */
export function applyGenerativeLines(ctx, width, height, imageData, options = {}) {
  const dpr = options.dpr ?? 1;
  const density = options.density ?? 50;
  const dislocate = (options.dislocate ?? 0) * dpr;
  const noiseAmp = (options.noiseAmplitude ?? 0) * dpr;
  const noiseFreq = Math.max(0.1, options.noiseFrequency ?? 1); // 0.1-10, frequency multiplier
  const perlinAmp = (options.perlinAmplitude ?? 0) * dpr;
  const perlinFreq = Math.max(0.1, options.perlinFrequency ?? 4) / 100;
  const sineAmp = (options.sineAmplitude ?? 0) * dpr;
  const sineFreq = options.sineFrequency ?? 10; // cycles across width
  const lineSpacing = options.lineSpacing ?? (200 * dpr) / Math.max(1, density);
  const regularity = options.regularity ?? 100;
  const maskOn = options.maskOn ?? false;
  const maskCoveringLines = options.maskCoveringLines ?? 'off';
  const maskCoverPadding = Math.max(0, options.maskCoverPadding ?? 0) * dpr;
  const rotationDeg = options.rotation ?? 0;
  const linesPerspective = options.linesPerspective ?? false;
  const centerX = options.centerX ?? 0.5;
  const centerY = options.centerY ?? 0.5;
  const {
    strokeStyle = '#000000',
    backgroundColor = '#ffffff',
  } = options;

  const noiseOX = (options.seed ?? 0) * 13.7 + (options.time ?? 0) * 0.1;
  const noiseOY = (options.seed ?? 0) * 7.3;
  const seedBase = (options.seed ?? 0) * 99991 + Math.floor((options.time ?? 0) * 1000);

  const data = imageData.data;
  const bgRgb = parseBgHex(backgroundColor);

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = (options.lineWidth ?? 1) * dpr;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const angleRad = (rotationDeg * Math.PI) / 180;

  if (linesPerspective) {
    // Radial lines from (cx, cy)
    const cx = width * centerX;
    const cy = height * centerY;
    const maxR = Math.ceil(Math.max(
      Math.hypot(cx, cy),
      Math.hypot(width - cx, cy),
      Math.hypot(cx, height - cy),
      Math.hypot(width - cx, height - cy)
    )) + 2;
    const numLines = Math.max(8, Math.ceil((2 * Math.PI * maxR) / lineSpacing));
    const angleStep = (2 * Math.PI) / numLines;
    let angles = getLineYs(0, 2 * Math.PI - angleStep * 0.5, angleStep, regularity, seedBase);
    if (maskCoveringLines === 'bottom-up') angles = angles.slice().reverse();

    const useEnvelope = maskCoveringLines !== 'off';
    const topDown = maskCoveringLines === 'top-down';
    const envelopeLen = useEnvelope ? Math.ceil(width) + 1 : 0;
    const envelope = useEnvelope ? new Float32Array(envelopeLen) : null;
    if (envelope) {
      for (let i = 0; i < envelopeLen; i++) envelope[i] = topDown ? -Infinity : Infinity;
    }

    const step = 1;
    for (const baseAngle of angles) {
      const theta = baseAngle + angleRad;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const perpX = -sinT;
      const perpY = cosT;
      const rStart = topDown ? maxR : 0;
      const rEnd = topDown ? 0 : maxR;
      const rStep = topDown ? -step : step;

      ctx.beginPath();
      let started = false;

      for (let r = rStart; topDown ? r >= rEnd : r <= rEnd; r += rStep) {
        const lx = cx + r * cosT;
        const ly = cy + r * sinT;
        const contentOk = !maskOn || isContentPixel(data, lx, ly, width, height, bgRgb);
        if (!contentOk) {
          if (started) {
            ctx.stroke();
            ctx.beginPath();
            started = false;
          }
          continue;
        }

        const lum = getLuminance(data, lx, ly, width, height);
        const t = 1 - lum / 255;

        let disp = t * dislocate;
        if (noiseAmp > 0) disp += t * noiseAmp * pixelNoise2(r / noiseFreq + noiseOX, theta * noiseFreq + noiseOY);
        if (perlinAmp > 0) disp += t * perlinAmp * perlin2(r * perlinFreq * 0.02 + noiseOX, theta * perlinFreq * 2 + noiseOY);
        if (sineAmp > 0) disp += t * sineAmp * Math.sin(theta * sineFreq);

        const px = lx + disp * perpX;
        const py = ly + disp * perpY;

        if (useEnvelope) {
          const eIdx = Math.min(envelopeLen - 1, Math.max(0, Math.round(lx)));
          const notCovered = topDown
            ? ly > envelope[eIdx] + maskCoverPadding
            : ly < envelope[eIdx] - maskCoverPadding;
          if (!notCovered) {
            if (started) {
              ctx.stroke();
              ctx.beginPath();
              started = false;
            }
            continue;
          }
          envelope[eIdx] = topDown ? Math.max(envelope[eIdx], py) : Math.min(envelope[eIdx], py);
        }

        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      if (started) ctx.stroke();
    }
    return;
  }

  // Non-perspective: horizontal lines
  const step = 1;
  const rotated = rotationDeg !== 0 && (rotationDeg % 360) !== 0;
  const cx = width / 2;
  const cy = height / 2;
  const cosA = rotated ? Math.cos(angleRad) : 1;
  const sinA = rotated ? Math.sin(angleRad) : 0;
  const diag = rotated ? Math.ceil(Math.sqrt(width * width + height * height)) : 0;

  function localToScreen(lx, ly) {
    if (!rotated) return [lx, ly];
    const dx = lx - cx;
    const dy = ly - cy;
    return [cx + dx * cosA - dy * sinA, cy + dx * sinA + dy * cosA];
  }

  const xMin = rotated ? -diag : 0;
  const xMax = rotated ? width + diag : width;
  const yMin = rotated ? -diag : lineSpacing;
  const yMax = rotated ? height + diag : height;

  let lineYs = getLineYs(yMin, yMax, lineSpacing, regularity, seedBase);
  if (maskCoveringLines === 'bottom-up') lineYs = lineYs.slice().reverse();

  const useEnvelope = maskCoveringLines !== 'off';
  const topDown = maskCoveringLines === 'top-down';
  const envelopeLen = useEnvelope ? (rotated ? width + 2 * diag : width) : 0;
  const envelope = useEnvelope ? new Float32Array(envelopeLen) : null;
  const envelopeOffset = rotated ? diag : 0;
  if (envelope) {
    for (let i = 0; i < envelopeLen; i++) envelope[i] = topDown ? -Infinity : Infinity;
  }

  if (rotated) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angleRad);
    ctx.translate(-cx, -cy);
  }

  for (const lineY of lineYs) {
    ctx.beginPath();
    let started = false;

    for (let x = xMin; x <= xMax; x += step) {
      const [sx, sy] = localToScreen(x, lineY);
      const contentOk = !maskOn || isContentPixel(data, sx, sy, width, height, bgRgb);
      if (!contentOk) {
        if (started) {
          ctx.stroke();
          ctx.beginPath();
          started = false;
        }
        continue;
      }

      const lum = getLuminance(data, sx, sy, width, height);
      const t = 1 - lum / 255;

      let offsetY = t * dislocate;
      if (noiseAmp > 0) {
        offsetY += t * noiseAmp * pixelNoise2(x / noiseFreq + noiseOX, lineY / noiseFreq + noiseOY);
      }
      if (perlinAmp > 0) {
        const nx = x * perlinFreq * 0.02 + noiseOX;
        const ny = lineY * perlinFreq * 0.02 + noiseOY;
        offsetY += t * perlinAmp * perlin2(nx, ny);
      }
      if (sineAmp > 0) {
        const phase = (x / width) * sineFreq * Math.PI * 2;
        offsetY += t * sineAmp * Math.sin(phase);
      }

      const y = lineY + offsetY;

      if (useEnvelope) {
        const ix = Math.min(envelopeLen - 1, Math.max(0, Math.round(x) + envelopeOffset));
        const notCovered = topDown
          ? y > envelope[ix] + maskCoverPadding
          : y < envelope[ix] - maskCoverPadding;
        if (!notCovered) {
          if (started) {
            ctx.stroke();
            ctx.beginPath();
            started = false;
          }
          continue;
        }
        envelope[ix] = topDown ? Math.max(envelope[ix], y) : Math.min(envelope[ix], y);
      }

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }

    if (started) ctx.stroke();
  }

  if (rotated) ctx.restore();
}

/**
 * Apply generative "circles" effect: concentric circles with radial noise from luminance.
 * Same options as lines (density, regularity, noise/perlin/sine, mask, mask covering, rotation).
 */
export function applyGenerativeCircles(ctx, width, height, imageData, options = {}) {
  const dpr = options.dpr ?? 1;
  const density = options.density ?? 50;
  const dislocate = (options.dislocate ?? 0) * dpr;
  const noiseAmp = (options.noiseAmplitude ?? 0) * dpr;
  const noiseFreq = Math.max(0.1, options.noiseFrequency ?? 1);
  const perlinAmp = (options.perlinAmplitude ?? 0) * dpr;
  const perlinFreq = Math.max(0.1, options.perlinFrequency ?? 4) / 100;
  const sineAmp = (options.sineAmplitude ?? 0) * dpr;
  const sineFreq = options.sineFrequency ?? 10;
  const radiusSpacing = (200 * dpr) / Math.max(1, density);
  const regularity = options.regularity ?? 100;
  const maskOn = options.maskOn ?? false;
  const maskCoveringLines = options.maskCoveringLines ?? 'off';
  const maskCoverPadding = Math.max(0, options.maskCoverPadding ?? 0) * dpr;
  const rotationDeg = options.rotation ?? 0;
  const angleRad = (rotationDeg * Math.PI) / 180;
  const {
    strokeStyle = '#000000',
    backgroundColor = '#ffffff',
    centerX = 0.5,
    centerY = 0.5,
  } = options;

  const noiseOX = (options.seed ?? 0) * 13.7 + (options.time ?? 0) * 0.1;
  const noiseOY = (options.seed ?? 0) * 7.3;
  const seedBase = (options.seed ?? 0) * 99991 + Math.floor((options.time ?? 0) * 1000);

  const cx = width * centerX;
  const cy = height * centerY;
  const maxDist = Math.max(
    Math.hypot(cx, cy),
    Math.hypot(width - cx, cy),
    Math.hypot(cx, height - cy),
    Math.hypot(width - cx, height - cy)
  );
  const maxRadius = maxDist + radiusSpacing;
  const data = imageData.data;
  const bgRgb = parseBgHex(backgroundColor);

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = (options.lineWidth ?? 1) * dpr;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  let radii = getLineYs(radiusSpacing, maxRadius, radiusSpacing, regularity, seedBase);
  if (maskCoveringLines === 'bottom-up') radii = radii.slice().reverse();

  const useEnvelope = maskCoveringLines !== 'off';
  const topDown = maskCoveringLines === 'top-down'; // inner-to-outer
  const envelopeLen = 720;
  const envelope = useEnvelope ? new Float32Array(envelopeLen) : null;
  if (envelope) {
    for (let i = 0; i < envelopeLen; i++) envelope[i] = topDown ? -Infinity : Infinity;
  }

  for (const r of radii) {
    // Sample roughly every pixel along the circumference.
    const angleStep = (2 * Math.PI) / Math.max(40, 2 * Math.PI * r);
    ctx.beginPath();
    let started = false;

    for (let angle = 0; angle <= 2 * Math.PI; angle += angleStep) {
      const theta = angle + angleRad;
      const x = cx + r * Math.cos(theta);
      const y = cy + r * Math.sin(theta);
      const contentOk = !maskOn || isContentPixel(data, x, y, width, height, bgRgb);
      if (!contentOk) {
        if (started) {
          ctx.stroke();
          ctx.beginPath();
          started = false;
        }
        continue;
      }

      const lum = getLuminance(data, x, y, width, height);
      const t = 1 - lum / 255;

      let displacement = t * dislocate;
      if (noiseAmp > 0) displacement += t * noiseAmp * pixelNoise2(x + noiseOX, y + noiseOY);
      if (perlinAmp > 0) displacement += t * perlinAmp * perlin2(r * perlinFreq * 0.02 + noiseOX, theta * perlinFreq * 2 + noiseOY);
      if (sineAmp > 0) displacement += t * sineAmp * Math.sin(theta * sineFreq);

      const effectiveR = r + displacement;
      const px = cx + effectiveR * Math.cos(theta);
      const py = cy + effectiveR * Math.sin(theta);

      if (useEnvelope) {
        const angleIndex = Math.min(envelopeLen - 1, Math.max(0, Math.floor(((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * envelopeLen)));
        const notCovered = topDown
          ? effectiveR > envelope[angleIndex] + maskCoverPadding
          : effectiveR < envelope[angleIndex] - maskCoverPadding;
        if (!notCovered) {
          if (started) {
            ctx.stroke();
            ctx.beginPath();
            started = false;
          }
          continue;
        }
        envelope[angleIndex] = topDown ? Math.max(envelope[angleIndex], effectiveR) : Math.min(envelope[angleIndex], effectiveR);
      }

      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
    if (started) ctx.stroke();
  }
}

/**
 * Build SVG string for generative lines as vector paths (same logic as applyGenerativeLines).
 * @param {number} width
 * @param {number} height
 * @param {ImageData} imageData
 * @param {Object} options - same as applyGenerativeLines
 * @returns {string} full SVG document
 */
export function buildGenerativeLinesSvg(width, height, imageData, options = {}) {
  const dpr = options.dpr ?? 1;
  const density = options.density ?? 50;
  const dislocate = (options.dislocate ?? 0) * dpr;
  const noiseAmp = (options.noiseAmplitude ?? 0) * dpr;
  const noiseFreq = Math.max(0.1, options.noiseFrequency ?? 1);
  const perlinAmp = (options.perlinAmplitude ?? 0) * dpr;
  const perlinFreq = Math.max(0.1, options.perlinFrequency ?? 4) / 100;
  const sineAmp = (options.sineAmplitude ?? 0) * dpr;
  const sineFreq = options.sineFrequency ?? 10;
  const lineSpacing = options.lineSpacing ?? (200 * dpr) / Math.max(1, density);
  const regularity = options.regularity ?? 100;
  const maskOn = options.maskOn ?? false;
  const maskCoveringLines = options.maskCoveringLines ?? 'off';
  const maskCoverPadding = Math.max(0, options.maskCoverPadding ?? 0) * dpr;
  const rotationDeg = options.rotation ?? 0;
  const linesPerspective = options.linesPerspective ?? false;
  const centerX = options.centerX ?? 0.5;
  const centerY = options.centerY ?? 0.5;
  const strokeStyle = options.strokeStyle ?? '#000000';
  const backgroundColor = options.backgroundColor ?? '#ffffff';
  const renderBackground = options.renderBackground ?? true;

  const noiseOX = (options.seed ?? 0) * 13.7 + (options.time ?? 0) * 0.1;
  const noiseOY = (options.seed ?? 0) * 7.3;
  const seedBase = (options.seed ?? 0) * 99991 + Math.floor((options.time ?? 0) * 1000);

  const data = imageData.data;
  const bgRgb = parseBgHex(backgroundColor);

  const angleRad = (rotationDeg * Math.PI) / 180;

  if (linesPerspective) {
    const cx = width * centerX;
    const cy = height * centerY;
    const maxR = Math.ceil(Math.max(
      Math.hypot(cx, cy),
      Math.hypot(width - cx, cy),
      Math.hypot(cx, height - cy),
      Math.hypot(width - cx, height - cy)
    )) + 2;
    const numLines = Math.max(8, Math.ceil((2 * Math.PI * maxR) / lineSpacing));
    const angleStep = (2 * Math.PI) / numLines;
    let angles = getLineYs(0, 2 * Math.PI - angleStep * 0.5, angleStep, regularity, seedBase);
    if (maskCoveringLines === 'bottom-up') angles = angles.slice().reverse();

    const useEnvelope = maskCoveringLines !== 'off';
    const topDown = maskCoveringLines === 'top-down';
    const envelopeLen = 720;
    const envelope = useEnvelope ? new Float32Array(envelopeLen) : null;
    if (envelope) {
      for (let i = 0; i < envelopeLen; i++) envelope[i] = topDown ? -Infinity : Infinity;
    }

    const step = 1;
    const pathParts = [];

    for (const baseAngle of angles) {
      const theta = baseAngle + angleRad;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const perpX = -sinT;
      const perpY = cosT;
      const rStart = topDown ? maxR : 0;
      const rEnd = topDown ? 0 : maxR;
      const rStep = topDown ? -step : step;

      let started = false;
      let d = '';

      for (let r = rStart; topDown ? r >= rEnd : r <= rEnd; r += rStep) {
        const lx = cx + r * cosT;
        const ly = cy + r * sinT;
        const contentOk = !maskOn || isContentPixel(data, lx, ly, width, height, bgRgb);
        if (!contentOk) {
          started = false;
          continue;
        }

        const lum = getLuminance(data, lx, ly, width, height);
        const t = 1 - lum / 255;

        let disp = t * dislocate;
        if (noiseAmp > 0) disp += t * noiseAmp * pixelNoise2(r / noiseFreq + noiseOX, theta * noiseFreq + noiseOY);
        if (perlinAmp > 0) disp += t * perlinAmp * perlin2(r * perlinFreq * 0.02 + noiseOX, theta * perlinFreq * 2 + noiseOY);
        if (sineAmp > 0) disp += t * sineAmp * Math.sin(theta * sineFreq);

        const px = Math.round((lx + disp * perpX) * 100) / 100;
        const py = Math.round((ly + disp * perpY) * 100) / 100;

        if (useEnvelope) {
          const angleIdx = Math.min(envelopeLen - 1, Math.max(0, Math.floor(((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * envelopeLen)));
          const notCovered = topDown
            ? r > envelope[angleIdx] + maskCoverPadding
            : r < envelope[angleIdx] - maskCoverPadding;
          if (!notCovered) {
            started = false;
            continue;
          }
          envelope[angleIdx] = topDown ? Math.min(envelope[angleIdx], r) : Math.max(envelope[angleIdx], r);
        }

        if (!started) {
          d += (d ? ' ' : '') + `M ${px} ${py}`;
          started = true;
        } else {
          d += ` L ${px} ${py}`;
        }
      }

      if (d) pathParts.push(d);
    }

    const pathsSvg = pathParts.map((pathD) => `<path d="${pathD}" fill="none" stroke="${escapeXml(strokeStyle)}" stroke-width="${dpr}" stroke-linecap="round" stroke-linejoin="round"/>`).join('\n  ');
    const backgroundRect = renderBackground === true
      ? `<rect width="100%" height="100%" fill="${escapeXml(backgroundColor)}"/>\n  `
      : renderBackground === 'stroke'
        ? `<rect width="100%" height="100%" fill="none" stroke="${escapeXml('#' + Math.floor(Math.random() * 16777216).toString(16).padStart(6, '0'))}" stroke-width="1"/>\n  `
        : '';
    const inner = `${backgroundRect}<g>\n  ${pathsSvg}\n  </g>`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${inner}
</svg>`;
  }

  // Non-perspective: horizontal lines
  const step = 1;
  const rotated = rotationDeg !== 0 && (rotationDeg % 360) !== 0;
  const cx = width / 2;
  const cy = height / 2;
  const cosA = rotated ? Math.cos(angleRad) : 1;
  const sinA = rotated ? Math.sin(angleRad) : 0;
  const diag = rotated ? Math.ceil(Math.sqrt(width * width + height * height)) : 0;

  function localToScreen(lx, ly) {
    if (!rotated) return [lx, ly];
    const dx = lx - cx;
    const dy = ly - cy;
    return [cx + dx * cosA - dy * sinA, cy + dx * sinA + dy * cosA];
  }

  const xMin = rotated ? -diag : 0;
  const xMax = rotated ? width + diag : width;
  const yMin = rotated ? -diag : lineSpacing;
  const yMax = rotated ? height + diag : height;

  let lineYs = getLineYs(yMin, yMax, lineSpacing, regularity, seedBase);
  if (maskCoveringLines === 'bottom-up') lineYs = lineYs.slice().reverse();

  const useEnvelope = maskCoveringLines !== 'off';
  const topDown = maskCoveringLines === 'top-down';
  const envelopeLen = useEnvelope ? (rotated ? width + 2 * diag : width) : 0;
  const envelope = useEnvelope ? new Float32Array(envelopeLen) : null;
  const envelopeOffset = rotated ? diag : 0;
  if (envelope) {
    for (let i = 0; i < envelopeLen; i++) envelope[i] = topDown ? -Infinity : Infinity;
  }

  const pathParts = [];

  for (const lineY of lineYs) {
    let started = false;
    let d = '';

    for (let x = xMin; x <= xMax; x += step) {
      const [sx, sy] = localToScreen(x, lineY);
      const contentOk = !maskOn || isContentPixel(data, sx, sy, width, height, bgRgb);
      if (!contentOk) {
        started = false;
        continue;
      }

      const lum = getLuminance(data, sx, sy, width, height);
      const t = 1 - lum / 255;

      let offsetY = t * dislocate;
      if (noiseAmp > 0) {
        offsetY += t * noiseAmp * pixelNoise2(x / noiseFreq + noiseOX, lineY / noiseFreq + noiseOY);
      }
      if (perlinAmp > 0) {
        const nx = x * perlinFreq * 0.02 + noiseOX;
        const ny = lineY * perlinFreq * 0.02 + noiseOY;
        offsetY += t * perlinAmp * perlin2(nx, ny);
      }
      if (sineAmp > 0) {
        const phase = (x / width) * sineFreq * Math.PI * 2;
        offsetY += t * sineAmp * Math.sin(phase);
      }

      const y = lineY + offsetY;

      if (useEnvelope) {
        const ix = Math.min(envelopeLen - 1, Math.max(0, Math.round(x) + envelopeOffset));
        const notCovered = topDown
          ? y > envelope[ix] + maskCoverPadding
          : y < envelope[ix] - maskCoverPadding;
        if (!notCovered) {
          started = false;
          continue;
        }
        envelope[ix] = topDown ? Math.max(envelope[ix], y) : Math.min(envelope[ix], y);
      }

      const px = Math.round(x * 100) / 100;
      const py = Math.round(y * 100) / 100;
      if (!started) {
        d += (d ? ' ' : '') + `M ${px} ${py}`;
        started = true;
      } else {
        d += ` L ${px} ${py}`;
      }
    }

    if (d) pathParts.push(d);
  }

  const pathsSvg = pathParts.map((d) => `<path d="${d}" fill="none" stroke="${escapeXml(strokeStyle)}" stroke-width="${dpr}" stroke-linecap="round" stroke-linejoin="round"/>`).join('\n  ');

  const transformAttr = rotated ? ` transform="translate(${cx},${cy}) rotate(${rotationDeg}) translate(${-cx},${-cy})"` : '';
  const backgroundRect = renderBackground === true
    ? `<rect width="100%" height="100%" fill="${escapeXml(backgroundColor)}"/>\n  `
    : renderBackground === 'stroke'
      ? `<rect width="100%" height="100%" fill="none" stroke="${escapeXml('#' + Math.floor(Math.random() * 16777216).toString(16).padStart(6, '0'))}" stroke-width="1"/>\n  `
      : '';
  const inner = `${backgroundRect}<g${transformAttr}>\n  ${pathsSvg}\n  </g>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${inner}
</svg>`;
}

/**
 * Build SVG string for generative circles as vector paths.
 */
export function buildGenerativeCirclesSvg(width, height, imageData, options = {}) {
  const dpr = options.dpr ?? 1;
  const density = options.density ?? 50;
  const dislocate = (options.dislocate ?? 0) * dpr;
  const noiseAmp = (options.noiseAmplitude ?? 0) * dpr;
  const noiseFreq = Math.max(0.1, options.noiseFrequency ?? 1);
  const perlinAmp = (options.perlinAmplitude ?? 0) * dpr;
  const perlinFreq = Math.max(0.1, options.perlinFrequency ?? 4) / 100;
  const sineAmp = (options.sineAmplitude ?? 0) * dpr;
  const sineFreq = options.sineFrequency ?? 10;
  const radiusSpacing = (200 * dpr) / Math.max(1, density);
  const regularity = options.regularity ?? 100;
  const maskOn = options.maskOn ?? false;
  const maskCoveringLines = options.maskCoveringLines ?? 'off';
  const maskCoverPadding = Math.max(0, options.maskCoverPadding ?? 0) * dpr;
  const rotationDeg = options.rotation ?? 0;
  const angleRad = (rotationDeg * Math.PI) / 180;
  const strokeStyle = options.strokeStyle ?? '#000000';
  const backgroundColor = options.backgroundColor ?? '#ffffff';
  const renderBackground = options.renderBackground ?? true;
  const centerX = options.centerX ?? 0.5;
  const centerY = options.centerY ?? 0.5;

  const noiseOX = (options.seed ?? 0) * 13.7 + (options.time ?? 0) * 0.1;
  const noiseOY = (options.seed ?? 0) * 7.3;
  const seedBase = (options.seed ?? 0) * 99991 + Math.floor((options.time ?? 0) * 1000);

  const cx = width * centerX;
  const cy = height * centerY;
  const maxDist = Math.max(
    Math.hypot(cx, cy),
    Math.hypot(width - cx, cy),
    Math.hypot(cx, height - cy),
    Math.hypot(width - cx, height - cy)
  );
  const maxRadius = maxDist + radiusSpacing;
  const data = imageData.data;
  const bgRgb = parseBgHex(backgroundColor);

  let radii = getLineYs(radiusSpacing, maxRadius, radiusSpacing, regularity, seedBase);
  if (maskCoveringLines === 'bottom-up') radii = radii.slice().reverse();

  const useEnvelope = maskCoveringLines !== 'off';
  const topDown = maskCoveringLines === 'top-down';
  const envelopeLen = 720;
  const envelope = useEnvelope ? new Float32Array(envelopeLen) : null;
  if (envelope) {
    for (let i = 0; i < envelopeLen; i++) envelope[i] = topDown ? -Infinity : Infinity;
  }

  const pathParts = [];

  for (const r of radii) {
    // Keep SVG circle sampling aligned with canvas rendering.
    const angleStep = (2 * Math.PI) / Math.max(40, 2 * Math.PI * r);
    let started = false;
    let d = '';

    for (let angle = 0; angle <= 2 * Math.PI; angle += angleStep) {
      const theta = angle + angleRad;
      const x = cx + r * Math.cos(theta);
      const y = cy + r * Math.sin(theta);
      const contentOk = !maskOn || isContentPixel(data, x, y, width, height, bgRgb);
      if (!contentOk) {
        started = false;
        continue;
      }

      const lum = getLuminance(data, x, y, width, height);
      const t = 1 - lum / 255;
      let displacement = t * dislocate;
      if (noiseAmp > 0) displacement += t * noiseAmp * pixelNoise2(x + noiseOX, y + noiseOY);
      if (perlinAmp > 0) displacement += t * perlinAmp * perlin2(r * perlinFreq * 0.02 + noiseOX, theta * perlinFreq * 2 + noiseOY);
      if (sineAmp > 0) displacement += t * sineAmp * Math.sin(theta * sineFreq);
      const effectiveR = r + displacement;
      const px = Math.round((cx + effectiveR * Math.cos(theta)) * 100) / 100;
      const py = Math.round((cy + effectiveR * Math.sin(theta)) * 100) / 100;

      if (useEnvelope) {
        const angleIndex = Math.min(envelopeLen - 1, Math.max(0, Math.floor(((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * envelopeLen)));
        const notCovered = topDown
          ? effectiveR > envelope[angleIndex] + maskCoverPadding
          : effectiveR < envelope[angleIndex] - maskCoverPadding;
        if (!notCovered) {
          started = false;
          continue;
        }
        envelope[angleIndex] = topDown ? Math.max(envelope[angleIndex], effectiveR) : Math.min(envelope[angleIndex], effectiveR);
      }

      if (!started) {
        d += (d ? ' ' : '') + `M ${px} ${py}`;
        started = true;
      } else {
        d += ` L ${px} ${py}`;
      }
    }
    if (d) pathParts.push(d);
  }

  const pathsSvg = pathParts.map((d) => `<path d="${d}" fill="none" stroke="${escapeXml(strokeStyle)}" stroke-width="${dpr}" stroke-linecap="round" stroke-linejoin="round"/>`).join('\n  ');
  const backgroundRect = renderBackground === true
    ? `<rect width="100%" height="100%" fill="${escapeXml(backgroundColor)}"/>\n  `
    : renderBackground === 'stroke'
      ? `<rect width="100%" height="100%" fill="none" stroke="${escapeXml('#' + Math.floor(Math.random() * 16777216).toString(16).padStart(6, '0'))}" stroke-width="1"/>\n  `
      : '';
  const inner = `${backgroundRect}${pathsSvg}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${inner}
</svg>`;
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Apply generative "particles" effect: particles flow and leave traces with flocking behavior.
 * Each particle's direction is tilted based on the pixel luminance value.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {ImageData} imageData
 * @param {Object} options - particleTilt, particleGrain, particleRotation, particleSmoothness, particleWindX, particleWindY, particlePerlinAmp, particlePerlinFreq, density, maskOn, separation, cohesion, alignment, dpr, strokeStyle, backgroundColor
 */
export function applyGenerativeParticles(ctx, width, height, imageData, options = {}) {
  const dpr = options.dpr ?? 1;
  const density = options.density ?? 50;
  const particleTilt = options.particleTilt ?? 50; // 0-3000, how much pixel value tilts direction
  const particleGrain = options.particleGrain ?? 0; // 0-100, random noise added to direction
  const particleRotation = options.particleRotation ?? 0; // 0-360, rotation applied to initial angle
  const particleSmoothness = options.particleSmoothness ?? 100; // 0-100, how smooth angle transitions are
  const particleWindX = (options.particleWindX ?? 0) / 100; // -100 to 100, constant X force
  const particleWindY = (options.particleWindY ?? 0) / 100; // -100 to 100, constant Y force
  const particlePerlinAmp = options.particlePerlinAmp ?? 0; // 0-100, perlin noise amplitude
  const particlePerlinFreq = options.particlePerlinFreq ?? 4; // 1-100, perlin noise frequency
  const separation = options.separation ?? 0; // 0-100, avoidance of nearby particles
  const cohesion = options.cohesion ?? 0; // 0-100, attraction to nearby particles
  const alignment = options.alignment ?? 0; // 0-100, matching direction of nearby particles
  const avoidLines = options.avoidLines ?? 0; // 0-100, steer away from previously drawn path cells
  const maskOn = options.maskOn ?? true;
  const maxSteps = Math.max(1, Math.floor(options.simulationLength ?? 2000)); // total step count; simulation stops when this is reached
  const particleLifetime = options.particleLifetime ?? 0; // 0 = unlimited, else max steps per particle
  const spawnMode = options.spawnMode ?? 'once'; // 'once' | 'respawn' | 'drip'
  const spawnInterval = Math.max(1, options.spawnInterval ?? 50); // for drip: steps between spawns
  const maxParticles = options.maxParticles ?? 2000; // cap for drip mode

  const noiseOX = (options.seed ?? 0) * 13.7 + (options.time ?? 0) * 0.1;
  const noiseOY = (options.seed ?? 0) * 7.3;
  const seedBase = (options.seed ?? 0) * 99991 + Math.floor((options.time ?? 0) * 1000);
  
  // Line-avoidance grid (cells that have been drawn)
  const cellSize = Math.max(4, 6 * dpr);
  const gridW = Math.ceil(width / cellSize);
  const gridH = Math.ceil(height / cellSize);
  const lineGrid = avoidLines > 0 ? new Uint8Array(gridW * gridH) : null;
  const getLineOcc = lineGrid
    ? (gx, gy) => (gx >= 0 && gx < gridW && gy >= 0 && gy < gridH ? lineGrid[gy * gridW + gx] : 0)
    : () => 0;
  
  // Smoothness controls: interpolation and quantization
  const smoothFactor = particleSmoothness / 100; // 0-1
  const angleQuantization = particleSmoothness < 100 ? (Math.PI / 8) * (1 - smoothFactor) : 0; // quantize at low smoothness
  const {
    strokeStyle = '#000000',
    backgroundColor = '#ffffff',
  } = options;

  const data = imageData.data;
  const bgRgb = parseBgHex(backgroundColor);

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = (options.lineWidth ?? 1) * dpr * 0.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Number of particles based on density (initial batch)
  const initialCount = Math.floor((density / 50) * 500);
  const stepSize = 2 * dpr;
  const neighborRadius = 30 * dpr; // radius to check for neighbors

  // Initialize all particles with positions and angles
  const rotationRad = (particleRotation * Math.PI) / 180;
  const particles = [];
  for (let p = 0; p < initialCount; p++) {
    particles.push({
      x: seededRand(p * 1234, seedBase) * width,
      y: seededRand(p * 5678, seedBase) * height,
      angle: seededRand(p * 9012, seedBase) * Math.PI * 2 + rotationRad,
      active: true,
      stepsWithoutContent: 0,
      path: [],
      steps: 0,
    });
  }

  // Simulate all particles together for flocking behavior
  for (let step = 0; step < maxSteps; step++) {
    // Drip: spawn one new particle every spawnInterval steps (capped by maxParticles)
    if (spawnMode === 'drip' && step > 0 && step % spawnInterval === 0 && particles.length < maxParticles) {
      particles.push(spawnParticleOnContent(data, width, height, bgRgb, maskOn, rotationRad, step * 9999, seedBase));
    }

    const toSpawn = []; // for respawn: new particles to add at end of step
    let anyActive = false;

    for (let p = 0; p < particles.length; p++) {
      const particle = particles[p];
      if (!particle.active) continue;

      particle.steps += 1;
      // Death from lifetime
      if (particleLifetime > 0 && particle.steps >= particleLifetime) {
        particle.active = false;
        if (spawnMode === 'respawn') toSpawn.push({ x: particle.x, y: particle.y, angle: particle.angle });
        continue;
      }

      anyActive = true;
      const { x, y, angle } = particle;

      // Check if we're on a content pixel
      const contentOk = !maskOn || isContentPixel(data, x, y, width, height, bgRgb);
      
      if (!contentOk) {
        particle.stepsWithoutContent++;
        if (particle.stepsWithoutContent > 20) {
          particle.active = false;
          if (spawnMode === 'respawn') toSpawn.push({ x: particle.x, y: particle.y, angle: particle.angle });
          continue;
        }
        // Don't add to path but keep moving
      } else {
        particle.stepsWithoutContent = 0;
        // Record position for drawing with grain noise
        let pathX = x;
        let pathY = y;
        if (particleGrain > 0) {
          const grainNoiseX = (seededRand(p * 7777 + step * 3333, seedBase) - 0.5) * 2;
          const grainNoiseY = (seededRand(p * 8888 + step * 4444, seedBase) - 0.5) * 2;
          pathX += grainNoiseX * (particleGrain / 100) * dpr * 2;
          pathY += grainNoiseY * (particleGrain / 100) * dpr * 2;
        }
        particle.path.push({ x: pathX, y: pathY });
        if (avoidLines > 0 && lineGrid) {
          const gx = Math.floor(pathX / cellSize);
          const gy = Math.floor(pathY / cellSize);
          if (gx >= 0 && gx < gridW && gy >= 0 && gy < gridH) lineGrid[gy * gridW + gx] = 1;
        }
      }

      // Get luminance at current position for tilt
      const lum = getLuminance(data, x, y, width, height);
      const t = 1 - lum / 255; // 0 = bright, 1 = dark

      // Base tilt from luminance
      let angleChange = (particleTilt / 100) * Math.PI * 0.5 * t * 0.1;

      // Wind force
      if (particleWindX !== 0 || particleWindY !== 0) {
        const windAngle = Math.atan2(particleWindY, particleWindX);
        const windStrength = Math.hypot(particleWindX, particleWindY);
        angleChange += windStrength * 0.1 * (windAngle - angle) * 0.3;
      }

      // Perlin noise
      if (particlePerlinAmp > 0) {
        const perlinFreqScaled = particlePerlinFreq / 100;
        const nx = x * perlinFreqScaled * 0.02 + noiseOX;
        const ny = y * perlinFreqScaled * 0.02 + noiseOY;
        const perlinValue = perlin2(nx, ny);
        angleChange += (particlePerlinAmp / 100) * perlinValue * 0.5;
      }

      // Flocking behavior: find neighbors
      if (separation > 0 || cohesion > 0 || alignment > 0) {
        const neighbors = [];
        for (let i = 0; i < particles.length; i++) {
          if (i === p || !particles[i].active) continue;
          const other = particles[i];
          const dist = Math.hypot(other.x - x, other.y - y);
          if (dist < neighborRadius && dist > 0.001) {
            neighbors.push({ ...other, dist });
          }
        }

        if (neighbors.length > 0) {
          // Separation: steer away from nearby particles
          if (separation > 0) {
            let separationX = 0;
            let separationY = 0;
            for (const n of neighbors) {
              const dx = x - n.x;
              const dy = y - n.y;
              const dist = n.dist;
              separationX += dx / (dist * dist);
              separationY += dy / (dist * dist);
            }
            separationX /= neighbors.length;
            separationY /= neighbors.length;
            const separationAngle = Math.atan2(separationY, separationX);
            angleChange += (separation / 100) * 0.2 * (separationAngle - angle) * 0.3;
          }

          // Cohesion: steer toward average position of neighbors
          if (cohesion > 0) {
            let avgX = 0;
            let avgY = 0;
            for (const n of neighbors) {
              avgX += n.x;
              avgY += n.y;
            }
            avgX /= neighbors.length;
            avgY /= neighbors.length;
            const dx = avgX - x;
            const dy = avgY - y;
            const cohesionAngle = Math.atan2(dy, dx);
            angleChange += (cohesion / 100) * 0.2 * (cohesionAngle - angle) * 0.3;
          }

          // Alignment: match average direction of neighbors
          if (alignment > 0) {
            let avgAngle = 0;
            for (const n of neighbors) {
              avgAngle += n.angle;
            }
            avgAngle /= neighbors.length;
            let angleDiff = avgAngle - angle;
            // Normalize angle difference to [-π, π]
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
            angleChange += (alignment / 100) * 0.2 * angleDiff * 0.3;
          }
        }
      }

      // Avoid previously drawn lines: look ahead and steer toward the freer side
      if (avoidLines > 0 && lineGrid) {
        const lookAhead = 20;
        const spread = 0.5;
        const center = getLineOcc(Math.floor((x + Math.cos(angle) * lookAhead) / cellSize), Math.floor((y + Math.sin(angle) * lookAhead) / cellSize));
        const left = getLineOcc(Math.floor((x + Math.cos(angle - spread) * lookAhead) / cellSize), Math.floor((y + Math.sin(angle - spread) * lookAhead) / cellSize));
        const right = getLineOcc(Math.floor((x + Math.cos(angle + spread) * lookAhead) / cellSize), Math.floor((y + Math.sin(angle + spread) * lookAhead) / cellSize));
        const steer = (avoidLines / 100) * 0.4 * (left - right);
        angleChange += center > 0 ? steer : steer * 0.3;
      }

      // Update angle with smoothness
      if (smoothFactor < 1) {
        // Less smooth: apply change more abruptly
        const adjustedChange = angleChange * (1 + (1 - smoothFactor) * 2);
        particle.angle += adjustedChange;
        
        // Quantize angle to discrete steps at low smoothness
        if (angleQuantization > 0) {
          particle.angle = Math.round(particle.angle / angleQuantization) * angleQuantization;
        }
      } else {
        // Full smoothness: normal behavior
        particle.angle += angleChange;
      }

      // Move particle (store position before move for respawn-on-boundary)
      const prevX = particle.x;
      const prevY = particle.y;
      particle.x += Math.cos(particle.angle) * stepSize;
      particle.y += Math.sin(particle.angle) * stepSize;

      // Check bounds (respawn 2 at last in-bounds position)
      if (particle.x < 0 || particle.x >= width || particle.y < 0 || particle.y >= height) {
        particle.active = false;
        if (spawnMode === 'respawn') toSpawn.push({ x: prevX, y: prevY, angle: particle.angle });
      }
    }

    for (const { x, y, angle } of toSpawn) {
      if (particles.length + 2 > maxParticles) break; // cap so respawn doesn't grow without bound
      particles.push(spawnParticleAtPosition(x, y, angle));
      particles.push(spawnParticleAtPosition(x, y, angle + Math.PI));
    }
    // Always run full maxSteps so simulation length param has effect (no early exit)
  }

  // Draw all particle paths
  for (const particle of particles) {
    if (particle.path.length === 0) continue;
    ctx.beginPath();
    ctx.moveTo(particle.path[0].x, particle.path[0].y);
    for (let i = 1; i < particle.path.length; i++) {
      ctx.lineTo(particle.path[i].x, particle.path[i].y);
    }
    ctx.stroke();
  }
}

/**
 * Build SVG string for generative particles as vector paths.
 */
export function buildGenerativeParticlesSvg(width, height, imageData, options = {}) {
  const dpr = options.dpr ?? 1;
  const density = options.density ?? 50;
  const particleTilt = options.particleTilt ?? 50;
  const particleGrain = options.particleGrain ?? 0;
  const particleRotation = options.particleRotation ?? 0;
  const particleSmoothness = options.particleSmoothness ?? 100;
  const particleWindX = (options.particleWindX ?? 0) / 100;
  const particleWindY = (options.particleWindY ?? 0) / 100;
  const particlePerlinAmp = options.particlePerlinAmp ?? 0;
  const particlePerlinFreq = options.particlePerlinFreq ?? 4;
  const separation = options.separation ?? 0;
  const cohesion = options.cohesion ?? 0;
  const alignment = options.alignment ?? 0;
  const avoidLines = options.avoidLines ?? 0;
  const maskOn = options.maskOn ?? true;
  const maxStepsSvg = Math.max(1, Math.floor(options.simulationLength ?? 2000)); // total step count
  const particleLifetime = options.particleLifetime ?? 0;
  const spawnMode = options.spawnMode ?? 'once';
  const spawnInterval = Math.max(1, options.spawnInterval ?? 50);
  const maxParticles = options.maxParticles ?? 2000;
  const stepSize = 2 * dpr;
  const neighborRadius = 30 * dpr;

  const noiseOX = (options.seed ?? 0) * 13.7 + (options.time ?? 0) * 0.1;
  const noiseOY = (options.seed ?? 0) * 7.3;
  const seedBase = (options.seed ?? 0) * 99991 + Math.floor((options.time ?? 0) * 1000);

  const cellSize = Math.max(4, 6 * dpr);
  const gridW = Math.ceil(width / cellSize);
  const gridH = Math.ceil(height / cellSize);
  const lineGrid = avoidLines > 0 ? new Uint8Array(gridW * gridH) : null;
  const getLineOcc = lineGrid
    ? (gx, gy) => (gx >= 0 && gx < gridW && gy >= 0 && gy < gridH ? lineGrid[gy * gridW + gx] : 0)
    : () => 0;

  const smoothFactor = particleSmoothness / 100;
  const angleQuantization = particleSmoothness < 100 ? (Math.PI / 8) * (1 - smoothFactor) : 0;
  const strokeStyle = options.strokeStyle ?? '#000000';
  const backgroundColor = options.backgroundColor ?? '#ffffff';
  const renderBackground = options.renderBackground ?? true;

  const data = imageData.data;
  const bgRgb = parseBgHex(backgroundColor);

  const initialCount = Math.floor((density / 50) * 500);
  const rotationRad = (particleRotation * Math.PI) / 180;
  const particles = [];
  for (let p = 0; p < initialCount; p++) {
    particles.push({
      x: seededRand(p * 1234, seedBase) * width,
      y: seededRand(p * 5678, seedBase) * height,
      angle: seededRand(p * 9012, seedBase) * Math.PI * 2 + rotationRad,
      active: true,
      stepsWithoutContent: 0,
      path: [],
      steps: 0,
    });
  }

  // Simulate all particles
  for (let step = 0; step < maxStepsSvg; step++) {
    if (spawnMode === 'drip' && step > 0 && step % spawnInterval === 0 && particles.length < maxParticles) {
      particles.push(spawnParticleOnContent(data, width, height, bgRgb, maskOn, rotationRad, step * 9999, seedBase));
    }
    const toSpawn = [];
    let anyActive = false;

    for (let p = 0; p < particles.length; p++) {
      const particle = particles[p];
      if (!particle.active) continue;

      particle.steps += 1;
      if (particleLifetime > 0 && particle.steps >= particleLifetime) {
        particle.active = false;
        if (spawnMode === 'respawn') toSpawn.push({ x: particle.x, y: particle.y, angle: particle.angle });
        continue;
      }

      anyActive = true;
      const { x, y, angle } = particle;

      const contentOk = !maskOn || isContentPixel(data, x, y, width, height, bgRgb);
      
      if (!contentOk) {
        particle.stepsWithoutContent++;
        if (particle.stepsWithoutContent > 20) {
          particle.active = false;
          if (spawnMode === 'respawn') toSpawn.push({ x: particle.x, y: particle.y, angle: particle.angle });
          continue;
        }
      } else {
        particle.stepsWithoutContent = 0;
        // Record position for drawing with grain noise
        let pathX = x;
        let pathY = y;
        if (particleGrain > 0) {
          const grainNoiseX = (seededRand(p * 7777 + step * 3333, seedBase) - 0.5) * 2;
          const grainNoiseY = (seededRand(p * 8888 + step * 4444, seedBase) - 0.5) * 2;
          pathX += grainNoiseX * (particleGrain / 100) * dpr * 2;
          pathY += grainNoiseY * (particleGrain / 100) * dpr * 2;
        }
        particle.path.push({ x: pathX, y: pathY });
        if (avoidLines > 0 && lineGrid) {
          const gx = Math.floor(pathX / cellSize);
          const gy = Math.floor(pathY / cellSize);
          if (gx >= 0 && gx < gridW && gy >= 0 && gy < gridH) lineGrid[gy * gridW + gx] = 1;
        }
      }

      const lum = getLuminance(data, x, y, width, height);
      const t = 1 - lum / 255;
      let angleChange = (particleTilt / 100) * Math.PI * 0.5 * t * 0.1;

      // Wind force
      if (particleWindX !== 0 || particleWindY !== 0) {
        const windAngle = Math.atan2(particleWindY, particleWindX);
        const windStrength = Math.hypot(particleWindX, particleWindY);
        angleChange += windStrength * 0.1 * (windAngle - angle) * 0.3;
      }

      // Perlin noise
      if (particlePerlinAmp > 0) {
        const perlinFreqScaled = particlePerlinFreq / 100;
        const nx = x * perlinFreqScaled * 0.02 + noiseOX;
        const ny = y * perlinFreqScaled * 0.02 + noiseOY;
        const perlinValue = perlin2(nx, ny);
        angleChange += (particlePerlinAmp / 100) * perlinValue * 0.5;
      }

      // Flocking behavior
      if (separation > 0 || cohesion > 0 || alignment > 0) {
        const neighbors = [];
        for (let i = 0; i < particles.length; i++) {
          if (i === p || !particles[i].active) continue;
          const other = particles[i];
          const dist = Math.hypot(other.x - x, other.y - y);
          if (dist < neighborRadius && dist > 0.001) {
            neighbors.push({ ...other, dist });
          }
        }

        if (neighbors.length > 0) {
          if (separation > 0) {
            let separationX = 0;
            let separationY = 0;
            for (const n of neighbors) {
              const dx = x - n.x;
              const dy = y - n.y;
              separationX += dx / (n.dist * n.dist);
              separationY += dy / (n.dist * n.dist);
            }
            separationX /= neighbors.length;
            separationY /= neighbors.length;
            const separationAngle = Math.atan2(separationY, separationX);
            angleChange += (separation / 100) * 0.2 * (separationAngle - angle) * 0.3;
          }

          if (cohesion > 0) {
            let avgX = 0;
            let avgY = 0;
            for (const n of neighbors) {
              avgX += n.x;
              avgY += n.y;
            }
            avgX /= neighbors.length;
            avgY /= neighbors.length;
            const dx = avgX - x;
            const dy = avgY - y;
            const cohesionAngle = Math.atan2(dy, dx);
            angleChange += (cohesion / 100) * 0.2 * (cohesionAngle - angle) * 0.3;
          }

          if (alignment > 0) {
            let avgAngle = 0;
            for (const n of neighbors) {
              avgAngle += n.angle;
            }
            avgAngle /= neighbors.length;
            let angleDiff = avgAngle - angle;
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
            angleChange += (alignment / 100) * 0.2 * angleDiff * 0.3;
          }
        }
      }

      // Avoid previously drawn lines
      if (avoidLines > 0 && lineGrid) {
        const lookAhead = 20;
        const spread = 0.5;
        const center = getLineOcc(Math.floor((x + Math.cos(angle) * lookAhead) / cellSize), Math.floor((y + Math.sin(angle) * lookAhead) / cellSize));
        const left = getLineOcc(Math.floor((x + Math.cos(angle - spread) * lookAhead) / cellSize), Math.floor((y + Math.sin(angle - spread) * lookAhead) / cellSize));
        const right = getLineOcc(Math.floor((x + Math.cos(angle + spread) * lookAhead) / cellSize), Math.floor((y + Math.sin(angle + spread) * lookAhead) / cellSize));
        const steer = (avoidLines / 100) * 0.4 * (left - right);
        angleChange += center > 0 ? steer : steer * 0.3;
      }

      // Update angle with smoothness
      if (smoothFactor < 1) {
        const adjustedChange = angleChange * (1 + (1 - smoothFactor) * 2);
        particle.angle += adjustedChange;
        
        if (angleQuantization > 0) {
          particle.angle = Math.round(particle.angle / angleQuantization) * angleQuantization;
        }
      } else {
        particle.angle += angleChange;
      }
      
      const prevX = particle.x;
      const prevY = particle.y;
      particle.x += Math.cos(particle.angle) * stepSize;
      particle.y += Math.sin(particle.angle) * stepSize;

      if (particle.x < 0 || particle.x >= width || particle.y < 0 || particle.y >= height) {
        particle.active = false;
        if (spawnMode === 'respawn') toSpawn.push({ x: prevX, y: prevY, angle: particle.angle });
      }
    }

    for (const { x, y, angle } of toSpawn) {
      if (particles.length + 2 > maxParticles) break; // cap so respawn doesn't grow without bound
      particles.push(spawnParticleAtPosition(x, y, angle));
      particles.push(spawnParticleAtPosition(x, y, angle + Math.PI));
    }
    // Always run full maxSteps so simulation length param has effect (no early exit)
  }

  // Build SVG paths
  const pathParts = [];
  for (const particle of particles) {
    if (particle.path.length === 0) continue;
    let d = '';
    for (let i = 0; i < particle.path.length; i++) {
      const px = Math.round(particle.path[i].x * 100) / 100;
      const py = Math.round(particle.path[i].y * 100) / 100;
      if (i === 0) {
        d += `M ${px} ${py}`;
      } else {
        d += ` L ${px} ${py}`;
      }
    }
    if (d) pathParts.push(d);
  }

  const pathsSvg = pathParts.map((d) => `<path d="${d}" fill="none" stroke="${escapeXml(strokeStyle)}" stroke-width="${dpr * 0.5}" stroke-linecap="round" stroke-linejoin="round"/>`).join('\n  ');
  const backgroundRect = renderBackground === true
    ? `<rect width="100%" height="100%" fill="${escapeXml(backgroundColor)}"/>\n  `
    : renderBackground === 'stroke'
      ? `<rect width="100%" height="100%" fill="none" stroke="${escapeXml('#' + Math.floor(Math.random() * 16777216).toString(16).padStart(6, '0'))}" stroke-width="1"/>\n  `
      : '';
  const inner = `${backgroundRect}${pathsSvg}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${inner}
</svg>`;
}

/**
 * Apply generative "topomap" effect: contour lines based on luminance as elevation.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {ImageData} imageData
 * @param {Object} options - density, topomapSmoothness, dpr, strokeStyle, backgroundColor, maskOn
 */
export function applyGenerativeTopomap(ctx, width, height, imageData, options = {}) {
  const dpr = options.dpr ?? 1;
  const density = options.density ?? 50;
  const topomapSmoothness = options.topomapSmoothness ?? 50;
  const maskOn = options.maskOn ?? false;
  const {
    strokeStyle = '#000000',
    backgroundColor = '#ffffff',
  } = options;

  const data = imageData.data;
  const bgRgb = parseBgHex(backgroundColor);

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = (options.lineWidth ?? 1) * dpr;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Number of contour levels based on density
  const numLevels = Math.max(5, Math.floor(density / 5));
  
  // Create luminance grid
  let lumGrid = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3] !== undefined ? data[i + 3] : 255;
      
      if (maskOn && a < 1) {
        lumGrid[y * width + x] = -1; // mark as outside mask
      } else if (maskOn && isContentPixel(data, x, y, width, height, bgRgb)) {
        const lum = getLuminance(data, x, y, width, height);
        lumGrid[y * width + x] = lum;
      } else if (!maskOn) {
        const lum = getLuminance(data, x, y, width, height);
        lumGrid[y * width + x] = lum;
      } else {
        lumGrid[y * width + x] = -1;
      }
    }
  }

  // Apply smoothing based on smoothness parameter
  if (topomapSmoothness > 0) {
    lumGrid = smoothLuminanceGrid(lumGrid, width, height, topomapSmoothness);
  }

  // Draw contour lines at each level
  for (let level = 0; level < numLevels; level++) {
    const threshold = (level / numLevels) * 255;
    
    // Use marching squares to trace contours
    const contours = traceContours(lumGrid, width, height, threshold);
    
    // Draw each contour
    for (const contour of contours) {
      if (contour.length < 2) continue;
      
      ctx.beginPath();
      ctx.moveTo(contour[0].x, contour[0].y);
      for (let i = 1; i < contour.length; i++) {
        ctx.lineTo(contour[i].x, contour[i].y);
      }
      ctx.stroke();
    }
  }
}

/**
 * Smooth the luminance grid using a box blur.
 */
function smoothLuminanceGrid(grid, width, height, smoothness) {
  const smoothed = new Float32Array(width * height);
  const radius = Math.max(1, Math.floor((smoothness / 100) * 5)); // 0-5 pixel radius
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      
      // Skip masked pixels
      if (grid[idx] < 0) {
        smoothed[idx] = -1;
        continue;
      }
      
      // Average surrounding pixels
      let sum = 0;
      let count = 0;
      
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nidx = ny * width + nx;
            if (grid[nidx] >= 0) {
              sum += grid[nidx];
              count++;
            }
          }
        }
      }
      
      smoothed[idx] = count > 0 ? sum / count : grid[idx];
    }
  }
  
  return smoothed;
}

/**
 * Trace contours at a specific threshold using marching squares algorithm.
 */
function traceContours(grid, width, height, threshold) {
  const contours = [];
  const visited = new Uint8Array(width * height);
  
  // Simplified contour tracing - find edges where value crosses threshold
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const idx = y * width + x;
      if (visited[idx]) continue;
      
      const v00 = grid[y * width + x];
      const v10 = grid[y * width + (x + 1)];
      const v01 = grid[(y + 1) * width + x];
      const v11 = grid[(y + 1) * width + (x + 1)];
      
      // Skip if any value is masked out
      if (v00 < 0 || v10 < 0 || v01 < 0 || v11 < 0) continue;
      
      // Check if threshold crosses through this cell
      const above00 = v00 > threshold;
      const above10 = v10 > threshold;
      const above01 = v01 > threshold;
      const above11 = v11 > threshold;
      
      const crossings = [above00, above10, above01, above11].filter(Boolean).length;
      
      // If there's a crossing, create a contour segment
      if (crossings > 0 && crossings < 4) {
        const contour = [];
        
        // Horizontal edges
        if (above00 !== above10) {
          const t = (threshold - v00) / (v10 - v00);
          contour.push({ x: x + t, y: y });
        }
        if (above01 !== above11) {
          const t = (threshold - v01) / (v11 - v01);
          contour.push({ x: x + t, y: y + 1 });
        }
        
        // Vertical edges
        if (above00 !== above01) {
          const t = (threshold - v00) / (v01 - v00);
          contour.push({ x: x, y: y + t });
        }
        if (above10 !== above11) {
          const t = (threshold - v10) / (v11 - v10);
          contour.push({ x: x + 1, y: y + t });
        }
        
        if (contour.length >= 2) {
          contours.push(contour);
        }
        visited[idx] = 1;
      }
    }
  }
  
  return contours;
}

/**
 * Build SVG string for generative topomap as vector paths.
 */
export function buildGenerativeTopomapSvg(width, height, imageData, options = {}) {
  const dpr = options.dpr ?? 1;
  const density = options.density ?? 50;
  const topomapSmoothness = options.topomapSmoothness ?? 50;
  const maskOn = options.maskOn ?? false;
  const strokeStyle = options.strokeStyle ?? '#000000';
  const backgroundColor = options.backgroundColor ?? '#ffffff';
  const renderBackground = options.renderBackground ?? true;

  const data = imageData.data;
  const bgRgb = parseBgHex(backgroundColor);

  const numLevels = Math.max(5, Math.floor(density / 5));
  
  // Create luminance grid
  let lumGrid = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3] !== undefined ? data[i + 3] : 255;
      
      if (maskOn && a < 1) {
        lumGrid[y * width + x] = -1;
      } else if (maskOn && isContentPixel(data, x, y, width, height, bgRgb)) {
        const lum = getLuminance(data, x, y, width, height);
        lumGrid[y * width + x] = lum;
      } else if (!maskOn) {
        const lum = getLuminance(data, x, y, width, height);
        lumGrid[y * width + x] = lum;
      } else {
        lumGrid[y * width + x] = -1;
      }
    }
  }

  // Apply smoothing
  if (topomapSmoothness > 0) {
    lumGrid = smoothLuminanceGrid(lumGrid, width, height, topomapSmoothness);
  }

  const pathParts = [];

  // Draw contour lines at each level
  for (let level = 0; level < numLevels; level++) {
    const threshold = (level / numLevels) * 255;
    const contours = traceContours(lumGrid, width, height, threshold);
    
    for (const contour of contours) {
      if (contour.length < 2) continue;
      
      let d = '';
      for (let i = 0; i < contour.length; i++) {
        const px = Math.round(contour[i].x * 100) / 100;
        const py = Math.round(contour[i].y * 100) / 100;
        if (i === 0) {
          d += `M ${px} ${py}`;
        } else {
          d += ` L ${px} ${py}`;
        }
      }
      if (d) pathParts.push(d);
    }
  }

  const pathsSvg = pathParts.map((d) => `<path d="${d}" fill="none" stroke="${escapeXml(strokeStyle)}" stroke-width="${dpr}" stroke-linecap="round" stroke-linejoin="round"/>`).join('\n  ');
  const backgroundRect = renderBackground === true
    ? `<rect width="100%" height="100%" fill="${escapeXml(backgroundColor)}"/>\n  `
    : renderBackground === 'stroke'
      ? `<rect width="100%" height="100%" fill="none" stroke="${escapeXml('#' + Math.floor(Math.random() * 16777216).toString(16).padStart(6, '0'))}" stroke-width="1"/>\n  `
      : '';
  const inner = `${backgroundRect}${pathsSvg}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${inner}
</svg>`;
}

/**
 * Apply generative "spiral" effect: spirals emanating from a center point with radial denting.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {ImageData} imageData
 * @param {Object} options - spiralDent, spiralTurns, density, maskOn, maskCoveringLines, maskCoverPadding, dpr, strokeStyle, backgroundColor, centerX, centerY
 */
export function applyGenerativeSpiral(ctx, width, height, imageData, options = {}) {
  const dpr = options.dpr ?? 1;
  const density = options.density ?? 50;
  const spiralDent = options.spiralDent ?? 50; // 0-100, how much spirals dent inward based on luminance
  const spiralTurns = options.spiralTurns ?? 5; // number of turns per spiral
  const maskOn = options.maskOn ?? false;
  const maskCoveringLines = options.maskCoveringLines ?? 'off';
  const maskCoverPadding = Math.max(0, options.maskCoverPadding ?? 0) * dpr;
  const rotationDeg = options.rotation ?? 0;
  const {
    strokeStyle = '#000000',
    backgroundColor = '#ffffff',
    centerX = 0.5,
    centerY = 0.5,
  } = options;

  const cx = width * centerX;
  const cy = height * centerY;
  const maxDist = Math.max(
    Math.hypot(cx, cy),
    Math.hypot(width - cx, cy),
    Math.hypot(cx, height - cy),
    Math.hypot(width - cx, height - cy)
  );
  const data = imageData.data;
  const bgRgb = parseBgHex(backgroundColor);

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = (options.lineWidth ?? 1) * dpr;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Number of spirals based on density
  const numSpirals = Math.max(3, Math.floor(density / 10));
  const spiralSpacing = (2 * Math.PI) / numSpirals;
  
  let spiralAngles = [];
  for (let i = 0; i < numSpirals; i++) {
    spiralAngles.push(i * spiralSpacing);
  }
  if (maskCoveringLines === 'bottom-up') spiralAngles = spiralAngles.slice().reverse();

  const useEnvelope = maskCoveringLines !== 'off';
  const topDown = maskCoveringLines === 'top-down'; // inner spirals cover outer
  const envelopeLen = 720; // angular resolution
  const envelope = useEnvelope ? new Float32Array(envelopeLen) : null;
  if (envelope) {
    for (let i = 0; i < envelopeLen; i++) envelope[i] = topDown ? -Infinity : Infinity;
  }

  const angleRad = (rotationDeg * Math.PI) / 180;

  for (const startAngle of spiralAngles) {
    ctx.beginPath();
    let started = false;
    
    // Draw spiral from center outward
    const maxRadius = maxDist;
    const radiusStep = 2 * dpr; // step size in pixels
    const angleStep = (spiralTurns * 2 * Math.PI) / (maxRadius / radiusStep); // radians per step
    
    for (let r = 0; r <= maxRadius; r += radiusStep) {
      const spiralAngle = startAngle + (r / maxRadius) * spiralTurns * 2 * Math.PI;
      const theta = spiralAngle + angleRad;
      
      // Base position on spiral
      const baseX = cx + r * Math.cos(theta);
      const baseY = cy + r * Math.sin(theta);
      
      const contentOk = !maskOn || isContentPixel(data, baseX, baseY, width, height, bgRgb);
      if (!contentOk) {
        if (started) {
          ctx.stroke();
          ctx.beginPath();
          started = false;
        }
        continue;
      }

      const lum = getLuminance(data, baseX, baseY, width, height);
      const t = 1 - lum / 255; // 0 = bright, 1 = dark

      // Calculate dent: pull point toward center based on luminance
      const dentAmount = (spiralDent / 100) * t * r * 0.3; // dent is proportional to radius
      const effectiveR = Math.max(0, r - dentAmount);
      
      const px = cx + effectiveR * Math.cos(theta);
      const py = cy + effectiveR * Math.sin(theta);

      if (useEnvelope) {
        const angleIndex = Math.min(envelopeLen - 1, Math.max(0, Math.floor(((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * envelopeLen)));
        const notCovered = topDown
          ? effectiveR > envelope[angleIndex] + maskCoverPadding
          : effectiveR < envelope[angleIndex] - maskCoverPadding;
        if (!notCovered) {
          if (started) {
            ctx.stroke();
            ctx.beginPath();
            started = false;
          }
          continue;
        }
        envelope[angleIndex] = topDown ? Math.max(envelope[angleIndex], effectiveR) : Math.min(envelope[angleIndex], effectiveR);
      }

      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
    
    if (started) ctx.stroke();
  }
}

/**
 * Build SVG string for generative spiral as vector paths.
 */
export function buildGenerativeSpiralSvg(width, height, imageData, options = {}) {
  const dpr = options.dpr ?? 1;
  const density = options.density ?? 50;
  const spiralDent = options.spiralDent ?? 50;
  const spiralTurns = options.spiralTurns ?? 5;
  const maskOn = options.maskOn ?? false;
  const maskCoveringLines = options.maskCoveringLines ?? 'off';
  const maskCoverPadding = Math.max(0, options.maskCoverPadding ?? 0) * dpr;
  const rotationDeg = options.rotation ?? 0;
  const angleRad = (rotationDeg * Math.PI) / 180;
  const strokeStyle = options.strokeStyle ?? '#000000';
  const backgroundColor = options.backgroundColor ?? '#ffffff';
  const renderBackground = options.renderBackground ?? true;
  const centerX = options.centerX ?? 0.5;
  const centerY = options.centerY ?? 0.5;

  const cx = width * centerX;
  const cy = height * centerY;
  const maxDist = Math.max(
    Math.hypot(cx, cy),
    Math.hypot(width - cx, cy),
    Math.hypot(cx, height - cy),
    Math.hypot(width - cx, height - cy)
  );
  const data = imageData.data;
  const bgRgb = parseBgHex(backgroundColor);

  const numSpirals = Math.max(3, Math.floor(density / 10));
  const spiralSpacing = (2 * Math.PI) / numSpirals;
  
  let spiralAngles = [];
  for (let i = 0; i < numSpirals; i++) {
    spiralAngles.push(i * spiralSpacing);
  }
  if (maskCoveringLines === 'bottom-up') spiralAngles = spiralAngles.slice().reverse();

  const useEnvelope = maskCoveringLines !== 'off';
  const topDown = maskCoveringLines === 'top-down';
  const envelopeLen = 720;
  const envelope = useEnvelope ? new Float32Array(envelopeLen) : null;
  if (envelope) {
    for (let i = 0; i < envelopeLen; i++) envelope[i] = topDown ? -Infinity : Infinity;
  }

  const pathParts = [];

  for (const startAngle of spiralAngles) {
    let started = false;
    let d = '';
    
    const maxRadius = maxDist;
    const radiusStep = 2 * dpr;
    
    for (let r = 0; r <= maxRadius; r += radiusStep) {
      const spiralAngle = startAngle + (r / maxRadius) * spiralTurns * 2 * Math.PI;
      const theta = spiralAngle + angleRad;
      
      const baseX = cx + r * Math.cos(theta);
      const baseY = cy + r * Math.sin(theta);
      
      const contentOk = !maskOn || isContentPixel(data, baseX, baseY, width, height, bgRgb);
      if (!contentOk) {
        started = false;
        continue;
      }

      const lum = getLuminance(data, baseX, baseY, width, height);
      const t = 1 - lum / 255;

      const dentAmount = (spiralDent / 100) * t * r * 0.3;
      const effectiveR = Math.max(0, r - dentAmount);
      
      const px = Math.round((cx + effectiveR * Math.cos(theta)) * 100) / 100;
      const py = Math.round((cy + effectiveR * Math.sin(theta)) * 100) / 100;

      if (useEnvelope) {
        const angleIndex = Math.min(envelopeLen - 1, Math.max(0, Math.floor(((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * envelopeLen)));
        const notCovered = topDown
          ? effectiveR > envelope[angleIndex] + maskCoverPadding
          : effectiveR < envelope[angleIndex] - maskCoverPadding;
        if (!notCovered) {
          started = false;
          continue;
        }
        envelope[angleIndex] = topDown ? Math.max(envelope[angleIndex], effectiveR) : Math.min(envelope[angleIndex], effectiveR);
      }

      if (!started) {
        d += (d ? ' ' : '') + `M ${px} ${py}`;
        started = true;
      } else {
        d += ` L ${px} ${py}`;
      }
    }
    
    if (d) pathParts.push(d);
  }

  const pathsSvg = pathParts.map((d) => `<path d="${d}" fill="none" stroke="${escapeXml(strokeStyle)}" stroke-width="${dpr}" stroke-linecap="round" stroke-linejoin="round"/>`).join('\n  ');
  const backgroundRect = renderBackground === true
    ? `<rect width="100%" height="100%" fill="${escapeXml(backgroundColor)}"/>\n  `
    : renderBackground === 'stroke'
      ? `<rect width="100%" height="100%" fill="none" stroke="${escapeXml('#' + Math.floor(Math.random() * 16777216).toString(16).padStart(6, '0'))}" stroke-width="1"/>\n  `
      : '';
  const inner = `${backgroundRect}${pathsSvg}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${inner}
</svg>`;
}

/**
 * Apply generative "spirals" effect: randomly placed spirals with masking.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {ImageData} imageData
 * @param {Object} options - spiralDent, spiralTurns, spiralSize, spiralSizeVariance, density, maskOn, centerX, centerY, dpr, strokeStyle, backgroundColor
 */
export function applyGenerativeSpirals(ctx, width, height, imageData, options = {}) {
  const dpr = options.dpr ?? 1;
  const density = options.density ?? 10;
  const spiralDent = options.spiralDent ?? 50;
  const spiralTurns = options.spiralTurns ?? 5;
  const spiralSize = options.spiralSize ?? 50; // 1-100, base size percentage
  const spiralSizeVariance = options.spiralSizeVariance ?? 50; // 0-100, variance in sizes
  const spiralDepthMask = options.spiralDepthMask ?? true; // Hide back side of sphere
  const maskOn = options.maskOn ?? false;
  const {
    strokeStyle = '#000000',
    backgroundColor = '#ffffff',
    centerX = 0.5,
    centerY = 0.5,
  } = options;

  const noiseOX = (options.seed ?? 0) * 13.7 + (options.time ?? 0) * 0.1;
  const noiseOY = (options.seed ?? 0) * 7.3;
  const seedBase = (options.seed ?? 0) * 99991 + Math.floor((options.time ?? 0) * 1000);

  // Global tilt center point
  const globalCenterX = width * centerX;
  const globalCenterY = height * centerY;

  const data = imageData.data;
  const bgRgb = parseBgHex(backgroundColor);

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = (options.lineWidth ?? 1) * dpr;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Number of spirals is directly set by density parameter
  const numSpirals = Math.max(1, Math.floor(density));
  
  // Create a mask to track covered areas (pixel-level)
  const maskData = new Uint8Array(width * height);
  
  // Track successfully placed spirals
  let placedSpirals = 0;
  let attemptIndex = 0;
  const maxAttempts = numSpirals * 10; // Try up to 10x the requested number to find valid positions
  
  // Keep trying to place spirals until we have enough or run out of attempts
  while (placedSpirals < numSpirals && attemptIndex < maxAttempts) {
    // Random center position using attempt index for variety
    const cx = seededRand(attemptIndex * 1357 + 111, seedBase) * width;
    const cy = seededRand(attemptIndex * 2468 + 222, seedBase) * height;

    attemptIndex++;

    // Check if this center point is already covered by a previous spiral
    const centerX = Math.floor(cx);
    const centerY = Math.floor(cy);
    if (centerX >= 0 && centerX < width && centerY >= 0 && centerY < height) {
      // If mask mode is on, check if this center is in a valid content area
      if (maskOn && !isContentPixel(data, centerX, centerY, width, height, bgRgb)) {
        // Center is outside content area, try next position
        continue;
      }

      if (maskData[centerY * width + centerX] > 0) {
        // Center is already covered, try next position
        continue;
      }
    } else {
      // Out of bounds
      continue;
    }

    // Calculate max radius for this spiral based on size and variance
    const maxDistToEdge = Math.min(
      Math.hypot(cx, cy),
      Math.hypot(width - cx, cy),
      Math.hypot(cx, height - cy),
      Math.hypot(width - cx, height - cy)
    );

    // Apply size and variance
    const baseSizeFactor = spiralSize / 100;
    const varianceFactor = spiralSizeVariance / 100;
    const randomVariance = (seededRand(placedSpirals * 4680 + 444, seedBase) - 0.5) * 2 * varianceFactor; // -variance to +variance
    const sizeFactor = Math.max(0.1, Math.min(1, baseSizeFactor + randomVariance * 0.5));
    const maxRadius = maxDistToEdge * sizeFactor;

    // Random starting angle
    const startAngle = seededRand(placedSpirals * 3579 + 333, seedBase) * Math.PI * 2;

    // Calculate direction from global center to this spiral
    const dx = cx - globalCenterX;
    const dy = cy - globalCenterY;
    const distToCenter = Math.hypot(dx, dy);
    const angleFromCenter = Math.atan2(dy, dx);
    
    // Tilt factor controls how much 3D rotation to apply
    const tiltFactor = spiralDent / 100; // 0 to 1
    
    // Calculate how much this sphere should be rotated based on distance from global center
    // Spheres at the center: no rotation (viewed from top)
    // Spheres at the edges: maximum rotation (viewed from side)
    const maxDist = Math.hypot(width / 2, height / 2);
    const normalizedDist = Math.min(1, distToCenter / maxDist);
    const rotationAmount = normalizedDist * tiltFactor; // 0 to 1
    
    // This spiral's sphere radius
    const sphereRadius = maxRadius;
    
    // Draw spiral on sphere surface
    ctx.beginPath();
    let started = false;
    let actualMaxRadius = 0; // Track actual max radius drawn
    const drawnPoints = []; // Track all actual 2D positions for accurate masking
    
    // Use very small step for extremely smooth spirals (0.25 pixels)
    const radiusStep = 0.25 * dpr;
    
    for (let r = 0; r <= maxRadius; r += radiusStep) {
      const spiralAngle = startAngle + (r / maxRadius) * spiralTurns * 2 * Math.PI;
      
      // Start with polar coordinates on a flat circle
      const flatX = r * Math.cos(spiralAngle);
      const flatY = r * Math.sin(spiralAngle);
      
      // Map to 3D sphere: convert 2D polar to spherical coordinates
      const normalizedR = r / sphereRadius;
      const theta = spiralAngle; // longitude
      const phi = normalizedR * (Math.PI / 2); // latitude (0 at center, π/2 at edge)
      
      // 3D position on sphere surface
      let x3d = Math.sin(phi) * Math.cos(theta) * sphereRadius;
      let y3d = Math.sin(phi) * Math.sin(theta) * sphereRadius;
      let z3d = Math.cos(phi) * sphereRadius; // depth into sphere
      
      // Rotate the sphere based on position relative to global center
      // Rotation axis is perpendicular to the direction from global center
      // This makes the sphere "tilt" to face the global center
      const rotationAngle = rotationAmount * (Math.PI / 2); // 0 to 90 degrees
      
      // Rotate around X axis (if sphere is to the left/right of center)
      // Actually, rotate around the axis perpendicular to angleFromCenter
      // We want to rotate the sphere so it "faces" toward/away from global center
      
      // Simplified: rotate around the axis perpendicular to the radial direction
      // This tilts spheres on the sides
      const rotAxis_x = -Math.sin(angleFromCenter); // perpendicular to radial
      const rotAxis_y = Math.cos(angleFromCenter);
      
      // Apply rotation around this axis (Rodrigues' rotation formula simplified)
      // For simplicity, we'll rotate around Y-axis first, then adjust
      const cosRot = Math.cos(rotationAngle);
      const sinRot = Math.sin(rotationAngle);
      
      // Rotate around X-axis (tilts sphere forward/back)
      const y3d_rot = y3d * cosRot - z3d * sinRot;
      const z3d_rot = y3d * sinRot + z3d * cosRot;
      
      // Now rotate the result based on the direction from global center
      const x_final = x3d * Math.cos(angleFromCenter) - y3d_rot * Math.sin(angleFromCenter);
      const y_final = x3d * Math.sin(angleFromCenter) + y3d_rot * Math.cos(angleFromCenter);
      const z_final = z3d_rot;
      
      // Depth masking: hide parts of the spiral behind the sphere
      if (spiralDepthMask && z_final < 0) {
        // This point is on the back side of the sphere, skip it
        if (started) {
          ctx.stroke();
          ctx.beginPath();
          started = false;
        }
        continue;
      }
      
      // Perspective projection: scale by depth
      const perspectiveFactor = 0.6 + (z_final / sphereRadius) * 0.4; // 0.6 to 1.0
      
      const baseX = cx + x_final * perspectiveFactor;
      const baseY = cy + y_final * perspectiveFactor;
      
      // Check if hitting masked area
      const mx = Math.floor(baseX);
      const my = Math.floor(baseY);
      if (mx >= 0 && mx < width && my >= 0 && my < height) {
        if (maskData[my * width + mx] > 0) {
          // This area is covered, stop drawing this spiral
          break;
        }
      }
      
      const contentOk = !maskOn || isContentPixel(data, baseX, baseY, width, height, bgRgb);
      if (!contentOk) {
        if (started) {
          ctx.stroke();
          ctx.beginPath();
          started = false;
        }
        continue;
      }

      if (!started) {
        ctx.moveTo(baseX, baseY);
        started = true;
      } else {
        ctx.lineTo(baseX, baseY);
      }
      
      // Track this point for accurate masking
      drawnPoints.push({ x: baseX, y: baseY });
      
      actualMaxRadius = r;
    }
    
    if (started) ctx.stroke();
    
    // Mark the area occupied by this spiral to prevent small spirals from appearing inside
    // We'll mask both the drawn points and a smaller interior area
    
    // First, mask around each drawn point with a small buffer
    const lineBuffer = Math.ceil(1.5 * dpr); // Small buffer around drawn lines
    
    for (const pt of drawnPoints) {
      const px = Math.floor(pt.x);
      const py = Math.floor(pt.y);
      
      for (let dy = -lineBuffer; dy <= lineBuffer; dy++) {
        for (let dx = -lineBuffer; dx <= lineBuffer; dx++) {
          const mx = px + dx;
          const my = py + dy;
          if (mx >= 0 && mx < width && my >= 0 && my < height) {
            if (Math.hypot(dx, dy) <= lineBuffer) {
              maskData[my * width + mx] = 1;
            }
          }
        }
      }
    }
    
    // Additionally, mask the interior area to prevent small spirals inside
    // Use a smaller percentage to avoid large gaps
    const interiorMaskRadius = actualMaxRadius * 0.5; // Mask 50% of the interior
    
    for (let y = Math.max(0, Math.floor(cy - interiorMaskRadius)); y <= Math.min(height - 1, Math.ceil(cy + interiorMaskRadius)); y++) {
      for (let x = Math.max(0, Math.floor(cx - interiorMaskRadius)); x <= Math.min(width - 1, Math.ceil(cx + interiorMaskRadius)); x++) {
        const dist = Math.hypot(x - cx, y - cy);
        if (dist <= interiorMaskRadius) {
          maskData[y * width + x] = 1;
        }
      }
    }
    
    // Successfully placed this spiral
    placedSpirals++;
  }
}

/**
 * Build SVG string for generative spirals (random placement) as vector paths.
 */
export function buildGenerativeSpiralsSvg(width, height, imageData, options = {}) {
  const dpr = options.dpr ?? 1;
  const density = options.density ?? 10;
  const spiralDent = options.spiralDent ?? 50;
  const spiralTurns = options.spiralTurns ?? 5;
  const spiralSize = options.spiralSize ?? 50;
  const spiralSizeVariance = options.spiralSizeVariance ?? 50;
  const spiralDepthMask = options.spiralDepthMask ?? true;
  const maskOn = options.maskOn ?? false;
  const strokeStyle = options.strokeStyle ?? '#000000';
  const backgroundColor = options.backgroundColor ?? '#ffffff';
  const renderBackground = options.renderBackground ?? true;
  const centerX = options.centerX ?? 0.5;
  const centerY = options.centerY ?? 0.5;

  const noiseOX = (options.seed ?? 0) * 13.7 + (options.time ?? 0) * 0.1;
  const noiseOY = (options.seed ?? 0) * 7.3;
  const seedBase = (options.seed ?? 0) * 99991 + Math.floor((options.time ?? 0) * 1000);

  const data = imageData.data;
  const bgRgb = parseBgHex(backgroundColor);

  // Global tilt center point
  const globalCenterX = width * centerX;
  const globalCenterY = height * centerY;

  // Number of spirals is directly set by density parameter
  const numSpirals = Math.max(1, Math.floor(density));
  
  // Create a mask to track covered areas
  const maskData = new Uint8Array(width * height);
  
  const pathParts = [];

  // Track successfully placed spirals
  let placedSpirals = 0;
  let attemptIndex = 0;
  const maxAttempts = numSpirals * 10; // Try up to 10x the requested number to find valid positions
  
  // Keep trying to place spirals until we have enough or run out of attempts
  while (placedSpirals < numSpirals && attemptIndex < maxAttempts) {
    // Random center position using attempt index for variety
    const cx = seededRand(attemptIndex * 1357 + 111, seedBase) * width;
    const cy = seededRand(attemptIndex * 2468 + 222, seedBase) * height;

    attemptIndex++;

    // Check if this center point is already covered
    const centerX = Math.floor(cx);
    const centerY = Math.floor(cy);
    if (centerX >= 0 && centerX < width && centerY >= 0 && centerY < height) {
      // If mask mode is on, check if this center is in a valid content area
      if (maskOn && !isContentPixel(data, centerX, centerY, width, height, bgRgb)) {
        // Center is outside content area, try next position
        continue;
      }

      if (maskData[centerY * width + centerX] > 0) {
        continue;
      }
    } else {
      // Out of bounds
      continue;
    }

    const maxDistToEdge = Math.min(
      Math.hypot(cx, cy),
      Math.hypot(width - cx, cy),
      Math.hypot(cx, height - cy),
      Math.hypot(width - cx, height - cy)
    );

    // Apply size and variance
    const baseSizeFactor = spiralSize / 100;
    const varianceFactor = spiralSizeVariance / 100;
    const randomVariance = (seededRand(placedSpirals * 4680 + 444, seedBase) - 0.5) * 2 * varianceFactor;
    const sizeFactor = Math.max(0.1, Math.min(1, baseSizeFactor + randomVariance * 0.5));
    const maxRadius = maxDistToEdge * sizeFactor;

    const startAngle = seededRand(placedSpirals * 3579 + 333, seedBase) * Math.PI * 2;
    
    // Calculate direction from global center to this spiral
    const dx = cx - globalCenterX;
    const dy = cy - globalCenterY;
    const distToCenter = Math.hypot(dx, dy);
    const angleFromCenter = Math.atan2(dy, dx);
    
    // Tilt factor controls how much 3D rotation to apply
    const tiltFactor = spiralDent / 100;
    
    // Calculate sphere rotation based on distance from global center
    const maxDist = Math.hypot(width / 2, height / 2);
    const normalizedDist = Math.min(1, distToCenter / maxDist);
    const rotationAmount = normalizedDist * tiltFactor;
    
    // This spiral's sphere radius
    const sphereRadius = maxRadius;
    
    let started = false;
    let d = '';
    let actualMaxRadius = 0;
    const drawnPoints = []; // Track all actual 2D positions for accurate masking
    
    // Use very small step for extremely smooth spirals (0.25 pixels)
    const radiusStep = 0.25 * dpr;
    
    for (let r = 0; r <= maxRadius; r += radiusStep) {
      const spiralAngle = startAngle + (r / maxRadius) * spiralTurns * 2 * Math.PI;
      
      // Map to 3D sphere
      const normalizedR = r / sphereRadius;
      const theta = spiralAngle;
      const phi = normalizedR * (Math.PI / 2);
      
      // 3D position on sphere surface
      let x3d = Math.sin(phi) * Math.cos(theta) * sphereRadius;
      let y3d = Math.sin(phi) * Math.sin(theta) * sphereRadius;
      let z3d = Math.cos(phi) * sphereRadius;
      
      // Rotate sphere based on position
      const rotationAngle = rotationAmount * (Math.PI / 2);
      const cosRot = Math.cos(rotationAngle);
      const sinRot = Math.sin(rotationAngle);
      
      // Rotate around X-axis
      const y3d_rot = y3d * cosRot - z3d * sinRot;
      const z3d_rot = y3d * sinRot + z3d * cosRot;
      
      // Rotate based on direction from global center
      const x_final = x3d * Math.cos(angleFromCenter) - y3d_rot * Math.sin(angleFromCenter);
      const y_final = x3d * Math.sin(angleFromCenter) + y3d_rot * Math.cos(angleFromCenter);
      const z_final = z3d_rot;
      
      // Depth masking: hide parts of the spiral behind the sphere
      if (spiralDepthMask && z_final < 0) {
        // This point is on the back side of the sphere, skip it
        started = false;
        continue;
      }
      
      // Perspective projection
      const perspectiveFactor = 0.6 + (z_final / sphereRadius) * 0.4;
      
      const baseX = cx + x_final * perspectiveFactor;
      const baseY = cy + y_final * perspectiveFactor;
      
      // Check if hitting masked area
      let hitMask = false;
      const mx = Math.floor(baseX);
      const my = Math.floor(baseY);
      if (mx >= 0 && mx < width && my >= 0 && my < height) {
        if (maskData[my * width + mx] > 0) {
          hitMask = true;
        }
      }
      
      if (hitMask) {
        break;
      }
      
      const contentOk = !maskOn || isContentPixel(data, baseX, baseY, width, height, bgRgb);
      if (!contentOk) {
        started = false;
        continue;
      }

      const px = Math.round(baseX * 100) / 100;
      const py = Math.round(baseY * 100) / 100;

      if (!started) {
        d += (d ? ' ' : '') + `M ${px} ${py}`;
        started = true;
      } else {
        d += ` L ${px} ${py}`;
      }
      
      // Track this point for accurate masking
      drawnPoints.push({ x: baseX, y: baseY });
      
      actualMaxRadius = r;
    }
    
    if (d) pathParts.push(d);
    
    // Mark the area occupied by this spiral to prevent small spirals from appearing inside
    // We'll mask both the drawn points and a smaller interior area
    
    // First, mask around each drawn point with a small buffer
    const lineBuffer = Math.ceil(1.5 * dpr); // Small buffer around drawn lines
    
    for (const pt of drawnPoints) {
      const px = Math.floor(pt.x);
      const py = Math.floor(pt.y);
      
      for (let dy = -lineBuffer; dy <= lineBuffer; dy++) {
        for (let dx = -lineBuffer; dx <= lineBuffer; dx++) {
          const mx = px + dx;
          const my = py + dy;
          if (mx >= 0 && mx < width && my >= 0 && my < height) {
            if (Math.hypot(dx, dy) <= lineBuffer) {
              maskData[my * width + mx] = 1;
            }
          }
        }
      }
    }
    
    // Additionally, mask the interior area to prevent small spirals inside
    // Use a smaller percentage to avoid large gaps
    const interiorMaskRadius = actualMaxRadius * 0.5; // Mask 50% of the interior
    
    for (let y = Math.max(0, Math.floor(cy - interiorMaskRadius)); y <= Math.min(height - 1, Math.ceil(cy + interiorMaskRadius)); y++) {
      for (let x = Math.max(0, Math.floor(cx - interiorMaskRadius)); x <= Math.min(width - 1, Math.ceil(cx + interiorMaskRadius)); x++) {
        const dist = Math.hypot(x - cx, y - cy);
        if (dist <= interiorMaskRadius) {
          maskData[y * width + x] = 1;
        }
      }
    }
    
    // Successfully placed this spiral
    placedSpirals++;
  }

  const pathsSvg = pathParts.map((d) => `<path d="${d}" fill="none" stroke="${escapeXml(strokeStyle)}" stroke-width="${dpr}" stroke-linecap="round" stroke-linejoin="round"/>`).join('\n  ');
  const backgroundRect = renderBackground === true
    ? `<rect width="100%" height="100%" fill="${escapeXml(backgroundColor)}"/>\n  `
    : renderBackground === 'stroke'
      ? `<rect width="100%" height="100%" fill="none" stroke="${escapeXml('#' + Math.floor(Math.random() * 16777216).toString(16).padStart(6, '0'))}" stroke-width="1"/>\n  `
      : '';
  const inner = `${backgroundRect}${pathsSvg}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${inner}
</svg>`;
}

/**
 * Apply generative effect based on mode.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {ImageData} imageData
 * @param {'lines'|'circles'|'particles'|'topomap'|'spiral'|'spirals'} mode
 * @param {Object} options - passed to the specific effect
 */
export function applyGenerativeEffect(ctx, width, height, imageData, mode, options = {}) {
  if (mode === 'circles') {
    applyGenerativeCircles(ctx, width, height, imageData, options);
  } else if (mode === 'particles') {
    applyGenerativeParticles(ctx, width, height, imageData, options);
  } else if (mode === 'topomap') {
    applyGenerativeTopomap(ctx, width, height, imageData, options);
  } else if (mode === 'spiral') {
    applyGenerativeSpiral(ctx, width, height, imageData, options);
  } else if (mode === 'spirals') {
    applyGenerativeSpirals(ctx, width, height, imageData, options);
  } else {
    applyGenerativeLines(ctx, width, height, imageData, options);
  }
}
