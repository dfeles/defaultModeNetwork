import React, { useState, useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Menu, Settings } from 'lucide-react';
import STLViewer from './components/STLViewer';
import ImageViewer from './components/ImageViewer';
import ControlPanel from './components/ControlPanel';
import ExportPanel from './components/ExportPanel';
import { exportSceneToSVG, downloadSVG, exportImageToSVG } from './utils/svgExporter';
import { getSTLFileURL, getImageFileURL } from './config/stlFiles';
import { applyFloydSteinbergDithering } from './utils/dithering';
import { saveState, loadState, saveLoadedImages, loadLoadedImages } from './utils/statePersistence';

import { DevOverlay } from 'mindone'
import './App.css';

function SceneExporter({ meshData, edgeSettings, onExport, onSVGGenerated, applyDithering }) {
  const { scene, camera, gl, size } = useThree();
  
  React.useEffect(() => {
    if (meshData && onSVGGenerated) {
      const generateFn = () => {
        const svgString = exportSceneToSVG(scene, camera, gl, {
          width: size.width,
          height: size.height,
          edgeSettings,
          meshData,
          applyDithering
        });
        onSVGGenerated(svgString);
      };
      
      // Store generate function
      window.generateSVG = generateFn;
    }
  }, [scene, camera, gl, size, meshData, edgeSettings, onExport, onSVGGenerated, applyDithering]);
  
  return null;
}

