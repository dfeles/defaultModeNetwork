import * as THREE from 'three';
import { 
  applyFloydSteinbergDithering, 
  applyOrderedDithering,
  applyAtkinsonDithering,
  applyJarvisJudiceNinkeDithering,
  applyStuckiDithering,
  applyBurkesDithering,
  applySierraDithering,
  applySierraLiteDithering,
  applyTwoRowSierraDithering,
  applyColorPalette as applyColorPaletteQuantization
} from './dithering';
import { ditherImageData, applyWebGLColorPalette, applyWebGLAscii } from './webglDithering';
import { ASCII_PRESETS } from '../components/shaders/AsciiMaterial';
import { getCharPath } from './asciiCharPaths';

/**
 * Get color band from pixel color (for shading)
 */
function getColorBandFromPixel(r, g, b, numBands, baseColor) {
  if (numBands <= 1) return 0;
  
  // Parse base color
  const hex = baseColor.replace('#', '');
  const baseR = parseInt(hex.substr(0, 2), 16);
  const baseG = parseInt(hex.substr(2, 2), 16);
  const baseB = parseInt(hex.substr(4, 2), 16);
  
  // Calculate brightness relative to base color
  // For grayscale shading, darker = closer to black = higher band number
  const brightness = (r + g + b) / 3;
  const maxBrightness = 255;
  
  // Normalize brightness (0 = black, 1 = white)
  const normalized = brightness / maxBrightness;
  
  // Map to band (inverse: darker = higher band)
  const band = Math.floor((1 - normalized) * numBands);
  return Math.min(band, numBands - 1);
}

/**
 * Get color for a band
 */
function getColorForBand(band, numBands, baseColor) {
  if (numBands <= 1) return baseColor;
  
  const brightness = 1.0 - (band / (numBands - 1));
  
  if (baseColor === '#000000' || baseColor === 'black') {
    const gray = Math.floor(brightness * 255);
    return `#${gray.toString(16).padStart(2, '0').repeat(3)}`;
  }
  
  // Parse hex color
  const hex = baseColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  const newR = Math.floor(r + (255 - r) * brightness);
  const newG = Math.floor(g + (255 - g) * brightness);
  const newB = Math.floor(b + (255 - b) * brightness);
  
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

/**
 * Trace edges from image data and convert to SVG paths
 * Uses marching squares algorithm to trace contours
 * Groups edges by color band if shading is enabled
 */
function traceEdgesFromImageData(imageData, width, height, edgeColor = '#000000', numShadingColors = 1) {
  const data = imageData.data;
  
  // Parse edge color
  const hex = edgeColor.replace('#', '');
  const targetR = parseInt(hex.substr(0, 2), 16);
  const targetG = parseInt(hex.substr(2, 2), 16);
  const targetB = parseInt(hex.substr(4, 2), 16);
  
  // Create edge map with color bands
  // Map: pixel index -> { isEdge: bool, band: number, color: string }
  const edgeMap = new Map();
  let edgePixelCount = 0;
  
  // The shader renders edges in black and surfaces in light gray/white
  // We need to detect only the very dark edge pixels, not the shaded surfaces
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    
    // Calculate brightness
    const brightness = (r + g + b) / 3;
    
    // Check if pixel matches edge color closely
    const colorDist = Math.abs(r - targetR) + Math.abs(g - targetG) + Math.abs(b - targetB);
    
    // Only mark as edge if:
    // 1. Very dark (brightness < 30) - actual black edges
    // 2. OR matches edge color very closely (within 30 color distance)
    // This excludes shaded surfaces which are lighter gray
    const isVeryDark = brightness < 30;
    const matchesEdgeColor = colorDist < 30;
    
    if (isVeryDark || matchesEdgeColor) {
      // Determine color band for this edge pixel
      const band = getColorBandFromPixel(r, g, b, numShadingColors, edgeColor);
      const color = numShadingColors > 1 ? getColorForBand(band, numShadingColors, edgeColor) : edgeColor;
      
      edgeMap.set(i, { isEdge: true, band, color });
      edgePixelCount++;
    } else {
      edgeMap.set(i, { isEdge: false, band: 0, color: null });
    }
  }
  
  console.log(`Edge map created: ${edgePixelCount} edge pixels out of ${width * height} (${(edgePixelCount / (width * height) * 100).toFixed(2)}%)`);
  
  // Trace contours using marching squares, grouped by color
  const contoursByColor = new Map();
  const visited = new Uint8Array(width * height);
  
  // Marching squares lookup table for line segments
  // Each cell has 4 corners, each can be 0 or 1, giving 16 cases (0-15)
  const marchingSquaresTable = {
    0: [],
    1: [[0, 3]], // bottom-left
    2: [[1, 0]], // top-left
    3: [[1, 3]], // left side
    4: [[2, 1]], // top-right
    5: [[0, 3], [2, 1]], // diagonal
    6: [[2, 0]], // top side
    7: [[2, 3]], // top-left to bottom-right
    8: [[3, 2]], // bottom-right
    9: [[0, 2]], // bottom side
    10: [[1, 0], [3, 2]], // diagonal
    11: [[1, 2]], // left to top-right
    12: [[3, 1]], // right side
    13: [[0, 1]], // bottom-left to top
    14: [[3, 0]], // bottom to right
    15: []
  };
  
  // Edge midpoint positions: [left, top, right, bottom]
  const edgeMidpoints = [
    [0, 0.5],    // 0: left edge
    [0.5, 0],    // 1: top edge
    [1, 0.5],    // 2: right edge
    [0.5, 1]     // 3: bottom edge
  ];
  
  // Trace contours, grouping by color
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const idx = y * width + x;
      if (visited[idx]) continue;
      
      // Get the 2x2 cell configuration
      const tlData = edgeMap.get(idx) || { isEdge: false };
      const trData = edgeMap.get(idx + 1) || { isEdge: false };
      const blData = edgeMap.get(idx + width) || { isEdge: false };
      const brData = edgeMap.get(idx + width + 1) || { isEdge: false };
      
      const tl = tlData.isEdge ? 1 : 0;
      const tr = trData.isEdge ? 1 : 0;
      const bl = blData.isEdge ? 1 : 0;
      const br = brData.isEdge ? 1 : 0;
      
      const cellConfig = tl * 1 + tr * 2 + br * 4 + bl * 8;
      
      if (cellConfig === 0 || cellConfig === 15) continue; // No edge or fully filled
      
      const segments = marchingSquaresTable[cellConfig];
      if (!segments || segments.length === 0) continue;
      
      // Determine color for this cell (use most common color in the 2x2 cell)
      const colors = [tlData.color, trData.color, blData.color, brData.color].filter(c => c);
      const cellColor = colors.length > 0 ? colors[0] : edgeColor; // Use first non-null color
      
      if (!contoursByColor.has(cellColor)) {
        contoursByColor.set(cellColor, []);
      }
      
      // Add line segments to contour
      segments.forEach(([start, end]) => {
        const startPos = edgeMidpoints[start];
        const endPos = edgeMidpoints[end];
        
        contoursByColor.get(cellColor).push({
          x1: x + startPos[0],
          y1: y + startPos[1],
          x2: x + endPos[0],
          y2: y + endPos[1]
        });
      });
      
      visited[idx] = 1;
    }
  }
  
  return contoursByColor;
}

/**
 * Connect line segments into continuous paths (optimized)
 */
function connectSegments(segments, tolerance = 0.5) {
  if (segments.length === 0) return [];
  
  const paths = [];
  const used = new Set();
  
  // Build spatial index for faster lookup
  const spatialIndex = new Map();
  const getKey = (x, y) => `${Math.floor(x / tolerance)},${Math.floor(y / tolerance)}`;
  
  segments.forEach((seg, idx) => {
    const key1 = getKey(seg.x1, seg.y1);
    const key2 = getKey(seg.x2, seg.y2);
    if (!spatialIndex.has(key1)) spatialIndex.set(key1, []);
    if (!spatialIndex.has(key2)) spatialIndex.set(key2, []);
    spatialIndex.get(key1).push({ idx, point: {x: seg.x1, y: seg.y1}, other: {x: seg.x2, y: seg.y2} });
    spatialIndex.get(key2).push({ idx, point: {x: seg.x2, y: seg.y2}, other: {x: seg.x1, y: seg.y1} });
  });
  
  const distance = (p1, p2) => {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  };
  
  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue;
    
    const path = [{x: segments[i].x1, y: segments[i].y1}, {x: segments[i].x2, y: segments[i].y2}];
    used.add(i);
    
    let extended = true;
    while (extended) {
      extended = false;
      const pathEnd = path[path.length - 1];
      const key = getKey(pathEnd.x, pathEnd.y);
      const candidates = spatialIndex.get(key) || [];
      
      // Find next connecting segment using spatial index
      for (const candidate of candidates) {
        if (used.has(candidate.idx)) continue;
        
        if (distance(pathEnd, candidate.point) < tolerance) {
          path.push(candidate.other);
          used.add(candidate.idx);
          extended = true;
          break;
        }
      }
    }
    
    if (path.length > 1) {
      paths.push(path);
    }
  }
  
  return paths;
}

/**
 * Export the current 3D scene view as SVG using geometry-based method
 */
export function exportSceneToSVG(scene, camera, renderer, options = {}) {
  const {
    width = 800,
    height = 800,
    edgeSettings = {},
    meshData = null,
    applyDithering = false // Whether to apply dithering (for future use)
  } = options;

  // Always use geometry-based export
  return exportSceneToSVGGeometry(scene, camera, renderer, options);
}


/**
 * Geometry-based export: extracts edges directly from mesh data
 */
