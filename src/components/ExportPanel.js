import React, { useState, useRef, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import { ASCII_PRESETS } from '../components/shaders/AsciiMaterial';
import './ExportPanel.css';

// Simple switch component (shadcn-style)
function Switch({ checked, onCheckedChange, id }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={id}
      onClick={() => onCheckedChange(!checked)}
      className={`switch ${checked ? 'switch-checked' : ''}`}
    >
      <span className="switch-thumb" />
    </button>
  );
}

// Figma-style size input parser
function parseFigmaSize(input, baseWidth, baseHeight) {
  if (!input || typeof input !== 'string') return null;
  
  const trimmed = input.trim().toLowerCase();
  
  // Handle multiplier (2x, 3x, etc.)
  const multiplierMatch = trimmed.match(/^(\d+(?:\.\d+)?)x$/);
  if (multiplierMatch) {
    const multiplier = parseFloat(multiplierMatch[1]);
    return {
      width: Math.round(baseWidth * multiplier),
      height: Math.round(baseHeight * multiplier)
    };
  }
  
  // Handle width constraint (1280w, 1920w, etc.)
  const widthMatch = trimmed.match(/^(\d+)w$/);
  if (widthMatch) {
    const targetWidth = parseInt(widthMatch[1]);
    const aspectRatio = baseWidth / baseHeight;
    return {
      width: targetWidth,
      height: Math.round(targetWidth / aspectRatio)
    };
  }
  
  // Handle height constraint (720h, 1080h, etc.)
  const heightMatch = trimmed.match(/^(\d+)h$/);
  if (heightMatch) {
    const targetHeight = parseInt(heightMatch[1]);
    const aspectRatio = baseWidth / baseHeight;
    return {
      width: Math.round(targetHeight * aspectRatio),
      height: targetHeight
    };
  }
  
  // Handle explicit dimensions (1280x720, 1920x1080, etc.)
  const dimensionMatch = trimmed.match(/^(\d+)x(\d+)$/);
  if (dimensionMatch) {
    return {
      width: parseInt(dimensionMatch[1]),
      height: parseInt(dimensionMatch[2])
    };
  }
  
  return null;
}

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

  const handleWheel = (e) => {
    // Only adjust if input is not focused (to avoid conflicts with text editing)
    if (isFocused || document.activeElement === inputRef.current) {
      return;
    }
    
    // Prevent page scroll when hovering over input
    e.preventDefault();
    e.stopPropagation();
    
    // Calculate delta (normalize for different browsers)
    const delta = e.deltaY > 0 ? -step : step;
    
    // Apply sensitivity based on step size
    const sensitivity = step < 1 ? 0.1 : 1;
    const adjustedDelta = delta * sensitivity;
    
    let newValue = value + adjustedDelta;
    
    // Clamp to min/max
    if (min !== undefined) newValue = Math.max(min, newValue);
    if (max !== undefined) newValue = Math.min(max, newValue);
    
    onChange(newValue);
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
            onWheel={handleWheel}
            className={`draggable-input ${isDragging ? 'dragging' : ''}`}
          />
          {unit && <span className="input-unit">{unit}</span>}
        </div>
      </div>
    </div>
  );
}

