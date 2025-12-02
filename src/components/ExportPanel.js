import React, { useState } from 'react';
import './ExportPanel.css';

function ExportPanel({ onGenerateSVG, onSaveSVG, generatedSVG, hasMesh, hasImage, inputMode, exportMethod, onExportMethodChange, activeTab, onTabChange }) {
  const [localActiveTab, setLocalActiveTab] = useState(activeTab || '3d-object');
  
  const handleTabChange = (tab) => {
    setLocalActiveTab(tab);
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  const hasContent = hasMesh || hasImage;

  return (
    <div className="export-panel">
      <div className="panel-section">
        <h2>Export</h2>
        <p className="subtitle">SVG Generation</p>
      </div>

      <div className="panel-section">
        <div className="export-tabs">
          <button
            className={`export-tab ${localActiveTab === '3d-object' ? 'active' : ''}`}
            onClick={() => handleTabChange('3d-object')}
          >
            3D Object
          </button>
          <button
            className={`export-tab ${localActiveTab === 'dithering' ? 'active' : ''}`}
            onClick={() => handleTabChange('dithering')}
          >
            Dithering
          </button>
        </div>
      </div>

      {localActiveTab === '3d-object' && (
        <div className="panel-section">
          <h3>Export Method</h3>
          <div className="control-group">
            <label>
              Export Method
              <select
                value={exportMethod}
                onChange={(e) => onExportMethodChange(e.target.value)}
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
                <option value="canvas">Canvas-based (from shader output)</option>
                <option value="geometry">Geometry-based (from mesh data)</option>
              </select>
              <small>Canvas: Captures and vectorizes the rendered image - matches what you see</small>
              <small style={{ display: 'block', marginTop: '4px' }}>Geometry: Extracts edges directly from 3D geometry - more precise but may show extra lines</small>
            </label>
          </div>
        </div>
      )}

      {localActiveTab === 'dithering' && (
        <div className="panel-section">
          <h3>Dithering Settings</h3>
          {inputMode === 'image' ? (
            <>
              <p style={{ color: '#888', fontSize: '13px', marginBottom: '16px' }}>
                Apply dithering to the image before converting to SVG. This creates a stylized halftone effect.
              </p>
              <p style={{ color: '#666', fontSize: '12px', fontStyle: 'italic' }}>
                Dithering will be automatically applied when generating the SVG.
              </p>
            </>
          ) : (
            <p style={{ color: '#888', fontSize: '13px', marginBottom: '16px' }}>
              Apply dithering to the canvas image before converting to SVG. This creates a stylized halftone effect.
            </p>
          )}
        </div>
      )}

      <div className="panel-section">
        <button
          className="export-button"
          onClick={onGenerateSVG}
          disabled={!hasContent}
        >
          Generate SVG Preview
        </button>
        {!hasContent && (
          <p className="hint">Load a file first</p>
        )}
      </div>
      
      {generatedSVG && (
        <div className="panel-section">
          <div className="svg-preview-container">
            <h3>SVG Preview</h3>
            {(() => {
              // Calculate metadata
              const fileSize = new Blob([generatedSVG]).size;
              const fileSizeKB = (fileSize / 1024).toFixed(1);
              const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
              const sizeDisplay = fileSize > 1024 * 1024 ? `${fileSizeMB} MB` : `${fileSizeKB} KB`;
              
              // Count paths/shapes
              const parser = new DOMParser();
              const svgDoc = parser.parseFromString(generatedSVG, 'image/svg+xml');
              const paths = svgDoc.querySelectorAll('path');
              const shapeCount = paths.length;
              
              return (
                <>
                  <div 
                    className="svg-preview"
                    dangerouslySetInnerHTML={{ __html: generatedSVG }}
                  />
                  <div className="svg-metadata">
                    <span>{sizeDisplay}</span>
                    <span>•</span>
                    <span>{shapeCount} {shapeCount === 1 ? 'shape' : 'shapes'}</span>
                  </div>
                </>
              );
            })()}
          </div>
          <button
            className="save-button"
            onClick={onSaveSVG}
          >
            Save SVG File
          </button>
        </div>
      )}
    </div>
  );
}

export default ExportPanel;