function exportSceneToSVGGeometry(scene, camera, renderer, options = {}) {
  const {
    width = 800,
    height = 800,
    edgeSettings = {},
    meshData = null
  } = options;

  // Create SVG header
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
`;

  if (!meshData || !meshData.geometry) {
    svg += '</svg>';
    return svg;
  }

  try {
    console.log('Exporting using geometry-based method...');
    
    // Get geometry
    const geometry = meshData.geometry;
    const positions = geometry.attributes.position;
    const indices = geometry.index;

    // Get mesh from scene to get world transform
    let mesh = null;
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry === geometry) {
        mesh = child;
      }
    });

    // Project 3D vertices to 2D
    const vertices2D = [];
    const vertices3D = [];
    const depths = [];

    for (let i = 0; i < positions.count; i++) {
      const vertex = new THREE.Vector3(
        positions.getX(i),
        positions.getY(i),
        positions.getZ(i)
      );

      // Apply mesh world matrix if available
      if (mesh) {
        vertex.applyMatrix4(mesh.matrixWorld);
      }

      // Transform to camera space
      const projected = vertex.clone().applyMatrix4(camera.matrixWorldInverse);
      depths.push(-projected.z);

      // Project to 2D
      const projected2D = vertex.clone().project(camera);
      
      // Convert to SVG coordinates
      const x = (projected2D.x * 0.5 + 0.5) * width;
      const y = (1 - (projected2D.y * 0.5 + 0.5)) * height; // Flip Y axis
      
      vertices2D.push({ x, y });
      vertices3D.push(vertex);
    }

    // Get camera position for edge detection
    const cameraWorldPos = new THREE.Vector3();
    camera.getWorldPosition(cameraWorldPos);
    // More aggressive edge threshold (higher = fewer edges)
    // Default to 0.15 instead of 0.1 for fewer edges
    const edgeThreshold = edgeSettings.threshold !== undefined ? edgeSettings.threshold : 0.15;

    // Helper to check if a face is front-facing
    function isFrontFacing(v1, v2, v3) {
      const p1 = vertices3D[v1];
      const p2 = vertices3D[v2];
      const p3 = vertices3D[v3];
      
      const edge1 = new THREE.Vector3().subVectors(p2, p1);
      const edge2 = new THREE.Vector3().subVectors(p3, p1);
      const faceNormal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
      
      const faceCenter = new THREE.Vector3()
        .add(p1)
        .add(p2)
        .add(p3)
        .multiplyScalar(1/3);
      
      const toCamera = new THREE.Vector3().subVectors(cameraWorldPos, faceCenter).normalize();
      
      return faceNormal.dot(toCamera) > 0;
    }

    // Helper to calculate edge value (same as shader)
    function calculateEdgeValue(faceNormal, faceCenter) {
      const viewDir = new THREE.Vector3().subVectors(cameraWorldPos, faceCenter).normalize();
      const dotProduct = Math.abs(faceNormal.dot(viewDir));
      return 1 - dotProduct; // edge = 1 - abs(dot(normal, viewDir))
    }

    // Build edge-to-faces mapping
    const edgeToFaces = new Map();
    
    const addEdgeToMap = (v1, v2, faceData) => {
      const key = v1 < v2 ? `${v1}-${v2}` : `${v2}-${v1}`;
      if (!edgeToFaces.has(key)) {
        edgeToFaces.set(key, []);
      }
      edgeToFaces.get(key).push(faceData);
    };

    // Process all triangles
    if (indices && indices.count > 0) {
      const indexArray = indices.array;
      for (let i = 0; i < indices.count; i += 3) {
        const i1 = indexArray[i];
        const i2 = indexArray[i + 1];
        const i3 = indexArray[i + 2];
        
        if (i1 >= depths.length || i2 >= depths.length || i3 >= depths.length) continue;
        if (!isFrontFacing(i1, i2, i3)) continue;
        
        const p1 = vertices3D[i1];
        const p2 = vertices3D[i2];
        const p3 = vertices3D[i3];
        const edge1 = new THREE.Vector3().subVectors(p2, p1);
        const edge2 = new THREE.Vector3().subVectors(p3, p1);
        const faceNormal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
        
        const faceCenter = new THREE.Vector3().add(p1).add(p2).add(p3).multiplyScalar(1/3);
        const edgeValue = calculateEdgeValue(faceNormal, faceCenter);
        const faceDepth = (depths[i1] + depths[i2] + depths[i3]) / 3;
        
        const faceData = { normal: faceNormal, center: faceCenter, edgeValue, depth: faceDepth };
        
        addEdgeToMap(i1, i2, faceData);
        addEdgeToMap(i2, i3, faceData);
        addEdgeToMap(i3, i1, faceData);
      }
    } else {
      const triangleCount = Math.floor(positions.count / 3);
      for (let i = 0; i < triangleCount; i++) {
        const i1 = i * 3;
        const i2 = i * 3 + 1;
        const i3 = i * 3 + 2;
        
        if (i1 >= depths.length || i2 >= depths.length || i3 >= depths.length) continue;
        if (!isFrontFacing(i1, i2, i3)) continue;
        
        const p1 = vertices3D[i1];
        const p2 = vertices3D[i2];
        const p3 = vertices3D[i3];
        const edge1 = new THREE.Vector3().subVectors(p2, p1);
        const edge2 = new THREE.Vector3().subVectors(p3, p1);
        const faceNormal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
        
        const faceCenter = new THREE.Vector3().add(p1).add(p2).add(p3).multiplyScalar(1/3);
        const edgeValue = calculateEdgeValue(faceNormal, faceCenter);
        const faceDepth = (depths[i1] + depths[i2] + depths[i3]) / 3;
        
        const faceData = { normal: faceNormal, center: faceCenter, edgeValue, depth: faceDepth };
        
        addEdgeToMap(i1, i2, faceData);
        addEdgeToMap(i2, i3, faceData);
        addEdgeToMap(i3, i1, faceData);
      }
    }

    // Calculate depth range for shading
    let minDepth = Infinity;
    let maxDepth = -Infinity;
    for (let i = 0; i < depths.length; i++) {
      if (depths[i] < minDepth) minDepth = depths[i];
      if (depths[i] > maxDepth) maxDepth = depths[i];
    }
    if (minDepth === Infinity) minDepth = 0;
    if (maxDepth === -Infinity) maxDepth = 0;

    // Collect edges that should be drawn, grouped by color
    const edgesByColor = new Map();
    const numShadingColors = edgeSettings.shadingColors || 1;
    const baseColor = edgeSettings.color || '#000000';
    const wireframeMode = options.wireframeMode || false;
    
    // Get minimum edge length in 2D space (for filtering) - very aggressive default
    const minEdgeLength2D = edgeSettings.minEdgeLength2D !== undefined ? edgeSettings.minEdgeLength2D : 2.0; // Minimum edge length in pixels
    
    if (wireframeMode) {
      // Wireframe mode: render all edges of front-facing triangles with lighting-based coloring
      // Paper.js style lighting: light from top-left, surfaces facing light are white, away are black
      const lightDirection = new THREE.Vector3(-0.5, 0.5, 1).normalize(); // Top-left light direction
      
      // First pass: collect all front-facing face edges with their normals
      const allEdges = new Map(); // edgeKey -> { faces: [...], normals: [...], depths: [] }
      
      if (indices && indices.count > 0) {
        const indexArray = indices.array;
        for (let i = 0; i < indices.count; i += 3) {
          const i1 = indexArray[i];
          const i2 = indexArray[i + 1];
          const i3 = indexArray[i + 2];
          
          if (i1 >= depths.length || i2 >= depths.length || i3 >= depths.length) continue;
          if (!isFrontFacing(i1, i2, i3)) continue;
          
          // Calculate face normal
          const p1 = vertices3D[i1];
          const p2 = vertices3D[i2];
          const p3 = vertices3D[i3];
          const edge1 = new THREE.Vector3().subVectors(p2, p1);
          const edge2 = new THREE.Vector3().subVectors(p3, p1);
          const faceNormal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
          
          // This face is front-facing, add its edges
          const faceDepth = (depths[i1] + depths[i2] + depths[i3]) / 3;
          const edges = [
            [Math.min(i1, i2), Math.max(i1, i2)],
            [Math.min(i2, i3), Math.max(i2, i3)],
            [Math.min(i3, i1), Math.max(i3, i1)]
          ];
          
          edges.forEach(([v1, v2]) => {
            const edgeKey = `${v1}-${v2}`;
            if (!allEdges.has(edgeKey)) {
              allEdges.set(edgeKey, { faces: [], normals: [], depths: [] });
            }
            allEdges.get(edgeKey).faces.push([i1, i2, i3]);
            allEdges.get(edgeKey).normals.push(faceNormal);
            allEdges.get(edgeKey).depths.push(faceDepth);
          });
        }
      } else {
        const triangleCount = Math.floor(positions.count / 3);
        for (let i = 0; i < triangleCount; i++) {
          const i1 = i * 3;
          const i2 = i * 3 + 1;
          const i3 = i * 3 + 2;
          
          if (i1 >= depths.length || i2 >= depths.length || i3 >= depths.length) continue;
          if (!isFrontFacing(i1, i2, i3)) continue;
          
          // Calculate face normal
          const p1 = vertices3D[i1];
          const p2 = vertices3D[i2];
          const p3 = vertices3D[i3];
          const edge1 = new THREE.Vector3().subVectors(p2, p1);
          const edge2 = new THREE.Vector3().subVectors(p3, p1);
          const faceNormal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
          
          // This face is front-facing, add its edges
          const faceDepth = (depths[i1] + depths[i2] + depths[i3]) / 3;
          const edges = [
            [Math.min(i1, i2), Math.max(i1, i2)],
            [Math.min(i2, i3), Math.max(i2, i3)],
            [Math.min(i3, i1), Math.max(i3, i1)]
          ];
          
          edges.forEach(([v1, v2]) => {
            const edgeKey = `${v1}-${v2}`;
            if (!allEdges.has(edgeKey)) {
              allEdges.set(edgeKey, { faces: [], normals: [], depths: [] });
            }
            allEdges.get(edgeKey).faces.push([i1, i2, i3]);
            allEdges.get(edgeKey).normals.push(faceNormal);
            allEdges.get(edgeKey).depths.push(faceDepth);
          });
        }
      }
      
      // Second pass: calculate lighting for each edge and assign color
      allEdges.forEach((edgeData, edgeKey) => {
        const [v1, v2] = edgeKey.split('-').map(Number);
        
        // Check 2D edge length first (fast rejection)
        const p1 = vertices2D[v1];
        const p2 = vertices2D[v2];
        if (!p1 || !p2) return;
        
        const edgeLength2D = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
        if (edgeLength2D < minEdgeLength2D) return; // Skip very short edges
        
        // Calculate lighting based on face normals
        // Average the lighting from all faces sharing this edge
        let totalLighting = 0;
        edgeData.normals.forEach(normal => {
          // Dot product with light direction gives lighting (0 = dark, 1 = bright)
          // Clamp to 0-1 range and add ambient light (0.2) for better visibility
          const lighting = Math.max(0, normal.dot(lightDirection));
          totalLighting += lighting;
        });
        const avgLighting = totalLighting / edgeData.normals.length;
        
        // Apply ambient light: lighting ranges from 0.2 (dark) to 1.0 (bright)
        const finalLighting = 0.2 + (avgLighting * 0.8);
        
        // Calculate color based on lighting and shading settings
        let color = baseColor;
        if (numShadingColors > 1) {
          // Use lighting to determine color band (0 = black, 1 = white)
          // Map lighting (0.2-1.0) to color bands
          const normalizedLighting = (finalLighting - 0.2) / 0.8; // Normalize to 0-1
          const band = Math.floor(normalizedLighting * numShadingColors);
          const clampedBand = Math.min(Math.max(0, band), numShadingColors - 1);
          
          // Calculate brightness: 0 = black, 1 = white
          const brightness = 1.0 - (clampedBand / (numShadingColors - 1));
          
          // Convert brightness to hex color
          const gray = Math.floor(brightness * 255);
          const hex = gray.toString(16).padStart(2, '0');
          color = `#${hex}${hex}${hex}`;
        } else {
          // Single color mode: use base color
          color = baseColor;
        }
        
        if (!edgesByColor.has(color)) {
          edgesByColor.set(color, []);
        }
        edgesByColor.get(color).push([v1, v2]);
      });
      
      console.log(`Wireframe mode: Found ${allEdges.size} unique edges from front-facing faces with lighting-based coloring`);
    } else {
      // Original edge detection mode
      edgeToFaces.forEach((faces, edgeKey) => {
        const [v1, v2] = edgeKey.split('-').map(Number);
        
        // Check 2D edge length first (fast rejection)
        const p1 = vertices2D[v1];
        const p2 = vertices2D[v2];
        if (!p1 || !p2) return;
        
        const edgeLength2D = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
        if (edgeLength2D < minEdgeLength2D) return; // Skip very short edges
        
        const avgDepth = (depths[v1] + depths[v2]) / 2;
        
        let shouldInclude = false;
        
        if (faces.length === 1) {
          // Silhouette edge - check if edge value exceeds threshold
          if (faces[0].edgeValue > edgeThreshold) {
            shouldInclude = true;
          }
        } else {
          // Shared edge - check if normals differ significantly (boundary edge)
          const f1 = faces[0];
          const f2 = faces[1];
          const dot = f1.normal.dot(f2.normal);
          
          // More aggressive: only include if normals differ significantly (angle > ~45 degrees)
          // Changed from 0.866 (30°) to 0.707 (45°) to reduce edges
          if (dot < 0.707) {
            shouldInclude = true;
          }
        }
        
        if (shouldInclude) {
          // Calculate color based on depth and shading settings
          let color = baseColor;
          if (numShadingColors > 1) {
            color = getDepthColor(avgDepth, minDepth, maxDepth, numShadingColors, baseColor);
          }
          
          if (!edgesByColor.has(color)) {
            edgesByColor.set(color, []);
          }
          edgesByColor.get(color).push([v1, v2]);
        }
      });
    }

    console.log(`Found edges in ${edgesByColor.size} color groups`);

    // Get optimization settings (very aggressive defaults for much smaller file size)
    // For wireframe mode, use tighter tolerances to ensure edges connect properly
    const optimizeSettings = {
      minEdgeLength: edgeSettings.minEdgeLength !== undefined ? edgeSettings.minEdgeLength : (wireframeMode ? 0.5 : 2.0),      // Filter edges shorter than this (pixels)
      simplifyEpsilon: edgeSettings.simplifyEpsilon !== undefined ? edgeSettings.simplifyEpsilon : (wireframeMode ? 0.5 : 2.0),  // Path simplification tolerance (higher = more aggressive)
      mergeTolerance: edgeSettings.mergeTolerance !== undefined ? edgeSettings.mergeTolerance : (wireframeMode ? 0.5 : 2.0),    // Merge nearby points - tighter for wireframe
      removeColinear: edgeSettings.removeColinear !== false, // Remove colinear points
      coordinatePrecision: edgeSettings.coordinatePrecision !== undefined ? edgeSettings.coordinatePrecision : 0 // Decimal places (0 = integer precision, smallest file size)
    };

    // Optimize edges for pen plotting, grouped by color
    const pathsByColor = new Map();
    let totalEdgesBefore = 0;
    let totalPathsAfter = 0;
    
    edgesByColor.forEach((edges, color) => {
      totalEdgesBefore += edges.length;
      const paths = connectGeometryEdges(edges, vertices2D, optimizeSettings);
      totalPathsAfter += paths.length;
      pathsByColor.set(color, paths);
    });

    console.log(`Optimization: ${totalEdgesBefore} edges → ${totalPathsAfter} paths (${((1 - totalPathsAfter / totalEdgesBefore) * 100).toFixed(1)}% reduction)`);

    // Clean up large intermediate arrays to free memory (after they're no longer needed)
    // Note: Must be done AFTER connectGeometryEdges calls since it uses vertices2D
    vertices2D.length = 0;
    vertices3D.length = 0;
    depths.length = 0;

    const strokeWidth = edgeSettings.width || 1;
    const precision = optimizeSettings.coordinatePrecision;
    
    // Automatic path limiting: estimate file size and limit if needed
    // Rough estimate: ~50-100 bytes per path on average
    const estimatedBytesPerPath = 80;
    const targetMaxBytes = 500 * 1024; // 500KB target
    const estimatedMaxPaths = Math.floor(targetMaxBytes / estimatedBytesPerPath);
    
    // Use explicit maxPaths if set, otherwise use automatic limit
    const maxPaths = edgeSettings.maxPaths !== undefined 
      ? edgeSettings.maxPaths 
      : (totalPathsAfter > estimatedMaxPaths ? estimatedMaxPaths : null);

    svg += '  <g id="edges">\n';
    
    let totalPathsAdded = 0;
    const shouldStop = () => maxPaths && totalPathsAdded >= maxPaths;
    
    if (maxPaths) {
      console.log(`Auto-limiting to ${maxPaths} paths to target ~${(maxPaths * estimatedBytesPerPath / 1024).toFixed(0)}KB file size`);
    }
    
    pathsByColor.forEach((paths, color) => {
      if (shouldStop()) return;
      
      // Sort paths by length (longest first) to prioritize important paths
      const sortedPaths = [...paths].sort((a, b) => {
        const lenA = a.length > 1 ? distance(a[0], a[a.length - 1]) : 0;
        const lenB = b.length > 1 ? distance(b[0], b[b.length - 1]) : 0;
        return lenB - lenA;
      });
      
      sortedPaths.forEach(path => {
        if (shouldStop()) return;
        if (path.length < 2) return;
        
        // Use reduced precision for coordinates (round to integers if precision is 0)
        const formatCoord = (val) => {
          if (precision === 0) {
            return Math.round(val).toString();
          }
          return val.toFixed(precision);
        };
        
        let pathData = `M ${formatCoord(path[0].x)},${formatCoord(path[0].y)}`;
        for (let i = 1; i < path.length; i++) {
          pathData += ` L ${formatCoord(path[i].x)},${formatCoord(path[i].y)}`;
        }
        
        svg += `    <path d="${pathData}" stroke="${color}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>\n`;
        totalPathsAdded++;
      });
    });
    
    if (maxPaths && totalPathsAdded >= maxPaths) {
      console.log(`Limited to ${maxPaths} paths (from ${totalPathsAfter} total)`);
    }
    
    svg += '  </g>\n';
    
    // Clean up large intermediate data structures to free memory
    edgesByColor.clear();
    pathsByColor.clear();
    edgeToFaces.clear();
    
  } catch (error) {
    console.error('Error in geometry export:', error);
    svg += '  <!-- Error: ' + error.message + ' -->\n';
  }

  svg += '</svg>';
  return svg;
}

