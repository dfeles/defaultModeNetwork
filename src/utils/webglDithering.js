import * as THREE from 'three';
import DitheringMaterial from '../components/shaders/DitheringMaterial';
import ColorPaletteMaterial from '../components/shaders/ColorPaletteMaterial';
import AsciiMaterial, { ASCII_PRESETS } from '../components/shaders/AsciiMaterial';

// Shared WebGL renderer for ASCII processing to avoid creating too many contexts
let sharedAsciiRenderer = null;
let sharedAsciiCanvas = null;

function getSharedAsciiRenderer(width, height) {
  if (!sharedAsciiRenderer || !sharedAsciiCanvas) {
    sharedAsciiCanvas = document.createElement('canvas');
    sharedAsciiCanvas.width = width;
    sharedAsciiCanvas.height = height;
    sharedAsciiRenderer = new THREE.WebGLRenderer({ 
      canvas: sharedAsciiCanvas, 
      antialias: false, 
      preserveDrawingBuffer: true 
    });
    sharedAsciiRenderer.setPixelRatio(1);
  } else {
    // Resize if needed
    if (sharedAsciiCanvas.width !== width || sharedAsciiCanvas.height !== height) {
      sharedAsciiCanvas.width = width;
      sharedAsciiCanvas.height = height;
      sharedAsciiRenderer.setSize(width, height);
    }
  }
  
  return { renderer: sharedAsciiRenderer, canvas: sharedAsciiCanvas };
}

/**
 * Apply dithering to an image using WebGL shaders (for Ordered) or CPU (for Floyd-Steinberg)
 * @param {HTMLImageElement|HTMLCanvasElement} image - Source image
 * @param {Object} options - Dithering options
 * @returns {Promise<ImageData>} Dithered image data
 */
