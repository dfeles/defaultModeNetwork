import React from 'react';
import './ControlPanel.css';

function ControlPanel({ onFileUpload, edgeSettings, onEdgeSettingsChange, hasMesh, selectedDefaultFile, onDefaultFileSelect }) {
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.name.endsWith('.stl')) {
      onFileUpload(file);
    } else {
      alert('Please select a valid STL file');
    }
  };

  const defaultFiles = [
    { value: '24_cell_Schlegel.stl', label: '24-Cell (Schlegel)' },
    { value: '120_Cell.stl', label: '120-Cell' },
    { value: '600_cell.stl', label: '600-Cell' }
  ];

  return (
    <div className="control-panel">
      <div className="panel-section">
        <h2>STL to SVG Converter</h2>
        <p className="subtitle">Shader-based edge detection</p>
      </div>

      <div className="panel-section">
        <h3>Load STL File</h3>
        
        <div className="control-group">
          <label>
            Default Models
            <select
              value={selectedDefaultFile || ''}
              onChange={(e) => onDefaultFileSelect(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: '#1a1a1a',
                border: '1px solid #2a2a2a',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '14px',
                marginTop: '8px',
                cursor: 'pointer'
              }}
            >
              <option value="">-- Select a default model --</option>
              {defaultFiles.map(file => (
                <option key={file.value} value={file.value}>{file.label}</option>
              ))}
            </select>
            <small>Choose from pre-loaded cell models</small>
          </label>
        </div>

        <div style={{ margin: '16px 0', textAlign: 'center', color: '#888' }}>
          OR
        </div>

        <label className="file-upload-button">
          <input
            type="file"
            accept=".stl"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          Choose Custom STL File
        </label>
      </div>

      <div className="panel-section">
        <h3>Edge Detection Settings</h3>
        
        <div className="control-group">
          <label>
            Edge Threshold
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={edgeSettings.threshold}
              onChange={(e) => onEdgeSettingsChange({
                ...edgeSettings,
                threshold: parseFloat(e.target.value)
              })}
            />
            <span className="value-display">{edgeSettings.threshold.toFixed(2)}</span>
          </label>
        </div>

        <div className="control-group">
          <label>
            Edge Color
            <input
              type="color"
              value={edgeSettings.color}
              onChange={(e) => onEdgeSettingsChange({
                ...edgeSettings,
                color: e.target.value
              })}
            />
          </label>
        </div>

        <div className="control-group">
          <label>
            Edge Width
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.1"
              value={edgeSettings.width}
              onChange={(e) => onEdgeSettingsChange({
                ...edgeSettings,
                width: parseFloat(e.target.value)
              })}
            />
            <span className="value-display">{edgeSettings.width.toFixed(1)}</span>
          </label>
        </div>

        <div className="control-group">
          <label>
            Shading Colors
            <input
              type="number"
              min="1"
              max="10"
              value={edgeSettings.shadingColors}
              onChange={(e) => onEdgeSettingsChange({
                ...edgeSettings,
                shadingColors: parseInt(e.target.value) || 1
              })}
            />
            <small>Number of discrete color bands (1 = no shading)</small>
          </label>
        </div>
      </div>


      <div className="panel-section">
        <h3>Controls</h3>
        <ul className="controls-list">
          <li><strong>Left Click + Drag:</strong> Rotate</li>
          <li><strong>Right Click + Drag:</strong> Pan</li>
          <li><strong>Scroll:</strong> Zoom</li>
        </ul>
      </div>
    </div>
  );
}

export default ControlPanel;

