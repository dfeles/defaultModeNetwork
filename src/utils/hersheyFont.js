/**
 * Hershey font utility — renders text as SVG stroke paths.
 * Font data from the hersheytext npm package (public domain font data).
 *
 * Usage (React, inside an <svg>):
 *   <HersheyText text="42" font="futural" size={12} x={4} y={4} color="#fff" />
 *
 * Usage (plain SVG string):
 *   const svg = hersheyTextSVG("42", { font: "futural", size: 12, x: 0, y: 0 });
 *
 * Usage (raw paths for custom rendering):
 *   const { paths, width, height } = hersheyMeasure("42", { font: "futural", size: 12 });
 */

import React from 'react';
import fontData from 'hersheytext/hersheytext.min.json';

// Hershey glyph coordinate space — cap height is ~1, baseline ~16, bottom ~22
const GLYPH_HEIGHT = 22;

/** All available Hershey fonts as { id, name } */
export const HERSHEY_FONTS = Object.keys(fontData).map((id) => ({
  id,
  name: fontData[id].name,
}));

/**
 * Scale and translate all coordinate pairs in a Hershey SVG path string.
 * Hershey paths only use M/L with absolute x,y pairs — no arcs or curves.
 */
function transformPath(d, tx, ty, scale) {
  return d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, px, py) => {
    const nx = parseFloat(px) * scale + tx;
    const ny = parseFloat(py) * scale + ty;
    return `${+nx.toFixed(3)},${+ny.toFixed(3)}`;
  });
}

/**
 * Generate SVG path `d` strings for a text string.
 *
 * @param {string} text
 * @param {object} opts
 * @param {string}  [opts.font='futural']
 * @param {number}  [opts.size=16]          - Approximate cap height in px
 * @param {number}  [opts.x=0]              - Left origin
 * @param {number}  [opts.y=0]              - Top origin (cap line)
 * @param {number}  [opts.letterSpacing=0]  - Extra px between glyphs
 * @returns {{ paths: string[], width: number, height: number }}
 */
export function hersheyPaths(text, opts = {}) {
  const {
    font = 'futural',
    size = 16,
    x = 0,
    y = 0,
    letterSpacing = 0,
  } = opts;

  const fontObj = fontData[font] || fontData.futural;
  const scale = size / GLYPH_HEIGHT;
  // Shift upward so y=0 aligns to the cap line (glyph cap starts at coord 1)
  const offsetY = y - 1 * scale;

  const paths = [];
  let cursorX = x;

  for (const char of text) {
    const code = char.charCodeAt(0);

    if (code === 32) {
      // space — use ~half the nominal unit width
      cursorX += 6 * scale + letterSpacing;
      continue;
    }

    const idx = code - 33;
    if (idx < 0 || idx >= fontObj.chars.length) continue;
    const glyph = fontObj.chars[idx];
    if (!glyph) continue;

    if (glyph.d) {
      paths.push(transformPath(glyph.d, cursorX, offsetY, scale));
    }

    cursorX += glyph.o * scale + letterSpacing;
  }

  return {
    paths,
    width: cursorX - x,
    height: size,
  };
}

/**
 * Measure rendered text dimensions without generating paths.
 */
export function hersheyMeasure(text, opts = {}) {
  const { width, height } = hersheyPaths(text, opts);
  return { width, height };
}

/**
 * Generate a snippet of SVG markup (paths only, no <svg> wrapper).
 * Embed inside your own <svg> element.
 */
export function hersheyTextSVG(text, opts = {}) {
  const { color = 'currentColor', strokeWidth = 1, ...pathOpts } = opts;
  const { paths } = hersheyPaths(text, pathOpts);
  return paths
    .map((d) => `<path d="${d}" stroke="${color}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`)
    .join('\n');
}

/**
 * React component — renders Hershey text as SVG <path> elements.
 * Must be used inside an existing <svg> or <g>.
 *
 * @param {object} props
 * @param {string}  props.text
 * @param {string}  [props.font='futural']
 * @param {number}  [props.size=16]
 * @param {number}  [props.x=0]
 * @param {number}  [props.y=0]
 * @param {string}  [props.color='currentColor']
 * @param {number}  [props.strokeWidth=1]
 * @param {number}  [props.letterSpacing=0]
 */
export function HersheyText({ text, font, size, x, y, color, strokeWidth, letterSpacing }) {
  const { paths } = hersheyPaths(text, { font, size, x, y, letterSpacing });
  return paths.map((d, i) => (
    <path
      key={i}
      d={d}
      stroke={color || 'currentColor'}
      strokeWidth={strokeWidth ?? 1}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ));
}

/**
 * Standalone React component — renders text in its own <svg> wrapper.
 * Use this when you're outside of an existing SVG context.
 *
 * @param {object} props - same as HersheyText, plus optional `padding`
 */
export function HersheyLabel({ text, font, size = 16, color = 'currentColor', strokeWidth = 1, letterSpacing = 0, padding = 2, style, className }) {
  const { width, height } = hersheyPaths(text || '', { font, size, letterSpacing });
  const svgW = width + padding * 2;
  const svgH = height + padding * 2;
  return (
    <svg
      width={svgW}
      height={svgH}
      viewBox={`0 0 ${svgW} ${svgH}`}
      style={style}
      className={className}
      overflow="visible"
    >
      <HersheyText
        text={text}
        font={font}
        size={size}
        x={padding}
        y={padding}
        color={color}
        strokeWidth={strokeWidth}
        letterSpacing={letterSpacing}
      />
    </svg>
  );
}
