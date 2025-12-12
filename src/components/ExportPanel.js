import React, { useState, useRef, useEffect } from 'react';
import './ExportPanel.css';

// Draggable number input component (Figma-style)
function DraggableNumberInput({ value, onChange, min, max, step = 1, unit = '', label, small }) {
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startValue, setStartValue] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);
  const dragStartRef = useRef({ x: 0, y: 0, active: false });

  const formatValue = (val) => {
    if (step < 1) {
      const rounded = Math.round(val * 100) / 100;
      return rounded.toFixed(2);
    }
    return Math.round(val).toString();
  };

  // Update input value when prop value changes (but not when focused/editing)
  useEffect(() => {
    if (!isFocused) {
      setInputValue(formatValue(value));
    }
  }, [value, isFocused, step]);

  const handleMouseDown = (e) => {
    // Always allow normal click behavior if input is focused
    if (isFocused || document.activeElement === inputRef.current) {
      return; // Let browser handle focus/selection normally
    }
    
    if (e.button !== 0) return; // Only left mouse button
    
    // Store initial mouse position
    const mouseDownX = e.clientX;
    const mouseDownY = e.clientY;
    let hasStartedDragging = false;
    
    const handleMouseMove = (moveEvent) => {
      if (hasStartedDragging) return; // Already started, useEffect will handle it
      
      const deltaX = Math.abs(moveEvent.clientX - mouseDownX);
      const deltaY = Math.abs(moveEvent.clientY - mouseDownY);
      
      // If mouse moved more than 3px, start dragging
      if (deltaX > 3 || deltaY > 3) {
        hasStartedDragging = true;
        setIsDragging(true);
        setStartX(mouseDownX);
        setStartValue(value);
        // Prevent text selection now that we're dragging
        moveEvent.preventDefault();
        // Clean up these listeners - useEffect will handle dragging now
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      }
    };
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      // If we started dragging, useEffect will handle cleanup
      if (!hasStartedDragging) {
        // If no drag started, allow normal click (focus input)
      }
    };
    
    // Add listeners to detect if user wants to drag
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      const deltaX = e.clientX - startX;
      const sensitivity = step < 1 ? 0.1 : 1;
      const delta = deltaX * sensitivity * step;
      let newValue = startValue + delta;
      
      if (min !== undefined) newValue = Math.max(min, newValue);
      if (max !== undefined) newValue = Math.min(max, newValue);
      
      onChange(newValue);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, startX, startValue, onChange, min, max, step]);

  const handleChange = (e) => {
    setInputValue(e.target.value);
    const num = parseFloat(e.target.value);
    if (!isNaN(num)) {
      let clamped = num;
      if (min !== undefined) clamped = Math.max(min, clamped);
      if (max !== undefined) clamped = Math.min(max, clamped);
      onChange(clamped);
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    setInputValue(formatValue(value));
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Validate and clamp the value on blur
    const num = parseFloat(inputValue);
    if (isNaN(num) || inputValue === '' || inputValue === '-') {
      // Reset to current value if invalid
      setInputValue(formatValue(value));
    } else {
      // Clamp and update
      let clamped = num;
      if (min !== undefined) clamped = Math.max(min, clamped);
      if (max !== undefined) clamped = Math.min(max, clamped);
      onChange(clamped);
      setInputValue(formatValue(clamped));
    }
  };

  const handleKeyDown = (e) => {
    // Allow Enter to confirm and blur
    if (e.key === 'Enter') {
      e.target.blur();
    }
    // Allow Escape to cancel and reset
    if (e.key === 'Escape') {
      setInputValue(formatValue(value));
      e.target.blur();
    }
    // Don't prevent default for other keys (arrow keys, etc.)
  };

  return (
    <div className="draggable-input-wrapper">
      <div className="draggable-input-row">
        {label && <div className="draggable-input-label">{label}</div>}
        <div className="draggable-input-container">
          <input
            ref={inputRef}
            type="text"
            value={isFocused ? inputValue : formatValue(value)}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onMouseDown={handleMouseDown}
            className={`draggable-input ${isDragging ? 'dragging' : ''}`}
          />
          {unit && <span className="input-unit">{unit}</span>}
        </div>
      </div>
    </div>
  );
}

