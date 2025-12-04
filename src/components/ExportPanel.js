import React from 'react';
import './ExportPanel.css';

function ExportPanel({ onGenerateSVG, onSaveSVG, generatedSVG, hasMesh, hasImage, inputMode, edgeSettings, onEdgeSettingsChange, applyDithering, onDitheringChange, ditheringResolution, onDitheringResolutionChange }) {
  const hasContent = hasMesh || hasImage;

  return (
    <div className="export-panel">
      {/* Settings Panel - Only show when 3D is loaded */}
      {hasMesh && inputMode === 'stl' && (
        <div className="panel-section">
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
          
          {/* Dithering Settings - Only show when dithering is enabled */}
          {applyDithering && hasImage && (
            <div className="control-group" style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #1a1a1a' }}>
              <label>
                Resolution
                <input
                  type="range"
                  min="1"
                  max="1000"
                  step="1"
                  value={ditheringResolution}
                  onChange={(e) => onDitheringResolutionChange(parseInt(e.target.value))}
                />
                <span className="value-display">{ditheringResolution}px</span>
              </label>
              <small>Image is downsampled to this resolution before dithering is applied. Lower values = faster processing, less detail.</small>
            </div>
          )}
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
        {hasContent && inputMode === 'image' && (
          <p className="hint" style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>
            Preview updates automatically. Click "Generate SVG" to create vector format.
          </p>
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
              
              // Count paths/shapes (including images, paths, circles, rects, etc.)
              const parser = new DOMParser();
              const svgDoc = parser.parseFromString(generatedSVG, 'image/svg+xml');
              const paths = svgDoc.querySelectorAll('path');
              const images = svgDoc.querySelectorAll('image');
              const circles = svgDoc.querySelectorAll('circle');
              const rects = svgDoc.querySelectorAll('rect');
              const polygons = svgDoc.querySelectorAll('polygon');
              const polylines = svgDoc.querySelectorAll('polyline');
              const ellipses = svgDoc.querySelectorAll('ellipse');
              const shapeCount = paths.length + images.length + circles.length + rects.length + 
                                polygons.length + polylines.length + ellipses.length;
              
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
            Download
          </button>
        </div>
      )}
    </div>
  );
}

export default ExportPanel;