export async function applyWebGLDithering(image, options = {}) {
  const {
    resolution = 500,
    threshold = 128,
    contrast = 0,
    brightness = 0,
    colorCount = 2,
    colorPalette = null,
    gradient = 50,
    method = 'floyd-steinberg' // 'floyd-steinberg' or 'ordered'
  } = options;

  // Error diffusion algorithms require sequential processing and are hard to parallelize accurately
  // Use CPU-based implementation for all error diffusion methods, GPU for Ordered
  const errorDiffusionMethods = [
    'floyd-steinberg',
    'atkinson',
    'jarvis-judice-ninke',
    'stucki',
    'burkes',
    'sierra',
    'sierra-lite',
    'two-row-sierra'
  ];
  
  if (errorDiffusionMethods.includes(method)) {
    // Fall back to CPU implementation for accurate error diffusion
    const ditheringModule = await import('./dithering');
    let ditherFunction;
    
    switch (method) {
      case 'floyd-steinberg':
        ditherFunction = ditheringModule.applyFloydSteinbergDithering;
        break;
      case 'atkinson':
        ditherFunction = ditheringModule.applyAtkinsonDithering;
        break;
      case 'jarvis-judice-ninke':
        ditherFunction = ditheringModule.applyJarvisJudiceNinkeDithering;
        break;
      case 'stucki':
        ditherFunction = ditheringModule.applyStuckiDithering;
        break;
      case 'burkes':
        ditherFunction = ditheringModule.applyBurkesDithering;
        break;
      case 'sierra':
        ditherFunction = ditheringModule.applySierraDithering;
        break;
      case 'sierra-lite':
        ditherFunction = ditheringModule.applySierraLiteDithering;
        break;
      case 'two-row-sierra':
        ditherFunction = ditheringModule.applyTwoRowSierraDithering;
        break;
      default:
        ditherFunction = ditheringModule.applyFloydSteinbergDithering;
    }
    
    // Convert image to ImageData
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    
    if (image instanceof HTMLCanvasElement) {
      ctx.drawImage(image, 0, 0);
    } else {
      ctx.drawImage(image, 0, 0);
    }
    
    // Downsample if needed
    let processWidth = image.width;
    let processHeight = image.height;
    if (image.width > resolution || image.height > resolution) {
      if (image.width > image.height) {
        const scale = resolution / image.width;
        processWidth = resolution;
        processHeight = Math.round(image.height * scale);
      } else {
        const scale = resolution / image.height;
        processHeight = resolution;
        processWidth = Math.round(image.width * scale);
      }
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = processWidth;
      tempCanvas.height = processHeight;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(canvas, 0, 0, processWidth, processHeight);
      canvas.width = processWidth;
      canvas.height = processHeight;
      ctx.drawImage(tempCanvas, 0, 0);
    }
    
    const imageData = ctx.getImageData(0, 0, processWidth, processHeight);
    const dithered = ditherFunction(
      imageData,
      colorCount,
      threshold,
      contrast,
      brightness,
      colorCount > 2 ? colorPalette : null,
      gradient
    );
    
    return dithered;
  }
  
  // For Ordered dithering, use GPU

  return new Promise((resolve, reject) => {
    try {
      // Calculate target dimensions
      let targetWidth = image.width;
      let targetHeight = image.height;
      let scaleFactor = 1;

      if (image.width > resolution || image.height > resolution) {
        if (image.width > image.height) {
          scaleFactor = resolution / image.width;
          targetWidth = resolution;
          targetHeight = Math.round(image.height * scaleFactor);
        } else {
          scaleFactor = resolution / image.height;
          targetHeight = resolution;
          targetWidth = Math.round(image.width * scaleFactor);
        }
      }

      // Create WebGL renderer
      const renderer = new THREE.WebGLRenderer({ 
        canvas: document.createElement('canvas'),
        preserveDrawingBuffer: true,
        antialias: false
      });
      renderer.setSize(targetWidth, targetHeight);

      // Create scene
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      // Load texture from image
      let texture;
      if (image instanceof HTMLCanvasElement) {
        // For canvas, create texture directly
        texture = new THREE.CanvasTexture(image);
        texture.flipY = false; // Don't flip - we'll handle it in shader
        texture.needsUpdate = true;
        
        // Process immediately
        processTexture();
      } else {
        // For image elements, use texture loader
        const textureLoader = new THREE.TextureLoader();
        texture = textureLoader.load(
          image.src || URL.createObjectURL(new Blob([image])),
          processTexture,
          undefined,
          (error) => {
            reject(error);
          }
        );
      }
      
      function processTexture() {
        if (!texture) {
          reject(new Error('Failed to load texture'));
          return;
        }
        
        texture.flipY = false; // Don't flip - we'll handle it in shader
        texture.needsUpdate = true;
        
        // Create material
        const material = new DitheringMaterial();
        material.uniforms.tOriginal.value = texture; // Store original texture
        material.uniforms.tDiffuse.value = texture; // Start with original
        material.uniforms.uResolution.value.set(targetWidth, targetHeight);
        material.uniforms.uThreshold.value = threshold;
        material.uniforms.uContrast.value = contrast;
        material.uniforms.uBrightness.value = brightness;
        material.uniforms.uColorCount.value = colorCount;
        material.uniforms.uGradient.value = gradient;
        material.uniforms.uMethod.value = method === 'ordered' ? 1 : 0;
        material.uniforms.uPass.value = 0;

        // Set color palette
        if (colorPalette && colorPalette.length > 0) {
          material.setColorPalette(colorPalette);
        } else if (colorCount === 2) {
          material.setColorPalette(['#000000', '#ffffff']);
        } else {
          // Generate grayscale palette
          const palette = [];
          for (let i = 0; i < colorCount; i++) {
            const gray = Math.round((i / (colorCount - 1)) * 255);
            const hex = '#' + [gray, gray, gray].map(x => {
              const hex = x.toString(16);
              return hex.length === 1 ? '0' + hex : hex;
            }).join('');
            palette.push(hex);
          }
          material.setColorPalette(palette);
        }

        // Create plane geometry
        const geometry = new THREE.PlaneGeometry(2, 2);
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        // Render to canvas (Ordered dithering only - Floyd-Steinberg handled above)
        renderer.render(scene, camera);

        // Read pixels from WebGL canvas
        const canvas = renderer.domElement;
        const gl = renderer.getContext();
        const pixels = new Uint8Array(targetWidth * targetHeight * 4);
        gl.readPixels(0, 0, targetWidth, targetHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        
        // Create ImageData from pixels
        // With texture.flipY = true, the texture matches canvas coordinates (top-left origin)
        // readPixels reads from bottom-left, so we need to flip Y axis to get correct orientation
        const imageData = new ImageData(targetWidth, targetHeight);
        for (let y = 0; y < targetHeight; y++) {
          for (let x = 0; x < targetWidth; x++) {
            // Read from bottom row first (WebGL readPixels origin)
            const srcY = targetHeight - 1 - y;
            const srcIdx = (srcY * targetWidth + x) * 4;
            const dstIdx = (y * targetWidth + x) * 4;
            imageData.data[dstIdx] = pixels[srcIdx];
            imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
            imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
            imageData.data[dstIdx + 3] = pixels[srcIdx + 3];
          }
        }

        // Clean up
        texture.dispose();
        material.dispose();
        geometry.dispose();
        renderer.dispose();

        resolve(imageData);
      }
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Apply dithering and return as ImageData (for use with canvas)
 * @param {ImageData|HTMLImageElement|HTMLCanvasElement} source - Source image
 * @param {Object} options - Dithering options
 * @returns {Promise<ImageData>} Dithered image data
 */
export async function ditherImageData(source, options = {}) {
  let image;
  
  if (source instanceof ImageData) {
    // Convert ImageData to canvas
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(source, 0, 0);
    image = canvas;
  } else if (source instanceof HTMLImageElement || source instanceof HTMLCanvasElement) {
    image = source;
  } else {
    throw new Error('Unsupported source type');
  }

  return applyWebGLDithering(image, options);
}

/**
 * Apply color palette quantization to an image using WebGL shaders
 * @param {HTMLImageElement|HTMLCanvasElement} image - Source image
 * @param {Object} options - Color palette options
 * @returns {Promise<ImageData>} Quantized image data
 */
export async function applyWebGLColorPalette(image, options = {}) {
  const {
    colorPalette = null
  } = options;

  if (!colorPalette || colorPalette.length === 0) {
    // No palette, return original image
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = image.width || image.naturalWidth;
    canvas.height = image.height || image.naturalHeight;
    ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  return new Promise((resolve, reject) => {
    try {
      const targetWidth = image.width || image.naturalWidth;
      const targetHeight = image.height || image.naturalHeight;

      // Create WebGL renderer
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
      renderer.setSize(targetWidth, targetHeight);
      renderer.setPixelRatio(1); // Use 1:1 pixel ratio for exact pixel matching

      // Create scene
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      // Load texture
      const textureLoader = new THREE.TextureLoader();
      const texture = textureLoader.load(
        image.src || (image instanceof HTMLCanvasElement ? image.toDataURL() : ''),
        function(texture) {
          processTexture();
        },
        undefined,
        function(error) {
          reject(new Error('Failed to load texture: ' + error));
        }
      );

      function processTexture() {
        if (!texture) {
          reject(new Error('Failed to load texture'));
          return;
        }
        
        texture.flipY = false; // Don't flip - we'll handle it in shader
        texture.needsUpdate = true;
        
        // Create material
        const material = new ColorPaletteMaterial();
        material.uniforms.tDiffuse.value = texture;
        material.uniforms.uResolution.value.set(targetWidth, targetHeight);
        material.uniforms.uColorCount.value = colorPalette.length;
        material.setColorPalette(colorPalette);

        // Create plane geometry
        const geometry = new THREE.PlaneGeometry(2, 2);
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        // Render to canvas
        renderer.render(scene, camera);

        // Read pixels from WebGL canvas
        const gl = renderer.getContext();
        const pixels = new Uint8Array(targetWidth * targetHeight * 4);
        gl.readPixels(0, 0, targetWidth, targetHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        // Create ImageData (WebGL reads from bottom-left, but shader flips Y, so this should be correct)
        const imageData = new ImageData(targetWidth, targetHeight);
        for (let y = 0; y < targetHeight; y++) {
          for (let x = 0; x < targetWidth; x++) {
            // Read from bottom row first (WebGL readPixels origin)
            const srcY = targetHeight - 1 - y;
            const srcIdx = (srcY * targetWidth + x) * 4;
            const dstIdx = (y * targetWidth + x) * 4;
            imageData.data[dstIdx] = pixels[srcIdx];
            imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
            imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
            imageData.data[dstIdx + 3] = pixels[srcIdx + 3];
          }
        }

        // Clean up
        texture.dispose();
        material.dispose();
        geometry.dispose();
        renderer.dispose();

        resolve(imageData);
      }
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Apply ASCII effect to an image using WebGL shaders
 * @param {HTMLImageElement|HTMLCanvasElement} image - Source image
 * @param {Object} options - ASCII effect options
 * @returns {Promise<ImageData>} ASCII-processed image data
 */
export async function applyWebGLAscii(image, options = {}) {
  const {
    cellSize = 8,
    charSet = 'standard'
  } = options;

  const charSetString = ASCII_PRESETS[charSet] || ASCII_PRESETS['standard'];

  return new Promise((resolve, reject) => {
    let scene = null;
    let camera = null;
    let loadedTexture = null;
    let material = null;
    let geometry = null;
    
    // Cleanup function - dispose resources but keep shared renderer
    const cleanup = () => {
      if (loadedTexture) {
        loadedTexture.dispose();
        loadedTexture = null;
      }
      if (material) {
        material.dispose();
        material = null;
      }
      if (geometry) {
        geometry.dispose();
        geometry = null;
      }
      // Don't dispose shared renderer - it will be reused
    };
    
    try {
      const targetWidth = image.width || image.naturalWidth;
      const targetHeight = image.height || image.naturalHeight;

      // Use shared renderer to avoid creating too many WebGL contexts
      const { renderer, canvas } = getSharedAsciiRenderer(targetWidth, targetHeight);
      const rendererRef = renderer; // Keep reference for use in processTexture

      // Create scene
      scene = new THREE.Scene();
      camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      // Load texture
      const textureLoader = new THREE.TextureLoader();
      
      textureLoader.load(
        image.src || (image instanceof HTMLCanvasElement ? image.toDataURL() : ''),
        function(texture) {
          loadedTexture = texture;
          processTexture();
        },
        undefined,
        function(error) {
          cleanup();
          reject(new Error('Failed to load texture: ' + error));
        }
      );

      async function processTexture() {
        if (!loadedTexture) {
          cleanup();
          reject(new Error('Failed to load texture'));
          return;
        }
        
        try {
          loadedTexture.flipY = false;
          loadedTexture.needsUpdate = true;
          
          // Create material
          material = new AsciiMaterial();
          material.uniforms.tDiffuse.value = loadedTexture;
          material.uniforms.uResolution.value.set(targetWidth, targetHeight);
          material.uniforms.uCellSize.value = cellSize;
          
          // Wait for character atlas to be created (will use cache if available)
          await material.setCharSet(charSetString);
          
          // Verify atlas was created
          if (!material.uniforms.tCharAtlas.value) {
            throw new Error('Character atlas texture was not created');
          }

          // Create plane geometry
          geometry = new THREE.PlaneGeometry(2, 2);
          const mesh = new THREE.Mesh(geometry, material);
          scene.add(mesh);

          // Render to canvas
          rendererRef.render(scene, camera);

          // Read pixels from WebGL canvas
          const gl = rendererRef.getContext();
          const pixels = new Uint8Array(targetWidth * targetHeight * 4);
          gl.readPixels(0, 0, targetWidth, targetHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

          // Create ImageData (WebGL reads from bottom-left, but shader flips Y, so this should be correct)
          const imageData = new ImageData(targetWidth, targetHeight);
          for (let y = 0; y < targetHeight; y++) {
            for (let x = 0; x < targetWidth; x++) {
              // Read from bottom row first (WebGL readPixels origin)
              const srcY = targetHeight - 1 - y;
              const srcIdx = (srcY * targetWidth + x) * 4;
              const dstIdx = (y * targetWidth + x) * 4;
              imageData.data[dstIdx] = pixels[srcIdx];
              imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
              imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
              imageData.data[dstIdx + 3] = pixels[srcIdx + 3];
            }
          }

          // Clean up
          cleanup();

          resolve(imageData);
        } catch (error) {
          console.error('Error in processTexture:', error);
          cleanup();
          reject(error);
        }
      }
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