function ImageExporter({ imageData, onExport, onSVGGenerated, applyDithering, exportMode, pixelFilter, autoGenerate = false }) {
  const { gl, size } = useThree();
  
  React.useEffect(() => {
    if (imageData && imageData.texture && onSVGGenerated) {
      const generateFn = () => {
        const svgString = exportImageToSVG(imageData.texture, gl, {
          width: size.width,
          height: size.height,
          imageWidth: imageData.width,
          imageHeight: imageData.height,
          applyDithering,
          exportMode,
          pixelFilter
        });
        onSVGGenerated(svgString);
      };
      
      // Store generate function
      window.generateImageSVG = generateFn;
      
      // Auto-generate if requested
      if (autoGenerate) {
        // Small delay to ensure everything is ready
        const timer = setTimeout(() => {
          generateFn();
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [imageData, gl, size, onExport, onSVGGenerated, applyDithering, autoGenerate]);
  
  return null;
}

function App() {
  const [stlFile, setStlFile] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imageData, setImageData] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null); // For immediate display (original image)
  const [processedPreviewUrl, setProcessedPreviewUrl] = useState(null); // For processed preview (with dithering)
  const [meshData, setMeshData] = useState(null);
  const [generatedSVG, setGeneratedSVG] = useState(null);
  const [selectedDefaultFile, setSelectedDefaultFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [inputMode, setInputMode] = useState('image'); // 'stl' or 'image'
  const [loadedImages, setLoadedImages] = useState([]); // Track loaded images for the file list
  const [edgeSettings, setEdgeSettings] = useState({
    threshold: 0.1,
    color: '#000000',
    width: 1,
    shadingColors: 1
  });
  const [isStateLoaded, setIsStateLoaded] = useState(false); // Track if we've loaded saved state
  const [applyDithering, setApplyDithering] = useState(false);
  const [ditheringResolution, setDitheringResolution] = useState(500); // Resolution for dithering (1-1000)
  const [ditheringThreshold, setDitheringThreshold] = useState(128); // Threshold for dithering (0-255)
  const [ditheringContrast, setDitheringContrast] = useState(0); // Contrast adjustment (-100 to 100)
  const [ditheringBrightness, setDitheringBrightness] = useState(0); // Brightness adjustment (-100 to 100)
  const [viewMode, setViewMode] = useState('svg'); // '3d' or 'svg' - start with svg for images
  const [exportMode, setExportMode] = useState('optimized'); // 'optimized' or 'simple' (for images)
  const [stlExportMode, setStlExportMode] = useState('geometric'); // 'geometric' or 'shader' (for 3D)
  const [pixelFilter, setPixelFilter] = useState('both'); // 'white', 'black', or 'both'
  const [renderBackground, setRenderBackground] = useState(true); // Whether to render background in SVG
  const [isDragging, setIsDragging] = useState(false);
  const [initialScale, setInitialScale] = useState(0.5); // Start with a smaller default scale
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const canvasRef = useRef(null);
  const exportTriggerRef = useRef(0);
  const dragCounterRef = useRef(0);
  const loadedImagesRef = useRef([]);
  const previewContainerRef = useRef(null);
  const transformRef = useRef(null);
  const hasCenteredInitialViewRef = useRef(false); // Track if we've done initial centering
  const currentImageKeyRef = useRef(null); // Track current image to detect image changes

  const handleFileUpload = (file, mode, isExistingSelection = false) => {
    setIsLoading(true);
    setMeshData(null); // Clear previous mesh data
    setImageData(null); // Clear previous image data
    setImagePreviewUrl(null); // Clear previous image preview
    setProcessedPreviewUrl(null); // Clear processed preview
    setGeneratedSVG(null); // Clear previous SVG
    
    if (mode === 'image') {
      // Clear STL-related state when selecting image
      setSelectedDefaultFile(null);
      setStlFile(null);
      setImageFile(file);
      setStlFile(null);
      setInputMode('image');
      
      if (isExistingSelection) {
        // Just load the existing image, don't reorder
        // Update file reference and thumbnail if needed, but keep position
        setLoadedImages(prev => {
          const updated = prev.map(img => {
            if (img.name === file.name) {
              // Update file reference and thumbnail
              if (img.thumbnailUrl) {
                URL.revokeObjectURL(img.thumbnailUrl);
              }
              return {
                ...img,
                file: file,
                thumbnailUrl: URL.createObjectURL(file)
              };
            }
            return img;
          });
          loadedImagesRef.current = updated;
          return updated;
        });
      } else {
        // New upload - add to top of loaded images list
        setLoadedImages(prev => {
          // Check if image with same name already exists
          const existingIndex = prev.findIndex(img => img.name === file.name);
          let result;
          if (existingIndex !== -1) {
            // Remove existing entry and add to top with updated file reference
            const updated = [...prev];
            const existing = updated.splice(existingIndex, 1)[0];
            // Update the file reference in case it's a new file object
            existing.file = file;
            // Revoke old thumbnail URL and create new one
            if (existing.thumbnailUrl) {
              URL.revokeObjectURL(existing.thumbnailUrl);
            }
            existing.thumbnailUrl = URL.createObjectURL(file);
            result = [existing, ...updated];
          } else {
            // Add new image entry with thumbnail URL
            const thumbnailUrl = URL.createObjectURL(file);
            const imageEntry = {
              name: file.name,
              file: file,
              type: 'image',
              id: Date.now(), // Simple ID for React keys
              thumbnailUrl: thumbnailUrl
            };
            result = [imageEntry, ...prev];
          }
          loadedImagesRef.current = result;
          return result;
        });
      }
    } else {
      setStlFile(file);
      setImageFile(null);
      setInputMode('stl');
    }
  };

  // Calculate initial scale to fit image in viewport with padding
  const calculateInitialScale = (imageWidth, imageHeight) => {
    if (!imageWidth || !imageHeight) {
      return 0.5;
    }
    
    // Get container dimensions
    const container = document.querySelector('.canvas-container');
    if (!container) {
      return 0.5;
    }
    
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    if (!containerWidth || !containerHeight) {
      return 0.5;
    }
    
    // Add padding (40px on each side = 80px total)
    const padding = 80;
    const availableWidth = containerWidth - padding;
    const availableHeight = containerHeight - padding;
    
    if (availableWidth <= 0 || availableHeight <= 0) {
      return 0.5;
    }
    
    const imageAspect = imageWidth / imageHeight;
    const containerAspect = availableWidth / availableHeight;
    
    let scale;
    if (imageAspect > containerAspect) {
      // Image is wider - fit to width
      scale = availableWidth / imageWidth;
    } else {
      // Image is taller - fit to height
      scale = availableHeight / imageHeight;
    }
    
    // Ensure the image is fully visible with some margin
    // Use 95% of calculated scale to add a bit more breathing room
    scale = scale * 0.95;
    
    // Clamp between 0.01 and 1 to ensure it's visible but not too small
    return Math.max(0.01, Math.min(1, scale));
  };

  const handleImageLoaded = (data) => {
    setImageData(data);
    setIsLoading(false);
    // Automatically switch to 2D mode when image loads
    setViewMode('svg');
    
    // Reset centering flag when new image loads
    hasCenteredInitialViewRef.current = false;
    
    // Calculate initial scale to fit the image
    if (data && data.width && data.height) {
      // Calculate scale immediately, then recalculate after a short delay when container is ready
      const calculateScale = () => {
        const scale = calculateInitialScale(data.width, data.height);
        setInitialScale(scale);
      };
      
      // Try immediately first
      calculateScale();
      
      // Then recalculate after container is rendered
      setTimeout(calculateScale, 100);
      setTimeout(calculateScale, 300); // Extra check after layout
    }
    
    // Create preview URL immediately for instant display
    if (data && data.texture && data.texture.image) {
      // Create a canvas to get the image data URL for immediate preview
      const canvas = document.createElement('canvas');
      canvas.width = data.width;
      canvas.height = data.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(data.texture.image, 0, 0);
      const previewUrl = canvas.toDataURL('image/png');
      setImagePreviewUrl(previewUrl);
    }
  };

  // Recalculate initial scale when window resizes or image loads
  useEffect(() => {
    if (!imageData || !imageData.width || !imageData.height) return;
    
      const recalculateScale = () => {
        const scale = calculateInitialScale(imageData.width, imageData.height);
        setInitialScale(scale);
      };
    
    // Calculate immediately
    recalculateScale();
    
    // Also recalculate after a delay to ensure container is fully rendered
    const timeout1 = setTimeout(recalculateScale, 50);
    const timeout2 = setTimeout(recalculateScale, 200);
    const timeout3 = setTimeout(recalculateScale, 500);
    
    const handleResize = () => {
      recalculateScale();
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      clearTimeout(timeout1);
      clearTimeout(timeout2);
      clearTimeout(timeout3);
      window.removeEventListener('resize', handleResize);
    };
  }, [imageData]);

  // Center the view only when a new image loads (not on every preview update)
  useEffect(() => {
    // Only center on initial load of a new image, not on preview updates
    const imageKey = imageFile?.name || imageFile?.size;
    const isNewImage = imageKey && imageKey !== currentImageKeyRef.current;
    
    if (isNewImage) {
      // Reset the centering flag for new image
      hasCenteredInitialViewRef.current = false;
      currentImageKeyRef.current = imageKey;
    }
    
    if ((processedPreviewUrl || imagePreviewUrl) && transformRef.current?.centerView && !hasCenteredInitialViewRef.current) {
      // Use multiple timeouts to ensure the DOM is ready
      const timer1 = setTimeout(() => {
        if (transformRef.current?.centerView && !hasCenteredInitialViewRef.current) {
          transformRef.current.centerView();
          hasCenteredInitialViewRef.current = true;
        }
      }, 50);
      const timer2 = setTimeout(() => {
        if (transformRef.current?.centerView && !hasCenteredInitialViewRef.current) {
          transformRef.current.centerView();
          hasCenteredInitialViewRef.current = true;
        }
      }, 200);
      const timer3 = setTimeout(() => {
        if (transformRef.current?.centerView && !hasCenteredInitialViewRef.current) {
          transformRef.current.centerView();
          hasCenteredInitialViewRef.current = true;
        }
      }, 500);
      
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
      };
    }
  }, [processedPreviewUrl, imagePreviewUrl, imageFile]);

  // Generate preview image when image data or dithering settings change (fast preview)
  // This only generates a preview image, NOT SVG
  useEffect(() => {
    if (inputMode === 'image' && imageData && imageData.texture && imageData.texture.image) {
      const generatePreview = () => {
        try {
          // For dithering, downsample first, then apply dithering, then scale back up for display
          let processWidth = imageData.width;
          let processHeight = imageData.height;
          let scaleFactor = 1;
          
          if (applyDithering) {
            // Downsample to dithering resolution before processing
            const targetDimension = ditheringResolution;
            if (imageData.width > targetDimension || imageData.height > targetDimension) {
              if (imageData.width > imageData.height) {
                scaleFactor = targetDimension / imageData.width;
                processWidth = targetDimension;
                processHeight = Math.round(imageData.height * scaleFactor);
              } else {
                scaleFactor = targetDimension / imageData.height;
                processHeight = targetDimension;
                processWidth = Math.round(imageData.width * scaleFactor);
              }
            }
          }
          
          // Create a temporary canvas for processing
          const processCanvas = document.createElement('canvas');
          processCanvas.width = processWidth;
          processCanvas.height = processHeight;
          const processCtx = processCanvas.getContext('2d');
          
          // Draw the image to the processing canvas (downsampled if dithering)
          processCtx.drawImage(imageData.texture.image, 0, 0, processWidth, processHeight);
          
          // Apply dithering if requested (on downsampled image)
          if (applyDithering) {
            const imageDataObj = processCtx.getImageData(0, 0, processWidth, processHeight);
            const ditheredData = applyFloydSteinbergDithering(
              imageDataObj, 
              2, 
              ditheringThreshold, 
              ditheringContrast, 
              ditheringBrightness
            );
            processCtx.putImageData(ditheredData, 0, 0);
          }
          
          // Create display canvas (original size for preview)
          const displayCanvas = document.createElement('canvas');
          displayCanvas.width = imageData.width;
          displayCanvas.height = imageData.height;
          const displayCtx = displayCanvas.getContext('2d');
          
          // Scale the processed image back up to original size for display
          displayCtx.drawImage(processCanvas, 0, 0, imageData.width, imageData.height);
          
          // Convert to data URL for preview
          const previewUrl = displayCanvas.toDataURL('image/png');
          setProcessedPreviewUrl(previewUrl);
        } catch (error) {
          console.error('Error generating preview:', error);
        }
      };
      
      // Generate preview immediately (fast, non-blocking)
      if (window.requestIdleCallback) {
        requestIdleCallback(generatePreview, { timeout: 500 });
      } else {
        setTimeout(generatePreview, 0);
      }
    } else {
      // Clear processed preview if no image
      setProcessedPreviewUrl(null);
    }
  }, [inputMode, imageData, applyDithering, ditheringResolution, ditheringThreshold, ditheringContrast, ditheringBrightness]);


  const handleDefaultFileSelect = React.useCallback(async (filename) => {
    if (!filename) {
      setSelectedDefaultFile(null);
      setStlFile(null);
      setMeshData(null);
      setIsLoading(false);
      return;
    }
    
    // Determine file type
    const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(filename);
    const isSTL = filename.endsWith('.stl');
    
    setSelectedDefaultFile(filename);
    setGeneratedSVG(null); // Clear previous SVG
    setIsLoading(true);
    
    try {
      const url = isImage ? getImageFileURL(filename) : getSTLFileURL(filename);
      console.log(`Loading ${isImage ? 'image' : 'STL'} from: ${url}`);
      const response = await fetch(url, {
        // Add cache control to avoid stale responses
        cache: 'no-cache',
        // Add headers that might help with Chrome
        headers: {
          'Accept': isImage ? 'image/*' : 'application/octet-stream'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`HTTP ${response.status} error loading ${filename} from ${url}:`, errorText);
        setIsLoading(false);
        alert(`Could not load ${filename} (HTTP ${response.status}). The file may not exist on GitHub. Please check the console for details.`);
        return;
      }

      const blob = await response.blob();
      
      // Check content-type for images
      if (isImage) {
        const blobType = blob.type;
        if (!blobType || !blobType.startsWith('image/')) {
          // Might be HTML error page, check first bytes
          const firstBytes = await blob.slice(0, 100).text();
          if (firstBytes.trim().toLowerCase().startsWith('<!doctype') || 
              firstBytes.trim().toLowerCase().startsWith('<html')) {
            console.error(`Received HTML instead of image. URL: ${url}`);
            console.error(`HTML preview:`, firstBytes.substring(0, 500));
            setIsLoading(false);
            alert(`Received HTML error page instead of image for ${filename}. The file may not exist on GitHub. Check console for details.`);
            return;
          }
        }
      }
      
      // Validate blob size
      if (blob.size < 1000) {
        // Might be an error page, try to read it
        const text = await blob.text();
        console.error(`File too small or invalid. URL: ${url}, Size: ${blob.size} bytes`);
        console.error(`Response preview:`, text.substring(0, 500));
        setIsLoading(false);
        alert(`Invalid file received for ${filename}. The file might not exist or the URL is incorrect. Check console for details.`);
        return;
      }

      // Check if it's actually HTML (error page) - for non-images
      if (!isImage) {
        const firstBytes = await blob.slice(0, 100).text();
        if (firstBytes.trim().toLowerCase().startsWith('<!doctype') || 
            firstBytes.trim().toLowerCase().startsWith('<html')) {
          console.error(`Received HTML instead of file. URL: ${url}`);
          console.error(`HTML preview:`, firstBytes.substring(0, 500));
          setIsLoading(false);
          alert(`Received HTML error page instead of file for ${filename}. Check console for details.`);
          return;
        }
      }

      if (isImage) {
        // Handle image file
        setStlFile(null);
        setMeshData(null);
        setInputMode('image');
        setViewMode('svg'); // Images show in SVG view
        const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
        setImageFile(file);
        // Image will be loaded by ImageViewer component
      } else {
        // Handle STL file
        setImageFile(null);
        setImageData(null);
        setImagePreviewUrl(null);
        setInputMode('stl');
        setViewMode('3d'); // Reset to 3D view for STL files
        setMeshData(null); // Clear previous mesh data
        const file = new File([blob], filename, { type: 'model/stl' });
        setStlFile(file);
      }
    } catch (error) {
      console.error(`Error loading ${filename}:`, error);
      setIsLoading(false);
      alert(`Error loading ${filename}: ${error.message}`);
    }
  }, []);

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      const isImage = file.type.startsWith('image/') || 
                     /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file.name);
      const isSTL = file.name.endsWith('.stl');
      
      if (isSTL) {
        handleFileUpload(file, 'stl');
      } else if (isImage) {
        handleFileUpload(file, 'image');
      } else {
        alert('Please drop a valid STL file or image (jpg, png, gif, etc.)');
      }
    }
  };

  // Load saved state on mount
  useEffect(() => {
    const savedState = loadState();
    const savedImages = loadLoadedImages();
    
    if (savedState) {
      // Restore settings
      setInputMode(savedState.inputMode || 'image');
      setViewMode(savedState.viewMode || 'svg');
      setEdgeSettings(savedState.edgeSettings || {
        threshold: 0.1,
        color: '#000000',
        width: 1,
        shadingColors: 1
      });
      setApplyDithering(savedState.applyDithering || false);
      setDitheringResolution(savedState.ditheringResolution || 500);
      setDitheringThreshold(savedState.ditheringThreshold || 128);
      setDitheringContrast(savedState.ditheringContrast || 0);
      setDitheringBrightness(savedState.ditheringBrightness || 0);
      setExportMode(savedState.exportMode || 'optimized');
      setStlExportMode(savedState.stlExportMode || 'geometric');
      setPixelFilter(savedState.pixelFilter || 'both');
      setRenderBackground(savedState.renderBackground !== undefined ? savedState.renderBackground : true);
      setInitialScale(savedState.initialScale || 0.5);
      
      // Restore loaded images metadata (without file objects)
      if (savedImages && savedImages.length > 0) {
        setLoadedImages(savedImages);
        loadedImagesRef.current = savedImages;
      }
      
      // Restore selected file
      if (savedState.selectedDefaultFile) {
        setSelectedDefaultFile(savedState.selectedDefaultFile);
        // Load the file
        handleDefaultFileSelect(savedState.selectedDefaultFile);
      } else if (savedState.currentImageFileName) {
        // Try to find the image in loaded images or default files
        const foundImage = savedImages?.find(img => img.name === savedState.currentImageFileName);
        if (foundImage) {
          // Image was in loaded images, but we can't restore the file object
          // User will need to re-upload or we could try to load from default files
          console.log('Saved image found in metadata, but file object cannot be restored');
        }
        // Check if it's a default file
        const defaultFiles = [
          { value: 'clouds.jpg', label: 'Clouds', type: 'image' },
          { value: '24_cell_Schlegel.stl', label: '24-Cell (Schlegel)', type: 'stl' },
          { value: '120_Cell.stl', label: '120-Cell', type: 'stl' },
          { value: '600_cell.stl', label: '600-Cell', type: 'stl' }
        ];
        const defaultFile = defaultFiles.find(f => f.value === savedState.currentImageFileName);
        if (defaultFile) {
          setSelectedDefaultFile(savedState.currentImageFileName);
          handleDefaultFileSelect(savedState.currentImageFileName);
        }
      } else if (savedState.currentStlFileName) {
        // Try to load STL file
        const defaultFiles = [
          { value: '24_cell_Schlegel.stl', label: '24-Cell (Schlegel)', type: 'stl' },
          { value: '120_Cell.stl', label: '120-Cell', type: 'stl' },
          { value: '600_cell.stl', label: '600-Cell', type: 'stl' }
        ];
        const defaultFile = defaultFiles.find(f => f.value === savedState.currentStlFileName);
        if (defaultFile) {
          setSelectedDefaultFile(savedState.currentStlFileName);
          handleDefaultFileSelect(savedState.currentStlFileName);
        }
      } else {
        // No saved file, load default
        setSelectedDefaultFile('clouds.jpg');
        handleDefaultFileSelect('clouds.jpg');
      }
    } else {
      // No saved state, load default file
      setSelectedDefaultFile('clouds.jpg');
      handleDefaultFileSelect('clouds.jpg');
    }
    
    setIsStateLoaded(true);
  }, [handleDefaultFileSelect]);

  // Save state whenever relevant state changes (but only after initial load)
  useEffect(() => {
    if (!isStateLoaded) return; // Don't save during initial load
    
    saveState({
      selectedDefaultFile,
      imageFile,
      stlFile,
      inputMode,
      viewMode,
      edgeSettings,
      applyDithering,
      ditheringResolution,
      ditheringThreshold,
      ditheringContrast,
      ditheringBrightness,
      exportMode,
      stlExportMode,
      pixelFilter,
      renderBackground,
      initialScale
    });
  }, [
    selectedDefaultFile,
    imageFile,
    stlFile,
    inputMode,
    viewMode,
    edgeSettings,
    applyDithering,
    ditheringResolution,
    ditheringThreshold,
    ditheringContrast,
    ditheringBrightness,
      exportMode,
      stlExportMode,
      pixelFilter,
      renderBackground,
      initialScale,
      isStateLoaded
  ]);

  // Save loaded images whenever they change
  useEffect(() => {
    if (!isStateLoaded) return; // Don't save during initial load
    
    saveLoadedImages(loadedImages);
  }, [loadedImages, isStateLoaded]);

  // Cleanup thumbnail URLs on unmount
  useEffect(() => {
    return () => {
      // Clean up all thumbnail URLs
      loadedImagesRef.current.forEach(img => {
        if (img.thumbnailUrl) {
          URL.revokeObjectURL(img.thumbnailUrl);
        }
      });
    };
  }, []);

  const handleGenerateSVG = () => {
    if (inputMode === 'image' && imageData) {
      // Generate actual vector SVG from image (async to prevent UI freeze)
      setIsLoading(true);
      
      // Use requestIdleCallback or setTimeout with chunked processing
      const generateSVGAsync = () => {
        try {
          const svgWidth = imageData.width;
          const svgHeight = imageData.height;
          
          console.log('Starting SVG generation...');
          const startTime = performance.now();
          
          const svgString = exportImageToSVG(imageData.texture, null, {
            width: svgWidth,
            height: svgHeight,
            imageWidth: imageData.width,
            imageHeight: imageData.height,
            applyDithering,
            ditheringResolution: applyDithering ? ditheringResolution : undefined,
            ditheringThreshold: applyDithering ? ditheringThreshold : undefined,
            ditheringContrast: applyDithering ? ditheringContrast : undefined,
            ditheringBrightness: applyDithering ? ditheringBrightness : undefined,
            exportMode,
            pixelFilter,
            renderBackground
          });
          
          const endTime = performance.now();
          console.log(`SVG generation took ${((endTime - startTime) / 1000).toFixed(2)} seconds`);
          
          setGeneratedSVG(svgString);
        } catch (error) {
          console.error('Error generating SVG:', error);
          alert('Error generating SVG: ' + error.message);
        } finally {
          setIsLoading(false);
        }
      };
      
      // Use requestIdleCallback if available for better performance
      if (window.requestIdleCallback) {
        requestIdleCallback(generateSVGAsync, { timeout: 2000 });
      } else {
        setTimeout(generateSVGAsync, 100);
      }
    } else if (inputMode === 'stl' && meshData) {
      // Generate SVG from STL
      exportTriggerRef.current += 1;
      if (window.generateSVG) {
        window.generateSVG();
      }
    }
  };

  const handleSaveSVG = () => {
    if (!generatedSVG) return;
    downloadSVG(generatedSVG, 'stl_export.svg');
  };

  return (
    <div 
      className="app"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <DevOverlay />
      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-overlay-content">
            <svg className="upload-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7 16V17C7 18.1046 7.89543 19 9 19H15C16.1046 19 17 18.1046 17 17V16M12 3V15M12 3L8 7M12 3L16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <h2>Drop File Here</h2>
            <p>Release to upload STL file or image</p>
          </div>
        </div>
      )}
      {/* Floating sidebar toggle buttons */}
      <button
        className="sidebar-toggle sidebar-toggle-left"
        onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
        aria-label="Toggle left sidebar"
      >
        <Menu size={24} />
      </button>
      <button
        className="sidebar-toggle sidebar-toggle-right"
        onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
        aria-label="Toggle right sidebar"
      >
        <Settings size={24} />
      </button>

      {/* Sidebar overlay for mobile */}
      {isLeftSidebarOpen && (
        <div className={`sidebar-overlay ${isLeftSidebarOpen ? 'active' : ''}`} onClick={() => setIsLeftSidebarOpen(false)}>
          <div className="sidebar-content sidebar-content-left" onClick={(e) => e.stopPropagation()}>
            <ControlPanel
              onFileUpload={handleFileUpload}
              inputMode={inputMode}
              selectedDefaultFile={selectedDefaultFile}
              onDefaultFileSelect={handleDefaultFileSelect}
              loadedImages={loadedImages}
              currentImageFileName={imageFile?.name}
            />
          </div>
        </div>
      )}

      {isRightSidebarOpen && (
        <div className={`sidebar-overlay ${isRightSidebarOpen ? 'active' : ''}`} onClick={() => setIsRightSidebarOpen(false)}>
          <div className="sidebar-content sidebar-content-right" onClick={(e) => e.stopPropagation()}>
            <ExportPanel
              onGenerateSVG={handleGenerateSVG}
              onSaveSVG={handleSaveSVG}
              generatedSVG={generatedSVG}
              hasMesh={!!meshData}
              hasImage={!!imageData}
              inputMode={inputMode}
              edgeSettings={edgeSettings}
              onEdgeSettingsChange={(newSettings) => {
                setEdgeSettings(newSettings);
                setGeneratedSVG(null); // Clear SVG when settings change
              }}
              applyDithering={applyDithering}
              onDitheringChange={(enabled) => {
                setApplyDithering(enabled);
                setGeneratedSVG(null); // Clear SVG when dithering changes
              }}
              ditheringResolution={ditheringResolution}
              onDitheringResolutionChange={(resolution) => {
                setDitheringResolution(resolution);
                setGeneratedSVG(null); // Clear SVG when resolution changes
              }}
              ditheringThreshold={ditheringThreshold}
              onDitheringThresholdChange={(threshold) => {
                setDitheringThreshold(threshold);
                setGeneratedSVG(null); // Clear SVG when threshold changes
              }}
              ditheringContrast={ditheringContrast}
              onDitheringContrastChange={(contrast) => {
                setDitheringContrast(contrast);
                setGeneratedSVG(null); // Clear SVG when contrast changes
              }}
              ditheringBrightness={ditheringBrightness}
              onDitheringBrightnessChange={(brightness) => {
                setDitheringBrightness(brightness);
                setGeneratedSVG(null); // Clear SVG when brightness changes
              }}
              exportMode={exportMode}
              onExportModeChange={(mode) => {
                setExportMode(mode);
                setGeneratedSVG(null); // Clear SVG when mode changes
              }}
              stlExportMode={stlExportMode}
              onStlExportModeChange={(mode) => {
                setStlExportMode(mode);
                setGeneratedSVG(null); // Clear SVG when mode changes
              }}
              pixelFilter={pixelFilter}
              onPixelFilterChange={(filter) => {
                setPixelFilter(filter);
                setGeneratedSVG(null); // Clear SVG when filter changes
              }}
              renderBackground={renderBackground}
              onRenderBackgroundChange={(enabled) => {
                setRenderBackground(enabled);
                setGeneratedSVG(null); // Clear SVG when background setting changes
              }}
            />
          </div>
        </div>
      )}

      <ControlPanel
        onFileUpload={handleFileUpload}
        inputMode={inputMode}
        selectedDefaultFile={selectedDefaultFile}
        onDefaultFileSelect={handleDefaultFileSelect}
        loadedImages={loadedImages}
        currentImageFileName={imageFile?.name}
      />
      <div className="canvas-container">

        {isLoading && (
          <div className="loading-overlay">
            <div className="loading-spinner"></div>
            <p>Loading file...</p>
          </div>
        )}

        {/* 3D View - Always show for STL files */}
        {inputMode === 'stl' && stlFile && (
          <Canvas key="stl-canvas" ref={canvasRef} gl={{ preserveDrawingBuffer: true }}>
            <PerspectiveCamera makeDefault position={[0, 0, 5]} />
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1} />
            <OrbitControls enableDamping dampingFactor={0.05} />
            {stlFile && (
              <STLViewer
                key={stlFile.name + stlFile.size}
                file={stlFile}
                onMeshLoaded={(data) => {
                  setMeshData(data);
                  setIsLoading(false);
                }}
                onError={(error) => {
                  console.error('STL loading error:', error);
                  setIsLoading(false);
                  alert('Error loading STL file: ' + error.message);
                }}
                edgeSettings={edgeSettings}
              />
            )}
            {meshData && (
              <SceneExporter
                meshData={meshData}
                edgeSettings={edgeSettings}
                onExport={exportTriggerRef.current}
                onSVGGenerated={setGeneratedSVG}
                applyDithering={applyDithering}
              />
            )}
          </Canvas>
        )}

        {/* 2D View - For images, show image immediately, then SVG when ready */}
        {inputMode === 'image' && imageFile && (
          <>
            {/* Hidden canvas only for loading the image texture - only render when imageFile exists */}
            <Canvas 
              key="image-canvas"
              gl={{ preserveDrawingBuffer: true }} 
              style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none', zIndex: -1, top: '-9999px', left: '-9999px' }}
            >
              <PerspectiveCamera makeDefault position={[0, 0, 5]} />
              <ImageViewer
                key={imageFile.name + imageFile.size}
                imageFile={imageFile}
                onImageLoaded={handleImageLoaded}
              />
            </Canvas>
            {/* Show image immediately, then replace with SVG when ready */}
            {generatedSVG ? (
              <div className="svg-preview-view">
                <TransformWrapper
                  key={`svg-${generatedSVG.substring(0, 50)}`}
                  initialScale={1}
                  minScale={0.1}
                  maxScale={10}
                  wheel={{ step: 0.1 }}
                  doubleClick={{ disabled: false, mode: 'reset' }}
                  pan={{ disabled: false }}
                  zoom={{ disabled: false }}
                  centerOnInit={true}
                  centerZoomedOut={true}
                  limitToBounds={false}
                  initialPositionX={0}
                  initialPositionY={0}
                >
                  <TransformComponent
                    wrapperClass="svg-preview-content"
                    contentClass="svg-preview-inner"
                  >
                    <div dangerouslySetInnerHTML={{ __html: generatedSVG }} />
                  </TransformComponent>
                </TransformWrapper>
              </div>
            ) : (processedPreviewUrl || imagePreviewUrl) ? (
              <div className="svg-preview-view" ref={previewContainerRef}>
                <TransformWrapper
                  key={`preview-${imageFile?.name || imageFile?.size || 'default'}`}
                  ref={(ref) => {
                    transformRef.current = ref;
                  }}
                  initialScale={initialScale}
                  minScale={0.01}
                  maxScale={10}
                  wheel={{ step: 0.1 }}
                  doubleClick={{ disabled: false, mode: 'reset' }}
                  pan={{ disabled: false }}
                  zoom={{ disabled: false }}
                  centerOnInit={true}
                  centerZoomedOut={true}
                  limitToBounds={false}
                  initialPositionX={0}
                  initialPositionY={0}
                >
                  {({ centerView }) => {
                    // Store centerView function in ref for use in useEffect
                    transformRef.current = { centerView };
                    
                    return (
                      <TransformComponent
                        wrapperClass="svg-preview-content"
                        contentClass="svg-preview-inner"
                      >
                        <img 
                          src={processedPreviewUrl || imagePreviewUrl} 
                          alt="Preview" 
                          width={imageData?.width}
                          height={imageData?.height}
                          style={{ 
                            maxWidth: 'none',
                            maxHeight: 'none',
                            width: 'auto',
                            height: 'auto',
                            display: 'block'
                          }} 
                        />
                      </TransformComponent>
                    );
                  }}
                </TransformWrapper>
              </div>
            ) : (
              <div className="svg-preview-empty">
                <p>Loading image...</p>
              </div>
            )}
          </>
        )}

      </div>
      <ExportPanel
        onGenerateSVG={handleGenerateSVG}
        onSaveSVG={handleSaveSVG}
        generatedSVG={generatedSVG}
        hasMesh={!!meshData}
        hasImage={!!imageData}
        inputMode={inputMode}
        edgeSettings={edgeSettings}
        onEdgeSettingsChange={(newSettings) => {
          setEdgeSettings(newSettings);
          setGeneratedSVG(null); // Clear SVG when settings change
        }}
        applyDithering={applyDithering}
        onDitheringChange={(enabled) => {
          setApplyDithering(enabled);
          setGeneratedSVG(null); // Clear SVG when dithering changes
        }}
        ditheringResolution={ditheringResolution}
        onDitheringResolutionChange={(resolution) => {
          setDitheringResolution(resolution);
          setGeneratedSVG(null); // Clear SVG when resolution changes
        }}
        ditheringThreshold={ditheringThreshold}
        onDitheringThresholdChange={(threshold) => {
          setDitheringThreshold(threshold);
          setGeneratedSVG(null); // Clear SVG when threshold changes
        }}
        ditheringContrast={ditheringContrast}
        onDitheringContrastChange={(contrast) => {
          setDitheringContrast(contrast);
          setGeneratedSVG(null); // Clear SVG when contrast changes
        }}
        ditheringBrightness={ditheringBrightness}
        onDitheringBrightnessChange={(brightness) => {
          setDitheringBrightness(brightness);
          setGeneratedSVG(null); // Clear SVG when brightness changes
        }}
              exportMode={exportMode}
              onExportModeChange={(mode) => {
                setExportMode(mode);
                setGeneratedSVG(null); // Clear SVG when mode changes
              }}
              stlExportMode={stlExportMode}
              onStlExportModeChange={(mode) => {
                setStlExportMode(mode);
                setGeneratedSVG(null); // Clear SVG when mode changes
              }}
              pixelFilter={pixelFilter}
              onPixelFilterChange={(filter) => {
                setPixelFilter(filter);
                setGeneratedSVG(null); // Clear SVG when filter changes
              }}
        renderBackground={renderBackground}
        onRenderBackgroundChange={(enabled) => {
          setRenderBackground(enabled);
          setGeneratedSVG(null); // Clear SVG when background setting changes
        }}
      />
    </div>
  );
}

export default App;

