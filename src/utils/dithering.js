/**
 * Apply contrast adjustment to a pixel value
 * @param {number} value - Pixel value (0-255)
 * @param {number} contrast - Contrast adjustment (-100 to 100, where 0 is no change)
 * @returns {number} Adjusted value
 */
function applyContrast(value, contrast) {
  // Convert contrast from -100 to 100 to a factor
  // 0 = no change, positive = more contrast, negative = less contrast
  const factor = (100 + contrast) / 100;
  const adjusted = ((value / 255 - 0.5) * factor + 0.5) * 255;
  return Math.min(255, Math.max(0, adjusted));
}

/**
 * Apply brightness adjustment to a pixel value
 * @param {number} value - Pixel value (0-255)
 * @param {number} brightness - Brightness adjustment (-100 to 100, where 0 is no change)
 * @returns {number} Adjusted value
 */
function applyBrightness(value, brightness) {
  // Convert brightness from -100 to 100 to an offset
  const offset = (brightness / 100) * 255;
  return Math.min(255, Math.max(0, value + offset));
}

/**
 * Convert hex color to RGB array
 * @param {string} hex - Hex color string (e.g., "#ff0000")
 * @returns {Array<number>} [r, g, b] values (0-255)
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [0, 0, 0];
}

/**
 * Find the closest color in palette to a given RGB color
 * @param {number} r - Red value (0-255)
 * @param {number} g - Green value (0-255)
 * @param {number} b - Blue value (0-255)
 * @param {Array<string>} palette - Array of hex color strings
 * @returns {Array<number>} [r, g, b] of closest color
 */
function findClosestColor(r, g, b, palette) {
  if (!palette || palette.length === 0) {
    return [r, g, b];
  }
  
  let minDistance = Infinity;
  let closestColor = [0, 0, 0];
  
  for (const hexColor of palette) {
    const [pr, pg, pb] = hexToRgb(hexColor);
    // Calculate Euclidean distance in RGB space
    const distance = Math.sqrt(
      Math.pow(r - pr, 2) + 
      Math.pow(g - pg, 2) + 
      Math.pow(b - pb, 2)
    );
    
    if (distance < minDistance) {
      minDistance = distance;
      closestColor = [pr, pg, pb];
    }
  }
  
  return closestColor;
}

/**
 * Apply gradient curve to brightness value
 * @param {number} brightness - Brightness value (0-255)
 * @param {number} gradient - Gradient control (0-100, 50 = linear, <50 = more black, >50 = more white)
 * @returns {number} Adjusted brightness (0-255)
 */
function applyGradientCurve(brightness, gradient) {
  // Normalize gradient: 0 = all black early, 50 = linear, 100 = all white early
  const normalized = (gradient - 50) / 50; // -1 to 1
  
  // Apply curve: negative = compress dark values, positive = compress light values
  if (normalized < 0) {
    // More black: compress dark values, expand light values
    const factor = 1 + Math.abs(normalized);
    return Math.pow(brightness / 255, 1 / factor) * 255;
  } else if (normalized > 0) {
    // More white: expand dark values, compress light values
    const factor = 1 + normalized;
    return Math.pow(brightness / 255, factor) * 255;
  }
  // Linear (gradient = 50)
  return brightness;
}

/**
 * Apply Floyd-Steinberg dithering to ImageData
 * Converts grayscale/color image to black and white or color palette using error diffusion
 * @param {ImageData} imageData - The image data to dither
 * @param {number} levels - Number of quantization levels (default: 2)
 * @param {number} threshold - Threshold for quantization (0-255, default: 128)
 * @param {number} contrast - Contrast adjustment (-100 to 100, default: 0)
 * @param {number} brightness - Brightness adjustment (-100 to 100, default: 0)
 * @param {Array<string>} colorPalette - Array of hex color strings for palette quantization (optional)
 * @param {number} gradient - Gradient control (0-100, 50 = linear, <50 = more black early, >50 = more white early)
 */
