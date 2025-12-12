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
 * Apply Floyd-Steinberg dithering to ImageData
 * Converts grayscale/color image to black and white using error diffusion
 * @param {ImageData} imageData - The image data to dither
 * @param {number} levels - Number of quantization levels (default: 2)
 * @param {number} threshold - Threshold for quantization (0-255, default: 128)
 * @param {number} contrast - Contrast adjustment (-100 to 100, default: 0)
 * @param {number} brightness - Brightness adjustment (-100 to 100, default: 0)
 */
export function applyFloydSteinbergDithering(imageData, levels = 2, threshold = 128, contrast = 0, brightness = 0) {
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
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      // Get current pixel RGB values
      let r = outputData[idx];
      let g = outputData[idx + 1];
      let b = outputData[idx + 2];
      
      // Convert to grayscale for quantization
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      
      // Quantize using threshold (for 2 levels: compare to threshold)
      const quantizedValue = gray > threshold ? 255 : 0;
      
      // Calculate error
      const error = gray - quantizedValue;
      
      // Set quantized value (convert back to RGB - grayscale)
      outputData[idx] = quantizedValue;
      outputData[idx + 1] = quantizedValue;
      outputData[idx + 2] = quantizedValue;
      // Alpha stays the same
      
      // Distribute error to neighboring pixels (apply to each RGB channel proportionally)
      const errorR = error;
      const errorG = error;
      const errorB = error;
      
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
 */
export function applyOrderedDithering(imageData, levels = 2, threshold = 128, contrast = 0, brightness = 0) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  
  const output = new ImageData(width, height);
  const outputData = output.data;
  
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
      
      // Apply contrast and brightness to each RGB channel
      let r = applyBrightness(applyContrast(data[idx], contrast), brightness);
      let g = applyBrightness(applyContrast(data[idx + 1], contrast), brightness);
      let b = applyBrightness(applyContrast(data[idx + 2], contrast), brightness);
      
      // Convert to grayscale
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      
      // Get threshold from Bayer matrix
      const matrixX = x % matrixSize;
      const matrixY = y % matrixSize;
      const matrixValue = bayerMatrix[matrixY][matrixX];
      const thresholdValue = (matrixValue / matrixThreshold) * 255;
      
      // Quantize based on threshold (adjusted by user threshold)
      const adjustedThreshold = threshold + (thresholdValue - 128);
      const quantized = gray > adjustedThreshold ? 255 : 0;
      
      outputData[idx] = quantized;
      outputData[idx + 1] = quantized;
      outputData[idx + 2] = quantized;
      outputData[idx + 3] = data[idx + 3]; // Alpha
    }
  }
  
  return output;
}

