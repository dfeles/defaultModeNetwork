import React, { useState, useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import STLViewer from './components/STLViewer';
import ControlPanel from './components/ControlPanel';
import ExportPanel from './components/ExportPanel';
import { exportSceneToSVG, downloadSVG } from './utils/svgExporter';
import './App.css';

function SceneExporter({ meshData, edgeSettings, onExport, onSVGGenerated, exportMethod }) {
  const { scene, camera, gl, size } = useThree();
  
  React.useEffect(() => {
    if (meshData && onSVGGenerated) {
      const generateFn = (method) => {
        const svgString = exportSceneToSVG(scene, camera, gl, {
          width: size.width,
          height: size.height,
          edgeSettings,
          meshData,
          exportMethod: method || exportMethod
        });
        onSVGGenerated(svgString);
      };
      
      // Store generate function
      window.generateSVG = generateFn;
    }
  }, [scene, camera, gl, size, meshData, edgeSettings, onExport, onSVGGenerated, exportMethod]);
  
  return null;
}

function App() {
  const [stlFile, setStlFile] = useState(null);
  const [meshData, setMeshData] = useState(null);
  const [generatedSVG, setGeneratedSVG] = useState(null);
  const [selectedDefaultFile, setSelectedDefaultFile] = useState('24_cell_Schlegel.stl');
  const [edgeSettings, setEdgeSettings] = useState({
    threshold: 0.1,
    color: '#000000',
    width: 1,
    shadingColors: 1
  });
  const [exportMethod, setExportMethod] = useState('canvas'); // 'canvas' or 'geometry'
  const [isDragging, setIsDragging] = useState(false);
  const canvasRef = useRef(null);
  const exportTriggerRef = useRef(0);
  const dragCounterRef = useRef(0);

  const handleFileUpload = (file) => {
    setStlFile(file);
    setGeneratedSVG(null); // Clear previous SVG
    setSelectedDefaultFile(null); // Clear default selection when custom file is uploaded
    // File will be loaded in STLViewer component
  };

  const handleDefaultFileSelect = React.useCallback(async (filename) => {
    if (!filename) return;
    setSelectedDefaultFile(filename);
    setGeneratedSVG(null); // Clear previous SVG
    try {
      const response = await fetch(`/${filename}`);
      if (response.ok) {
        const blob = await response.blob();
        const file = new File([blob], filename, { type: 'model/stl' });
        setStlFile(file);
      } else {
        console.error(`Could not load ${filename}`);
      }
    } catch (error) {
      console.error(`Error loading ${filename}:`, error);
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
      if (file.name.endsWith('.stl')) {
        handleFileUpload(file);
      } else {
        alert('Please drop a valid STL file');
      }
    }
  };

  // Load default STL file on mount
  useEffect(() => {
    handleDefaultFileSelect('24_cell_Schlegel.stl');
  }, [handleDefaultFileSelect]);

  const handleGenerateSVG = () => {
    if (!meshData) return;
    exportTriggerRef.current += 1;
    // Trigger export via window function with current method
    if (window.generateSVG) {
      window.generateSVG(exportMethod);
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
            <h2>Drop STL File Here</h2>
            <p>Release to upload your 3D model</p>
          </div>
        </div>
      )}
      <ControlPanel
        onFileUpload={handleFileUpload}
        edgeSettings={edgeSettings}
        onEdgeSettingsChange={setEdgeSettings}
        hasMesh={!!meshData}
        selectedDefaultFile={selectedDefaultFile}
        onDefaultFileSelect={handleDefaultFileSelect}
      />
      <div className="canvas-container">
        <Canvas ref={canvasRef} gl={{ preserveDrawingBuffer: true }}>
          <PerspectiveCamera makeDefault position={[0, 0, 5]} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          <OrbitControls enableDamping dampingFactor={0.05} />
          {stlFile && (
            <STLViewer
              file={stlFile}
              onMeshLoaded={setMeshData}
              edgeSettings={edgeSettings}
            />
          )}
          {meshData && (
            <SceneExporter
              meshData={meshData}
              edgeSettings={edgeSettings}
              onExport={exportTriggerRef.current}
              onSVGGenerated={setGeneratedSVG}
              exportMethod={exportMethod}
            />
          )}
        </Canvas>
      </div>
      <ExportPanel
        onGenerateSVG={handleGenerateSVG}
        onSaveSVG={handleSaveSVG}
        generatedSVG={generatedSVG}
        hasMesh={!!meshData}
        exportMethod={exportMethod}
        onExportMethodChange={setExportMethod}
      />
    </div>
  );
}

export default App;