export function applyFloydSteinbergDithering(imageData, levels = 2, threshold = 128, contrast = 0, brightness = 0, colorPalette = null, gradient = 50) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  
  // Create a copy to work with
  const output = new ImageData(width, height);
  const outputData = output.data;
  
  // Copy original data and apply contrast/brightness adjustments
  for (let i = 0; i < data.length; i += 4) {
    // Apply contrast and brightness to each RGB channel
    outputData[i] = applyBrightness(applyContrast(data[i], contrast), brightness);
    outputData[i + 1] = applyBrightness(applyContrast(data[i + 1], contrast), brightness);
    outputData[i + 2] = applyBrightness(applyContrast(data[i + 2], contrast), brightness);
    outputData[i + 3] = data[i + 3]; // Alpha unchanged
  }
  
  // Floyd-Steinberg error diffusion matrix
  // Error distribution: Right: 7/16, Bottom-left: 3/16, Bottom: 5/16, Bottom-right: 1/16
  
  // Build color palette if provided
  let palette = null;
  if (colorPalette && colorPalette.length > 0) {
    palette = colorPalette;
  } else if (levels === 2) {
    // Default black and white for 2 levels
    palette = ['#000000', '#ffffff'];
  } else {
    // For more than 2 levels without palette, create grayscale levels
    palette = [];
    for (let i = 0; i < levels; i++) {
      const gray = Math.round((i / (levels - 1)) * 255);
      const hex = '#' + [gray, gray, gray].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      }).join('');
      palette.push(hex);
    }
  }
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      // Get current pixel RGB values
      let r = outputData[idx];
      let g = outputData[idx + 1];
      let b = outputData[idx + 2];
      
      // Apply gradient curve to brightness before color matching
      // This controls where black/white transitions occur
      if (gradient !== 50 && palette && palette.length > 2) {
        // Calculate brightness
        const pixelBrightness = 0.299 * r + 0.587 * g + 0.114 * b;
        // Apply gradient curve
        const adjustedBrightness = applyGradientCurve(pixelBrightness, gradient);
        // Scale RGB proportionally to match adjusted brightness
        const scale = adjustedBrightness / Math.max(pixelBrightness, 0.001);
        r = Math.min(255, Math.max(0, r * scale));
        g = Math.min(255, Math.max(0, g * scale));
        b = Math.min(255, Math.max(0, b * scale));
      }
      
      // Find closest color in palette
      const [quantizedR, quantizedG, quantizedB] = findClosestColor(r, g, b, palette);
      
      // Calculate error for each channel
      const errorR = r - quantizedR;
      const errorG = g - quantizedG;
      const errorB = b - quantizedB;
      
      // Set quantized value
      outputData[idx] = quantizedR;
      outputData[idx + 1] = quantizedG;
      outputData[idx + 2] = quantizedB;
      // Alpha stays the same
      
      // Distribute error to neighboring pixels (Floyd-Steinberg matrix)
      if (x < width - 1) {
        // Right pixel: 7/16 of error
        const rightIdx = idx + 4;
        outputData[rightIdx] = Math.min(255, Math.max(0, outputData[rightIdx] + errorR * (7 / 16)));
        outputData[rightIdx + 1] = Math.min(255, Math.max(0, outputData[rightIdx + 1] + errorG * (7 / 16)));
        outputData[rightIdx + 2] = Math.min(255, Math.max(0, outputData[rightIdx + 2] + errorB * (7 / 16)));
      }
      
      if (y < height - 1) {
        // Bottom pixel: 5/16 of error
        const bottomIdx = (y + 1) * width * 4 + x * 4;
        outputData[bottomIdx] = Math.min(255, Math.max(0, outputData[bottomIdx] + errorR * (5 / 16)));
        outputData[bottomIdx + 1] = Math.min(255, Math.max(0, outputData[bottomIdx + 1] + errorG * (5 / 16)));
        outputData[bottomIdx + 2] = Math.min(255, Math.max(0, outputData[bottomIdx + 2] + errorB * (5 / 16)));
        
        if (x > 0) {
          // Bottom-left pixel: 3/16 of error
          const bottomLeftIdx = bottomIdx - 4;
          outputData[bottomLeftIdx] = Math.min(255, Math.max(0, outputData[bottomLeftIdx] + errorR * (3 / 16)));
          outputData[bottomLeftIdx + 1] = Math.min(255, Math.max(0, outputData[bottomLeftIdx + 1] + errorG * (3 / 16)));
          outputData[bottomLeftIdx + 2] = Math.min(255, Math.max(0, outputData[bottomLeftIdx + 2] + errorB * (3 / 16)));
        }
        
        if (x < width - 1) {
          // Bottom-right pixel: 1/16 of error
          const bottomRightIdx = bottomIdx + 4;
          outputData[bottomRightIdx] = Math.min(255, Math.max(0, outputData[bottomRightIdx] + errorR * (1 / 16)));
          outputData[bottomRightIdx + 1] = Math.min(255, Math.max(0, outputData[bottomRightIdx + 1] + errorG * (1 / 16)));
          outputData[bottomRightIdx + 2] = Math.min(255, Math.max(0, outputData[bottomRightIdx + 2] + errorB * (1 / 16)));
        }
      }
    }
  }
  
  return output;
}

