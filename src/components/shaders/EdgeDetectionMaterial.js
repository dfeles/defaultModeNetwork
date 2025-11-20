import * as THREE from 'three';

const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDepth;
  
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mvPosition.z;
    
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  uniform float edgeThreshold;
  uniform vec3 edgeColor;
  uniform float edgeWidth;
  uniform int shadingColors;
  
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDepth;
  
  // Calculate discrete color band based on depth
  vec3 getDepthColor(float depth, float minDepth, float maxDepth, int numColors) {
    if (numColors <= 1) {
      return vec3(1.0);
    }
    
    float normalized = (depth - minDepth) / (maxDepth - minDepth);
    normalized = clamp(normalized, 0.0, 1.0);
    
    int band = int(normalized * float(numColors));
    band = min(band, numColors - 1);
    
    float brightness = 1.0 - (float(band) / float(numColors - 1));
    return vec3(brightness);
  }
  
  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vPosition);
    
    // Edge detection using normal variation
    float edge = 1.0 - abs(dot(normal, viewDir));
    
    // Apply threshold
    if (edge > edgeThreshold) {
      gl_FragColor = vec4(edgeColor, 1.0);
    } else {
      // Base color with depth shading
      vec3 baseColor = vec3(0.9, 0.9, 0.9);
      
      if (shadingColors > 1) {
        // This would need depth range passed as uniforms
        // For now, use simple shading based on normal
        float shade = dot(normal, vec3(0.0, 0.0, 1.0)) * 0.5 + 0.5;
        baseColor *= shade;
      }
      
      gl_FragColor = vec4(baseColor, 1.0);
    }
  }
`;

class EdgeDetectionMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      vertexShader,
      fragmentShader,
      uniforms: {
        edgeThreshold: { value: 0.1 },
        edgeColor: { value: new THREE.Color(0x000000) },
        edgeWidth: { value: 1.0 },
        shadingColors: { value: 1 },
        minDepth: { value: 0.0 },
        maxDepth: { value: 100.0 }
      },
      side: THREE.DoubleSide
    });
  }
}

export default EdgeDetectionMaterial;

