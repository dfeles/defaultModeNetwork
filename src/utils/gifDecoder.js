import { parseGIF, decompressFrames } from 'gifuct-js';

/**
 * Parse a GIF File/Blob into composited full-frame ImageData objects.
 * Returns an array of { imageData, width, height, delay } — one per frame.
 */
export async function parseGifFrames(file) {
  const buf = await file.arrayBuffer();
  const gif = parseGIF(buf);
  const frames = decompressFrames(gif, true);
  if (!frames || frames.length === 0) return [];

  const W = gif.lsd.width;
  const H = gif.lsd.height;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const result = [];

  for (const frame of frames) {
    // Draw this frame's patch onto the composite canvas
    const pd = new ImageData(new Uint8ClampedArray(frame.patch), frame.dims.width, frame.dims.height);
    const tmp = document.createElement('canvas');
    tmp.width = frame.dims.width;
    tmp.height = frame.dims.height;
    tmp.getContext('2d').putImageData(pd, 0, 0);
    ctx.drawImage(tmp, frame.dims.left, frame.dims.top);

    result.push({
      imageData: ctx.getImageData(0, 0, W, H),
      width: W,
      height: H,
      delay: frame.delay || 10, // centiseconds
    });

    // Handle disposal
    if (frame.disposalType === 2) {
      ctx.clearRect(frame.dims.left, frame.dims.top, frame.dims.width, frame.dims.height);
    }
  }

  return result;
}

/** Convert a GIF frame's ImageData into a data URL (via offscreen canvas). */
export function frameToDataUrl(frame) {
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  canvas.getContext('2d').putImageData(frame.imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Convert a GIF frame into a loaded HTMLImageElement. */
export function frameToImg(frame) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = frameToDataUrl(frame);
  });
}