/**
 * Calculate distance between two points
 */
function distance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Remove colinear points from a path (simplifies paths significantly)
 */
function removeColinearPoints(path, angleTolerance = 0.05) {
  if (path.length < 3) return path;
  
  const simplified = [path[0]];
  
  for (let i = 1; i < path.length - 1; i++) {
    const p0 = path[i - 1];
    const p1 = path[i];
    const p2 = path[i + 1];
    
    // Calculate vectors
    const v1 = { x: p1.x - p0.x, y: p1.y - p0.y };
    const v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
    
    // Calculate lengths
    const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    
    // Skip if either vector is too short (more aggressive threshold)
    if (len1 < 1.0 || len2 < 1.0) {
      simplified.push(p1);
      continue;
    }
    
    // Normalize vectors
    const n1 = { x: v1.x / len1, y: v1.y / len1 };
    const n2 = { x: v2.x / len2, y: v2.y / len2 };
    
    // Calculate dot product (1 = colinear, 0 = perpendicular)
    const dot = n1.x * n2.x + n1.y * n2.y;
    
    // If not colinear (within tolerance), keep the point
    // More aggressive: higher tolerance removes more points
    if (Math.abs(1 - dot) > angleTolerance) {
      simplified.push(p1);
    }
  }
  
  simplified.push(path[path.length - 1]);
  return simplified;
}

/**
 * Simplify path using Douglas-Peucker algorithm (more aggressive simplification)
 */
