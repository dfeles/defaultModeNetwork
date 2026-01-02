import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, SkipForward, RotateCcw as RotateCcwIcon } from 'lucide-react';
import { applyFloydSteinbergDithering, applyOrderedDithering } from '../utils/dithering';
import * as THREE from 'three';
import GameOfLifeMaterial from './shaders/GameOfLifeMaterial';
import './GameOfLife.css';

// Cellular automata rules
// B = birth counts, S = survival counts
function getNextGeneration(grid, width, height, rule = 'game-of-life') {
  const newGrid = new Array(height).fill(null).map(() => new Array(width).fill(0));
  
  // Define rules for different automata
  const rules = {
    'game-of-life': { birth: [3], survive: [2, 3] }, // B3/S23 - Conway's Game of Life
    'seeds': { birth: [2], survive: [] }, // B2/S - Seeds (explosive growth)
    'highlife': { birth: [3, 6], survive: [2, 3] }, // B36/S23 - HighLife (has replicators)
    'amoeba': { birth: [3, 5, 7], survive: [1, 3, 5, 8] }, // B357/S1358 - Amoeba (organic growth patterns)
    'life-without-death': { birth: [3], survive: [0, 1, 2, 3, 4, 5, 6, 7, 8] }, // B3/S012345678 - Life without Death (cells never die)
    'slow-death': { birth: [3], survive: [0, 1, 2, 3, 4, 5, 6] }, // B3/S01234567 - Slow Death (dies only when completely surrounded)
  };
  
  const ruleSet = rules[rule] || rules['game-of-life'];
  const birthCounts = ruleSet.birth;
  const surviveCounts = ruleSet.survive;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let neighbors = 0;
      
      // Count living neighbors (8 directions)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          
          const ny = y + dy;
          const nx = x + dx;
          
          // Wrap around edges (toroidal)
          const wrappedY = (ny + height) % height;
          const wrappedX = (nx + width) % width;
          
          if (grid[wrappedY][wrappedX] === 1) {
            neighbors++;
          }
        }
      }
      
      // Apply cellular automata rules
      if (grid[y][x] === 1) {
        // Living cell - survives if neighbor count is in survive list
        newGrid[y][x] = surviveCounts.includes(neighbors) ? 1 : 0;
      } else {
        // Dead cell - becomes alive if neighbor count is in birth list
        newGrid[y][x] = birthCounts.includes(neighbors) ? 1 : 0;
      }
    }
  }
  
  return newGrid;
}

// Reaction-Diffusion (Gray-Scott model) - creates organic, biological patterns
function updateReactionDiffusion(gridA, gridB, width, height, params) {
  const { feed, kill, diffA, diffB } = params;
  const dt = 1.0;
  
  const newA = new Array(height).fill(null).map(() => new Array(width).fill(0));
  const newB = new Array(height).fill(null).map(() => new Array(width).fill(0));
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Laplacian (diffusion) - using 5-point stencil
      let laplacianA = 0;
      let laplacianB = 0;
      
      const centerA = gridA[y][x];
      const centerB = gridB[y][x];
      
      // 4-neighbor diffusion
      const neighbors = [
        { x: (x - 1 + width) % width, y: y },
        { x: (x + 1) % width, y: y },
        { x: x, y: (y - 1 + height) % height },
        { x: x, y: (y + 1) % height }
      ];
      
      neighbors.forEach(n => {
        laplacianA += gridA[n.y][n.x] - centerA;
        laplacianB += gridB[n.y][n.x] - centerB;
      });
      
      laplacianA *= 0.2; // Average of 4 neighbors
      laplacianB *= 0.2;
      
      // Gray-Scott reaction-diffusion equations
      const reaction = centerA * centerB * centerB;
      const newAVal = centerA + (diffA * laplacianA - reaction + feed * (1 - centerA)) * dt;
      const newBVal = centerB + (diffB * laplacianB + reaction - (feed + kill) * centerB) * dt;
      
      newA[y][x] = Math.max(0, Math.min(1, newAVal));
      newB[y][x] = Math.max(0, Math.min(1, newBVal));
    }
  }
  
  return { gridA: newA, gridB: newB };
}

// Diffusion - smooth spreading pattern
function updateDiffusion(grid, width, height, rate) {
  const newGrid = new Array(height).fill(null).map(() => new Array(width).fill(0));
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      
      // Average of neighbors (including self)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = (y + dy + height) % height;
          const nx = (x + dx + width) % width;
          sum += grid[ny][nx];
          count++;
        }
      }
      
      const avg = sum / count;
      const current = grid[y][x];
      // Blend current value with average of neighbors
      newGrid[y][x] = current + (avg - current) * rate;
      newGrid[y][x] = Math.max(0, Math.min(1, newGrid[y][x]));
    }
  }
  
  return newGrid;
}

// Slime mold - simple aggregation pattern
function updateSlimeMold(grid, width, height) {
  const newGrid = new Array(height).fill(null).map(() => new Array(width).fill(0));
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let maxNeighbor = 0;
      
      // Find maximum neighbor value
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ny = (y + dy + height) % height;
          const nx = (x + dx + width) % width;
          maxNeighbor = Math.max(maxNeighbor, grid[ny][nx]);
        }
      }
      
      const current = grid[y][x];
      // Attract to high values, decay slightly
      newGrid[y][x] = Math.max(0, Math.min(1, current * 0.95 + maxNeighbor * 0.1));
    }
  }
  
  return newGrid;
}

// Belousov-Zhabotinsky reaction - chemical wave patterns
function updateBelousovZhabotinsky(grid, width, height, params) {
  const { threshold, decay, growth } = params;
  const newGrid = new Array(height).fill(null).map(() => new Array(width).fill(0));
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const current = grid[y][x];
      
      // Count excited neighbors
      let excitedCount = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ny = (y + dy + height) % height;
          const nx = (x + dx + width) % width;
          if (grid[ny][nx] > threshold) {
            excitedCount++;
          }
        }
      }
      
      // BZ reaction rules: excitable medium
      if (current < threshold) {
        // Resting state - becomes excited if enough neighbors are excited
        newGrid[y][x] = excitedCount >= 2 ? Math.min(1, current + growth) : Math.max(0, current - decay * 0.1);
      } else {
        // Excited state - decays back to resting
        newGrid[y][x] = Math.max(0, current - decay);
      }
    }
  }
  
  return newGrid;
}