/**
 * Apply ordered dithering (Bayer matrix) to ImageData
 * Alternative dithering method
 * @param {ImageData} imageData - The image data to dither
 * @param {number} levels - Number of quantization levels (default: 2)
 * @param {number} threshold - Threshold for quantization (0-255, default: 128)
 * @param {number} contrast - Contrast adjustment (-100 to 100, default: 0)
 * @param {number} brightness - Brightness adjustment (-100 to 100, default: 0)
 * @param {Array<string>} colorPalette - Array of hex color strings for palette quantization (optional)
 * @param {number} gradient - Gradient control (0-100, 50 = linear, <50 = more black early, >50 = more white early)
 */
export function applyOrderedDithering(imageData, levels = 2, threshold = 128, contrast = 0, brightness = 0, colorPalette = null, gradient = 50) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  
  const output = new ImageData(width, height);
  const outputData = output.data;
  
  // Copy original data and apply contrast/brightness adjustments
  for (let i = 0; i < data.length; i += 4) {
    // Apply contrast and brightness to each RGB channel
    outputData[i] = applyBrightness(applyContrast(data[i], contrast), brightness);
    outputData[i + 1] = applyBrightness(applyContrast(data[i + 1], contrast), brightness);
    outputData[i + 2] = applyBrightness(applyContrast(data[i + 2], contrast), brightness);
    outputData[i + 3] = data[i + 3]; // Alpha unchanged
  }
  
  // Build color palette if provided
  let palette = null;
  if (colorPalette && colorPalette.length > 0) {
    palette = colorPalette;
  } else if (levels === 2) {
    // Default black and white for 2 levels
    palette = ['#000000', '#ffffff'];
  } else {
    // For more than 2 levels without palette, create grayscale levels
    palette = [];
    for (let i = 0; i < levels; i++) {
      const gray = Math.round((i / (levels - 1)) * 255);
      const hex = '#' + [gray, gray, gray].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      }).join('');
      palette.push(hex);
    }
  }
  
  // 4x4 Bayer matrix
  const bayerMatrix = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ];
  const matrixSize = 4;
  const matrixThreshold = 16;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      // Get current pixel RGB values
      let r = outputData[idx];
      let g = outputData[idx + 1];
      let b = outputData[idx + 2];
      
      // Apply gradient curve to brightness before color matching
      if (gradient !== 50 && palette && palette.length > 2) {
        // Calculate brightness
        const pixelBrightness = 0.299 * r + 0.587 * g + 0.114 * b;
        // Apply gradient curve
        const adjustedBrightness = applyGradientCurve(pixelBrightness, gradient);
        // Scale RGB proportionally to match adjusted brightness
        const scale = adjustedBrightness / Math.max(pixelBrightness, 0.001);
        r = Math.min(255, Math.max(0, r * scale));
        g = Math.min(255, Math.max(0, g * scale));
        b = Math.min(255, Math.max(0, b * scale));
      }
      
      // Get threshold from Bayer matrix
      const matrixX = x % matrixSize;
      const matrixY = y % matrixSize;
      const matrixValue = bayerMatrix[matrixY][matrixX];
      const thresholdValue = (matrixValue / matrixThreshold) * 255;
      
      // Calculate brightness for quantization
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      
      // Quantize based on threshold (adjusted by user threshold and matrix)
      const adjustedThreshold = threshold + (thresholdValue - 128);
      
      // Find closest color in palette
      const [quantizedR, quantizedG, quantizedB] = findClosestColor(r, g, b, palette);
      
      outputData[idx] = quantizedR;
      outputData[idx + 1] = quantizedG;
      outputData[idx + 2] = quantizedB;
      outputData[idx + 3] = data[idx + 3]; // Alpha
    }
  }
  
  return output;
}

