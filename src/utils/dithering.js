/**
 * Apply Floyd-Steinberg dithering to ImageData
 * Converts grayscale/color image to black and white using error diffusion
 */
export function applyFloydSteinbergDithering(imageData, levels = 2) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  
  // Create a copy to work with
  const output = new ImageData(width, height);
  const outputData = output.data;
  
  // Copy original data
  for (let i = 0; i < data.length; i++) {
    outputData[i] = data[i];
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
      
      // Quantize to nearest level (for 2 levels: 0 or 255)
      const quantized = Math.round((gray / 255) * (levels - 1)) * (255 / (levels - 1));
      const quantizedValue = Math.min(255, Math.max(0, quantized));
      
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
 */
export function applyOrderedDithering(imageData, levels = 2) {
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
  const threshold = 16;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      
      // Convert to grayscale
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      
      // Get threshold from Bayer matrix
      const matrixX = x % matrixSize;
      const matrixY = y % matrixSize;
      const matrixValue = bayerMatrix[matrixY][matrixX];
      const thresholdValue = (matrixValue / threshold) * 255;
      
      // Quantize based on threshold
      const quantized = gray > thresholdValue ? 255 : 0;
      
      outputData[idx] = quantized;
      outputData[idx + 1] = quantized;
      outputData[idx + 2] = quantized;
      outputData[idx + 3] = data[idx + 3]; // Alpha
    }
  }
  
  return output;
}