// Coral growth - branching patterns
function updateCoralGrowth(grid, width, height, params) {
  const { growthRate, branchProb, decayRate } = params;
  const newGrid = new Array(height).fill(null).map(() => new Array(width).fill(0));
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const current = grid[y][x];
      
      // Count living neighbors
      let livingNeighbors = 0;
      let neighborSum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ny = (y + dy + height) % height;
          const nx = (x + dx + width) % width;
          const neighborVal = grid[ny][nx];
          if (neighborVal > 0.1) {
            livingNeighbors++;
            neighborSum += neighborVal;
          }
        }
      }
      
      // Coral growth rules
      if (current > 0.1) {
        // Living coral - grows if has neighbors, decays if isolated
        if (livingNeighbors >= 1 && livingNeighbors <= 4) {
          newGrid[y][x] = Math.min(1, current + growthRate * (1 - current));
        } else {
          newGrid[y][x] = Math.max(0, current - decayRate);
        }
      } else {
        // Dead space - can grow if neighbors exist and random chance
        if (livingNeighbors >= 1 && livingNeighbors <= 3 && Math.random() < branchProb) {
          newGrid[y][x] = neighborSum / (livingNeighbors * 8) * growthRate;
        } else {
          newGrid[y][x] = Math.max(0, current - decayRate * 0.1);
        }
      }
    }
  }
  
  return newGrid;
}

// Morphogenesis - pattern formation through local interactions
function updateMorphogenesis(grid, width, height, params) {
  const { diffusion, reaction, threshold } = params;
  const newGrid = new Array(height).fill(null).map(() => new Array(width).fill(0));
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const current = grid[y][x];
      
      // Calculate local average (diffusion)
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = (y + dy + height) % height;
          const nx = (x + dx + width) % width;
          sum += grid[ny][nx];
          count++;
        }
      }
      const localAvg = sum / count;
      
      // Morphogenesis: local activation, lateral inhibition
      const diff = localAvg - current;
      const activation = current > threshold ? reaction : -reaction * 0.5;
      newGrid[y][x] = Math.max(0, Math.min(1, current + diffusion * diff + activation));
    }
  }
  
  return newGrid;
}