function ExportPanel({ onGenerateSVG, onSaveSVG, generatedSVG, generatedPNG, hasMesh, hasImage, inputMode, edgeSettings, onEdgeSettingsChange, applyDithering, onDitheringChange, ditheringResolution, onDitheringResolutionChange, ditheringThreshold, onDitheringThresholdChange, ditheringContrast, onDitheringContrastChange, ditheringBrightness, onDitheringBrightnessChange, ditheringGradient, onDitheringGradientChange, ditheringMethod, onDitheringMethodChange, onDitheringReset, applyColorPalette, onColorPaletteChange, colorPalette, onColorPaletteValueChange, colorPaletteCount, onColorPaletteCountChange, onColorPaletteReset, applyAscii, onAsciiChange, asciiCellSize, onAsciiCellSizeChange, asciiCharSet, onAsciiCharSetChange, onAsciiReset, exportMode, onExportModeChange, stlExportMode, onStlExportModeChange, pixelFilter, onPixelFilterChange, renderBackground, onRenderBackgroundChange, strokeColor, onStrokeColorChange, strokeWidth, onStrokeWidthChange, exportFormat, onExportFormatChange, pngSizeInput, onPngSizeInputChange, imageData }) {
  const hasContent = hasMesh || hasImage;
  const [isExportExpanded, setIsExportExpanded] = useState(false);
  const [pngSizeInputValue, setPngSizeInputValue] = useState(pngSizeInput || '');

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
          
          {/* Add Color Palette - Show when color palette is not enabled */}
          {!applyColorPalette && hasImage && (
            <div 
              className="effect-add-item"
              onClick={() => onColorPaletteChange(true)}
            >
              <span className="effect-add-label">Add color palette</span>
              <span className="effect-add-icon">+</span>
            </div>
          )}
          
          {/* Color Palette Settings - Only show when color palette is enabled */}
          {applyColorPalette && hasImage && (
            <div className="effect-item">
              <div className="effect-item-header">
                <span className="effect-item-label">Color Palette</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    onClick={onColorPaletteReset}
                    title="Reset to Default Settings"
                    className="remove-button"
                    style={{ 
                      width: '18px',
                      height: '18px',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <RotateCcw size={12} />
                  </button>
                  <button
                    className="remove-button"
                    onClick={() => onColorPaletteChange(false)}
                    title="Remove Color Palette"
                  >
                    −
                  </button>
                </div>
              </div>
              <div className="dithering-settings">
                <div className="control-group">
                  <DraggableNumberInput
                    value={colorPaletteCount}
                    onChange={(val) => {
                      onColorPaletteCountChange(parseInt(val));
                    }}
                    min={2}
                    max={20}
                    step={1}
                    label="Colors"
                  />
                </div>
                
                {colorPaletteCount > 2 && colorPalette && (
                  <div className="control-group">
                    <div className="control-label" style={{ marginBottom: '8px' }}>Color Palette</div>
                    <div className="color-palette-grid">
                      {colorPalette.map((color, index) => (
                        <div key={index} className="color-palette-item">
                          <input
                            type="color"
                            value={color}
                            onChange={(e) => {
                              const newPalette = [...colorPalette];
                              newPalette[index] = e.target.value;
                              onColorPaletteValueChange(newPalette);
                            }}
                            className="color-palette-picker"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    onClick={onDitheringReset}
                    title="Reset to Default Settings"
                    className="remove-button"
                    style={{ 
                      width: '18px',
                      height: '18px',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <RotateCcw size={12} />
                  </button>
                  <button
                    className="remove-button"
                    onClick={() => onDitheringChange(false)}
                    title="Remove Dithering"
                  >
                    −
                  </button>
                </div>
              </div>
              <div className="dithering-settings">
                <div className="control-group">
                  <div className="control-row">
                    <div className="control-label">Method</div>
                    <select
                      value={ditheringMethod}
                      onChange={(e) => onDitheringMethodChange(e.target.value)}
                      className="export-select"
                      style={{ flex: 1, marginTop: 0 }}
                    >
                      <option value="floyd-steinberg">Floyd-Steinberg</option>
                      <option value="atkinson">Atkinson</option>
                      <option value="jarvis-judice-ninke">Jarvis-Judice-Ninke</option>
                      <option value="stucki">Stucki</option>
                      <option value="burkes">Burkes</option>
                      <option value="sierra">Sierra</option>
                      <option value="sierra-lite">Sierra Lite</option>
                      <option value="two-row-sierra">Two-Row Sierra</option>
                      <option value="ordered">Ordered (GL)</option>
                    </select>
                  </div>
                </div>
                
                {((applyColorPalette && colorPalette && colorPalette.length > 2) || (!applyColorPalette)) && (
                  <div className="control-group">
                    <DraggableNumberInput
                      value={ditheringGradient}
                      onChange={(val) => {
                        onDitheringGradientChange(parseInt(val));
                      }}
                      min={0}
                      max={100}
                      step={1}
                      label="Gradient"
                    />
                    <small style={{ display: 'block', marginTop: '6px', color: '#666', fontSize: '11px' }}>
                      {ditheringGradient < 50 ? 'More black early' : ditheringGradient > 50 ? 'More white early' : 'Linear distribution'}
                    </small>
                  </div>
                )}
                
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
          
          {/* Add ASCII - Show when ASCII is not enabled */}
          {!applyAscii && hasImage && (
            <div 
              className="effect-add-item"
              onClick={() => onAsciiChange(true)}
            >
              <span className="effect-add-label">Add ASCII (GL)</span>
              <span className="effect-add-icon">+</span>
            </div>
          )}
          
          {/* ASCII Settings - Only show when ASCII is enabled */}
          {applyAscii && hasImage && (
            <div className="effect-item">
              <div className="effect-item-header">
                <span className="effect-item-label">ASCII (GL)</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    onClick={onAsciiReset}
                    title="Reset to Default Settings"
                    className="remove-button"
                    style={{ 
                      width: '18px',
                      height: '18px',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <RotateCcw size={12} />
                  </button>
                  <button
                    className="remove-button"
                    onClick={() => onAsciiChange(false)}
                    title="Remove ASCII"
                  >
                    −
                  </button>
                </div>
              </div>
              <div className="dithering-settings">
                <div className="control-group">
                  <DraggableNumberInput
                    value={asciiCellSize}
                    onChange={(val) => {
                      onAsciiCellSizeChange(parseInt(val));
                    }}
                    min={2}
                    max={32}
                    step={1}
                    unit="px"
                    label="Cell Size"
                  />
                </div>
                
                <div className="control-group">
                  <div className="control-row">
                    <div className="control-label">Character Set</div>
                    <select
                      value={asciiCharSet}
                      onChange={(e) => onAsciiCharSetChange(e.target.value)}
                      className="export-select"
                      style={{ flex: 1, marginTop: 0 }}
                    >
                      {Object.keys(ASCII_PRESETS).map((key) => (
                        <option key={key} value={key}>
                          {key.charAt(0).toUpperCase() + key.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
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
                    <option value="wireframe">Wireframe</option>
                  </select>
                </div>
              </div>
            )}

            {/* Image Export Settings - Only show for images */}
            {hasImage && inputMode === 'image' && (
              <>
                <div className="control-group">
                  <div className="control-row">
                    <div className="control-label">Format</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                      <span style={{ fontSize: '11px', color: exportFormat === 'png' ? '#fff' : '#666' }}>PNG</span>
                      <Switch
                        checked={exportFormat === 'svg'}
                        onCheckedChange={(checked) => onExportFormatChange(checked ? 'svg' : 'png')}
                        id="export-format-switch"
                      />
                      <span style={{ fontSize: '11px', color: exportFormat === 'svg' ? '#fff' : '#666' }}>SVG</span>
                    </div>
                  </div>
                </div>

                {/* PNG Size Input - Only show when PNG is selected */}
                {exportFormat === 'png' && imageData && (
                  <div className="control-group">
                    <div className="draggable-input-wrapper">
                      <div className="draggable-input-row">
                        <div className="draggable-input-label">Size</div>
                        <div className="draggable-input-container">
                          <input
                            type="text"
                            value={pngSizeInputValue}
                            onChange={(e) => {
                              const value = e.target.value;
                              setPngSizeInputValue(value);
                              onPngSizeInputChange(value);
                            }}
                            onFocus={(e) => e.target.select()}
                            placeholder="1x, 2x, 4x, 1024w"
                            className="draggable-input"
                            style={{ fontFamily: 'monospace', cursor: 'text' }}
                          />
                        </div>
                      </div>
                    </div>
                    <small style={{ display: 'block', marginTop: '6px', color: '#666', fontSize: '11px' }}>
                      {(() => {
                        const parsed = parseFigmaSize(pngSizeInputValue, imageData.width, imageData.height);
                        if (parsed) {
                          return `${parsed.width} × ${parsed.height}px`;
                        }
                        return '1x, 2x, 4x, 1024w';
                      })()}
                    </small>
                  </div>
                )}

                {/* SVG Export Mode - Only show when SVG is selected */}
                {exportFormat === 'svg' && (
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
                )}

                {/* SVG-specific settings - Only show when SVG is selected */}
                {exportFormat === 'svg' && (
                  <>
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

                    <div className="control-group">
                      <div className="control-row">
                        <div className="control-label">Stroke Color</div>
                        <input
                          type="color"
                          value={strokeColor || '#000000'}
                          onChange={(e) => onStrokeColorChange(e.target.value)}
                        />
                        <button
                          style={{
                            padding: '4px 8px',
                            background: strokeColor ? '#1a1a1a' : '#2a2a2a',
                            border: '1px solid #2a2a2a',
                            borderRadius: '4px',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: '11px'
                          }}
                          onClick={() => onStrokeColorChange(strokeColor ? null : '#000000')}
                        >
                          {strokeColor ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </div>

                    {strokeColor && (
                      <div className="control-group">
                        <DraggableNumberInput
                          value={strokeWidth}
                          onChange={(val) => onStrokeWidthChange(val)}
                          min={0.1}
                          max={5}
                          step={0.1}
                          label="Stroke Width"
                        />
                      </div>
                    )}
                  </>
                )}
              </>
            )}
            
            <button
              className="export-button"
              onClick={onGenerateSVG}
              disabled={!hasContent}
            >
              {exportFormat === 'png' ? 'Generate PNG' : 'Generate SVG'}
            </button>
            {!hasContent && (
              <p className="hint">Load a file first</p>
            )}
              </div>
            </div>
          )}
        </div>
      )}
      
      {isExportExpanded && (generatedSVG || generatedPNG || (exportFormat === 'png' && imageData && pngSizeInput)) && (
        <div className="panel-section">
          <div className="svg-preview-container">
            <h3>Preview</h3>
            {exportFormat === 'png' && generatedPNG ? (
              <div>
                <div className="svg-preview" style={{ textAlign: 'center', padding: '8px' }}>
                  <img 
                    src={generatedPNG} 
                    alt="PNG Preview" 
                    style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '4px' }}
                  />
                </div>
                <div className="svg-metadata">
                  <span>PNG Export</span>
                </div>
              </div>
            ) : exportFormat === 'png' && imageData ? (
              <div>
                <div className="svg-preview" style={{ textAlign: 'center', padding: '20px' }}>
                  <div style={{ color: '#666', fontSize: '12px' }}>
                    {(() => {
                      const parsed = parseFigmaSize(pngSizeInput, imageData.width, imageData.height);
                      if (parsed) {
                        return `Will export at ${parsed.width} × ${parsed.height}px`;
                      }
                      return 'Enter size (e.g., 2x, 1280w)';
                    })()}
                  </div>
                </div>
                <div className="svg-metadata">
                  <span>PNG Export</span>
                </div>
              </div>
            ) : generatedSVG ? (
              (() => {
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
              })()
            ) : null}
          </div>
          <button
            className="save-button"
            onClick={onSaveSVG}
          >
            Download {exportFormat === 'png' ? 'PNG' : 'SVG'}
          </button>
        </div>
      )}
    </div>
  );
}

export default ExportPanel;

