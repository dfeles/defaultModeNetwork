import * as THREE from 'three';

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
  uniform vec2 uResolution;
  uniform int uColorCount;
  uniform vec3 uColorPalette[20]; // Max 20 colors
  
  varying vec2 vUv;
  
  // Find closest color in palette
  vec3 findClosestColor(vec3 color, int colorCount) {
    if (colorCount <= 0) return color;
    
    float minDistance = 999999.0;
    vec3 closestColor = color;
    
    for (int i = 0; i < 20; i++) {
      if (i >= colorCount) break;
      
      vec3 paletteColor = uColorPalette[i];
      float distance = length(color - paletteColor);
      
      if (distance < minDistance) {
        minDistance = distance;
        closestColor = paletteColor;
      }
    }
    
    return closestColor;
  }
  
  void main() {
    vec2 uv = vUv;
    vec4 texColor = texture2D(tDiffuse, uv);
    vec3 color = texColor.rgb;
    
    // Find closest color in palette
    vec3 quantizedColor = findClosestColor(color, uColorCount);
    
    gl_FragColor = vec4(quantizedColor, texColor.a);
  }
`;

class ColorPaletteMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      vertexShader,
      fragmentShader,
      uniforms: {
        tDiffuse: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uColorCount: { value: 2 },
        uColorPalette: { value: [] }
      }
    });
  }
  
  // Helper method to set color palette
  setColorPalette(palette) {
    const paletteArray = new Array(20).fill(new THREE.Vector3(0, 0, 0));
    
    for (let i = 0; i < Math.min(palette.length, 20); i++) {
      const hex = palette[i].replace('#', '');
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      paletteArray[i] = new THREE.Vector3(r / 255.0, g / 255.0, b / 255.0);
    }
    
    // Fill remaining slots with last color or black
    const lastColor = paletteArray[Math.min(palette.length - 1, 19)];
    for (let i = palette.length; i < 20; i++) {
      paletteArray[i] = lastColor;
    }
    
    this.uniforms.uColorPalette.value = paletteArray;
  }
}

export default ColorPaletteMaterial;

