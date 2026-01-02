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
  uniform sampler2D tGrid;
  uniform vec2 uResolution;
  uniform vec2 uGridSize;
  uniform float uCellSize;
  
  varying vec2 vUv;
  
  void main() {
    vec2 uv = vUv;
    
    // Calculate pixel coordinates
    vec2 pixelCoord = uv * uResolution;
    
    // Calculate which cell this pixel belongs to
    vec2 cellCoord = floor(pixelCoord / uCellSize);
    
    // Clamp to grid bounds
    cellCoord = clamp(cellCoord, vec2(0.0), uGridSize - vec2(1.0));
    
    // Convert cell coordinates to texture UV coordinates
    vec2 gridUv = (cellCoord + vec2(0.5)) / uGridSize;
    
    // Sample the grid texture
    vec4 gridValue = texture2D(tGrid, gridUv);
    
    // Extract intensity (handle both binary 0/1 and continuous 0-1 values)
    float intensity = gridValue.r / 255.0; // Normalize from 0-255 to 0-1
    
    // Output grayscale color
    gl_FragColor = vec4(intensity, intensity, intensity, 1.0);
  }
`;

class GameOfLifeMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      vertexShader,
      fragmentShader,
      uniforms: {
        tGrid: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uGridSize: { value: new THREE.Vector2(1, 1) },
        uCellSize: { value: 4.0 }
      }
    });
  }
}

export default GameOfLifeMaterial;