function simplifyPath(path, epsilon = 0.5) {
  if (path.length < 3) return path;
  
  // Find the point with maximum distance from line between start and end
  let maxDist = 0;
  let maxIndex = 0;
  const start = path[0];
  const end = path[path.length - 1];
  
  for (let i = 1; i < path.length - 1; i++) {
    const dist = pointToLineDistance(path[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }
  
  // If max distance is greater than epsilon, recursively simplify
  if (maxDist > epsilon) {
    // Recursively simplify both halves
    const left = simplifyPath(path.slice(0, maxIndex + 1), epsilon);
    const right = simplifyPath(path.slice(maxIndex), epsilon);
    
    // Combine results (remove duplicate point at junction)
    return [...left.slice(0, -1), ...right];
  } else {
    // All points are within epsilon, return just start and end
    return [start, end];
  }
}

/**
 * Calculate distance from point to line segment
 */
function pointToLineDistance(point, lineStart, lineEnd) {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  
  if (lenSq !== 0) param = dot / lenSq;
  
  let xx, yy;
  
  if (param < 0) {
    xx = lineStart.x;
    yy = lineStart.y;
  } else if (param > 1) {
    xx = lineEnd.x;
    yy = lineEnd.y;
  } else {
    xx = lineStart.x + param * C;
    yy = lineStart.y + param * D;
  }
  
  const dx = point.x - xx;
  const dy = point.y - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Connect geometry edges into continuous paths (optimized)
 */
function connectGeometryEdges(edges, vertices2D, options = {}) {
  if (edges.length === 0) return [];

  const {
    minEdgeLength = 2.0,      // Minimum edge length in pixels (aggressive default)
    simplifyEpsilon = 2.0,    // Path simplification tolerance (aggressive default)
    mergeTolerance = 2.0,     // Tolerance for merging nearby points (aggressive default)
    removeColinear = true     // Remove colinear points
  } = options;

  // Convert to line segments and filter by minimum length
  const lines = [];
  const seen = new Set();
  
  for (const [v1, v2] of edges) {
    const p1 = vertices2D[v1];
    const p2 = vertices2D[v2];
    if (!p1 || !p2) continue;
    
    // Filter out very short edges
    const edgeLength = distance(p1, p2);
    if (edgeLength < minEdgeLength) continue;
    
    // Normalize edge direction
    const normalized = p1.x < p2.x || (p1.x === p2.x && p1.y < p2.y)
      ? { start: p1, end: p2 }
      : { start: p2, end: p1 };
    
    // Check for duplicates with higher precision
    const key = `${Math.round(normalized.start.x / mergeTolerance)},${Math.round(normalized.start.y / mergeTolerance)}-${Math.round(normalized.end.x / mergeTolerance)},${Math.round(normalized.end.y / mergeTolerance)}`;
    if (!seen.has(key)) {
      seen.add(key);
      lines.push(normalized);
    }
  }

  console.log(`Filtered to ${lines.length} edges (from ${edges.length} original)`);

  // Build spatial index
  const spatialIndex = new Map();
  const getKey = (x, y) => `${Math.floor(x / mergeTolerance)},${Math.floor(y / mergeTolerance)}`;
  
  lines.forEach((line, idx) => {
    const key1 = getKey(line.start.x, line.start.y);
    const key2 = getKey(line.end.x, line.end.y);
    if (!spatialIndex.has(key1)) spatialIndex.set(key1, []);
    if (!spatialIndex.has(key2)) spatialIndex.set(key2, []);
    spatialIndex.get(key1).push({ idx, point: line.start, other: line.end });
    spatialIndex.get(key2).push({ idx, point: line.end, other: line.start });
  });

  // Connect into paths
  const paths = [];
  const used = new Set();
  
  // Helper to get neighboring grid cells for better connection matching
  const getNeighborKeys = (x, y) => {
    const baseKey = getKey(x, y);
    const [baseX, baseY] = baseKey.split(',').map(Number);
    return [
      `${baseX},${baseY}`,     // center
      `${baseX - 1},${baseY}`, // left
      `${baseX + 1},${baseY}`, // right
      `${baseX},${baseY - 1}`, // top
      `${baseX},${baseY + 1}`, // bottom
      `${baseX - 1},${baseY - 1}`, // top-left
      `${baseX + 1},${baseY - 1}`, // top-right
      `${baseX - 1},${baseY + 1}`, // bottom-left
      `${baseX + 1},${baseY + 1}`, // bottom-right
    ];
  };
  
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    
    const path = [lines[i].start, lines[i].end];
    used.add(i);
    
    let extended = true;
    while (extended) {
      extended = false;
      const pathEnd = path[path.length - 1];
      
      // Check center and neighboring grid cells for better connection
      const neighborKeys = getNeighborKeys(pathEnd.x, pathEnd.y);
      const candidates = [];
      neighborKeys.forEach(key => {
        const cellCandidates = spatialIndex.get(key) || [];
        candidates.push(...cellCandidates);
      });
      
      // Find the best matching candidate (closest point within tolerance)
      let bestCandidate = null;
      let bestDistance = Infinity;
      
      for (const candidate of candidates) {
        if (used.has(candidate.idx)) continue;
        
        const dist = distance(pathEnd, candidate.point);
        if (dist < mergeTolerance && dist < bestDistance) {
          bestDistance = dist;
          bestCandidate = candidate;
        }
      }
      
      if (bestCandidate) {
        path.push(bestCandidate.other);
        used.add(bestCandidate.idx);
        extended = true;
      }
    }
    
    // Also extend backward from the start
    extended = true;
    while (extended) {
      extended = false;
      const pathStart = path[0];
      
      // Check center and neighboring grid cells for better connection
      const neighborKeys = getNeighborKeys(pathStart.x, pathStart.y);
      const candidates = [];
      neighborKeys.forEach(key => {
        const cellCandidates = spatialIndex.get(key) || [];
        candidates.push(...cellCandidates);
      });
      
      // Find the best matching candidate (closest point within tolerance)
      let bestCandidate = null;
      let bestDistance = Infinity;
      
      for (const candidate of candidates) {
        if (used.has(candidate.idx)) continue;
        
        const dist = distance(pathStart, candidate.point);
        if (dist < mergeTolerance && dist < bestDistance) {
          bestDistance = dist;
          bestCandidate = candidate;
        }
      }
      
      if (bestCandidate) {
        path.unshift(bestCandidate.other);
        used.add(bestCandidate.idx);
        extended = true;
      }
    }
    
    if (path.length > 1) {
      // Merge nearby points in the path
      const mergedPath = [];
      for (let j = 0; j < path.length; j++) {
        if (j === 0 || j === path.length - 1) {
          mergedPath.push(path[j]);
        } else {
          const prev = mergedPath[mergedPath.length - 1];
          if (distance(prev, path[j]) > mergeTolerance) {
            mergedPath.push(path[j]);
          }
        }
      }
      
      // Remove colinear points (less aggressive for wireframe to preserve structure)
      const colinearTolerance = mergeTolerance < 1.0 ? 0.02 : 0.1; // Tighter tolerance for wireframe
      let simplified = removeColinear ? removeColinearPoints(mergedPath, colinearTolerance) : mergedPath;
      
      // Apply Douglas-Peucker simplification if path is long enough
      // Use less aggressive simplification for wireframe to preserve edge connections
      if (simplified.length > 3 && simplifyEpsilon > 0) {
        const simplificationEpsilon = mergeTolerance < 1.0 ? Math.min(simplifyEpsilon, 0.5) : simplifyEpsilon;
        simplified = simplifyPath(simplified, simplificationEpsilon);
      }
      
      // Filter out very short paths (aggressive filtering)
      if (simplified.length >= 2) {
        // Calculate total path length
        let pathLength = 0;
        for (let j = 1; j < simplified.length; j++) {
          pathLength += distance(simplified[j - 1], simplified[j]);
        }
        
        // Only keep paths longer than minimum edge length
        if (pathLength >= minEdgeLength) {
          paths.push(simplified);
        }
      }
    }
  }
  
  console.log(`Created ${paths.length} paths (average ${paths.length > 0 ? (lines.length / paths.length).toFixed(1) : 0} edges per path)`);
  
  return paths;
}

/**
 * Get color for depth-based shading
 */
function getDepthColor(depth, minDepth, maxDepth, numColors, baseColor) {
  if (numColors <= 1 || maxDepth === minDepth) {
    return baseColor || '#000000';
  }

  const normalized = (depth - minDepth) / (maxDepth - minDepth);
  const band = Math.floor(Math.min(normalized * numColors, numColors - 1));
  const brightness = 1.0 - (band / (numColors - 1));

  if (baseColor === '#000000' || baseColor === 'black') {
    const gray = Math.floor(brightness * 255);
    return `#${gray.toString(16).padStart(2, '0').repeat(3)}`;
  }

  // Parse hex color
  const hex = baseColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  const newR = Math.floor(r + (255 - r) * brightness);
  const newG = Math.floor(g + (255 - g) * brightness);
  const newB = Math.floor(b + (255 - b) * brightness);

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

/**
 * Convert RGB to hex color
 */
function rgbToHex(r, g, b) {
  return `#${[r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('')}`;
}

/**
 * Get SVG path for a character using preset line-based icons
 * Characters are represented as simple geometric patterns
 * This now uses the shared utility function
 */
function charToPath(char, cellSize) {
  const path = getCharPath(char, cellSize);
  
  if (!path) return null;
  
  return {
    path: path,
    width: cellSize,
    height: cellSize
  };
}

/**
 * Merge adjacent rectangles of the same color (union and flatten)
 * This significantly reduces file size by combining pixel-level rectangles into larger shapes
 * Uses iterative passes until no more merges are possible
 */
function mergeRectangles(rects) {
  if (rects.length === 0) return [];
  
  const EPSILON = 0.01; // Tolerance for floating point comparisons
  const initialCount = rects.length;
  
  // Round coordinates to avoid floating point issues
  let merged = rects.map(r => ({
    x: Math.round(r.x * 100) / 100,
    y: Math.round(r.y * 100) / 100,
    width: Math.round(r.width * 100) / 100,
    height: Math.round(r.height * 100) / 100
  }));
  
  let previousCount = merged.length;
  let iterations = 0;
  const maxIterations = 10; // Safety limit
  
  // Iterate until no more merges are possible
  while (iterations < maxIterations) {
    iterations++;
    
    // Pass 1: Merge horizontally (left to right)
    merged = mergeHorizontally(merged, EPSILON);
    
    // Pass 2: Merge vertically (top to bottom)
    merged = mergeVertically(merged, EPSILON);
    
    // Check if we made progress
    if (merged.length === previousCount) {
      // No more merges possible
      break;
    }
    
    previousCount = merged.length;
  }
  
  if (iterations > 1) {
    console.log(`  Completed ${iterations} merge iterations: ${initialCount} → ${merged.length} rectangles`);
  }
  
  return merged;
}

/**
 * Merge horizontally adjacent rectangles on the same row
 */
function mergeHorizontally(rects, epsilon) {
  if (rects.length === 0) return [];
  
  // Sort by y (row), then x (column) for efficient row-based merging
  const sorted = [...rects].sort((a, b) => {
    if (Math.abs(a.y - b.y) < epsilon) {
      return a.x - b.x;
    }
    return a.y - b.y;
  });
  
  const merged = [];
  let current = null;
  
  for (const rect of sorted) {
    if (!current) {
      current = { ...rect };
      continue;
    }
    
    // Check if rectangles are on the same row and adjacent horizontally
    const sameRow = Math.abs(current.y - rect.y) < epsilon;
    const sameHeight = Math.abs(current.height - rect.height) < epsilon;
    const adjacent = Math.abs((current.x + current.width) - rect.x) < epsilon;
    
    if (sameRow && sameHeight && adjacent) {
      // Merge horizontally by extending width
      current.width += rect.width;
    } else {
      // Can't merge, save current and start new
      merged.push(current);
      current = { ...rect };
    }
  }
  
  if (current) {
    merged.push(current);
  }
  
  return merged;
}

/**
 * Merge vertically adjacent rectangles in the same column
 */
function mergeVertically(rects, epsilon) {
  if (rects.length === 0) return [];
  
  // Sort by x (column), then y (row) for efficient column-based merging
  const sorted = [...rects].sort((a, b) => {
    if (Math.abs(a.x - b.x) < epsilon) {
      return a.y - b.y;
    }
    return a.x - b.x;
  });
  
  const merged = [];
  let current = null;
  
  for (const rect of sorted) {
    if (!current) {
      current = { ...rect };
      continue;
    }
    
    // Check if rectangles are in the same column and adjacent vertically
    const sameColumn = Math.abs(current.x - rect.x) < epsilon;
    const sameWidth = Math.abs(current.width - rect.width) < epsilon;
    const adjacent = Math.abs((current.y + current.height) - rect.y) < epsilon;
    
    if (sameColumn && sameWidth && adjacent) {
      // Merge vertically by extending height
      current.height += rect.height;
    } else {
      // Can't merge, save current and start new
      merged.push(current);
      current = { ...rect };
    }
  }
  
  if (current) {
    merged.push(current);
  }
  
  return merged;
}

/**
 * Flatten merged rectangles into a single path by computing their union outline
 * This creates one polygon/path that represents all rectangles combined
 * Uses improved edge matching with better floating point precision handling
 */
function flattenRectanglesToPath(rects, epsilon = 0.001) {
  if (rects.length === 0) return null;
  if (rects.length === 1) {
    // Single rectangle - return as closed path
    const r = rects[0];
    // Ensure path is closed with Z command
    return `M ${r.x.toFixed(2)},${r.y.toFixed(2)} L ${(r.x + r.width).toFixed(2)},${r.y.toFixed(2)} L ${(r.x + r.width).toFixed(2)},${(r.y + r.height).toFixed(2)} L ${r.x.toFixed(2)},${(r.y + r.height).toFixed(2)} Z`;
  }
  
  // Extract all edge segments from rectangles
  // Each rectangle contributes 4 edges
  const allEdges = [];
  rects.forEach((rect, idx) => {
    const x1 = rect.x;
    const y1 = rect.y;
    const x2 = rect.x + rect.width;
    const y2 = rect.y + rect.height;
    
    // Add 4 edges: top, right, bottom, left
    allEdges.push({ x1, y1, x2, y2: y1, rectIndex: idx }); // top
    allEdges.push({ x1: x2, y1, x2, y2, rectIndex: idx }); // right
    allEdges.push({ x1: x2, y1: y2, x2: x1, y2, rectIndex: idx }); // bottom
    allEdges.push({ x1, y1: y2, x2: x1, y2: y1, rectIndex: idx }); // left
  });
  
  // Normalize and round edges for better matching
  // Round to a grid to handle floating point precision issues
  const gridSize = Math.max(epsilon * 100, 0.01);
  const roundToGrid = (val) => Math.round(val / gridSize) * gridSize;
  
  const normalizedEdges = allEdges.map(e => {
    // Normalize direction (smaller coordinates first)
    let x1 = roundToGrid(e.x1);
    let y1 = roundToGrid(e.y1);
    let x2 = roundToGrid(e.x2);
    let y2 = roundToGrid(e.y2);
    
    if (x1 > x2 || (x1 === x2 && y1 > y2)) {
      return { x1: x2, y1: y2, x2: x1, y2: y1, rectIndex: e.rectIndex };
    }
    return { x1, y1, x2, y2, rectIndex: e.rectIndex };
  });
  
  // Group edges by their normalized key and count occurrences
  // Edges that appear exactly twice are internal (shared by two rectangles)
  const edgeMap = new Map();
  normalizedEdges.forEach(e => {
    // Create a key that uniquely identifies the edge
    const key = `${e.x1.toFixed(4)},${e.y1.toFixed(4)}-${e.x2.toFixed(4)},${e.y2.toFixed(4)}`;
    if (!edgeMap.has(key)) {
      edgeMap.set(key, []);
    }
    edgeMap.get(key).push(e);
  });
  
  // Keep only external edges (appear once, or odd number of times)
  const externalEdges = [];
  edgeMap.forEach((edgeList, key) => {
    // If edge appears odd number of times, it's external
    if (edgeList.length % 2 === 1) {
      externalEdges.push(edgeList[0]);
    }
  });
  
  if (externalEdges.length === 0) {
    // All edges are internal - return bounding box as closed path
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    rects.forEach(r => {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.width);
      maxY = Math.max(maxY, r.y + r.height);
    });
    // Ensure path is closed with Z command
    return `M ${minX.toFixed(2)},${minY.toFixed(2)} L ${maxX.toFixed(2)},${minY.toFixed(2)} L ${maxX.toFixed(2)},${maxY.toFixed(2)} L ${minX.toFixed(2)},${maxY.toFixed(2)} Z`;
  }
  
  // Merge collinear edge segments before connecting
  const mergedEdges = mergeCollinearEdgeSegments(externalEdges, epsilon);
  
  // Connect edges into continuous paths
  const paths = connectEdgesToPaths(mergedEdges, epsilon);
  
  if (paths.length === 0) return null;
  
  // Ensure all paths are properly closed
  const closedPaths = paths.map(path => ensurePathClosed(path, epsilon));
  
  // Separate outer paths (larger, counter-clockwise) from holes (smaller, clockwise)
  const { outerPaths, holes } = classifyPaths(closedPaths);
  
  if (outerPaths.length === 0) return null;
  
  // Build path data: start with the largest outer path
  // Ensure all paths are properly closed
  const mainPath = ensurePathClosed(outerPaths[0], epsilon);
  let pathData = `M ${mainPath[0].x.toFixed(2)},${mainPath[0].y.toFixed(2)}`;
  for (let i = 1; i < mainPath.length; i++) {
    pathData += ` L ${mainPath[i].x.toFixed(2)},${mainPath[i].y.toFixed(2)}`;
  }
  // Always close the path
  pathData += ' Z';
  
  // Add holes (they will be filled with even-odd rule)
  for (const hole of holes) {
    const closedHole = ensurePathClosed(hole, epsilon);
    pathData += ` M ${closedHole[0].x.toFixed(2)},${closedHole[0].y.toFixed(2)}`;
    for (let j = 1; j < closedHole.length; j++) {
      pathData += ` L ${closedHole[j].x.toFixed(2)},${closedHole[j].y.toFixed(2)}`;
    }
    pathData += ' Z';
  }
  
  // Add additional outer paths (separate regions) if any
  for (let i = 1; i < outerPaths.length; i++) {
    const path = ensurePathClosed(outerPaths[i], epsilon);
    pathData += ` M ${path[0].x.toFixed(2)},${path[0].y.toFixed(2)}`;
    for (let j = 1; j < path.length; j++) {
      pathData += ` L ${path[j].x.toFixed(2)},${path[j].y.toFixed(2)}`;
    }
    pathData += ' Z';
  }
  
  return pathData;
}

/**
 * Merge collinear edge segments that are on the same line
 * This handles cases where multiple small edges form one long edge
 */
function mergeCollinearEdgeSegments(edges, epsilon) {
  if (edges.length === 0) return [];
  
  // Separate horizontal and vertical edges
  const horizontal = [];
  const vertical = [];
  
  edges.forEach(e => {
    const isHorizontal = Math.abs(e.y1 - e.y2) < epsilon;
    const isVertical = Math.abs(e.x1 - e.x2) < epsilon;
    
    if (isHorizontal) {
      horizontal.push({ ...e, y: (e.y1 + e.y2) / 2 });
    } else if (isVertical) {
      vertical.push({ ...e, x: (e.x1 + e.x2) / 2 });
    } else {
      // Diagonal edge - keep as is
      horizontal.push(e);
    }
  });
  
  const merged = [];
  
  // Merge horizontal edges on the same y coordinate
  const hGroups = new Map();
  horizontal.forEach(e => {
    const y = Math.round(e.y / epsilon) * epsilon;
    if (!hGroups.has(y)) {
      hGroups.set(y, []);
    }
    hGroups.get(y).push(e);
  });
  
  hGroups.forEach((group, y) => {
    // Sort by x coordinate
    group.sort((a, b) => Math.min(a.x1, a.x2) - Math.min(b.x1, b.x2));
    
    // Merge overlapping or adjacent segments
    let current = { min: Math.min(group[0].x1, group[0].x2), max: Math.max(group[0].x1, group[0].x2) };
    for (let i = 1; i < group.length; i++) {
      const seg = group[i];
      const segMin = Math.min(seg.x1, seg.x2);
      const segMax = Math.max(seg.x1, seg.x2);
      
      if (segMin <= current.max + epsilon) {
        // Merge
        current.max = Math.max(current.max, segMax);
      } else {
        merged.push({ x1: current.min, y1: y, x2: current.max, y2: y });
        current = { min: segMin, max: segMax };
      }
    }
    merged.push({ x1: current.min, y1: y, x2: current.max, y2: y });
  });
  
  // Merge vertical edges on the same x coordinate
  const vGroups = new Map();
  vertical.forEach(e => {
    const x = Math.round(e.x / epsilon) * epsilon;
    if (!vGroups.has(x)) {
      vGroups.set(x, []);
    }
    vGroups.get(x).push(e);
  });
  
  vGroups.forEach((group, x) => {
    // Sort by y coordinate
    group.sort((a, b) => Math.min(a.y1, a.y2) - Math.min(b.y1, b.y2));
    
    // Merge overlapping or adjacent segments
    let current = { min: Math.min(group[0].y1, group[0].y2), max: Math.max(group[0].y1, group[0].y2) };
    for (let i = 1; i < group.length; i++) {
      const seg = group[i];
      const segMin = Math.min(seg.y1, seg.y2);
      const segMax = Math.max(seg.y1, seg.y2);
      
      if (segMin <= current.max + epsilon) {
        // Merge
        current.max = Math.max(current.max, segMax);
      } else {
        merged.push({ x1: x, y1: current.min, x2: x, y2: current.max });
        current = { min: segMin, max: segMax };
      }
    }
    merged.push({ x1: x, y1: current.min, x2: x, y2: current.max });
  });
  
  return merged;
}

/**
 * Ensure a path is properly closed (first point = last point within epsilon)
 * This is critical for proper SVG rendering - unclosed paths cause fill issues
 */
function ensurePathClosed(path, epsilon = 0.001) {
  if (path.length < 3) {
    // Path too short to be closed - return as is (will be handled by caller)
    return path;
  }
  
  const first = path[0];
  const last = path[path.length - 1];
  const distance = Math.sqrt((first.x - last.x) ** 2 + (first.y - last.y) ** 2);
  
  // Use a more generous tolerance for closing paths
  const closeTolerance = Math.max(epsilon * 10, 0.1);
  
  // If path is already closed (within tolerance), ensure exact match
  if (distance < closeTolerance) {
    // Make last point exactly equal to first point
    const closedPath = [...path];
    closedPath[closedPath.length - 1] = { x: first.x, y: first.y };
    return closedPath;
  }
  
  // Path is not closed - force closure by adding the first point at the end
  // This ensures the path is always closed for proper SVG rendering
  if (distance > closeTolerance) {
    // Only warn if the gap is significant
    if (distance > 1.0) {
      console.warn(`Path not properly closed (distance: ${distance.toFixed(4)}), forcing closure`);
    }
    // Add first point at the end to close the path
    return [...path, { x: first.x, y: first.y }];
  }
  
  // Fallback: replace last point with first point
  return [...path.slice(0, -1), { x: first.x, y: first.y }];
}

/**
 * Classify paths as outer paths (counter-clockwise, larger) or holes (clockwise, smaller)
 * Uses the shoelace formula to calculate signed area
 */
function classifyPaths(paths) {
  const outerPaths = [];
  const holes = [];
  
  paths.forEach(path => {
    if (path.length < 3) return;
    
    // Calculate signed area using shoelace formula
    let area = 0;
    for (let i = 0; i < path.length; i++) {
      const j = (i + 1) % path.length;
      area += path[i].x * path[j].y;
      area -= path[j].x * path[i].y;
    }
    area /= 2;
    
    // Positive area = counter-clockwise = outer path
    // Negative area = clockwise = hole
    // Also consider path size - larger paths are more likely to be outer
    const pathLength = path.length;
    const isLarge = pathLength > 10; // Threshold for "large" path
    
    if (area > 0 || (area === 0 && isLarge)) {
      // Outer path (counter-clockwise or large)
      outerPaths.push(path);
    } else {
      // Hole (clockwise)
      holes.push(path);
    }
  });
  
  // Sort outer paths by area (largest first)
  outerPaths.sort((a, b) => {
    const areaA = Math.abs(calculatePathArea(a));
    const areaB = Math.abs(calculatePathArea(b));
    return areaB - areaA;
  });
  
  // Sort holes by area (smallest first) - they'll be processed in order
  holes.sort((a, b) => {
    const areaA = Math.abs(calculatePathArea(a));
    const areaB = Math.abs(calculatePathArea(b));
    return areaA - areaB;
  });
  
  return { outerPaths, holes };
}

/**
 * Calculate the area of a path using shoelace formula
 */
function calculatePathArea(path) {
  if (path.length < 3) return 0;
  
  let area = 0;
  for (let i = 0; i < path.length; i++) {
    const j = (i + 1) % path.length;
    area += path[i].x * path[j].y;
    area -= path[j].x * path[i].y;
  }
  return area / 2;
}

/**
 * Connect edges into continuous paths
 */
function connectEdgesToPaths(edges, epsilon) {
  if (edges.length === 0) return [];
  
  const paths = [];
  const used = new Set();
  
  // Build spatial index for faster lookup
  // Use a coarser grid for better matching
  const gridSize = Math.max(epsilon * 10, 0.1);
  const spatialIndex = new Map();
  
  const getGridKey = (x, y) => {
    return `${Math.floor(x / gridSize)},${Math.floor(y / gridSize)}`;
  };
  
  edges.forEach((edge, idx) => {
    const key1 = getGridKey(edge.x1, edge.y1);
    const key2 = getGridKey(edge.x2, edge.y2);
    if (!spatialIndex.has(key1)) spatialIndex.set(key1, []);
    if (!spatialIndex.has(key2)) spatialIndex.set(key2, []);
    spatialIndex.get(key1).push({ idx, point: { x: edge.x1, y: edge.y1 }, end: { x: edge.x2, y: edge.y2 } });
    spatialIndex.get(key2).push({ idx, point: { x: edge.x2, y: edge.y2 }, end: { x: edge.x1, y: edge.y1 } });
  });
  
  const pointDistance = (p1, p2) => {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  };
  
  for (let i = 0; i < edges.length; i++) {
    if (used.has(i)) continue;
    
    const edge = edges[i];
    const path = [{ x: edge.x1, y: edge.y1 }, { x: edge.x2, y: edge.y2 }];
    used.add(i);
    
    // Extend path forward
    let extended = true;
    while (extended) {
      extended = false;
      const pathEnd = path[path.length - 1];
      const key = getGridKey(pathEnd.x, pathEnd.y);
      const candidates = spatialIndex.get(key) || [];
      
      // Also check neighboring grid cells for better matching
      const neighbors = [
        getGridKey(pathEnd.x + gridSize, pathEnd.y),
        getGridKey(pathEnd.x - gridSize, pathEnd.y),
        getGridKey(pathEnd.x, pathEnd.y + gridSize),
        getGridKey(pathEnd.x, pathEnd.y - gridSize)
      ];
      neighbors.forEach(nKey => {
        const nCandidates = spatialIndex.get(nKey) || [];
        candidates.push(...nCandidates);
      });
      
      // Use a more generous tolerance for matching edges
      const matchTolerance = Math.max(epsilon * 5, 0.1);
      
      // Find the best matching candidate (closest point)
      let bestCandidate = null;
      let bestDistance = Infinity;
      
      for (const candidate of candidates) {
        if (used.has(candidate.idx)) continue;
        const dist = pointDistance(pathEnd, candidate.point);
        if (dist < matchTolerance && dist < bestDistance) {
          bestDistance = dist;
          bestCandidate = candidate;
        }
      }
      
      if (bestCandidate) {
        path.push(bestCandidate.end);
        used.add(bestCandidate.idx);
        extended = true;
      }
    }
    
    // Extend path backward
    extended = true;
    while (extended) {
      extended = false;
      const pathStart = path[0];
      const key = getGridKey(pathStart.x, pathStart.y);
      const candidates = spatialIndex.get(key) || [];
      
      // Also check neighboring grid cells
      const neighbors = [
        getGridKey(pathStart.x + gridSize, pathStart.y),
        getGridKey(pathStart.x - gridSize, pathStart.y),
        getGridKey(pathStart.x, pathStart.y + gridSize),
        getGridKey(pathStart.x, pathStart.y - gridSize)
      ];
      neighbors.forEach(nKey => {
        const nCandidates = spatialIndex.get(nKey) || [];
        candidates.push(...nCandidates);
      });
      
      // Use a more generous tolerance for matching edges
      const matchTolerance = Math.max(epsilon * 5, 0.1);
      
      // Find the best matching candidate (closest point)
      let bestCandidate = null;
      let bestDistance = Infinity;
      
      for (const candidate of candidates) {
        if (used.has(candidate.idx)) continue;
        const dist = pointDistance(pathStart, candidate.point);
        if (dist < matchTolerance && dist < bestDistance) {
          bestDistance = dist;
          bestCandidate = candidate;
        }
      }
      
      if (bestCandidate) {
        path.unshift(bestCandidate.end);
        used.add(bestCandidate.idx);
        extended = true;
      }
    }
    
    // Ensure path is properly closed before adding
    if (path.length > 2) {
      const pathStart = path[0];
      const pathEnd = path[path.length - 1];
      const closeDistance = pointDistance(pathStart, pathEnd);
      
      // Use a more generous tolerance for closing paths
      const closeTolerance = Math.max(epsilon * 10, 0.1);
      
      // If path is almost closed, ensure it's properly closed
      if (closeDistance < closeTolerance) {
        // Path forms a loop - ensure last point equals first point exactly
        path[path.length - 1] = { x: pathStart.x, y: pathStart.y };
      } else if (closeDistance < 1.0) {
        // Path is close but not exact - force closure
        path.push({ x: pathStart.x, y: pathStart.y });
      }
      // If distance is > 1.0, it's likely an open path (edge case)
      // We'll still add it but it won't be closed
      
      paths.push(path);
    }
  }
  
  return paths;
}

/**
 * Export an image texture to SVG with pixels as vector dots/circles
 */
export async function exportImageToSVG(texture, renderer, options = {}) {
  const {
    width = 800,
    height = 800,
    imageWidth = 800,
    imageHeight = 800,
    applyDithering = false,
    applyColorPalette = false,
    colorPalette = null,
    applyAscii = false,
    asciiCellSize = 8,
    asciiCharSet = 'standard',
    ditheringResolution = 500,
    ditheringThreshold = 128,
    ditheringContrast = 0,
    ditheringBrightness = 0,
    ditheringColorCount = 2,
    ditheringGradient = 50, // Gradient control (0-100)
    ditheringMethod = 'floyd-steinberg', // 'floyd-steinberg' or 'ordered'
    exportMode = 'optimized', // 'optimized' or 'simple'
    pixelFilter = 'both', // 'white', 'black', or 'both'
    renderBackground = true, // Whether to render background rectangle
    strokeColor = null, // Stroke color (null/undefined = no stroke, hex color string = stroke color)
    strokeWidth = 0.5 // Stroke width in SVG units
  } = options;

  // Create SVG header
  // Determine background color based on pixel filter
  const backgroundColor = pixelFilter === 'white' ? 'black' : 
                         pixelFilter === 'black' ? 'white' : 'white';
  
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
`;
  
  // Only add background rectangle if renderBackground is true
  if (renderBackground) {
    svg += `  <rect width="${width}" height="${height}" fill="${backgroundColor}"/>\n`;
  }

  if (!texture || !texture.image) {
    svg += '</svg>';
    return svg;
  }

  try {
    let processWidth = imageWidth;
    let processHeight = imageHeight;
    let scaleFactor = 1;
    
    // For dithered images: downsample to dithering resolution BEFORE dithering
    if (applyDithering) {
      const targetDimension = ditheringResolution;
      if (imageWidth > targetDimension || imageHeight > targetDimension) {
        if (imageWidth > imageHeight) {
          scaleFactor = targetDimension / imageWidth;
          processWidth = targetDimension;
          processHeight = Math.round(imageHeight * scaleFactor);
        } else {
          scaleFactor = targetDimension / imageHeight;
          processHeight = targetDimension;
          processWidth = Math.round(imageWidth * scaleFactor);
        }
        console.log(`Downsampling to ${processWidth}x${processHeight} before dithering (resolution: ${targetDimension}px)`);
      }
    } else {
      // For non-dithered images: limit to prevent browser freeze
      const maxDimension = 1000;
      if (imageWidth > maxDimension || imageHeight > maxDimension) {
        if (imageWidth > imageHeight) {
          scaleFactor = maxDimension / imageWidth;
          processWidth = maxDimension;
          processHeight = Math.round(imageHeight * scaleFactor);
        } else {
          scaleFactor = maxDimension / imageHeight;
          processHeight = maxDimension;
          processWidth = Math.round(imageWidth * scaleFactor);
        }
        console.log(`Downsampling from ${imageWidth}x${imageHeight} to ${processWidth}x${processHeight}`);
      }
    }
    
    // Create a temporary canvas to render the texture
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = processWidth;
    tempCanvas.height = processHeight;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Draw the image to the canvas (downsampled if needed)
    tempCtx.drawImage(texture.image, 0, 0, processWidth, processHeight);
    
    // Get ImageData
    let processedImageData = tempCtx.getImageData(0, 0, processWidth, processHeight);
    
    // Clean up canvas immediately after getting ImageData
    tempCanvas.width = 0;
    tempCanvas.height = 0;
    
    // Apply color palette quantization if enabled (only if dithering is NOT enabled)
    // If both are enabled, dithering will use the original image with the color palette
    if (applyColorPalette && colorPalette && colorPalette.length > 0 && !applyDithering) {
      // Create a temporary canvas for WebGL color palette quantization
      const paletteCanvas = document.createElement('canvas');
      paletteCanvas.width = processWidth;
      paletteCanvas.height = processHeight;
      const paletteCtx = paletteCanvas.getContext('2d');
      paletteCtx.putImageData(processedImageData, 0, 0);
      
      try {
        processedImageData = await applyWebGLColorPalette(paletteCanvas, {
          colorPalette: colorPalette
        });
        // Clean up
        paletteCanvas.width = 0;
        paletteCanvas.height = 0;
      } catch (error) {
        console.error('Error in WebGL color palette quantization for SVG, falling back to CPU:', error);
        // Fallback to CPU quantization
        processedImageData = applyColorPaletteQuantization(processedImageData, colorPalette);
        paletteCanvas.width = 0;
        paletteCanvas.height = 0;
      }
    }
    
    // Apply dithering if requested (on the downsampled image) using WebGL
    // When both color palette and dithering are enabled, dithering uses the original image with the color palette
    if (applyDithering) {
      console.log(`Applying ${ditheringMethod} dithering to ${processWidth}x${processHeight} image using WebGL...`);
      
      // Use color palette if available, otherwise use 2 colors (black/white)
      const ditheringPalette = (applyColorPalette && colorPalette && colorPalette.length > 0) 
        ? colorPalette 
        : null;
      const ditheringColorCount = ditheringPalette ? ditheringPalette.length : 2;
      
      // Create a temporary canvas for WebGL dithering
      const ditherCanvas = document.createElement('canvas');
      ditherCanvas.width = processWidth;
      ditherCanvas.height = processHeight;
      const ditherCtx = ditherCanvas.getContext('2d');
      ditherCtx.putImageData(processedImageData, 0, 0);
      
      try {
        processedImageData = await ditherImageData(ditherCanvas, {
          resolution: ditheringResolution,
          threshold: ditheringThreshold,
          contrast: ditheringContrast,
          brightness: ditheringBrightness,
          colorCount: ditheringColorCount,
          colorPalette: ditheringPalette,
          gradient: ditheringGradient,
          method: ditheringMethod
        });
      } catch (error) {
        console.error('Error in WebGL dithering for SVG, falling back to CPU:', error);
        // Fallback to CPU dithering
        const ditheringPalette = (applyColorPalette && colorPalette && colorPalette.length > 0) 
          ? colorPalette 
          : null;
        const ditheringColorCount = ditheringPalette ? ditheringPalette.length : 2;
        
        let ditherFunction;
        switch (ditheringMethod) {
          case 'ordered': ditherFunction = applyOrderedDithering; break;
          case 'atkinson': ditherFunction = applyAtkinsonDithering; break;
          case 'jarvis-judice-ninke': ditherFunction = applyJarvisJudiceNinkeDithering; break;
          case 'stucki': ditherFunction = applyStuckiDithering; break;
          case 'burkes': ditherFunction = applyBurkesDithering; break;
          case 'sierra': ditherFunction = applySierraDithering; break;
          case 'sierra-lite': ditherFunction = applySierraLiteDithering; break;
          case 'two-row-sierra': ditherFunction = applyTwoRowSierraDithering; break;
          default: ditherFunction = applyFloydSteinbergDithering; break;
        }
        processedImageData = ditherFunction(
          processedImageData, 
          ditheringColorCount, 
          ditheringThreshold, 
          ditheringContrast, 
          ditheringBrightness,
          ditheringPalette,
          ditheringGradient
        );
      }
      
      // Clean up
      ditherCanvas.width = 0;
      ditherCanvas.height = 0;
    }
    
    // If ASCII is enabled, render as text characters instead of pixels
    if (applyAscii) {
      // Save the image data before ASCII processing (we need original for brightness calculation)
      // processedImageData already has dithering/color palette applied, which is what we want
      const preAsciiData = new ImageData(
        new Uint8ClampedArray(processedImageData.data),
        processedImageData.width,
        processedImageData.height
      );
      
      // Get character set
      const charSetString = ASCII_PRESETS[asciiCharSet] || ASCII_PRESETS['standard'];
      const charSetLength = charSetString.length;
      
      // Calculate number of cells
      const cellsX = Math.ceil(processWidth / asciiCellSize);
      const cellsY = Math.ceil(processHeight / asciiCellSize);
      
      console.log(`Rendering ASCII: ${cellsX}x${cellsY} cells with cell size ${asciiCellSize}px, char set length: ${charSetLength}`);
      
      // Process each cell using the PRE-ASCII image data
      const data = preAsciiData.data;
      // Use full cell size (no padding) to match WebGL rendering
      const scaledCellSize = asciiCellSize / scaleFactor;
      
      // Group characters by color for optimization
      const charsByColor = new Map();
      let totalChars = 0;
      
      for (let cellY = 0; cellY < cellsY; cellY++) {
        for (let cellX = 0; cellX < cellsX; cellX++) {
          // Calculate cell bounds
          const cellStartX = cellX * asciiCellSize;
          const cellStartY = cellY * asciiCellSize;
          const cellEndX = Math.min(cellStartX + asciiCellSize, processWidth);
          const cellEndY = Math.min(cellStartY + asciiCellSize, processHeight);
          
          // Sample average brightness from the cell
          let totalBrightness = 0;
          let pixelCount = 0;
          let totalR = 0, totalG = 0, totalB = 0;
          
          for (let y = cellStartY; y < cellEndY; y++) {
            for (let x = cellStartX; x < cellEndX; x++) {
              const idx = (y * processWidth + x) * 4;
              const r = data[idx];
              const g = data[idx + 1];
              const b = data[idx + 2];
              const a = data[idx + 3];
              
              if (a >= 128) { // Only count non-transparent pixels
                const brightness = (r + g + b) / 3;
                totalBrightness += brightness;
                totalR += r;
                totalG += g;
                totalB += b;
                pixelCount++;
              }
            }
          }
          
          if (pixelCount === 0) continue; // Skip empty cells
          
          const avgBrightness = totalBrightness / pixelCount;
          const avgR = Math.round(totalR / pixelCount);
          const avgG = Math.round(totalG / pixelCount);
          const avgB = Math.round(totalB / pixelCount);
          
          // Map brightness to character index
          // Darker = lower index, Lighter = higher index
          // Normalize brightness to 0-1 range
          const normalizedBrightness = avgBrightness / 255;
          // Clamp to avoid edge cases
          const clampedBrightness = Math.min(Math.max(0, normalizedBrightness), 1);
          // Map: 0 brightness -> index 0, 1 brightness -> index (length-1)
          // But we want to avoid always getting the last character for pure white
          const charIndex = Math.floor(clampedBrightness * (charSetLength - 1));
          const clampedIndex = Math.min(Math.max(0, charIndex), charSetLength - 1);
          const char = charSetString[clampedIndex];
          
          // Calculate cell top-left position (scaled to SVG coordinates)
          // Position at top-left to match WebGL rendering (characters fill entire cell)
          const cellPosX = cellStartX / scaleFactor;
          const cellPosY = cellStartY / scaleFactor;
          
          // Get color
          const color = rgbToHex(avgR, avgG, avgB);
          
          // Group by color
          if (!charsByColor.has(color)) {
            charsByColor.set(color, []);
          }
          charsByColor.get(color).push({
            x: cellPosX,
            y: cellPosY,
            char: char
          });
          totalChars++;
        }
      }
      
      console.log(`Generated ${charsByColor.size} color groups with ${totalChars} ASCII characters total`);
      
      if (totalChars === 0) {
        console.warn('No ASCII characters generated - image might be empty or all transparent');
        svg += '  <!-- No ASCII characters to render -->\n';
      } else {
        // Convert characters to paths and render grouped by color
        const charPathCache = new Map(); // Cache character paths
        
        console.log('Converting characters to SVG paths using preset line icons...');
        
        charsByColor.forEach((chars, color) => {
          // Use stroke width proportional to cell size (matching WebGL rendering)
          const strokeWidth = Math.max(0.5, scaledCellSize / 20);
          svg += `  <g fill="none" stroke="${color}" stroke-width="${strokeWidth.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round">\n`;
          
          chars.forEach(({ x, y, char }) => {
            // Get or create path for this character
            // Use full cell size (no padding) to match WebGL rendering
            let charPath = charPathCache.get(char);
            if (!charPath) {
              charPath = charToPath(char, scaledCellSize);
              if (charPath) {
                charPathCache.set(char, charPath);
              }
            }
            
            if (charPath && charPath.path) {
              // Transform path to correct position
              // The path is defined for a cell of size scaledCellSize, positioned at top-left
              svg += `    <g transform="translate(${x.toFixed(2)},${y.toFixed(2)})">\n`;
              svg += `      <path d="${charPath.path}"/>\n`;
              svg += `    </g>\n`;
            }
          });
          
          svg += `  </g>\n`;
        });
        
        console.log(`Cached ${charPathCache.size} unique character paths`);
        charPathCache.clear();
      }
      
      // Clean up
      charsByColor.clear();
    } else {
      // Original pixel-based rendering (when ASCII is not enabled)
      const data = processedImageData.data;
      const pixels = [];
      
      // Convert pixels to vector dots
      // Configuration - different for dithered vs non-dithered
      let dotRadius, brightnessThreshold, minAlpha, maxDots, stepSize;
      
      // Pixel filter threshold (always use midpoint for filtering)
      const pixelFilterThreshold = 128;
      
      if (applyDithering) {
        // For dithered images: MUST process every pixel to preserve the error-diffused pattern
        // Dithering creates an organic pattern that will be lost with grid sampling
        brightnessThreshold = 250; // Only skip pure white (255) for dithered
        minAlpha = 128;
        maxDots = 1000000; // Higher limit since we need to capture the pattern
        // CRITICAL: Always use stepSize = 1 for dithered images to preserve the pattern
        // The dithering algorithm already created the optimal pattern, we just need to capture it
        stepSize = 1; // Process every pixel - this is essential for dithered images
        console.log(`Dithered image: ${processWidth}x${processHeight}, processing every pixel (stepSize=1)`);
      } else {
        // For non-dithered images: use sampling to reduce dots
        dotRadius = 0.6;
        brightnessThreshold = 245; // Skip very light pixels for non-dithered
        minAlpha = 128;
        maxDots = 500000;
        // Use step size to skip pixels for very large images
        stepSize = Math.max(1, Math.ceil(Math.sqrt((processWidth * processHeight) / maxDots)));
      }
      
      for (let y = 0; y < processHeight; y += stepSize) {
        for (let x = 0; x < processWidth; x += stepSize) {
          // Stop if we've reached max dots
          if (pixels.length >= maxDots) {
            console.warn(`Reached maximum dot limit of ${maxDots}, stopping early`);
            break;
          }
          
          const idx = (y * processWidth + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3];
          
          // Skip transparent or very transparent pixels
          if (a < minAlpha) continue;
          
          // Calculate brightness
          const brightness = (r + g + b) / 3;
          
          // Filter pixels based on pixelFilter mode
          if (pixelFilter === 'black') {
            // Only render dark pixels (black) - brightness below midpoint
            if (brightness > pixelFilterThreshold) continue;
          } else if (pixelFilter === 'white') {
            // Only render light pixels (white) - brightness above midpoint
            if (brightness <= pixelFilterThreshold) continue;
          } else {
            // 'both' - render all pixels (but still skip very light ones for non-dithered)
            if (!applyDithering && brightness > brightnessThreshold) continue;
          }
          
          // Scale coordinates back to original size if downsampled
          const scaledX = x / scaleFactor;
          const scaledY = y / scaleFactor;
          const pixelSize = 1 / scaleFactor; // Size of each pixel in SVG coordinates
          
          if (applyDithering) {
            // For dithered images: generate black rectangles for dark pixels
            // Skip light pixels (they're the white background)
            const color = rgbToHex(r, g, b);
            pixels.push({
              x: scaledX,
              y: scaledY,
              width: pixelSize,
              height: pixelSize,
              color: color,
              isRect: true
            });
          } else {
            // For non-dithered images: use dots
            const color = rgbToHex(r, g, b);
            pixels.push({
              x: scaledX + 0.5 / scaleFactor,
              y: scaledY + 0.5 / scaleFactor,
              color: color,
              isRect: false
            });
          }
        }
        if (pixels.length >= maxDots) break;
      }
      
      console.log(`Converting ${pixels.length} pixels to vector dots (step size: ${stepSize})...`);
      
      // Group pixels by color for optimization (reduces file size)
      const dotsByColor = new Map();
      pixels.forEach(pixel => {
        if (!dotsByColor.has(pixel.color)) {
          dotsByColor.set(pixel.color, []);
        }
        dotsByColor.get(pixel.color).push(pixel);
      });
      
      console.log(`Grouped ${pixels.length} pixels into ${dotsByColor.size} color groups`);
      
      // Helper function to create a valid SVG ID from hex color
      const colorToId = (hexColor) => {
        // Remove # and convert to lowercase, replace invalid characters
        // SVG IDs must start with a letter or underscore, and contain only letters, digits, hyphens, underscores, and periods
        const clean = hexColor.replace('#', '').toLowerCase();
        return `color-${clean}`;
      };
      
      // Add shapes to SVG, grouped by color for efficiency
      // Build SVG string in chunks to avoid memory issues
      let colorIndex = 0;
      dotsByColor.forEach((dots, color) => {
        const groupId = colorToId(color);
        const groupName = `color-group-${colorIndex}`;
        
        // When stroke is enabled: no fill, only stroke, and make rectangles smaller
        const hasStroke = !!strokeColor;
        const fillAttr = hasStroke ? 'fill="none"' : `fill="${color}"`;
        const strokeAttr = hasStroke ? `stroke="${strokeColor}" stroke-width="${strokeWidth}"` : 'stroke="none"';
        
        svg += `  <g id="${groupId}" data-name="${groupName}" ${fillAttr} ${strokeAttr}>\n`;
        colorIndex++;
        
        if (dots.length > 0 && dots[0].isRect) {
          if (exportMode === 'simple') {
            // Simple mode: group rectangles by color but render individually
            console.log(`Simple mode: rendering ${dots.length} pixels for color ${color}...`);
            
            // Output as individual rectangles grouped by color
            dots.forEach(pixel => {
              if (hasStroke) {
                // Make rectangles smaller when stroke is enabled (inset by half stroke width)
                const inset = strokeWidth / 2;
                const smallerX = pixel.x + inset;
                const smallerY = pixel.y + inset;
                const smallerWidth = Math.max(0, pixel.width - strokeWidth);
                const smallerHeight = Math.max(0, pixel.height - strokeWidth);
                svg += `    <rect x="${smallerX.toFixed(2)}" y="${smallerY.toFixed(2)}" width="${smallerWidth.toFixed(2)}" height="${smallerHeight.toFixed(2)}"/>\n`;
              } else {
                svg += `    <rect x="${pixel.x.toFixed(2)}" y="${pixel.y.toFixed(2)}" width="${pixel.width.toFixed(2)}" height="${pixel.height.toFixed(2)}"/>\n`;
              }
            });
          } else {
            // Optimized mode (VIP): merge rectangles, then flatten to single path
            console.log(`Optimized mode: merging ${dots.length} rectangles for color ${color}...`);
            
            // When stroke is enabled, make rectangles smaller before merging
            let rectsToMerge = dots;
            if (hasStroke) {
              const inset = strokeWidth / 2;
              rectsToMerge = dots.map(pixel => ({
                x: pixel.x + inset,
                y: pixel.y + inset,
                width: Math.max(0, pixel.width - strokeWidth),
                height: Math.max(0, pixel.height - strokeWidth)
              }));
            }
            
            const mergedRects = mergeRectangles(rectsToMerge);
            console.log(`Merged to ${mergedRects.length} rectangles (${((1 - mergedRects.length / dots.length) * 100).toFixed(1)}% reduction)`);
            
            // Flatten all rectangles into a single path (union)
            console.log(`Flattening ${mergedRects.length} rectangles into single path...`);
            const flattenedPath = flattenRectanglesToPath(mergedRects);
            
            if (flattenedPath) {
              // Ensure the path ends with Z (closed) if it doesn't already
              let finalPath = flattenedPath.trim();
              if (!finalPath.endsWith('Z') && !finalPath.endsWith('z')) {
                finalPath += ' Z';
              }
              // Output as a single path element with fill-rule for proper rendering
              svg += `    <path d="${finalPath}" fill-rule="evenodd"/>\n`;
              console.log(`  Flattened to single path for color ${color}`);
            } else {
              // Fallback: output as individual rectangles if flattening fails
              // Each rectangle is already a closed shape
              mergedRects.forEach(rect => {
                svg += `    <rect x="${rect.x.toFixed(2)}" y="${rect.y.toFixed(2)}" width="${rect.width.toFixed(2)}" height="${rect.height.toFixed(2)}"/>\n`;
              });
            }
          }
        } else {
          // For non-dithered images: group circles by color
          console.log(`Rendering ${dots.length} circles for color ${color}...`);
          dots.forEach(dot => {
            svg += `    <circle cx="${dot.x.toFixed(1)}" cy="${dot.y.toFixed(1)}" r="${(dotRadius / scaleFactor).toFixed(2)}"/>\n`;
          });
        }
        svg += `  </g>\n`;
      });
      
      console.log(`Generated SVG with ${pixels.length} dots in ${dotsByColor.size} color groups`);
      
      // Clean up large intermediate data structures
      pixels.length = 0; // Clear pixel array
      dotsByColor.clear(); // Clear color map
    }
    
  } catch (error) {
    console.error('Error exporting image to SVG:', error);
    svg += '  <!-- Error exporting image: ' + error.message + ' -->\n';
  }

  svg += '</svg>';
  return svg;
}

export function downloadSVG(svgString, filename = 'export.svg') {
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
