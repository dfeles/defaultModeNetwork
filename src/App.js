import React, { useState, useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import STLViewer from './components/STLViewer';
import ImageViewer from './components/ImageViewer';
import ControlPanel from './components/ControlPanel';
import ExportPanel from './components/ExportPanel';
import { exportSceneToSVG, downloadSVG, exportImageToSVG } from './utils/svgExporter';
import { getSTLFileURL } from './config/stlFiles';
import './App.css';

function SceneExporter({ meshData, edgeSettings, onExport, onSVGGenerated, exportMethod, activeTab }) {
  const { scene, camera, gl, size } = useThree();
  
  React.useEffect(() => {
    if (meshData && onSVGGenerated) {
      const generateFn = (method, tab) => {
        const svgString = exportSceneToSVG(scene, camera, gl, {
          width: size.width,
          height: size.height,
          edgeSettings,
          meshData,
          exportMethod: method || exportMethod,
          applyDithering: tab === 'dithering' || activeTab === 'dithering'
        });
        onSVGGenerated(svgString);
      };
      
      // Store generate function
      window.generateSVG = generateFn;
    }
  }, [scene, camera, gl, size, meshData, edgeSettings, onExport, onSVGGenerated, exportMethod, activeTab]);
  
  return null;
}

function ImageExporter({ imageData, onExport, onSVGGenerated, activeTab }) {
  const { gl, size } = useThree();
  
  React.useEffect(() => {
    if (imageData && imageData.texture && onSVGGenerated) {
      const generateFn = (tab) => {
        const applyDithering = tab === 'dithering' || activeTab === 'dithering';
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
    }
  }, [imageData, gl, size, onExport, onSVGGenerated, activeTab]);
  
  return null;
}

function App() {
  const [stlFile, setStlFile] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imageData, setImageData] = useState(null);
  const [meshData, setMeshData] = useState(null);
  const [generatedSVG, setGeneratedSVG] = useState(null);
  const [selectedDefaultFile, setSelectedDefaultFile] = useState('24_cell_Schlegel.stl');
  const [isLoading, setIsLoading] = useState(false);
  const [inputMode, setInputMode] = useState('stl'); // 'stl' or 'image'
  const [edgeSettings, setEdgeSettings] = useState({
    threshold: 0.1,
    color: '#000000',
    width: 1,
    shadingColors: 1
  });
  const [exportMethod, setExportMethod] = useState('canvas'); // 'canvas' or 'geometry'
  const [activeTab, setActiveTab] = useState('3d-object'); // '3d-object' or 'dithering'
  const [viewMode, setViewMode] = useState('3d'); // '3d' or 'svg'
  const [isDragging, setIsDragging] = useState(false);
  const canvasRef = useRef(null);
  const exportTriggerRef = useRef(0);
  const dragCounterRef = useRef(0);

  const handleFileUpload = (file, mode) => {
    setIsLoading(true);
    setMeshData(null); // Clear previous mesh data
    setImageData(null); // Clear previous image data
    setGeneratedSVG(null); // Clear previous SVG
    setSelectedDefaultFile(null); // Clear default selection when custom file is uploaded
    
    if (mode === 'image') {
      setImageFile(file);
      setStlFile(null);
      setInputMode('image');
    } else {
      setStlFile(file);
      setImageFile(null);
      setInputMode('stl');
    }
  };

  const handleImageLoaded = (data) => {
    setImageData(data);
    setIsLoading(false);
  };

  const handleDefaultFileSelect = React.useCallback(async (filename) => {
    if (!filename) {
      setSelectedDefaultFile(null);
      setStlFile(null);
      setMeshData(null);
      setIsLoading(false);
      return;
    }
    setSelectedDefaultFile(filename);
    setGeneratedSVG(null); // Clear previous SVG
    setMeshData(null); // Clear previous mesh data
    setIsLoading(true);
    try {
      const url = getSTLFileURL(filename);
      console.log(`Loading STL from: ${url}`);
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`HTTP ${response.status} error loading ${filename} from ${url}:`, errorText);
        setIsLoading(false);
        alert(`Could not load ${filename} (HTTP ${response.status}). Please check the console for details.`);
        return;
      }

      // Check content type
      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('stl') && !contentType.includes('octet-stream') && !contentType.includes('model')) {
        console.warn(`Unexpected content type: ${contentType} for ${filename}`);
      }

      const blob = await response.blob();
      
      // Validate blob size (STL files should be at least a few KB)
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
        console.error(`Received HTML instead of STL file. URL: ${url}`);
        console.error(`HTML preview:`, firstBytes.substring(0, 500));
        setIsLoading(false);
        alert(`Received HTML error page instead of STL file for ${filename}. Check console for details.`);
        return;
      }

      const file = new File([blob], filename, { type: 'model/stl' });
      setStlFile(file);
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

  const handleGenerateSVG = () => {
    if (inputMode === 'image' && imageData) {
      // Generate SVG from image
      exportTriggerRef.current += 1;
      if (window.generateImageSVG) {
        window.generateImageSVG(activeTab);
      }
    } else if (inputMode === 'stl' && meshData) {
      // Generate SVG from STL
      exportTriggerRef.current += 1;
      if (window.generateSVG) {
        window.generateSVG(exportMethod, activeTab);
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
        edgeSettings={edgeSettings}
        onEdgeSettingsChange={setEdgeSettings}
        hasMesh={!!meshData}
        hasImage={!!imageData}
        inputMode={inputMode}
        selectedDefaultFile={selectedDefaultFile}
        onDefaultFileSelect={handleDefaultFileSelect}
      />
      <div className="canvas-container">
        {/* View Mode Toggle Switch */}
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
            title="SVG Preview"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="7.5 4.21 12 6.81 16.5 4.21"></polyline>
              <polyline points="7.5 19.79 7.5 14.6 3 12"></polyline>
              <polyline points="21 12 16.5 14.6 16.5 19.79"></polyline>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
            <span>SVG</span>
          </button>
        </div>

        {isLoading && (
          <div className="loading-overlay">
            <div className="loading-spinner"></div>
            <p>Loading STL file...</p>
          </div>
        )}

        {/* 3D View */}
        {viewMode === '3d' && (
          <Canvas ref={canvasRef} gl={{ preserveDrawingBuffer: true }}>
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
            {imageFile && (
              <ImageViewer
                key={imageFile.name + imageFile.size}
                imageFile={imageFile}
                onImageLoaded={handleImageLoaded}
              />
            )}
            {meshData && (
              <SceneExporter
                meshData={meshData}
                edgeSettings={edgeSettings}
                onExport={exportTriggerRef.current}
                onSVGGenerated={setGeneratedSVG}
                exportMethod={exportMethod}
                activeTab={activeTab}
              />
            )}
            {imageData && (
              <ImageExporter
                imageData={imageData}
                onExport={exportTriggerRef.current}
                onSVGGenerated={setGeneratedSVG}
                activeTab={activeTab}
              />
            )}
          </Canvas>
        )}

        {/* SVG Preview View */}
        {viewMode === 'svg' && generatedSVG && (
          <div className="svg-preview-view">
            <div 
              className="svg-preview-content"
              dangerouslySetInnerHTML={{ __html: generatedSVG }}
            />
          </div>
        )}

        {viewMode === 'svg' && !generatedSVG && (
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
        exportMethod={exportMethod}
        onExportMethodChange={setExportMethod}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
    </div>
  );
}

export default App;

