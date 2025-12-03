import React, { useState, useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import STLViewer from './components/STLViewer';
import ImageViewer from './components/ImageViewer';
import ControlPanel from './components/ControlPanel';
import ExportPanel from './components/ExportPanel';
import { exportSceneToSVG, downloadSVG, exportImageToSVG } from './utils/svgExporter';
import { getSTLFileURL, getImageFileURL } from './config/stlFiles';

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

function ImageExporter({ imageData, onExport, onSVGGenerated, applyDithering, autoGenerate = false }) {
  const { gl, size } = useThree();
  
  React.useEffect(() => {
    if (imageData && imageData.texture && onSVGGenerated) {
      const generateFn = () => {
        const svgString = exportImageToSVG(imageData.texture, gl, {
          width: size.width,
          height: size.height,
          imageWidth: imageData.width,
          imageHeight: imageData.height,
          applyDithering
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
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null); // For immediate display
  const [meshData, setMeshData] = useState(null);
  const [generatedSVG, setGeneratedSVG] = useState(null);
  const [selectedDefaultFile, setSelectedDefaultFile] = useState('24_cell_Schlegel.stl');
  const [isLoading, setIsLoading] = useState(false);
  const [inputMode, setInputMode] = useState('stl'); // 'stl' or 'image'
  const [loadedImages, setLoadedImages] = useState([]); // Track loaded images for the file list
  const [edgeSettings, setEdgeSettings] = useState({
    threshold: 0.1,
    color: '#000000',
    width: 1,
    shadingColors: 1
  });
  const [applyDithering, setApplyDithering] = useState(false);
  const [viewMode, setViewMode] = useState('3d'); // '3d' or 'svg'
  const [isDragging, setIsDragging] = useState(false);
  const canvasRef = useRef(null);
  const exportTriggerRef = useRef(0);
  const dragCounterRef = useRef(0);
  const loadedImagesRef = useRef([]);

  const handleFileUpload = (file, mode, isExistingSelection = false) => {
    setIsLoading(true);
    setMeshData(null); // Clear previous mesh data
    setImageData(null); // Clear previous image data
    setImagePreviewUrl(null); // Clear previous image preview
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

  const handleImageLoaded = (data) => {
    setImageData(data);
    setIsLoading(false);
    // Automatically switch to 2D mode when image loads
    setViewMode('svg');
    
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

  // Generate SVG when image data is available (async, non-blocking)
  useEffect(() => {
    if (inputMode === 'image' && imageData && imageData.texture && imageData.texture.image) {
      // Generate SVG asynchronously to not block UI
      const generateSVG = () => {
        // Use a reasonable default size for the SVG
        const svgWidth = 800;
        const svgHeight = 800;
        const svgString = exportImageToSVG(imageData.texture, null, {
          width: svgWidth,
          height: svgHeight,
          imageWidth: imageData.width,
          imageHeight: imageData.height,
          applyDithering
        });
        setGeneratedSVG(svgString);
      };
      
      // Use requestIdleCallback if available, otherwise setTimeout
      if (window.requestIdleCallback) {
        requestIdleCallback(generateSVG, { timeout: 1000 });
      } else {
        setTimeout(generateSVG, 0);
      }
    }
  }, [inputMode, imageData, applyDithering]);


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
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`HTTP ${response.status} error loading ${filename} from ${url}:`, errorText);
        setIsLoading(false);
        alert(`Could not load ${filename} (HTTP ${response.status}). Please check the console for details.`);
        return;
      }

      const blob = await response.blob();
      
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

      // Check if it's actually HTML (error page)
      const firstBytes = await blob.slice(0, 100).text();
      if (firstBytes.trim().toLowerCase().startsWith('<!doctype') || 
          firstBytes.trim().toLowerCase().startsWith('<html')) {
        console.error(`Received HTML instead of file. URL: ${url}`);
        console.error(`HTML preview:`, firstBytes.substring(0, 500));
        setIsLoading(false);
        alert(`Received HTML error page instead of file for ${filename}. Check console for details.`);
        return;
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

  // Load default STL file on mount
  useEffect(() => {
    handleDefaultFileSelect('24_cell_Schlegel.stl');
  }, [handleDefaultFileSelect]);

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
      // Generate SVG from image
      exportTriggerRef.current += 1;
      if (window.generateImageSVG) {
        window.generateImageSVG();
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
      <ControlPanel
        onFileUpload={handleFileUpload}
        inputMode={inputMode}
        selectedDefaultFile={selectedDefaultFile}
        onDefaultFileSelect={handleDefaultFileSelect}
        loadedImages={loadedImages}
        currentImageFileName={imageFile?.name}
      />
      <div className="canvas-container">
        {/* View Mode Toggle Switch */}
        {inputMode !== 'image' && (
          <div className="view-mode-toggle">
            <button
              className={`toggle-button ${viewMode === '3d' ? 'active' : ''}`}
              onClick={() => setViewMode('3d')}
              title="3D View"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                <line x1="12" y1="22.08" x2="12" y2="12"></line>
              </svg>
              <span>3D</span>
            </button>
            <button
              className={`toggle-button ${viewMode === 'svg' ? 'active' : ''}`}
              onClick={() => setViewMode('svg')}
              disabled={!generatedSVG}
              title="2D Preview"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                <polyline points="7.5 4.21 12 6.81 16.5 4.21"></polyline>
                <polyline points="7.5 19.79 7.5 14.6 3 12"></polyline>
                <polyline points="21 12 16.5 14.6 16.5 19.79"></polyline>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                <line x1="12" y1="22.08" x2="12" y2="12"></line>
              </svg>
              <span>2D</span>
            </button>
          </div>
        )}

        {isLoading && (
          <div className="loading-overlay">
            <div className="loading-spinner"></div>
            <p>Loading file...</p>
          </div>
        )}

        {/* 3D View - Only show for STL files */}
        {viewMode === '3d' && inputMode === 'stl' && stlFile && (
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
                <div 
                  className="svg-preview-content"
                  dangerouslySetInnerHTML={{ __html: generatedSVG }}
                />
              </div>
            ) : imagePreviewUrl ? (
              <div className="svg-preview-view">
                <img 
                  src={imagePreviewUrl} 
                  alt="Preview" 
                  style={{ 
                    maxWidth: '100%', 
                    maxHeight: '100%', 
                    objectFit: 'contain',
                    display: 'block'
                  }} 
                />
              </div>
            ) : (
              <div className="svg-preview-empty">
                <p>Loading image...</p>
              </div>
            )}
          </>
        )}

        {/* SVG Preview View - For STL files */}
        {viewMode === 'svg' && inputMode === 'stl' && generatedSVG && (
          <div className="svg-preview-view">
            <div 
              className="svg-preview-content"
              dangerouslySetInnerHTML={{ __html: generatedSVG }}
            />
          </div>
        )}

        {viewMode === 'svg' && inputMode === 'stl' && !generatedSVG && (
          <div className="svg-preview-empty">
            <p>Generate an SVG preview first</p>
          </div>
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
        onEdgeSettingsChange={setEdgeSettings}
        applyDithering={applyDithering}
        onDitheringChange={setApplyDithering}
      />
    </div>
  );
}

export default App;

