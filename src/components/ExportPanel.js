import React from 'react';
import './ExportPanel.css';

function ExportPanel({ onGenerateSVG, onSaveSVG, generatedSVG, hasMesh, hasImage, inputMode, edgeSettings, onEdgeSettingsChange, applyDithering, onDitheringChange }) {
  const hasContent = hasMesh || hasImage;

  return (
    <div className="export-panel">
      <div className="panel-section">
        <h2>Export</h2>
        <p className="subtitle">SVG Generation</p>
      </div>

      {/* Settings Panel - Only show when 3D is loaded */}
      {hasMesh && inputMode === 'stl' && (
        <div className="panel-section">
          <h3>Settings</h3>
          
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
      )}

      {/* Effects Panel - Show when 3D or image is loaded */}
      {(hasMesh || hasImage) && (
        <div className="panel-section">
          <h3>Effects</h3>
          
          <div className="control-group">
            <label>
              <input
                type="checkbox"
                checked={applyDithering}
                onChange={(e) => onDitheringChange(e.target.checked)}
              />
              Apply Dithering
            </label>
            <small>Apply Floyd-Steinberg dithering to create a stylized halftone effect</small>
          </div>
        </div>
      )}

      <div className="panel-section">
        <button
          className="export-button"
          onClick={onGenerateSVG}
          disabled={!hasContent}
        >
          Generate SVG
        </button>
        {!hasContent && (
          <p className="hint">Load a file first</p>
        )}
      </div>
      
      {generatedSVG && (
        <div className="panel-section">
          <div className="svg-preview-container">
            <h3>Preview</h3>
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