function ExportPanel({ onGenerateSVG, onSaveSVG, generatedSVG, hasMesh, hasImage, inputMode, edgeSettings, onEdgeSettingsChange, applyDithering, onDitheringChange, ditheringResolution, onDitheringResolutionChange, ditheringThreshold, onDitheringThresholdChange, ditheringContrast, onDitheringContrastChange, ditheringBrightness, onDitheringBrightnessChange, exportMode, onExportModeChange, stlExportMode, onStlExportModeChange, pixelFilter, onPixelFilterChange, renderBackground, onRenderBackgroundChange }) {
  const hasContent = hasMesh || hasImage;
  const [isExportExpanded, setIsExportExpanded] = useState(false);

  return (
    <div className="export-panel">
      {/* Settings Panel - Only show when 3D is loaded */}
      {hasMesh && inputMode === 'stl' && (
        <div className="panel-section">
          <div className="control-group">
            <DraggableNumberInput
              value={edgeSettings.threshold}
              onChange={(val) => onEdgeSettingsChange({
                ...edgeSettings,
                threshold: val
              })}
              min={0}
              max={1}
              step={0.01}
              label="Edge Threshold"
            />
          </div>

          <div className="control-group">
            <div className="control-row">
              <div className="control-label">Edge Color</div>
              <input
                type="color"
                value={edgeSettings.color}
                onChange={(e) => onEdgeSettingsChange({
                  ...edgeSettings,
                  color: e.target.value
                })}
              />
            </div>
          </div>

          <div className="control-group">
            <DraggableNumberInput
              value={edgeSettings.width}
              onChange={(val) => onEdgeSettingsChange({
                ...edgeSettings,
                width: val
              })}
              min={0.5}
              max={5}
              step={0.1}
              label="Edge Width"
            />
          </div>

          <div className="control-group">
            <DraggableNumberInput
              value={edgeSettings.shadingColors}
              onChange={(val) => onEdgeSettingsChange({
                ...edgeSettings,
                shadingColors: parseInt(val) || 1
              })}
              min={1}
              max={10}
              step={1}
              label="Shading Colors"
            />
          </div>
        </div>
      )}

      {/* Effects Panel - Show when 3D or image is loaded */}
      {(hasMesh || hasImage) && (
        <div className="panel-section">
          <div className="section-header">
            <h3>Effects</h3>
          </div>
          
          {/* Add Dithering - Show when dithering is not enabled */}
          {!applyDithering && hasImage && (
            <div 
              className="effect-add-item"
              onClick={() => onDitheringChange(true)}
            >
              <span className="effect-add-label">Add dithering</span>
              <span className="effect-add-icon">+</span>
            </div>
          )}
          
          {/* Dithering Settings - Only show when dithering is enabled */}
          {applyDithering && hasImage && (
            <div className="effect-item">
              <div className="effect-item-header">
                <span className="effect-item-label">Dithering</span>
                <button
                  className="remove-button"
                  onClick={() => onDitheringChange(false)}
                  title="Remove Dithering"
                >
                  −
                </button>
              </div>
              <div className="dithering-settings">
                <div className="control-group">
                  <DraggableNumberInput
                    value={ditheringResolution}
                    onChange={(val) => {
                      onDitheringResolutionChange(parseInt(val));
                    }}
                    min={1}
                    max={1000}
                    step={1}
                    unit="px"
                    label="Resolution"
                  />
                </div>
                
                <div className="control-group">
                  <DraggableNumberInput
                    value={ditheringThreshold}
                    onChange={(val) => {
                      onDitheringThresholdChange(parseInt(val));
                    }}
                    min={0}
                    max={255}
                    step={1}
                    label="Threshold"
                  />
                </div>
                
                <div className="control-group">
                  <DraggableNumberInput
                    value={ditheringContrast}
                    onChange={(val) => {
                      onDitheringContrastChange(parseInt(val));
                    }}
                    min={-100}
                    max={100}
                    step={1}
                    label="Contrast"
                  />
                </div>
                
                <div className="control-group">
                  <DraggableNumberInput
                    value={ditheringBrightness}
                    onChange={(val) => {
                      onDitheringBrightnessChange(parseInt(val));
                    }}
                    min={-100}
                    max={100}
                    step={1}
                    label="Brightness"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Export Settings - Show for images and 3D objects */}
      {(hasImage || hasMesh) && (
        <div className="panel-section">
          <div className="section-header">
            <h3>Export</h3>
          </div>
          
          {/* Add Export - Show when export is not expanded */}
          {!isExportExpanded && (
            <div 
              className="effect-add-item"
              onClick={() => setIsExportExpanded(true)}
            >
              <span className="effect-add-label">Export</span>
              <span className="effect-add-icon">+</span>
            </div>
          )}
          
          {/* Export Settings - Show when expanded */}
          {isExportExpanded && (
            <div className="effect-item">
              <div className="effect-item-header">
                <span className="effect-item-label">Export</span>
                <button
                  className="remove-button"
                  onClick={() => setIsExportExpanded(false)}
                  title="Collapse Export"
                >
                  −
                </button>
              </div>
              <div className="export-settings-content">
            {/* 3D Export Mode - Only show for STL/3D objects */}
            {hasMesh && inputMode === 'stl' && (
              <div className="control-group">
                <div className="control-row">
                  <div className="control-label">Export Mode</div>
                  <select
                    value={stlExportMode}
                    onChange={(e) => onStlExportModeChange(e.target.value)}
                    className="export-select"
                  >
                    <option value="geometric">Geometric</option>
                  </select>
                </div>
              </div>
            )}

            {/* Image Export Settings - Only show for images */}
            {hasImage && inputMode === 'image' && (
              <>
                <div className="control-group">
                  <div className="control-row">
                    <div className="control-label">Export Mode</div>
                    <select
                      value={exportMode}
                      onChange={(e) => onExportModeChange(e.target.value)}
                      className="export-select"
                    >
                      <option value="optimized">Optimized (VIP)</option>
                      <option value="simple">Simple</option>
                    </select>
                  </div>
                </div>

                <div className="control-group">
                  <div className="control-row">
                    <div className="control-label">Pixel Filter</div>
                    <select
                      value={pixelFilter}
                      onChange={(e) => onPixelFilterChange(e.target.value)}
                      className="export-select"
                    >
                      <option value="both">Both</option>
                      <option value="black">Black Only</option>
                      <option value="white">White Only</option>
                    </select>
                  </div>
                </div>

                <div className="control-group">
                  <div className="control-row">
                    <div className="control-label">Render Background</div>
                    <input
                      type="checkbox"
                      checked={renderBackground}
                      onChange={(e) => onRenderBackgroundChange(e.target.checked)}
                    />
                  </div>
                </div>
              </>
            )}
            
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
              <p className="hint">
                Preview updates automatically. Click "Generate SVG" to create vector format.
              </p>
            )}
              </div>
            </div>
          )}
        </div>
      )}
      
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

