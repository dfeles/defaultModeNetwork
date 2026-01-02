import React, { useState, useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Menu, Settings } from 'lucide-react';
import ImageViewer from './components/ImageViewer';
import ControlPanel from './components/ControlPanel';
import GameOfLife from './components/GameOfLife';
import { getImageFileURL } from './config/stlFiles';
import { saveState, loadState, saveLoadedImages, loadLoadedImages } from './utils/statePersistence';

import { DevOverlay } from 'mindone'
import './App.css';

function App() {
  const [imageFile, setImageFile] = useState(null);
  const [imageData, setImageData] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [selectedDefaultFile, setSelectedDefaultFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadedImages, setLoadedImages] = useState([]);
  const [isStateLoaded, setIsStateLoaded] = useState(false);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [currentGrid, setCurrentGrid] = useState(null);
  const [gameOfLifeGrid, setGameOfLifeGrid] = useState(null);
  const [gameOfLifeGeneration, setGameOfLifeGeneration] = useState(0);
  const [gameOfLifeIsRunning, setGameOfLifeIsRunning] = useState(false);
  const [gameOfLifeEnabled, setGameOfLifeEnabled] = useState(false);
  const [cellularAutomataEnabled, setCellularAutomataEnabled] = useState(false);
  const canvasRef = useRef(null);
  const dragCounterRef = useRef(0);
  const loadedImagesRef = useRef([]);
  const previewContainerRef = useRef(null);
  const transformRef = useRef(null);
  const [initialScale, setInitialScale] = useState(0.5);

  const handleFileUpload = (file, mode, isExistingSelection = false) => {
    setIsLoading(true);
    
    // Clean up previous resources
    if (imageData?.texture) {
      imageData.texture.dispose();
    }
    
    setImageData(null);
    setImagePreviewUrl(null);
    setCurrentGrid(null);
    
    if (mode === 'image') {
      setSelectedDefaultFile(null);
      setImageFile(file);
      
      if (isExistingSelection) {
        setLoadedImages(prev => {
          const updated = prev.map(img => {
            if (img.name === file.name) {
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
        setLoadedImages(prev => {
          const MAX_LOADED_IMAGES = 100;
          const trimmed = prev.slice(0, MAX_LOADED_IMAGES - 1);
          
          if (prev.length >= MAX_LOADED_IMAGES) {
            prev.slice(MAX_LOADED_IMAGES - 1).forEach(img => {
              if (img.thumbnailUrl) {
                URL.revokeObjectURL(img.thumbnailUrl);
              }
            });
          }
          
          const existingIndex = trimmed.findIndex(img => img.name === file.name);
          let result;
          if (existingIndex !== -1) {
            const updated = [...trimmed];
            const existing = updated.splice(existingIndex, 1)[0];
            existing.file = file;
            if (existing.thumbnailUrl) {
              URL.revokeObjectURL(existing.thumbnailUrl);
            }
            existing.thumbnailUrl = URL.createObjectURL(file);
            result = [existing, ...updated];
          } else {
            const thumbnailUrl = URL.createObjectURL(file);
            const imageEntry = {
              name: file.name,
              file: file,
              type: 'image',
              id: Date.now(),
              thumbnailUrl: thumbnailUrl
            };
            result = [imageEntry, ...trimmed];
          }
          loadedImagesRef.current = result;
          return result;
        });
      }
    }
  };

  const calculateInitialScale = (imageWidth, imageHeight) => {
    if (!imageWidth || !imageHeight) {
      return 1;
    }
    
    const container = document.querySelector('.canvas-container');
    if (!container) {
      return 1;
    }
    
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    if (!containerWidth || !containerHeight) {
      return 1;
    }
    
    // Account for sidebars (left: 320px, right: 320px on large screens)
    const sidebarWidth = window.innerWidth > 1200 ? 320 : 0;
    const padding = 40; // Padding around image
    const availableWidth = containerWidth - (padding * 2);
    const availableHeight = containerHeight - (padding * 2);
    
    if (availableWidth <= 0 || availableHeight <= 0) {
      return 1;
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
    
    // Use 90% of calculated scale to add some breathing room
    scale = scale * 0.9;
    
    // Ensure scale is reasonable (not too small, not too large)
    return Math.max(0.1, Math.min(2, scale));
  };

  const handleImageLoaded = (data) => {
    setImageData(data);
    setIsLoading(false);
    
    if (data && data.width && data.height) {
      // Calculate scale multiple times to ensure container is ready
      const calculateAndSet = () => {
        const scale = calculateInitialScale(data.width, data.height);
        setInitialScale(scale);
      };
      
      calculateAndSet();
      setTimeout(calculateAndSet, 50);
      setTimeout(calculateAndSet, 100);
      setTimeout(calculateAndSet, 200);
      setTimeout(calculateAndSet, 500);
    }
    
    if (data && data.texture && data.texture.image) {
      const canvas = document.createElement('canvas');
      canvas.width = data.width;
      canvas.height = data.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(data.texture.image, 0, 0);
      const previewUrl = canvas.toDataURL('image/jpeg', 0.85);
      setImagePreviewUrl(previewUrl);
      
      canvas.width = 0;
      canvas.height = 0;
    }
  };

  useEffect(() => {
    if (!imageData || !imageData.width || !imageData.height) return;
    
    const recalculateScale = () => {
      const scale = calculateInitialScale(imageData.width, imageData.height);
      setInitialScale(scale);
    };
    
    recalculateScale();
    
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

  const handleDefaultFileSelect = React.useCallback(async (filename) => {
    if (!filename) {
      setSelectedDefaultFile(null);
      setImageFile(null);
      setImageData(null);
      setIsLoading(false);
      return;
    }
    
    const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(filename);
    
    if (!isImage) {
      alert('Please select an image file');
      return;
    }
    
    setSelectedDefaultFile(filename);
    setCurrentGrid(null);
    setIsLoading(true);
    
    try {
      const url = getImageFileURL(filename);
      console.log(`Loading image from: ${url}`);
      const response = await fetch(url, {
        cache: 'no-cache',
        headers: {
          'Accept': 'image/*'
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
      
      if (blob.size < 1000) {
        const text = await blob.text();
        console.error(`File too small or invalid. URL: ${url}, Size: ${blob.size} bytes`);
        console.error(`Response preview:`, text.substring(0, 500));
        setIsLoading(false);
        alert(`Invalid file received for ${filename}. The file might not exist or the URL is incorrect. Check console for details.`);
        return;
      }

      const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
      setImageFile(file);
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
      // Will be handled by setIsDragging in parent
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      // Will be handled by setIsDragging in parent
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      const isImage = file.type.startsWith('image/') || 
                     /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file.name);
      
      if (isImage) {
        handleFileUpload(file, 'image');
      } else {
        alert('Please drop a valid image file (jpg, png, gif, etc.)');
      }
    }
  };

  // Load saved state on mount
  useEffect(() => {
    const savedState = loadState();
    const savedImages = loadLoadedImages();
    
    if (savedState) {
      if (savedImages && savedImages.length > 0) {
        setLoadedImages(savedImages);
        loadedImagesRef.current = savedImages;
      }
      
      if (savedState.selectedDefaultFile) {
        setSelectedDefaultFile(savedState.selectedDefaultFile);
        handleDefaultFileSelect(savedState.selectedDefaultFile);
      } else {
        setSelectedDefaultFile('clouds.jpg');
        handleDefaultFileSelect('clouds.jpg');
      }
    } else {
      setSelectedDefaultFile('clouds.jpg');
      handleDefaultFileSelect('clouds.jpg');
    }
    
    setIsStateLoaded(true);
  }, [handleDefaultFileSelect]);

  // Save state whenever relevant state changes
  useEffect(() => {
    if (!isStateLoaded) return;
    
    saveState({
      selectedDefaultFile,
      imageFile,
      inputMode: 'image'
    });
  }, [selectedDefaultFile, imageFile, isStateLoaded]);

  // Save loaded images whenever they change
  useEffect(() => {
    if (!isStateLoaded) return;
    saveLoadedImages(loadedImages);
  }, [loadedImages, isStateLoaded]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      loadedImagesRef.current.forEach(img => {
        if (img.thumbnailUrl) {
          URL.revokeObjectURL(img.thumbnailUrl);
        }
      });
      
      if (imageData?.texture) {
        imageData.texture.dispose();
      }
      
      setImagePreviewUrl(null);
    };
  }, []);

  return (
    <div 
      className="app"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <DevOverlay />
      
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
              inputMode="image"
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
            <GameOfLife
              imageData={imageData}
              onGridChange={setCurrentGrid}
              displayMode="sidebar"
            />
          </div>
        </div>
      )}

      <ControlPanel
        onFileUpload={handleFileUpload}
        inputMode="image"
        selectedDefaultFile={selectedDefaultFile}
        onDefaultFileSelect={handleDefaultFileSelect}
        loadedImages={loadedImages}
        currentImageFileName={imageFile?.name}
      />
      
      <div className="canvas-container">
        {isLoading && (
          <div className="loading-overlay">
            <div className="loading-spinner"></div>
            <p>Loading image...</p>
          </div>
        )}

        {/* Hidden canvas for loading the image texture */}
        {imageFile && (
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
        )}
        
        {/* Show image preview when Cellular Automata is not enabled */}
        {imagePreviewUrl && !cellularAutomataEnabled && (
          <div className="svg-preview-view" ref={previewContainerRef}>
            <TransformWrapper
              key={`preview-${imageFile?.name || imageFile?.size || 'default'}`}
              ref={(ref) => {
                transformRef.current = ref;
              }}
              initialScale={initialScale}
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
              {({ centerView }) => {
                transformRef.current = { centerView };
                
                return (
                  <TransformComponent
                    wrapperClass="svg-preview-content"
                    contentClass="svg-preview-inner"
                  >
                    <img 
                      src={imagePreviewUrl} 
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
        )}
        
        {/* Cellular Automata animation canvas - only show when enabled */}
        {cellularAutomataEnabled && (
          <GameOfLife
            imageData={imageData}
            onGridChange={setCurrentGrid}
            displayMode="main"
            grid={gameOfLifeGrid}
            setGrid={setGameOfLifeGrid}
            generation={gameOfLifeGeneration}
            setGeneration={setGameOfLifeGeneration}
            isRunning={gameOfLifeIsRunning}
            setIsRunning={setGameOfLifeIsRunning}
            gameOfLifeEnabled={gameOfLifeEnabled}
            setGameOfLifeEnabled={setGameOfLifeEnabled}
            cellularAutomataEnabled={cellularAutomataEnabled}
            setCellularAutomataEnabled={setCellularAutomataEnabled}
          />
        )}
      </div>
      
      {/* Right sidebar - Cellular Automata controls */}
      <GameOfLife
        imageData={imageData}
        onGridChange={setCurrentGrid}
        displayMode="sidebar"
        grid={gameOfLifeGrid}
        setGrid={setGameOfLifeGrid}
        generation={gameOfLifeGeneration}
        setGeneration={setGameOfLifeGeneration}
        isRunning={gameOfLifeIsRunning}
        setIsRunning={setGameOfLifeIsRunning}
        gameOfLifeEnabled={gameOfLifeEnabled}
        setGameOfLifeEnabled={setGameOfLifeEnabled}
        cellularAutomataEnabled={cellularAutomataEnabled}
        setCellularAutomataEnabled={setCellularAutomataEnabled}
      />
    </div>
  );
}

export default App;

