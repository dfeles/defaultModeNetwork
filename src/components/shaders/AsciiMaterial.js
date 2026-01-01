import * as THREE from 'three';
import { getCharPath } from '../../utils/asciiCharPaths';

// Cache for character atlas textures (keyed by charSet string)
const charAtlasCache = new Map();

// Character set presets
export const ASCII_PRESETS = {
  'standard': ' .:-=+*#%@',
  'dense': ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',
  'minimal': ' .',
  'blocks': ' ░▒▓█',
  'braille': ' ⠀⠁⠂⠃⠄⠅⠆⠇⠈⠉⠊⠋⠌⠍⠎⠏⠐⠑⠒⠓⠔⠕⠖⠗⠘⠙⠚⠛⠜⠝⠞⠟⠠⠡⠢⠣⠤⠥⠦⠧⠨⠩⠪⠫⠬⠭⠮⠯⠰⠱⠲⠳⠴⠵⠶⠷⠸⠹⠺⠻⠼⠽⠾⠿',
  'technical': ' .-+*#',
  'matrix': ' 0123456789ABCDEF',
  'hatching': ' /|\\-+'
};

const vertexShader = `
  varying vec2 vUv;
  
  void main() {
    // Flip Y coordinate to match canvas coordinate system (top-left origin)
    vUv = vec2(uv.x, 1.0 - uv.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D tDiffuse;
  uniform sampler2D tCharAtlas;
  uniform vec2 uResolution;
  uniform float uCellSize;
  uniform int uCharSetLength;
  uniform float uCharSet[256]; // Character brightness values (normalized 0-1)
  
  varying vec2 vUv;
  
  // Calculate brightness from RGB
  float calculateBrightness(vec3 rgb) {
    return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  }
  
  void main() {
    vec2 uv = vUv;
    
    // Calculate cell coordinates
    vec2 cellCoord = floor(uv * uResolution / uCellSize);
    vec2 cellUv = mod(uv * uResolution, uCellSize) / uCellSize;
    
    // Get the center of the cell for sampling brightness
    vec2 cellCenter = (cellCoord + 0.5) * uCellSize / uResolution;
    vec3 cellColor = texture2D(tDiffuse, cellCenter).rgb;
    float cellBrightness = calculateBrightness(cellColor);
    
    // Map brightness to character index
    int charIndex = int(floor(cellBrightness * float(uCharSetLength)));
    charIndex = clamp(charIndex, 0, uCharSetLength - 1);
    
    // Sample from character atlas
    // Character atlas is arranged in a grid: each character is in its own cell
    float charsPerRow = 16.0; // 16 characters per row in the atlas
    float totalRows = ceil(float(uCharSetLength) / charsPerRow);
    
    // Calculate which character cell in the atlas
    float charCol = mod(float(charIndex), charsPerRow);
    float charRow = floor(float(charIndex) / charsPerRow);
    
    // Calculate UV within the character cell in the atlas
    // cellUv is 0-1 within the current cell, we need to map it to the atlas character cell
    vec2 charAtlasUv = vec2(
      (charCol + cellUv.x) / charsPerRow,
      1.0 - (charRow + (1.0 - cellUv.y)) / totalRows  // Flip Y for texture coordinates
    );
    
    vec4 charColor = texture2D(tCharAtlas, charAtlasUv);
    
    // Use the character texture as the output
    gl_FragColor = vec4(charColor.rgb, 1.0);
  }
`;

class AsciiMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      vertexShader,
      fragmentShader,
      uniforms: {
        tDiffuse: { value: null },
        tCharAtlas: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uCellSize: { value: 8.0 },
        uCharSetLength: { value: 0 },
        uCharSet: { value: new Array(256).fill(0.0) }
      }
    });
  }
  
  // Helper method to create character atlas texture using preset line-based icons
  async createCharAtlas(charSetString) {
    // Check cache first
    if (charAtlasCache.has(charSetString)) {
      const cachedTexture = charAtlasCache.get(charSetString);
      this.uniforms.tCharAtlas.value = cachedTexture;
      return; // Use cached texture, no need to create new one
    }
    
    const charsPerRow = 16;
    const charSize = 64; // Size of each character in the atlas (larger for better quality)
    const cols = charsPerRow;
    const rows = Math.ceil(charSetString.length / charsPerRow);
    
    const canvas = document.createElement('canvas');
    canvas.width = cols * charSize;
    canvas.height = rows * charSize;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas with black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Set up stroke style for line-based characters
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, charSize / 20);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Draw each character using preset paths
    for (let i = 0; i < charSetString.length; i++) {
      const char = charSetString[i];
      const col = i % charsPerRow;
      const row = Math.floor(i / charsPerRow);
      
      const x = col * charSize;
      const y = row * charSize;
      
      // Get the path for this character
      const pathData = getCharPath(char, charSize);
      
      if (pathData) {
        // Render path directly to canvas using Path2D
        try {
          ctx.save();
          ctx.translate(x, y);
          const path = new Path2D(pathData);
          ctx.stroke(path);
          ctx.restore();
        } catch (error) {
          // Fallback: try SVG approach if Path2D fails
          console.warn(`Path2D failed for character '${char}', trying SVG fallback:`, error);
          try {
            const svgNS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(svgNS, 'svg');
            svg.setAttribute('width', charSize);
            svg.setAttribute('height', charSize);
            svg.setAttribute('viewBox', `0 0 ${charSize} ${charSize}`);
            
            const pathElement = document.createElementNS(svgNS, 'path');
            pathElement.setAttribute('d', pathData);
            pathElement.setAttribute('fill', 'none');
            pathElement.setAttribute('stroke', '#ffffff');
            pathElement.setAttribute('stroke-width', ctx.lineWidth.toString());
            pathElement.setAttribute('stroke-linecap', 'round');
            pathElement.setAttribute('stroke-linejoin', 'round');
            svg.appendChild(pathElement);
            
            // Convert SVG to image and draw to canvas
            const svgData = new XMLSerializer().serializeToString(svg);
            const img = new Image();
            const blob = new Blob([svgData], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            
            await new Promise((resolve) => {
              img.onload = () => {
                ctx.drawImage(img, x, y, charSize, charSize);
                URL.revokeObjectURL(url);
                resolve();
              };
              img.onerror = (error) => {
                console.warn(`Failed to load SVG for character '${char}':`, error);
                URL.revokeObjectURL(url);
                resolve(); // Continue even if one character fails
              };
              img.src = url;
            });
          } catch (svgError) {
            console.warn(`Both Path2D and SVG failed for character '${char}':`, svgError);
          }
        }
      }
    }
    
    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false;
    texture.needsUpdate = true;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    
    // Cache the texture
    charAtlasCache.set(charSetString, texture);
    
    this.uniforms.tCharAtlas.value = texture;
    console.log(`Character atlas created: ${charSetString.length} characters, texture size: ${canvas.width}x${canvas.height}`);
  }
  
  // Helper method to set character set
  async setCharSet(charSetString) {
    const charSetArray = new Array(256).fill(0.0);
    const length = Math.min(charSetString.length, 256);
    
    // Calculate brightness for each character
    // We'll use a simple mapping: position in string determines brightness
    for (let i = 0; i < length; i++) {
      // Normalize to 0-1 range
      charSetArray[i] = i / Math.max(length - 1, 1);
    }
    
    this.uniforms.uCharSetLength.value = length;
    this.uniforms.uCharSet.value = charSetArray;
    
    // Create character atlas (now async)
    await this.createCharAtlas(charSetString);
  }
}

export default AsciiMaterial;