function GameOfLife({ 
  imageData, 
  onGridChange, 
  displayMode = 'sidebar',
  grid: externalGrid,
  setGrid: externalSetGrid,
  generation: externalGeneration,
  setGeneration: externalSetGeneration,
  isRunning: externalIsRunning,
  setIsRunning: externalSetIsRunning,
  gameOfLifeEnabled: externalGameOfLifeEnabled,
  setGameOfLifeEnabled: externalSetGameOfLifeEnabled,
  cellularAutomataEnabled: externalCellularAutomataEnabled,
  setCellularAutomataEnabled: externalSetCellularAutomataEnabled
}) {
  // Use external state if provided, otherwise use local state
  const [localGrid, setLocalGrid] = useState(null);
  const [localIsRunning, setLocalIsRunning] = useState(false);
  const [localGeneration, setLocalGeneration] = useState(0);
  
  const grid = externalGrid !== undefined ? externalGrid : localGrid;
  const setGrid = externalSetGrid || setLocalGrid;
  const isRunning = externalIsRunning !== undefined ? externalIsRunning : localIsRunning;
  const setIsRunning = externalSetIsRunning || setLocalIsRunning;
  const generation = externalGeneration !== undefined ? externalGeneration : localGeneration;
  const setGeneration = externalSetGeneration || setLocalGeneration;
  
  const [speed, setSpeed] = useState(300); // milliseconds per generation
  const intervalRef = useRef(null);
  const canvasRef = useRef(null);
  const rendererRef = useRef(null); // WebGL renderer
  const sceneRef = useRef(null); // Three.js scene
  const cameraRef = useRef(null); // Three.js camera
  const meshRef = useRef(null); // Three.js mesh
  const materialRef = useRef(null); // Shader material
  const textureRef = useRef(null); // Grid texture
  const gridRef = useRef(grid); // Keep ref in sync with grid state
  const isUpdatingRef = useRef(false); // Prevent overlapping updates
  const intervalIdRef = useRef(null); // Track the actual interval ID to prevent duplicates
  const simulationTypeRef = useRef('cellular-automata'); // Keep ref in sync with simulation type
  const automataRuleRef = useRef('game-of-life'); // Keep ref in sync with automata rule
  const reactionDiffusionParamsRef = useRef({ feed: 0.055, kill: 0.062, diffA: 1.0, diffB: 0.5 }); // Keep ref in sync with reaction-diffusion params
  const diffusionRateRef = useRef(0.1); // Keep ref in sync with diffusion rate
  const [cellSize, setCellSize] = useState(4); // pixels per cell
  const [useDithering, setUseDithering] = useState(false);
  const [ditheringMethod, setDitheringMethod] = useState('floyd-steinberg'); // 'floyd-steinberg' or 'ordered'
  const [ditheringThreshold, setDitheringThreshold] = useState(128);
  const [automataRule, setAutomataRule] = useState('game-of-life'); // 'game-of-life', 'seeds', 'highlife', 'amoeba', 'life-without-death', 'slow-death'
  const [simulationType, setSimulationType] = useState('cellular-automata'); // 'cellular-automata', 'reaction-diffusion', 'diffusion', 'slime-mold'
  
  // Reaction-diffusion parameters
  const [reactionDiffusionParams, setReactionDiffusionParams] = useState({ feed: 0.055, kill: 0.062, diffA: 1.0, diffB: 0.5 });
  const reactionGridRef = useRef(null); // For reaction-diffusion (two-layer grid)
  
  // Diffusion parameters
  const [diffusionRate, setDiffusionRate] = useState(0.1);
  const diffusionGridRef = useRef(null); // For diffusion (single-layer continuous)
  
  // Belousov-Zhabotinsky parameters
  const [bzParams, setBzParams] = useState({ threshold: 0.5, decay: 0.15, growth: 0.3 });
  const bzParamsRef = useRef({ threshold: 0.5, decay: 0.15, growth: 0.3 });
  
  // Coral growth parameters
  const [coralParams, setCoralParams] = useState({ growthRate: 0.1, branchProb: 0.05, decayRate: 0.02 });
  const coralParamsRef = useRef({ growthRate: 0.1, branchProb: 0.05, decayRate: 0.02 });
  
  // Morphogenesis parameters
  const [morphParams, setMorphParams] = useState({ diffusion: 0.1, reaction: 0.05, threshold: 0.5 });
  const morphParamsRef = useRef({ diffusion: 0.1, reaction: 0.05, threshold: 0.5 });
  
  // Use external state if provided, otherwise use local state
  const [localCellularAutomataEnabled, setLocalCellularAutomataEnabled] = useState(false);
  const cellularAutomataEnabled = externalCellularAutomataEnabled !== undefined ? externalCellularAutomataEnabled : localCellularAutomataEnabled;
  const setCellularAutomataEnabled = externalSetCellularAutomataEnabled || setLocalCellularAutomataEnabled;
  
  // For backward compatibility, also check gameOfLifeEnabled
  const [localGameOfLifeEnabled, setLocalGameOfLifeEnabled] = useState(false);
  const gameOfLifeEnabled = externalGameOfLifeEnabled !== undefined ? externalGameOfLifeEnabled : localGameOfLifeEnabled;
  
  // Use cellularAutomataEnabled if provided, otherwise use gameOfLifeEnabled for backward compatibility
  const isEnabled = cellularAutomataEnabled !== undefined ? cellularAutomataEnabled : (gameOfLifeEnabled !== undefined ? gameOfLifeEnabled : false);
  const setIsEnabled = setCellularAutomataEnabled || setGameOfLifeEnabled;
  const onGridChangeRef = useRef(onGridChange);
  const lastInitKeyRef = useRef(null); // Track which image+cellSize we've initialized from
  const hasInitializedRef = useRef(false); // Track if we've initialized from current image

  // Keep refs updated
  useEffect(() => {
    onGridChangeRef.current = onGridChange;
  }, [onGridChange]);
  
  useEffect(() => {
    gridRef.current = grid;
  }, [grid]);
  
  useEffect(() => {
    simulationTypeRef.current = simulationType;
  }, [simulationType]);
  
  useEffect(() => {
    automataRuleRef.current = automataRule;
  }, [automataRule]);
  
  useEffect(() => {
    reactionDiffusionParamsRef.current = reactionDiffusionParams;
  }, [reactionDiffusionParams]);
  
  useEffect(() => {
    diffusionRateRef.current = diffusionRate;
  }, [diffusionRate]);
  
  useEffect(() => {
    bzParamsRef.current = bzParams;
  }, [bzParams]);
  
  useEffect(() => {
    coralParamsRef.current = coralParams;
  }, [coralParams]);
  
  useEffect(() => {
    morphParamsRef.current = morphParams;
  }, [morphParams]);

  // Initialize grid from image when imageData or cellSize changes (only if Cellular Automata is enabled)
  useEffect(() => {
    if (!isEnabled) {
      setGrid(null);
      return;
    }
    
    if (!imageData || !imageData.texture || !imageData.texture.image) {
      setGrid(null);
      lastInitKeyRef.current = null;
      hasInitializedRef.current = false;
      return;
    }

    const img = imageData.texture.image;
    
    // Create a unique identifier for this image + cellSize combination
    // This prevents re-initializing when imageData object reference changes but image is the same
    const initKey = `${img.width}x${img.height}x${cellSize}`;
    
    // Only re-initialize if this is a different image or cellSize
    if (lastInitKeyRef.current === initKey && hasInitializedRef.current) {
      return; // Same image and cellSize, don't re-initialize
    }
    
    lastInitKeyRef.current = initKey;
    hasInitializedRef.current = false; // Will be set to true after initialization
    
    // Ensure image is loaded
    if (!img.complete || img.width === 0 || img.height === 0) {
      // Wait for image to load
      const handleLoad = () => {
        processImage(img);
      };
      
      if (img.complete) {
        // Image already loaded, process immediately
        processImage(img);
      } else {
        img.addEventListener('load', handleLoad, { once: true });
        img.addEventListener('error', () => {
          console.error('Error loading image for Game of Life');
          setGrid(null);
        }, { once: true });
      }
      
      return () => {
        img.removeEventListener('load', handleLoad);
        img.removeEventListener('error', () => {});
      };
    }
    
    processImage(img);
    
    function processImage(image) {
      try {
        const width = Math.floor(image.width / cellSize);
        const height = Math.floor(image.height / cellSize);
        
        if (width === 0 || height === 0) {
          setGrid(null);
          return;
        }
        
        // Create canvas to sample image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Draw and sample image
        ctx.drawImage(image, 0, 0, width, height);
        let imageDataObj = ctx.getImageData(0, 0, width, height);
        
        // Apply dithering if enabled
        if (useDithering) {
          const ditherFunction = ditheringMethod === 'ordered' ? applyOrderedDithering : applyFloydSteinbergDithering;
          imageDataObj = ditherFunction(
            imageDataObj,
            2, // levels (binary: alive/dead)
            ditheringThreshold,
            0, // contrast
            0, // brightness
            null, // colorPalette (not used for binary)
            50 // gradient
          );
        }
        
        const data = imageDataObj.data;
        
        if (simulationType === 'cellular-automata') {
          // Convert to binary grid (threshold based on brightness)
          const newGrid = new Array(height).fill(null).map(() => new Array(width).fill(0));
          
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const idx = (y * width + x) * 4;
              const r = data[idx];
              const g = data[idx + 1];
              const b = data[idx + 2];
              // Calculate brightness
              const brightness = (r + g + b) / 3;
              // Threshold: cells are alive if brightness > threshold
              newGrid[y][x] = brightness > ditheringThreshold ? 1 : 0;
            }
          }
          
          setGrid(newGrid);
          gridRef.current = newGrid;
        } else if (simulationType === 'reaction-diffusion') {
          // Convert to continuous values (0-1) for reaction-diffusion
          const gridA = new Array(height).fill(null).map(() => new Array(width).fill(1)); // Substrate A starts at 1
          const gridB = new Array(height).fill(null).map(() => new Array(width).fill(0)); // Catalyst B starts at 0
          
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const idx = (y * width + x) * 4;
              const r = data[idx];
              const g = data[idx + 1];
              const b = data[idx + 2];
              const brightness = (r + g + b) / 255;
              // Use brightness to seed catalyst B
              gridB[y][x] = brightness;
            }
          }
          
          reactionGridRef.current = { gridA, gridB };
          // Use gridB for display (the visible pattern)
          setGrid(gridB);
          gridRef.current = gridB;
        } else if (simulationType === 'diffusion' || simulationType === 'slime-mold') {
          // Convert to continuous values (0-1)
          const newGrid = new Array(height).fill(null).map(() => new Array(width).fill(0));
          
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const idx = (y * width + x) * 4;
              const r = data[idx];
              const g = data[idx + 1];
              const b = data[idx + 2];
              const brightness = (r + g + b) / 255;
              newGrid[y][x] = brightness;
            }
          }
          
          if (simulationType === 'diffusion') {
            diffusionGridRef.current = newGrid;
          }
          setGrid(newGrid);
          gridRef.current = newGrid;
        }
        
        setGeneration(0);
        setIsRunning(false);
        hasInitializedRef.current = true; // Mark as initialized
        
        // Call onGridChange in a separate effect to avoid setState during render
        // Determine which grid to notify based on simulation type
        let gridToNotify;
        if (simulationType === 'reaction-diffusion') {
          gridToNotify = reactionGridRef.current?.gridB;
        } else if (simulationType === 'diffusion') {
          gridToNotify = diffusionGridRef.current;
        } else if (simulationType === 'cellular-automata') {
          // newGrid was set in the cellular-automata branch
          gridToNotify = gridRef.current;
        } else {
          // slime-mold - gridRef.current was set
          gridToNotify = gridRef.current;
        }
        
        if (onGridChangeRef.current && gridToNotify) {
          setTimeout(() => {
            onGridChangeRef.current?.(gridToNotify);
          }, 0);
        }
      } catch (error) {
        console.error('Error processing image for Game of Life:', error);
        setGrid(null);
      }
    }
  }, [imageData, cellSize, useDithering, ditheringMethod, ditheringThreshold, setGrid, setGeneration, setIsRunning, isEnabled, simulationType]);

  // Convert grid to texture data
  const gridToTextureData = useCallback((gridData) => {
    if (!gridData) return null;
    
    const width = gridData[0].length;
    const height = gridData.length;
    const data = new Uint8Array(width * height * 4);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const value = gridData[y][x];
        const idx = (y * width + x) * 4;
        // Handle both binary (0/1) and continuous (0-1) values
        const intensity = value === 1 ? 255 : Math.floor(value * 255);
        data[idx] = intensity;     // R
        data[idx + 1] = intensity; // G
        data[idx + 2] = intensity; // B
        data[idx + 3] = 255;       // A
      }
    }
    
    return { data, width, height };
  }, []);

  // Draw grid using WebGL
  const drawGrid = useCallback(() => {
    if (!canvasRef.current || !grid) return;
    
    const canvas = canvasRef.current;
    const width = grid[0].length;
    const height = grid.length;
    
    // Initialize WebGL renderer if needed
    if (!rendererRef.current) {
      rendererRef.current = new THREE.WebGLRenderer({ 
        canvas: canvas,
        antialias: false,
        preserveDrawingBuffer: true
      });
      rendererRef.current.setPixelRatio(1);
      
      // Create scene
      sceneRef.current = new THREE.Scene();
      cameraRef.current = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      
      // Create material
      materialRef.current = new GameOfLifeMaterial();
      
      // Create geometry and mesh
      const geometry = new THREE.PlaneGeometry(2, 2);
      meshRef.current = new THREE.Mesh(geometry, materialRef.current);
      sceneRef.current.add(meshRef.current);
    }
    
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const material = materialRef.current;
    
    // Convert grid to texture data
    const textureData = gridToTextureData(grid);
    if (!textureData) return;
    
    // Dispose old texture
    if (textureRef.current) {
      textureRef.current.dispose();
    }
    
    // Create new texture with current grid data
    textureRef.current = new THREE.DataTexture(
      textureData.data,
      textureData.width,
      textureData.height,
      THREE.RGBAFormat
    );
    textureRef.current.flipY = false;
    textureRef.current.needsUpdate = true;
    material.uniforms.tGrid.value = textureRef.current;
    
    // Update uniforms
    material.uniforms.uGridSize.value.set(width, height);
    material.uniforms.uCellSize.value = cellSize;
    
    if (displayMode === 'main') {
      // In main mode, scale canvas to fit container while maintaining aspect ratio
      const container = canvas.parentElement;
      if (container) {
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        const gridAspect = width / height;
        const containerAspect = containerWidth / containerHeight;
        
        let displayWidth, displayHeight;
        if (gridAspect > containerAspect) {
          // Grid is wider - fit to width
          displayWidth = containerWidth;
          displayHeight = containerWidth / gridAspect;
        } else {
          // Grid is taller - fit to height
          displayHeight = containerHeight;
          displayWidth = containerHeight * gridAspect;
        }
        
        // Set canvas display size (CSS)
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;
        
        // Set renderer size
        renderer.setSize(displayWidth, displayHeight);
        material.uniforms.uResolution.value.set(displayWidth, displayHeight);
      }
    } else {
      // Sidebar mode - original sizing
      const canvasWidth = width * cellSize;
      const canvasHeight = height * cellSize;
      canvas.style.width = '';
      canvas.style.height = '';
      renderer.setSize(canvasWidth, canvasHeight);
      material.uniforms.uResolution.value.set(canvasWidth, canvasHeight);
    }
    
    // Render
    renderer.render(scene, camera);
  }, [grid, cellSize, displayMode, gridToTextureData]);

  // Update canvas when grid changes or window resizes
  useEffect(() => {
    if (grid) {
      // Draw immediately to ensure each generation is visible
      drawGrid();
      
      if (displayMode === 'main') {
        const handleResize = () => {
          drawGrid();
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
      }
    }
  }, [drawGrid, displayMode, grid]);

  // Cleanup WebGL resources on unmount
  useEffect(() => {
    return () => {
      if (textureRef.current) {
        textureRef.current.dispose();
        textureRef.current = null;
      }
      if (materialRef.current) {
        materialRef.current.dispose();
        materialRef.current = null;
      }
      if (meshRef.current) {
        if (meshRef.current.geometry) {
          meshRef.current.geometry.dispose();
        }
        meshRef.current = null;
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, []);

  // Game loop
  useEffect(() => {
    // Don't run if conditions aren't met
    if (!isRunning || !grid || !isEnabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        intervalIdRef.current = null;
      }
      isUpdatingRef.current = false;
      return;
    }
    
    // CRITICAL: Sync ALL refs with actual state BEFORE creating interval
    // This ensures we always start from the correct state and simulation type
    gridRef.current = grid;
    simulationTypeRef.current = simulationType;
    automataRuleRef.current = automataRule;
    reactionDiffusionParamsRef.current = reactionDiffusionParams;
    diffusionRateRef.current = diffusionRate;
    bzParamsRef.current = bzParams;
    coralParamsRef.current = coralParams;
    morphParamsRef.current = morphParams;
    
    // Ensure reaction-diffusion state is initialized if we're using that simulation type
    if (simulationType === 'reaction-diffusion' && grid && (!reactionGridRef.current || !reactionGridRef.current.gridA)) {
      const width = grid[0].length;
      const height = grid.length;
      const gridA = new Array(height).fill(null).map(() => new Array(width).fill(1));
      const gridB = grid.map(row => row.map(val => typeof val === 'number' ? val : 0));
      reactionGridRef.current = { gridA, gridB };
    }
    
    // Clear any existing interval first to prevent duplicates
    if (intervalRef.current && intervalIdRef.current === intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      intervalIdRef.current = null;
    }
    isUpdatingRef.current = false;
    
    // Create interval that advances exactly one generation per tick
    const intervalId = setInterval(() => {
      // Double-check this is still the active interval (prevent stale intervals)
      if (intervalIdRef.current !== intervalId) {
        return;
      }
      
      // Skip if previous update is still processing
      if (isUpdatingRef.current) {
        return;
      }
      
      isUpdatingRef.current = true;
      
      // Use the ref to get the absolute latest grid state
      // But ensure it's in sync - use the ref value that was set at interval creation
      const currentGrid = gridRef.current;
      if (!currentGrid) {
        isUpdatingRef.current = false;
        if (intervalRef.current === intervalId) {
          clearInterval(intervalId);
          intervalRef.current = null;
          intervalIdRef.current = null;
        }
        return;
      }
      
      let newGrid;
      const width = currentGrid[0].length;
      const height = currentGrid.length;
      
      // Use refs to get the latest simulation type and rule (not closure values)
      const currentSimulationType = simulationTypeRef.current;
      const currentAutomataRule = automataRuleRef.current;
      
      // Compute next step based on simulation type
      if (currentSimulationType === 'cellular-automata') {
        newGrid = getNextGeneration(currentGrid, width, height, currentAutomataRule);
      } else if (currentSimulationType === 'reaction-diffusion') {
        const reactionState = reactionGridRef.current;
        if (!reactionState || !reactionState.gridA || !reactionState.gridB) {
          // If reaction-diffusion state is missing, initialize it from current grid
          const gridA = new Array(height).fill(null).map(() => new Array(width).fill(1));
          const gridB = currentGrid.map(row => row.map(val => val)); // Copy current grid as B
          reactionGridRef.current = { gridA, gridB };
          newGrid = gridB; // Display the B layer
        } else {
          const updated = updateReactionDiffusion(reactionState.gridA, reactionState.gridB, width, height, reactionDiffusionParamsRef.current);
          reactionGridRef.current = updated;
          newGrid = updated.gridB; // Display the B layer (catalyst)
        }
      } else if (currentSimulationType === 'diffusion') {
        newGrid = updateDiffusion(currentGrid, width, height, diffusionRateRef.current);
        diffusionGridRef.current = newGrid;
      } else if (currentSimulationType === 'slime-mold') {
        newGrid = updateSlimeMold(currentGrid, width, height);
      } else if (currentSimulationType === 'belousov-zhabotinsky') {
        newGrid = updateBelousovZhabotinsky(currentGrid, width, height, bzParamsRef.current);
      } else if (currentSimulationType === 'coral-growth') {
        newGrid = updateCoralGrowth(currentGrid, width, height, coralParamsRef.current);
      } else if (currentSimulationType === 'morphogenesis') {
        newGrid = updateMorphogenesis(currentGrid, width, height, morphParamsRef.current);
      } else {
        // Unknown simulation type - don't update
        isUpdatingRef.current = false;
        return;
      }
      
      // Update state FIRST - this ensures React state is the source of truth
      setGrid(newGrid);
      setGeneration(prev => prev + 1);
      
      // Then update ref to match - this ensures next iteration uses the new state
      gridRef.current = newGrid;
      
      // Call onGridChange asynchronously
      if (onGridChangeRef.current) {
        setTimeout(() => {
          onGridChangeRef.current?.(newGrid);
        }, 0);
      }
      
      // Clear the updating flag immediately after queuing the update
      // The interval timing (speed) will naturally prevent overlapping updates
      // Use a small fixed delay just to ensure React has queued the state update
      setTimeout(() => {
        isUpdatingRef.current = false;
      }, 10);
    }, speed);
    
    intervalRef.current = intervalId;
    intervalIdRef.current = intervalId;
    
    return () => {
      if (intervalRef.current === intervalId) {
        clearInterval(intervalId);
        intervalRef.current = null;
        intervalIdRef.current = null;
      }
      isUpdatingRef.current = false;
    };
    // Only depend on isRunning, speed, isEnabled, and ALL the values we need to sync
    // Include all state that affects simulation so refs are synced when any of them change
  }, [isRunning, speed, isEnabled, grid, simulationType, automataRule, reactionDiffusionParams, diffusionRate, bzParams, coralParams, morphParams]);

  const handleStep = () => {
    const currentGrid = gridRef.current || grid;
    if (!currentGrid) return;
    
    const width = currentGrid[0].length;
    const height = currentGrid.length;
    let newGrid;
    
    // Use refs to get the latest simulation type and rule
    const currentSimulationType = simulationTypeRef.current;
    const currentAutomataRule = automataRuleRef.current;
    
    // Compute next step based on simulation type
    if (currentSimulationType === 'cellular-automata') {
      newGrid = getNextGeneration(currentGrid, width, height, currentAutomataRule);
    } else if (currentSimulationType === 'reaction-diffusion') {
      const reactionState = reactionGridRef.current;
      if (reactionState) {
        const updated = updateReactionDiffusion(reactionState.gridA, reactionState.gridB, width, height, reactionDiffusionParamsRef.current);
        reactionGridRef.current = updated;
        newGrid = updated.gridB;
      } else {
        return;
      }
    } else if (currentSimulationType === 'diffusion') {
      newGrid = updateDiffusion(currentGrid, width, height, diffusionRateRef.current);
      diffusionGridRef.current = newGrid;
    } else if (currentSimulationType === 'slime-mold') {
      newGrid = updateSlimeMold(currentGrid, width, height);
    } else if (currentSimulationType === 'belousov-zhabotinsky') {
      newGrid = updateBelousovZhabotinsky(currentGrid, width, height, bzParamsRef.current);
    } else if (currentSimulationType === 'coral-growth') {
      newGrid = updateCoralGrowth(currentGrid, width, height, coralParamsRef.current);
    } else if (currentSimulationType === 'morphogenesis') {
      newGrid = updateMorphogenesis(currentGrid, width, height, morphParamsRef.current);
    } else {
      return;
    }
    
    // Update ref immediately
    gridRef.current = newGrid;
    
    // Update state
    setGrid(newGrid);
    setGeneration(prev => prev + 1);
    
    // Call onGridChange asynchronously
    if (onGridChangeRef.current) {
      setTimeout(() => {
        onGridChangeRef.current?.(newGrid);
      }, 0);
    }
  };

  const handleReset = () => {
    setIsRunning(false);
    setGeneration(0);
    // Re-initialize from image
    if (imageData && imageData.texture && imageData.texture.image) {
      const img = imageData.texture.image;
      const width = Math.floor(img.width / cellSize);
      const height = Math.floor(img.height / cellSize);
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      let imageDataObj = ctx.getImageData(0, 0, width, height);
      
      // Apply dithering if enabled
      if (useDithering) {
        const ditherFunction = ditheringMethod === 'ordered' ? applyOrderedDithering : applyFloydSteinbergDithering;
        imageDataObj = ditherFunction(
          imageDataObj,
          2, // levels (binary: alive/dead)
          ditheringThreshold,
          0, // contrast
          0, // brightness
          null, // colorPalette (not used for binary)
          50 // gradient
        );
      }
      
      const data = imageDataObj.data;
      
      const newGrid = new Array(height).fill(null).map(() => new Array(width).fill(0));
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const brightness = (r + g + b) / 3;
          newGrid[y][x] = brightness > ditheringThreshold ? 1 : 0;
        }
      }
      
      setGrid(newGrid);
      // Call onGridChange asynchronously
      if (onGridChangeRef.current) {
        setTimeout(() => {
          onGridChangeRef.current?.(newGrid);
        }, 0);
      }
    }
  };


  if (displayMode === 'main') {
    // Main canvas display mode - only show canvas when grid exists
    // The image preview will show when grid doesn't exist
    if (!grid) {
      return null; // Don't render anything - let the image show through
    }

    return (
      <div className="game-of-life-main-container">
        <canvas
          ref={canvasRef}
          className="game-of-life-canvas-main"
        />
      </div>
    );
  }

  // Sidebar panel mode
  if (!imageData) {
    return (
      <div className="game-of-life-panel">
        <div className="panel-section">
          <h3>Cellular Automata</h3>
          <div className="game-of-life-empty">
            <p>Load an image to start Cellular Automata</p>
          </div>
        </div>
      </div>
    );
  }

  const handleResetCellularAutomata = () => {
    setSpeed(300);
    setCellSize(4);
    setAutomataRule('game-of-life');
    setSimulationType('cellular-automata');
    setReactionDiffusionParams({ feed: 0.055, kill: 0.062, diffA: 1.0, diffB: 0.5 });
    setDiffusionRate(0.1);
  };

  const handleResetDithering = () => {
    setDitheringMethod('floyd-steinberg');
    setDitheringThreshold(128);
  };

  return (
    <div className="game-of-life-panel">
      {/* Start Image Section */}
      {imageData && (
        <div className="panel-section">
          <div className="section-header">
            <h3>Start Image</h3>
          </div>
          
          {/* Add Dithering - Show when dithering is not enabled */}
          {!useDithering && (
            <div 
              className="effect-add-item"
              onClick={() => setUseDithering(true)}
            >
              <span className="effect-add-label">Add dithering</span>
              <span className="effect-add-icon">+</span>
            </div>
          )}
          
          {/* Dithering Settings - Only show when dithering is enabled */}
          {useDithering && (
            <div className="effect-item">
              <div className="effect-item-header">
                <span className="effect-item-label">Dithering</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    onClick={handleResetDithering}
                    title="Reset to Default Settings"
                    className="remove-button"
                    style={{ 
                      width: '18px',
                      height: '18px',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <RotateCcwIcon size={12} />
                  </button>
                  <button
                    className="remove-button"
                    onClick={() => setUseDithering(false)}
                    title="Remove Dithering"
                  >
                    −
                  </button>
                </div>
              </div>
              <div className="dithering-settings">
                <div className="control-group">
                  <label>
                    <span>Method</span>
                    <select
                      value={ditheringMethod}
                      onChange={(e) => setDitheringMethod(e.target.value)}
                      disabled={isRunning}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        background: '#1a1a1a',
                        border: '1px solid #2a2a2a',
                        borderRadius: '4px',
                        color: '#ffffff',
                        fontSize: '12px',
                        marginTop: '8px'
                      }}
                    >
                      <option value="floyd-steinberg">Floyd-Steinberg</option>
                      <option value="ordered">Ordered</option>
                    </select>
                  </label>
                </div>
                
                <div className="control-group">
                  <label>
                    <span>Threshold</span>
                    <input
                      type="range"
                      min="0"
                      max="255"
                      step="1"
                      value={ditheringThreshold}
                      onChange={(e) => setDitheringThreshold(Number(e.target.value))}
                      disabled={isRunning}
                      style={{ width: '100%', marginTop: '8px' }}
                    />
                    <span className="value-display">{ditheringThreshold}</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cellular Automata Section */}
      {imageData && (
        <div className="panel-section">
          <div className="section-header">
            <h3>Cellular Automata</h3>
          </div>
          
          {/* Add Cellular Automata - Show when Cellular Automata is not enabled */}
          {!isEnabled && (
            <div 
              className="effect-add-item"
              onClick={() => setIsEnabled(true)}
            >
              <span className="effect-add-label">Add cellular automata</span>
              <span className="effect-add-icon">+</span>
            </div>
          )}
          
          {/* Cellular Automata Settings - Only show when Cellular Automata is enabled */}
          {isEnabled && (
            <div className="effect-item">
              <div className="effect-item-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="effect-item-label">Cellular Automata</span>
                  <div className="generation-counter" style={{ fontSize: '11px', color: '#888', fontFamily: 'monospace' }}>
                    Gen: {generation}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    onClick={handleResetCellularAutomata}
                    title="Reset to Default Settings"
                    className="remove-button"
                    style={{ 
                      width: '18px',
                      height: '18px',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <RotateCcwIcon size={12} />
                  </button>
                  <button
                    className="remove-button"
                    onClick={() => setIsEnabled(false)}
                    title="Remove Cellular Automata"
                  >
                    −
                  </button>
                </div>
              </div>
              
              <div className="dithering-settings">
                {/* Simulation Type Selection */}
                <div className="control-group">
                  <label>
                    <span>Simulation Type</span>
                    <select
                      value={simulationType}
                      onChange={(e) => setSimulationType(e.target.value)}
                      disabled={isRunning}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        background: '#1a1a1a',
                        border: '1px solid #2a2a2a',
                        borderRadius: '4px',
                        color: '#ffffff',
                        fontSize: '12px',
                        marginTop: '8px'
                      }}
                    >
                      <option value="cellular-automata">Cellular Automata</option>
                      <option value="reaction-diffusion">Reaction-Diffusion</option>
                      <option value="diffusion">Diffusion</option>
                      <option value="slime-mold">Slime Mold</option>
                      <option value="belousov-zhabotinsky">Belousov-Zhabotinsky</option>
                      <option value="coral-growth">Coral Growth</option>
                      <option value="morphogenesis">Morphogenesis</option>
                    </select>
                  </label>
                </div>
                
                {/* Rule Selection - Only show for cellular automata */}
                {simulationType === 'cellular-automata' && (
                  <div className="control-group">
                    <label>
                      <span>Rule</span>
                      <select
                        value={automataRule}
                        onChange={(e) => setAutomataRule(e.target.value)}
                        disabled={isRunning}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          background: '#1a1a1a',
                          border: '1px solid #2a2a2a',
                          borderRadius: '4px',
                          color: '#ffffff',
                          fontSize: '12px',
                          marginTop: '8px'
                        }}
                      >
                        <option value="game-of-life">Game of Life (B3/S23)</option>
                        <option value="seeds">Seeds (B2/S)</option>
                        <option value="highlife">HighLife (B36/S23)</option>
                        <option value="amoeba">Amoeba (B357/S1358)</option>
                        <option value="life-without-death">Life without Death (B3/S012345678)</option>
                        <option value="slow-death">Slow Death (B3/S01234567)</option>
                      </select>
                    </label>
                  </div>
                )}
                
                {/* Reaction-Diffusion Parameters */}
                {simulationType === 'reaction-diffusion' && (
                  <>
                    <div className="control-group">
                      <label>
                        <span>Feed Rate</span>
                        <input
                          type="range"
                          min="0.01"
                          max="0.1"
                          step="0.001"
                          value={reactionDiffusionParams.feed}
                          onChange={(e) => setReactionDiffusionParams(prev => ({ ...prev, feed: Number(e.target.value) }))}
                          disabled={isRunning}
                          style={{ width: '100%', marginTop: '8px' }}
                        />
                        <span className="value-display">{reactionDiffusionParams.feed.toFixed(3)}</span>
                      </label>
                    </div>
                    <div className="control-group">
                      <label>
                        <span>Kill Rate</span>
                        <input
                          type="range"
                          min="0.01"
                          max="0.1"
                          step="0.001"
                          value={reactionDiffusionParams.kill}
                          onChange={(e) => setReactionDiffusionParams(prev => ({ ...prev, kill: Number(e.target.value) }))}
                          disabled={isRunning}
                          style={{ width: '100%', marginTop: '8px' }}
                        />
                        <span className="value-display">{reactionDiffusionParams.kill.toFixed(3)}</span>
                      </label>
                    </div>
                  </>
                )}
                
                {/* Diffusion Parameters */}
                {simulationType === 'diffusion' && (
                  <div className="control-group">
                    <label>
                      <span>Diffusion Rate</span>
                      <input
                        type="range"
                        min="0.01"
                        max="0.5"
                        step="0.01"
                        value={diffusionRate}
                        onChange={(e) => setDiffusionRate(Number(e.target.value))}
                        disabled={isRunning}
                        style={{ width: '100%', marginTop: '8px' }}
                      />
                      <span className="value-display">{diffusionRate.toFixed(2)}</span>
                    </label>
                  </div>
                )}
                
                {/* Belousov-Zhabotinsky Parameters */}
                {simulationType === 'belousov-zhabotinsky' && (
                  <>
                    <div className="control-group">
                      <label>
                        <span>Threshold</span>
                        <input
                          type="range"
                          min="0.1"
                          max="0.9"
                          step="0.05"
                          value={bzParams.threshold}
                          onChange={(e) => setBzParams(prev => ({ ...prev, threshold: Number(e.target.value) }))}
                          disabled={isRunning}
                          style={{ width: '100%', marginTop: '8px' }}
                        />
                        <span className="value-display">{bzParams.threshold.toFixed(2)}</span>
                      </label>
                    </div>
                    <div className="control-group">
                      <label>
                        <span>Decay Rate</span>
                        <input
                          type="range"
                          min="0.05"
                          max="0.3"
                          step="0.01"
                          value={bzParams.decay}
                          onChange={(e) => setBzParams(prev => ({ ...prev, decay: Number(e.target.value) }))}
                          disabled={isRunning}
                          style={{ width: '100%', marginTop: '8px' }}
                        />
                        <span className="value-display">{bzParams.decay.toFixed(2)}</span>
                      </label>
                    </div>
                    <div className="control-group">
                      <label>
                        <span>Growth Rate</span>
                        <input
                          type="range"
                          min="0.1"
                          max="0.5"
                          step="0.05"
                          value={bzParams.growth}
                          onChange={(e) => setBzParams(prev => ({ ...prev, growth: Number(e.target.value) }))}
                          disabled={isRunning}
                          style={{ width: '100%', marginTop: '8px' }}
                        />
                        <span className="value-display">{bzParams.growth.toFixed(2)}</span>
                      </label>
                    </div>
                  </>
                )}
                
                {/* Coral Growth Parameters */}
                {simulationType === 'coral-growth' && (
                  <>
                    <div className="control-group">
                      <label>
                        <span>Growth Rate</span>
                        <input
                          type="range"
                          min="0.01"
                          max="0.2"
                          step="0.01"
                          value={coralParams.growthRate}
                          onChange={(e) => setCoralParams(prev => ({ ...prev, growthRate: Number(e.target.value) }))}
                          disabled={isRunning}
                          style={{ width: '100%', marginTop: '8px' }}
                        />
                        <span className="value-display">{coralParams.growthRate.toFixed(2)}</span>
                      </label>
                    </div>
                    <div className="control-group">
                      <label>
                        <span>Branch Probability</span>
                        <input
                          type="range"
                          min="0.01"
                          max="0.2"
                          step="0.01"
                          value={coralParams.branchProb}
                          onChange={(e) => setCoralParams(prev => ({ ...prev, branchProb: Number(e.target.value) }))}
                          disabled={isRunning}
                          style={{ width: '100%', marginTop: '8px' }}
                        />
                        <span className="value-display">{coralParams.branchProb.toFixed(2)}</span>
                      </label>
                    </div>
                    <div className="control-group">
                      <label>
                        <span>Decay Rate</span>
                        <input
                          type="range"
                          min="0.001"
                          max="0.05"
                          step="0.001"
                          value={coralParams.decayRate}
                          onChange={(e) => setCoralParams(prev => ({ ...prev, decayRate: Number(e.target.value) }))}
                          disabled={isRunning}
                          style={{ width: '100%', marginTop: '8px' }}
                        />
                        <span className="value-display">{coralParams.decayRate.toFixed(3)}</span>
                      </label>
                    </div>
                  </>
                )}
                
                {/* Morphogenesis Parameters */}
                {simulationType === 'morphogenesis' && (
                  <>
                    <div className="control-group">
                      <label>
                        <span>Diffusion</span>
                        <input
                          type="range"
                          min="0.01"
                          max="0.3"
                          step="0.01"
                          value={morphParams.diffusion}
                          onChange={(e) => setMorphParams(prev => ({ ...prev, diffusion: Number(e.target.value) }))}
                          disabled={isRunning}
                          style={{ width: '100%', marginTop: '8px' }}
                        />
                        <span className="value-display">{morphParams.diffusion.toFixed(2)}</span>
                      </label>
                    </div>
                    <div className="control-group">
                      <label>
                        <span>Reaction</span>
                        <input
                          type="range"
                          min="0.01"
                          max="0.2"
                          step="0.01"
                          value={morphParams.reaction}
                          onChange={(e) => setMorphParams(prev => ({ ...prev, reaction: Number(e.target.value) }))}
                          disabled={isRunning}
                          style={{ width: '100%', marginTop: '8px' }}
                        />
                        <span className="value-display">{morphParams.reaction.toFixed(2)}</span>
                      </label>
                    </div>
                    <div className="control-group">
                      <label>
                        <span>Threshold</span>
                        <input
                          type="range"
                          min="0.1"
                          max="0.9"
                          step="0.05"
                          value={morphParams.threshold}
                          onChange={(e) => setMorphParams(prev => ({ ...prev, threshold: Number(e.target.value) }))}
                          disabled={isRunning}
                          style={{ width: '100%', marginTop: '8px' }}
                        />
                        <span className="value-display">{morphParams.threshold.toFixed(2)}</span>
                      </label>
                    </div>
                  </>
                )}
                
                {/* Controls */}
                <div className="game-of-life-controls" style={{ marginBottom: '12px' }}>
                  <button
                    onClick={() => setIsRunning(!isRunning)}
                    className="control-button"
                    disabled={!grid}
                    style={{ flex: '1' }}
                  >
                    {isRunning ? <Pause size={16} /> : <Play size={16} />}
                    <span>{isRunning ? 'Pause' : 'Play'}</span>
                  </button>
                  
                  <button
                    onClick={handleStep}
                    className="control-button"
                    disabled={!grid || isRunning}
                    style={{ flex: '1' }}
                  >
                    <SkipForward size={16} />
                    <span>Step</span>
                  </button>
                  
                  <button
                    onClick={handleReset}
                    className="control-button"
                    disabled={!grid}
                    style={{ flex: '1' }}
                  >
                    <RotateCcw size={16} />
                    <span>Reset</span>
                  </button>
                </div>
                
                {/* Settings */}
                <div className="control-group">
                  <label>
                    <span>Speed</span>
                    <input
                      type="range"
                      min="50"
                      max="2000"
                      step="50"
                      value={speed}
                      onChange={(e) => setSpeed(Number(e.target.value))}
                      disabled={!grid || isRunning}
                      style={{ width: '100%', marginTop: '8px' }}
                    />
                    <span className="value-display">{speed}ms</span>
                  </label>
                </div>
                
                <div className="control-group">
                  <label>
                    <span>Cell Size</span>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      step="1"
                      value={cellSize}
                      onChange={(e) => setCellSize(Number(e.target.value))}
                      disabled={!grid || isRunning}
                      style={{ width: '100%', marginTop: '8px' }}
                    />
                    <span className="value-display">{cellSize}px</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default GameOfLife;

