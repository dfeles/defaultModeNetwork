import * as THREE from 'three';
import { applyFloydSteinbergDithering } from './dithering';

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
    
    // Get minimum edge length in 2D space (for filtering) - very aggressive default
    const minEdgeLength2D = edgeSettings.minEdgeLength2D !== undefined ? edgeSettings.minEdgeLength2D : 2.0; // Minimum edge length in pixels
    
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

    console.log(`Found edges in ${edgesByColor.size} color groups`);

    // Get optimization settings (very aggressive defaults for much smaller file size)
    const optimizeSettings = {
      minEdgeLength: edgeSettings.minEdgeLength !== undefined ? edgeSettings.minEdgeLength : 2.0,      // Filter edges shorter than this (pixels)
      simplifyEpsilon: edgeSettings.simplifyEpsilon !== undefined ? edgeSettings.simplifyEpsilon : 2.0,  // Path simplification tolerance (higher = more aggressive)
      mergeTolerance: edgeSettings.mergeTolerance !== undefined ? edgeSettings.mergeTolerance : 2.0,    // Merge nearby points
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
  
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    
    const path = [lines[i].start, lines[i].end];
    used.add(i);
    
    let extended = true;
    while (extended) {
      extended = false;
      const pathEnd = path[path.length - 1];
      const key = getKey(pathEnd.x, pathEnd.y);
      const candidates = spatialIndex.get(key) || [];
      
      for (const candidate of candidates) {
        if (used.has(candidate.idx)) continue;
        
        if (distance(pathEnd, candidate.point) < mergeTolerance) {
          path.push(candidate.other);
          used.add(candidate.idx);
          extended = true;
          break;
        }
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
      
      // Remove colinear points (more aggressive)
      let simplified = removeColinear ? removeColinearPoints(mergedPath, 0.1) : mergedPath;
      
      // Apply Douglas-Peucker simplification if path is long enough
      if (simplified.length > 3 && simplifyEpsilon > 0) {
        simplified = simplifyPath(simplified, simplifyEpsilon);
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
 * Export an image texture to SVG with optional dithering
 */
export function exportImageToSVG(texture, renderer, options = {}) {
  const {
    width = 800,
    height = 800,
    imageWidth = 800,
    imageHeight = 800,
    applyDithering = false
  } = options;

  // Create SVG header
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
`;

  if (!texture || !texture.image) {
    svg += '</svg>';
    return svg;
  }

  try {
    // Create a temporary canvas to render the texture
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imageWidth;
    tempCanvas.height = imageHeight;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Draw the image to the canvas
    tempCtx.drawImage(texture.image, 0, 0, imageWidth, imageHeight);
    
    // Get ImageData
    const imageData = tempCtx.getImageData(0, 0, imageWidth, imageHeight);
    
    // Apply dithering if requested
    let processedImageData = imageData;
    if (applyDithering) {
      console.log('Applying Floyd-Steinberg dithering to image...');
      processedImageData = applyFloydSteinbergDithering(imageData, 2);
      
      // Update canvas with dithered image
      tempCtx.putImageData(processedImageData, 0, 0);
    }
    
    // Convert to base64 data URL
    const imageDataUrl = tempCanvas.toDataURL('image/png');
    
    // Embed image in SVG
    svg += `  <image href="${imageDataUrl}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>\n`;
    
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
