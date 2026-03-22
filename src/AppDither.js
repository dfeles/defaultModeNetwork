import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RotateCcw, Download, FileDown, ChevronDown, ChevronRight, Eye, EyeOff, X } from 'lucide-react';
import { ditherImageData } from './utils/webglDithering';
import { makeOpaquePaletteOnly, applyColorAdjustments } from './utils/dithering';
import { applyGenerativeEffect, buildGenerativeLinesSvg, buildGenerativeCirclesSvg, buildGenerativeParticlesSvg, buildGenerativeTopomapSvg, buildGenerativeSpiralSvg, buildGenerativeSpiralsSvg } from './utils/generativeEffect';
import { exportImageToSVG, downloadSVG } from './utils/svgExporter';

function generateRainbowColors(count) {
  if (count <= 2) return ['#000000', '#ffffff'];
  const colors = ['#000000'];
  for (let i = 0; i < count - 2; i++) {
    const hue = (i / (count - 2)) * 360;
    const h = hue / 360, s = 1, l = 0.5;
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const r = Math.round(hue2rgb(p, q, h + 1/3) * 255);
    const g = Math.round(hue2rgb(p, q, h) * 255);
    const b = Math.round(hue2rgb(p, q, h - 1/3) * 255);
    colors.push('#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join(''));
  }
  colors.push('#ffffff');
  return colors;
}

const DITHER_STORAGE_KEY = 'ditherApp_settings';

function loadDitherSettings() {
  try {
    const raw = localStorage.getItem(DITHER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveDitherSettings(settings) {
  try {
    localStorage.setItem(DITHER_STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Could not save dither settings', e);
  }
}

/** Get the most used non-transparent color from an image (quantized for counting). Returns hex e.g. #rrggbb. */
function getMostUsedColorFromImage(img) {
  if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) return null;
  const maxDim = 200;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h, 0, 0, cw, ch);
  const data = ctx.getImageData(0, 0, cw, ch).data;
  const ALPHA_MIN = 128;
  const Q = 16; // quantize to 16 levels so similar colors group
  const count = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < ALPHA_MIN) continue;
    const qr = Math.min(Q - 1, Math.floor((data[i] / 255) * Q));
    const qg = Math.min(Q - 1, Math.floor((data[i + 1] / 255) * Q));
    const qb = Math.min(Q - 1, Math.floor((data[i + 2] / 255) * Q));
    const key = `${qr},${qg},${qb}`;
    count.set(key, (count.get(key) || 0) + 1);
  }
  let maxKey = null;
  let maxN = 0;
  count.forEach((n, key) => {
    if (n > maxN) {
      maxN = n;
      maxKey = key;
    }
  });
  if (!maxKey) return null;
  // Convert winning bucket index back to integer RGB (center of bucket) for valid hex
  const [qr, qg, qb] = maxKey.split(',').map(Number);
  const r = Math.min(255, Math.round(((qr + 0.5) / Q) * 255));
  const g = Math.min(255, Math.round(((qg + 0.5) / Q) * 255));
  const b = Math.min(255, Math.round(((qb + 0.5) / Q) * 255));
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const DITHER_METHODS = [
  { value: 'floyd-steinberg', label: 'Floyd-Steinberg' },
  { value: 'atkinson', label: 'Atkinson' },
  { value: 'jarvis-judice-ninke', label: 'Jarvis-Judice-Ninke' },
  { value: 'stucki', label: 'Stucki' },
  { value: 'burkes', label: 'Burkes' },
  { value: 'sierra', label: 'Sierra' },
  { value: 'sierra-lite', label: 'Sierra Lite' },
  { value: 'two-row-sierra', label: 'Two-Row Sierra' },
  { value: 'ordered', label: 'Ordered (Bayer)' },
];

function Slider({ value, onChange, min, max, step = 1, label, unit = '' }) {
  const [isEditingValue, setIsEditingValue] = useState(false);
  const [draftValue, setDraftValue] = useState(String(value));
  const valueInputRef = useRef(null);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (!isEditingValue) setDraftValue(String(value));
  }, [value, isEditingValue]);

  useEffect(() => {
    if (isEditingValue && valueInputRef.current) {
      valueInputRef.current.focus();
      valueInputRef.current.select();
    }
  }, [isEditingValue]);

  const commitValue = () => {
    const next = parseFloat(draftValue);
    if (Number.isFinite(next)) onChange(next);
    setIsEditingValue(false);
  };

  const cancelEdit = () => {
    skipBlurCommitRef.current = true;
    setDraftValue(String(value));
    setIsEditingValue(false);
  };

  const sliderValue = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

  return (
    <div className="flex flex-col gap-1">
      <div>
        <span className="text-xs text-dither-muted-light">{label}</span>
        {isEditingValue ? (
          <span className="ml-1.5 inline-flex items-center gap-1">
            <input
              ref={valueInputRef}
              type="number"
              step="any"
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              onBlur={() => {
                if (skipBlurCommitRef.current) {
                  skipBlurCommitRef.current = false;
                  return;
                }
                commitValue();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitValue();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              className="w-[70px] px-1 py-0.5 text-[11px] text-dither-text bg-[#111] border border-dither-border-active rounded"
            />
            {unit && <span className="text-[11px] text-dither-muted">{unit}</span>}
          </span>
        ) : (
          <button
            type="button"
            className="bg-transparent border-0 p-0 cursor-text"
            onClick={() => setIsEditingValue(true)}
            title="Click to type a custom value"
          >
            <span className="text-[11px] text-dither-muted ml-1.5">{value}{unit}</span>
          </button>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={sliderValue}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 accent-dither-muted cursor-pointer"
      />
    </div>
  );
}

export default function AppDither() {
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [processedUrl, setProcessedUrl] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [applyDithering, setApplyDithering] = useState(true);
  const [method, setMethod] = useState('floyd-steinberg');
  const [resolution, setResolution] = useState(500);
  const [threshold, setThreshold] = useState(128);
  const [contrast, setContrast] = useState(0);
  const [brightness, setBrightness] = useState(0);
  const [levelsBlack, setLevelsBlack] = useState(0);
  const [levelsWhite, setLevelsWhite] = useState(255);
  const [levelsGamma, setLevelsGamma] = useState(1);
  const [usePalette, setUsePalette] = useState(false);
  const [paletteCount, setPaletteCount] = useState(2);
  const [colorPalette, setColorPalette] = useState(['#000000', '#ffffff']);
  const [isDragging, setIsDragging] = useState(false);
  const [exportOpen, setExportOpen] = useState(true);
  const [exportFormat, setExportFormat] = useState('svg'); // 'png' | 'svg'
  const [exportMode, setExportMode] = useState('simple');
  const [renderBackground, setRenderBackground] = useState(true);
  const [exportTransparentStrokeOnly, setExportTransparentStrokeOnly] = useState(false); // transparent BG + stroke only (dither & gen)
  const [strokeColor, setStrokeColor] = useState(null);
  const [strokeWidth, setStrokeWidth] = useState(0.5);
  const [pixelScale, setPixelScale] = useState(100); // 1–100% size, rest is padding
  const [pixelShape, setPixelShape] = useState('square'); // 'square' | 'circle'
  const [previewBgWhite, setPreviewBgWhite] = useState(false);
  const [accentColor, setAccentColor] = useState('#000000'); // line/circle/dither stroke; sampled from image on load
  const [applyGenerative, setApplyGenerative] = useState(false);
  const [generativeMode, setGenerativeMode] = useState('lines'); // 'lines' | 'circles'
  const [generativeDensity, setGenerativeDensity] = useState(10); // For spirals mode, this is the number of spirals; for other modes, density
  const [generativeRegularity, setGenerativeRegularity] = useState(100); // 0 = random placement, 100 = regular
  const [generativeDislocate, setGenerativeDislocate] = useState(0);
  const [generativeNoiseAmplitude, setGenerativeNoiseAmplitude] = useState(0);
  const [generativeNoiseFrequency, setGenerativeNoiseFrequency] = useState(1); // 0.1-10
  const [generativePerlinAmplitude, setGenerativePerlinAmplitude] = useState(6);
  const [generativePerlinFrequency, setGenerativePerlinFrequency] = useState(4); // 1–500
  const [generativeSineAmplitude, setGenerativeSineAmplitude] = useState(0);
  const [generativeSineFrequency, setGenerativeSineFrequency] = useState(10); // cycles across image
  const [generativeMaskOn, setGenerativeMaskOn] = useState(true);
  const [generativeMaskCoveringLines, setGenerativeMaskCoveringLines] = useState('off'); // 'off' | 'top-down' | 'bottom-up'
  const [generativeMaskCoverPadding, setGenerativeMaskCoverPadding] = useState(0); // px gap before mask starts covering
  const [generativeRotation, setGenerativeRotation] = useState(0); // degrees, 0 = horizontal
  const [generativeCenterX, setGenerativeCenterX] = useState(0.5); // 0-1 for circles / lines perspective center
  const [generativeCenterY, setGenerativeCenterY] = useState(0.5);
  const [generativeLinesPerspective, setGenerativeLinesPerspective] = useState(false);
  const [generativeRenderBackground, setGenerativeRenderBackground] = useState(true);
  const [generativeParticleTilt, setGenerativeParticleTilt] = useState(50); // 0-100 for particles
  const [generativeParticleGrain, setGenerativeParticleGrain] = useState(0); // 0-100 for particles
  const [generativeParticleRotation, setGenerativeParticleRotation] = useState(0); // 0-360 degrees
  const [generativeParticleSmoothness, setGenerativeParticleSmoothness] = useState(100); // 0-100
  const [generativeParticleWindX, setGenerativeParticleWindX] = useState(0); // -100 to 100
  const [generativeParticleWindY, setGenerativeParticleWindY] = useState(0); // -100 to 100
  const [generativeParticlePerlinAmp, setGenerativeParticlePerlinAmp] = useState(0); // 0-100
  const [generativeParticlePerlinFreq, setGenerativeParticlePerlinFreq] = useState(4); // 1-100
  const [generativeSeparation, setGenerativeSeparation] = useState(0); // 0-100 for particles
  const [generativeCohesion, setGenerativeCohesion] = useState(0); // 0-100 for particles
  const [generativeAlignment, setGenerativeAlignment] = useState(0); // 0-100 for particles
  const [generativeAvoidLines, setGenerativeAvoidLines] = useState(0); // 0-100, steer away from drawn paths
  const [generativeSimulationLength, setGenerativeSimulationLength] = useState(2000); // total step count; simulation runs until this
  const [generativeParticleLifetime, setGenerativeParticleLifetime] = useState(0); // 0 = unlimited, else max steps per particle
  const [generativeSpawnMode, setGenerativeSpawnMode] = useState('once'); // 'once' | 'respawn' | 'drip'
  const [generativeSpawnInterval, setGenerativeSpawnInterval] = useState(50); // for drip: steps between spawns
  const [generativeMaxParticles, setGenerativeMaxParticles] = useState(2000); // cap for drip mode
  const [generativeTopomapSmoothness, setGenerativeTopomapSmoothness] = useState(50); // 0-100 for topomap
  const [generativeSpiralDent, setGenerativeSpiralDent] = useState(50); // 0-100 for spirals
  const [generativeSpiralTurns, setGenerativeSpiralTurns] = useState(5); // 1-20 for spirals
  const [generativeSpiralSize, setGenerativeSpiralSize] = useState(50); // 1-100 for spirals
  const [generativeSpiralSizeVariance, setGenerativeSpiralSizeVariance] = useState(50); // 0-100 for spirals
  const [generativeSpiralDepthMask, setGenerativeSpiralDepthMask] = useState(true); // Hide back side of sphere
  const [isPickingCenter, setIsPickingCenter] = useState(false);
  const [isGeneratingSvg, setIsGeneratingSvg] = useState(false);
  const [svgOverlays, setSvgOverlays] = useState([]); // { id, svg, name, visible, url? } — exported SVGs shown bottom-left
  const cancelRef = useRef(false);
  const imgRef = useRef(null);
  const processedImgRef = useRef(null);
  const previewContainerRef = useRef(null);
  const hasLoadedSettings = useRef(false);
  const svgOverlaysRef = useRef([]);
  const [imageDisplayRect, setImageDisplayRect] = useState(null); // { left, top, width, height } for overlay alignment

  // Load default image on mount
  useEffect(() => {
    const loadDefaultImage = async () => {
      try {
        const response = await fetch('/default.png');
        const blob = await response.blob();
        const file = new File([blob], 'default.png', { type: 'image/png' });
        handleFile(file);
      } catch (err) {
        console.warn('Could not load default image:', err);
      }
    };
    loadDefaultImage();
  }, []);

  // Load saved settings on mount
  useEffect(() => {
    const s = loadDitherSettings();
    if (!s) {
      hasLoadedSettings.current = true;
      return;
    }
    if (s.applyDithering != null) setApplyDithering(s.applyDithering);
    if (s.method != null) setMethod(s.method);
    if (s.resolution != null) setResolution(s.resolution);
    if (s.threshold != null) setThreshold(s.threshold);
    if (s.contrast != null) setContrast(s.contrast);
    if (s.brightness != null) setBrightness(s.brightness);
    if (s.levelsBlack != null) setLevelsBlack(s.levelsBlack);
    if (s.levelsWhite != null) setLevelsWhite(s.levelsWhite);
    if (s.levelsGamma != null) setLevelsGamma(s.levelsGamma);
    if (s.usePalette != null) setUsePalette(s.usePalette);
    if (s.paletteCount != null) setPaletteCount(s.paletteCount);
    if (s.colorPalette != null && Array.isArray(s.colorPalette)) setColorPalette(s.colorPalette);
    if (s.exportOpen != null) setExportOpen(s.exportOpen);
    if (s.exportFormat != null) setExportFormat(s.exportFormat);
    if (s.exportMode != null) setExportMode(s.exportMode);
    if (s.renderBackground != null) setRenderBackground(s.renderBackground);
    if (s.exportTransparentStrokeOnly != null) setExportTransparentStrokeOnly(s.exportTransparentStrokeOnly);
    if (s.accentColor != null) setAccentColor(s.accentColor);
    if (s.strokeColor !== undefined) setStrokeColor(s.strokeColor);
    if (s.strokeWidth != null) setStrokeWidth(s.strokeWidth);
    if (s.pixelScale != null) setPixelScale(s.pixelScale);
    if (s.pixelShape != null) setPixelShape(s.pixelShape);
    if (s.previewBgWhite != null) setPreviewBgWhite(s.previewBgWhite);
    if (s.applyGenerative != null) setApplyGenerative(s.applyGenerative);
    if (s.generativeMode != null) setGenerativeMode(s.generativeMode);
    if (s.generativeDensity != null) setGenerativeDensity(s.generativeDensity);
    if (s.generativeRegularity != null) setGenerativeRegularity(s.generativeRegularity);
    if (s.generativeDislocate != null) setGenerativeDislocate(s.generativeDislocate);
    if (s.generativeNoiseAmplitude != null) setGenerativeNoiseAmplitude(s.generativeNoiseAmplitude);
    if (s.generativeNoiseFrequency != null) setGenerativeNoiseFrequency(s.generativeNoiseFrequency);
    if (s.generativePerlinAmplitude != null) setGenerativePerlinAmplitude(s.generativePerlinAmplitude);
    if (s.generativePerlinFrequency != null) setGenerativePerlinFrequency(s.generativePerlinFrequency);
    else if (s.generativeNoiseZoom != null) setGenerativePerlinFrequency(s.generativeNoiseZoom);
    else if (s.generativeNoiseResX != null || s.generativeNoiseResY != null) setGenerativePerlinFrequency(s.generativeNoiseResX != null && s.generativeNoiseResY != null ? Math.round((Number(s.generativeNoiseResX) + Number(s.generativeNoiseResY)) / 2) : (Number(s.generativeNoiseResX) ?? Number(s.generativeNoiseResY) ?? 4));
    if (s.generativeSineAmplitude != null) setGenerativeSineAmplitude(s.generativeSineAmplitude);
    if (s.generativeSineFrequency != null) setGenerativeSineFrequency(s.generativeSineFrequency);
    if (s.generativeMaskOn != null) setGenerativeMaskOn(s.generativeMaskOn);
    if (s.generativeMaskCoveringLines != null) setGenerativeMaskCoveringLines(s.generativeMaskCoveringLines);
    if (s.generativeMaskCoverPadding != null) setGenerativeMaskCoverPadding(s.generativeMaskCoverPadding);
    if (s.generativeRotation != null) setGenerativeRotation(s.generativeRotation);
    if (s.generativeCenterX != null) setGenerativeCenterX(s.generativeCenterX);
    if (s.generativeCenterY != null) setGenerativeCenterY(s.generativeCenterY);
    if (s.generativeLinesPerspective != null) setGenerativeLinesPerspective(s.generativeLinesPerspective);
    if (s.generativeRenderBackground != null) setGenerativeRenderBackground(s.generativeRenderBackground);
    if (s.generativeParticleTilt != null) setGenerativeParticleTilt(s.generativeParticleTilt);
    if (s.generativeParticleGrain != null) setGenerativeParticleGrain(s.generativeParticleGrain);
    if (s.generativeParticleRotation != null) setGenerativeParticleRotation(s.generativeParticleRotation);
    if (s.generativeParticleSmoothness != null) setGenerativeParticleSmoothness(s.generativeParticleSmoothness);
    if (s.generativeParticleWindX != null) setGenerativeParticleWindX(s.generativeParticleWindX);
    if (s.generativeParticleWindY != null) setGenerativeParticleWindY(s.generativeParticleWindY);
    if (s.generativeParticlePerlinAmp != null) setGenerativeParticlePerlinAmp(s.generativeParticlePerlinAmp);
    if (s.generativeParticlePerlinFreq != null) setGenerativeParticlePerlinFreq(s.generativeParticlePerlinFreq);
    if (s.generativeSeparation != null) setGenerativeSeparation(s.generativeSeparation);
    if (s.generativeCohesion != null) setGenerativeCohesion(s.generativeCohesion);
    if (s.generativeAlignment != null) setGenerativeAlignment(s.generativeAlignment);
    if (s.generativeAvoidLines != null) setGenerativeAvoidLines(s.generativeAvoidLines);
    if (s.generativeSimulationLength != null) setGenerativeSimulationLength(s.generativeSimulationLength);
    if (s.generativeParticleLifetime != null) setGenerativeParticleLifetime(s.generativeParticleLifetime);
    if (s.generativeSpawnMode != null) setGenerativeSpawnMode(s.generativeSpawnMode);
    if (s.generativeSpawnInterval != null) setGenerativeSpawnInterval(s.generativeSpawnInterval);
    if (s.generativeMaxParticles != null) setGenerativeMaxParticles(s.generativeMaxParticles);
    if (s.generativeTopomapSmoothness != null) setGenerativeTopomapSmoothness(s.generativeTopomapSmoothness);
    if (s.generativeSpiralDent != null) setGenerativeSpiralDent(s.generativeSpiralDent);
    if (s.generativeSpiralTurns != null) setGenerativeSpiralTurns(s.generativeSpiralTurns);
    if (s.generativeSpiralSize != null) setGenerativeSpiralSize(s.generativeSpiralSize);
    if (s.generativeSpiralSizeVariance != null) setGenerativeSpiralSizeVariance(s.generativeSpiralSizeVariance);
    if (s.generativeSpiralDepthMask != null) setGenerativeSpiralDepthMask(s.generativeSpiralDepthMask);
    if (s.generativeAmplitude != null && s.generativePerlinAmplitude == null) setGenerativePerlinAmplitude(s.generativeAmplitude);
    // Defer so the save effect runs first (with hasLoadedSettings still false) and doesn't overwrite with defaults
    queueMicrotask(() => {
      hasLoadedSettings.current = true;
    });
  }, []);

  // Persist all settings when they change
  useEffect(() => {
    if (!hasLoadedSettings.current) return;
    saveDitherSettings({
      applyDithering,
      method,
      resolution,
      threshold,
      contrast,
      brightness,
      levelsBlack,
      levelsWhite,
      levelsGamma,
      usePalette,
      paletteCount,
      colorPalette,
      exportOpen,
      exportFormat,
      exportMode,
      renderBackground,
      exportTransparentStrokeOnly,
      accentColor,
      strokeColor,
      strokeWidth,
      pixelScale,
      pixelShape,
      previewBgWhite,
      applyGenerative,
      generativeMode,
      generativeDensity,
      generativeRegularity,
      generativeDislocate,
      generativeNoiseAmplitude,
      generativeNoiseFrequency,
      generativePerlinAmplitude,
      generativePerlinFrequency,
      generativeSineAmplitude,
      generativeSineFrequency,
      generativeMaskOn,
      generativeMaskCoveringLines,
      generativeMaskCoverPadding,
      generativeRotation,
      generativeCenterX,
      generativeCenterY,
      generativeLinesPerspective,
      generativeRenderBackground,
      generativeParticleTilt,
      generativeParticleGrain,
      generativeParticleRotation,
      generativeParticleSmoothness,
      generativeParticleWindX,
      generativeParticleWindY,
      generativeParticlePerlinAmp,
      generativeParticlePerlinFreq,
      generativeSeparation,
      generativeCohesion,
      generativeAlignment,
      generativeAvoidLines,
      generativeSimulationLength,
      generativeParticleLifetime,
      generativeSpawnMode,
      generativeSpawnInterval,
      generativeMaxParticles,
      generativeTopomapSmoothness,
      generativeSpiralDent,
      generativeSpiralTurns,
      generativeSpiralSize,
      generativeSpiralSizeVariance,
      generativeSpiralDepthMask,
    });
  }, [
    applyDithering,
    method,
    resolution,
    threshold,
    contrast,
    brightness,
    levelsBlack,
    levelsWhite,
    levelsGamma,
    usePalette,
    paletteCount,
    colorPalette,
    exportOpen,
    exportFormat,
    exportMode,
    renderBackground,
    exportTransparentStrokeOnly,
    accentColor,
    strokeColor,
    strokeWidth,
    pixelScale,
    pixelShape,
    previewBgWhite,
    applyGenerative,
    generativeMode,
    generativeDensity,
    generativeRegularity,
    generativeDislocate,
    generativeNoiseAmplitude,
    generativePerlinAmplitude,
    generativePerlinFrequency,
    generativeSineAmplitude,
    generativeSineFrequency,
    generativeMaskOn,
    generativeMaskCoveringLines,
    generativeMaskCoverPadding,
    generativeRotation,
    generativeCenterX,
    generativeCenterY,
    generativeLinesPerspective,
    generativeRenderBackground,
    generativeParticleTilt,
    generativeParticleGrain,
    generativeParticleRotation,
    generativeParticleSmoothness,
    generativeParticleWindX,
    generativeParticleWindY,
    generativeParticlePerlinAmp,
    generativeParticlePerlinFreq,
    generativeSeparation,
    generativeCohesion,
    generativeAlignment,
    generativeAvoidLines,
    generativeSimulationLength,
    generativeParticleLifetime,
    generativeSpawnMode,
    generativeSpawnInterval,
    generativeMaxParticles,
    generativeTopomapSmoothness,
    generativeSpiralDent,
    generativeSpiralTurns,
    generativeSpiralSize,
    generativeSpiralSizeVariance,
  ]);

  // Keep palette in sync with count
  useEffect(() => {
    if (paletteCount === 2) {
      setColorPalette(['#000000', '#ffffff']);
    } else if (colorPalette.length !== paletteCount) {
      setColorPalette(generateRainbowColors(paletteCount));
    }
  }, [paletteCount]);

  const runDither = useCallback(async (file, imgElement, forSvgExport = false) => {
    if (!file || !imgElement) return forSvgExport ? null : undefined;
    if (forSvgExport) cancelRef.current = false;
    else {
      cancelRef.current = false;
      setIsProcessing(true);
      setProcessedUrl(null);
    }

    const w = imgElement.naturalWidth;
    const h = imgElement.naturalHeight;
    let processW = w;
    let processH = h;
    if (w > resolution || h > resolution) {
      if (w > h) {
        processW = resolution;
        processH = Math.round(h * (resolution / w));
      } else {
        processH = resolution;
        processW = Math.round(w * (resolution / h));
      }
    }

    // Original alpha (before composite) so we can keep 0 alpha for fully transparent pixels
    const origCanvas = document.createElement('canvas');
    origCanvas.width = processW;
    origCanvas.height = processH;
    const origCtx = origCanvas.getContext('2d');
    origCtx.drawImage(imgElement, 0, 0, processW, processH);
    const originalImageData = origCtx.getImageData(0, 0, processW, processH);

    const canvas = document.createElement('canvas');
    canvas.width = processW;
    canvas.height = processH;
    const ctx = canvas.getContext('2d');
    // Composite onto app bg so transparent PNGs have a color for dithering; we restore 0 alpha after
    const bgColor = previewBgWhite ? '#ffffff' : '#0a0a0a';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, processW, processH);
    ctx.drawImage(imgElement, 0, 0, processW, processH);

    try {
      if (applyDithering) {
        const palette = (usePalette && colorPalette.length > 0) ? colorPalette : ['#000000', '#ffffff'];
        const colorCount = palette.length;
        const dithered = await ditherImageData(canvas, {
          resolution,
          threshold,
          contrast,
          brightness,
          colorCount,
          colorPalette: palette.length > 0 ? palette : null,
          levelsBlack,
          levelsWhite,
          levelsGamma,
          method,
        });
        if (cancelRef.current) return;
        const opaquePalette = makeOpaquePaletteOnly(dithered, palette, originalImageData);
        ctx.putImageData(opaquePalette, 0, 0);
      } else {
        const imageData = ctx.getImageData(0, 0, processW, processH);
        const colorOnly = applyColorAdjustments(imageData, contrast, brightness, levelsBlack, levelsWhite, levelsGamma);
        for (let i = 3; i < colorOnly.data.length; i += 4) colorOnly.data[i] = originalImageData.data[i];
        ctx.putImageData(colorOnly, 0, 0);
      }
      let outputCanvas = canvas;
      if (applyGenerative && generativeMode) {
        const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
        const outW = Math.round(processW * dpr);
        const outH = Math.round(processH * dpr);
        const retinaCanvas = document.createElement('canvas');
        retinaCanvas.width = outW;
        retinaCanvas.height = outH;
        const rCtx = retinaCanvas.getContext('2d');
        rCtx.imageSmoothingEnabled = true;
        rCtx.imageSmoothingQuality = 'high';
        rCtx.drawImage(canvas, 0, 0, processW, processH, 0, 0, outW, outH);
        const imageData = rCtx.getImageData(0, 0, outW, outH);
        const bgColor = previewBgWhite ? '#ffffff' : '#0a0a0a';
        const strokeStyle = accentColor || (previewBgWhite ? '#000000' : '#ffffff');
        if (forSvgExport) {
          return { width: outW, height: outH, imageData, backgroundColor: bgColor, strokeStyle };
        }
        applyGenerativeEffect(rCtx, outW, outH, imageData, generativeMode || 'lines', {
          backgroundColor: bgColor,
          strokeStyle,
          dpr,
          density: generativeDensity,
          regularity: generativeRegularity,
          dislocate: generativeDislocate,
          noiseAmplitude: generativeNoiseAmplitude,
          noiseFrequency: generativeNoiseFrequency,
          perlinAmplitude: generativePerlinAmplitude,
          perlinFrequency: generativePerlinFrequency,
          sineAmplitude: generativeSineAmplitude,
          sineFrequency: generativeSineFrequency,
          maskOn: generativeMaskOn,
          maskCoveringLines: generativeMaskCoveringLines,
          maskCoverPadding: generativeMaskCoverPadding,
          rotation: generativeRotation,
          centerX: generativeCenterX,
          centerY: generativeCenterY,
          linesPerspective: generativeLinesPerspective,
          particleTilt: generativeParticleTilt,
          particleGrain: generativeParticleGrain,
          particleRotation: generativeParticleRotation,
          particleSmoothness: generativeParticleSmoothness,
          particleWindX: generativeParticleWindX,
          particleWindY: generativeParticleWindY,
          particlePerlinAmp: generativeParticlePerlinAmp,
          particlePerlinFreq: generativeParticlePerlinFreq,
          separation: generativeSeparation,
          cohesion: generativeCohesion,
          alignment: generativeAlignment,
          avoidLines: generativeAvoidLines,
          simulationLength: generativeSimulationLength,
          particleLifetime: generativeParticleLifetime,
          spawnMode: generativeSpawnMode,
          spawnInterval: generativeSpawnInterval,
          maxParticles: generativeMaxParticles,
          topomapSmoothness: generativeTopomapSmoothness,
          spiralDent: generativeSpiralDent,
          spiralTurns: generativeSpiralTurns,
          spiralSize: generativeSpiralSize,
          spiralSizeVariance: generativeSpiralSizeVariance,
          spiralDepthMask: generativeSpiralDepthMask,
        });
        outputCanvas = retinaCanvas;
      }
      if (forSvgExport) return null;
      const dataUrl = outputCanvas.toDataURL('image/png');
      setProcessedUrl(dataUrl);
    } catch (err) {
      console.error('Dither error:', err);
      if (forSvgExport) return null;
    } finally {
      if (!forSvgExport) setIsProcessing(false);
    }
  }, [applyDithering, applyGenerative, generativeMode, generativeDensity, generativeRegularity, generativeDislocate, generativeNoiseAmplitude, generativeNoiseFrequency, generativePerlinAmplitude, generativePerlinFrequency, generativeSineAmplitude, generativeSineFrequency, generativeMaskOn, generativeMaskCoveringLines, generativeMaskCoverPadding, generativeRotation, generativeCenterX, generativeCenterY, generativeLinesPerspective, generativeParticleTilt, generativeParticleGrain, generativeParticleRotation, generativeParticleSmoothness, generativeParticleWindX, generativeParticleWindY, generativeParticlePerlinAmp, generativeParticlePerlinFreq, generativeSeparation, generativeCohesion, generativeAlignment, generativeAvoidLines, generativeSimulationLength, generativeParticleLifetime, generativeSpawnMode, generativeSpawnInterval, generativeMaxParticles, generativeTopomapSmoothness, generativeSpiralDent, generativeSpiralTurns, generativeSpiralSize, generativeSpiralSizeVariance, generativeSpiralDepthMask, resolution, threshold, contrast, brightness, levelsBlack, levelsWhite, levelsGamma, method, usePalette, colorPalette, previewBgWhite, accentColor]);

  // When image loads or settings change, recompute dithered preview (short debounce for live updates while dragging)
  useEffect(() => {
    if (!imageFile || !imgRef.current) {
      setProcessedUrl(null);
      return;
    }
    const img = imgRef.current;
    if (!img.complete || !img.naturalWidth) return;

    cancelRef.current = true;
    const t = setTimeout(() => {
      cancelRef.current = false;
      runDither(imageFile, img);
    }, 40);
    return () => clearTimeout(t);
  }, [imageFile, applyDithering, applyGenerative, generativeMode, generativeDensity, generativeRegularity, generativeDislocate, generativeNoiseAmplitude, generativeNoiseFrequency, generativePerlinAmplitude, generativePerlinFrequency, generativeSineAmplitude, generativeSineFrequency, generativeMaskOn, generativeMaskCoveringLines, generativeMaskCoverPadding, generativeRotation, generativeCenterX, generativeCenterY, generativeLinesPerspective, generativeParticleTilt, generativeParticleGrain, generativeParticleRotation, generativeParticleSmoothness, generativeParticleWindX, generativeParticleWindY, generativeParticlePerlinAmp, generativeParticlePerlinFreq, generativeSeparation, generativeCohesion, generativeAlignment, generativeAvoidLines, generativeSimulationLength, generativeParticleLifetime, generativeSpawnMode, generativeSpawnInterval, generativeMaxParticles, generativeTopomapSmoothness, generativeSpiralDent, generativeSpiralTurns, generativeSpiralSize, generativeSpiralSizeVariance, generativeSpiralDepthMask, method, resolution, threshold, contrast, brightness, levelsBlack, levelsWhite, levelsGamma, usePalette, colorPalette, previewBgWhite, runDither]);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    setProcessedUrl(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handleReset = () => {
    setApplyDithering(true);
    setMethod('floyd-steinberg');
    setResolution(500);
    setThreshold(128);
    setContrast(0);
    setBrightness(0);
    setLevelsBlack(0);
    setLevelsWhite(255);
    setLevelsGamma(1);
    setProcessedUrl((prev) => prev ? null : prev);
  };

  const handleDitheringReset = () => {
    setMethod('floyd-steinberg');
    setResolution(500);
    setThreshold(128);
    setUsePalette(false);
    setPaletteCount(2);
    setColorPalette(['#000000', '#ffffff']);
    setProcessedUrl((prev) => prev ? null : prev);
  };

  const handleDownload = () => {
    if (!processedUrl) return;
    // With dark canvas, export only white pixels (transparent background)
    if (!previewBgWhite) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const DARK = 30; // treat pixels darker than this as background
        for (let i = 0; i < data.data.length; i += 4) {
          const r = data.data[i];
          const g = data.data[i + 1];
          const b = data.data[i + 2];
          const isBackground = r <= DARK && g <= DARK && b <= DARK;
          if (isBackground) data.data[i + 3] = 0;
        }
        ctx.putImageData(data, 0, 0);
        const a = document.createElement('a');
        a.download = (imageFile?.name || 'export').replace(/\.[^.]+$/, '') + '-dithered.png';
        a.href = canvas.toDataURL('image/png');
        a.click();
      };
      img.src = processedUrl;
      return;
    }
    const a = document.createElement('a');
    a.download = (imageFile?.name || 'export').replace(/\.[^.]+$/, '') + '-dithered.png';
    a.href = processedUrl;
    a.click();
  };

  const handleDownloadSvg = async () => {
    const img = imgRef.current;
    if (!imageFile || !img || !img.complete || !img.naturalWidth) return;
    setIsGeneratingSvg(true);
    try {
      const texture = { image: img };
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const transparentStroke = exportTransparentStrokeOnly;
      const effectiveStroke = strokeColor ?? accentColor ?? (previewBgWhite ? '#000000' : '#ffffff');
      const ditherStrokeColor = transparentStroke ? effectiveStroke : (strokeColor ?? undefined);
      const svgString = await exportImageToSVG(texture, null, {
        width: w,
        height: h,
        imageWidth: w,
        imageHeight: h,
        backgroundColor: previewBgWhite ? '#ffffff' : '#0a0a0a',
        applyDithering,
        applyColorPalette: usePalette,
        colorPalette: usePalette && colorPalette.length > 0 ? colorPalette : undefined,
        ditheringResolution: resolution,
        ditheringThreshold: threshold,
        ditheringContrast: contrast,
        ditheringBrightness: brightness,
        ditheringLevelsBlack: levelsBlack,
        ditheringLevelsWhite: levelsWhite,
        ditheringLevelsGamma: levelsGamma,
        ditheringMethod: method,
        ditheringColorCount: (usePalette && colorPalette.length > 0) ? colorPalette.length : 2,
        exportMode,
        renderBackground: transparentStroke ? false : renderBackground,
        exportWhiteOnly: !previewBgWhite,
        strokeColor: ditherStrokeColor,
        strokeWidth: ditherStrokeColor ? strokeWidth : undefined,
        pixelScale,
        pixelShape,
      });
      const filename = (imageFile?.name || 'export').replace(/\.[^.]+$/, '') + '-dithered.svg';
      downloadSVG(svgString, filename);
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const id = `ov-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      setSvgOverlays((prev) => [...prev, { id, svg: svgString, name: filename, visible: true, url }]);
    } catch (err) {
      console.error('SVG export error:', err);
    } finally {
      setIsGeneratingSvg(false);
    }
  };

  const handleExportGenerativeSvg = async () => {
    const img = imgRef.current;
    if (!imageFile || !img || !img.complete || !img.naturalWidth) return;
    setIsGeneratingSvg(true);
    try {
      const exportData = await runDither(imageFile, img, true);
      if (!exportData) return;
      const { width, height, imageData, backgroundColor, strokeStyle } = exportData;
      const opts = {
        dpr: Math.min(3, Math.max(1, window.devicePixelRatio || 1)),
        density: generativeDensity,
        regularity: generativeRegularity,
        dislocate: generativeDislocate,
        noiseAmplitude: generativeNoiseAmplitude,
        perlinAmplitude: generativePerlinAmplitude,
        perlinFrequency: generativePerlinFrequency,
        sineAmplitude: generativeSineAmplitude,
        sineFrequency: generativeSineFrequency,
        maskOn: generativeMaskOn,
        maskCoveringLines: generativeMaskCoveringLines,
        maskCoverPadding: generativeMaskCoverPadding,
        rotation: generativeRotation,
        centerX: generativeCenterX,
        centerY: generativeCenterY,
        linesPerspective: generativeLinesPerspective,
        renderBackground: 'stroke', // transparent fill + stroke outline
        backgroundColor,
        strokeStyle,
      };
      const svg = generativeMode === 'circles'
        ? buildGenerativeCirclesSvg(width, height, imageData, opts)
        : generativeMode === 'particles'
        ? buildGenerativeParticlesSvg(width, height, imageData, { 
            ...opts, 
            particleTilt: generativeParticleTilt,
            particleGrain: generativeParticleGrain,
            particleRotation: generativeParticleRotation,
            particleSmoothness: generativeParticleSmoothness,
            particleWindX: generativeParticleWindX,
            particleWindY: generativeParticleWindY,
            particlePerlinAmp: generativeParticlePerlinAmp,
            particlePerlinFreq: generativeParticlePerlinFreq,
            separation: generativeSeparation,
            cohesion: generativeCohesion,
            alignment: generativeAlignment,
            avoidLines: generativeAvoidLines,
            simulationLength: generativeSimulationLength,
            particleLifetime: generativeParticleLifetime,
            spawnMode: generativeSpawnMode,
            spawnInterval: generativeSpawnInterval,
            maxParticles: generativeMaxParticles,
          })
        : generativeMode === 'topomap'
        ? buildGenerativeTopomapSvg(width, height, imageData, { ...opts, topomapSmoothness: generativeTopomapSmoothness })
        : generativeMode === 'spiral'
        ? buildGenerativeSpiralSvg(width, height, imageData, { ...opts, spiralDent: generativeSpiralDent, spiralTurns: generativeSpiralTurns, spiralDepthMask: generativeSpiralDepthMask })
        : generativeMode === 'spirals'
        ? buildGenerativeSpiralsSvg(width, height, imageData, { ...opts, spiralDent: generativeSpiralDent, spiralTurns: generativeSpiralTurns, spiralSize: generativeSpiralSize, spiralSizeVariance: generativeSpiralSizeVariance, spiralDepthMask: generativeSpiralDepthMask })
        : buildGenerativeLinesSvg(width, height, imageData, opts);
      const filename = (imageFile?.name || 'export').replace(/\.[^.]+$/, '') + '-generative.svg';
      downloadSVG(svg, filename);
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const id = `ov-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      setSvgOverlays((prev) => [...prev, { id, svg, name: filename, visible: true, url }]);
    } catch (err) {
      console.error('Generative SVG export error:', err);
    } finally {
      setIsGeneratingSvg(false);
    }
  };

  const setSvgOverlayVisible = (id, visible) => {
    setSvgOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, visible } : o)));
  };

  const removeSvgOverlay = (id) => {
    setSvgOverlays((prev) => {
      const o = prev.find((x) => x.id === id);
      if (o?.url) URL.revokeObjectURL(o.url);
      return prev.filter((x) => x.id !== id);
    });
  };

  useEffect(() => {
    svgOverlaysRef.current = svgOverlays;
  }, [svgOverlays]);

  useEffect(() => {
    return () => {
      svgOverlaysRef.current.forEach((o) => {
        if (o.url) URL.revokeObjectURL(o.url);
      });
    };
  }, []);

  // Measure displayed image rect so overlay can be positioned/sized exactly on top
  const measureImageRect = useCallback(() => {
    const container = previewContainerRef.current;
    const img = processedUrl ? processedImgRef.current : imgRef.current;
    if (!container || !img) {
      setImageDisplayRect(null);
      return;
    }
    const cr = container.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    setImageDisplayRect({
      left: ir.left - cr.left,
      top: ir.top - cr.top,
      width: ir.width,
      height: ir.height,
    });
  }, [processedUrl]);

  useEffect(() => {
    if (!imagePreviewUrl && !processedUrl) {
      setImageDisplayRect(null);
      return;
    }
    const raf = requestAnimationFrame(() => {
      measureImageRect();
    });
    const onResize = () => measureImageRect();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [imagePreviewUrl, processedUrl, measureImageRect]);

  // Re-measure when processed image loads (dimensions available)
  const handleProcessedImageLoad = useCallback(() => {
    measureImageRect();
  }, [measureImageRect]);

  const displayUrl = processedUrl || imagePreviewUrl;

  const handlePreviewClick = (e) => {
    if (!isPickingCenter) return;
    e.preventDefault();
    e.stopPropagation();
    const imgEl = processedUrl ? processedImgRef.current : imgRef.current;
    if (!imgEl) return;
    const rect = imgEl.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setGenerativeCenterX(Math.max(0, Math.min(1, x)));
    setGenerativeCenterY(Math.max(0, Math.min(1, y)));
    setIsPickingCenter(false);
  };

  return (
    <div
      className={`h-screen min-h-0 flex flex-col overflow-hidden bg-dither-bg text-dither-text ${isDragging ? 'outline outline-3 outline-dashed outline-dither-border-active bg-white/[0.02]' : ''}`}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false); }}
      onDrop={handleDrop}
    >
      <header className="py-3 px-5 border-b border-dither-border flex-shrink-0">
        <h1 className="m-0 text-xl font-semibold tracking-wide">Dither</h1>
      </header>
      <main className="flex-1 flex min-h-0">
        <aside className="w-[260px] flex-shrink-0 min-h-0 max-h-full border-r border-dither-border flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 flex flex-col gap-4">
            <div className="border-2 border-dashed border-dither-border-active rounded-lg py-3 px-4 text-center cursor-pointer relative transition-colors hover:border-dither-border-active hover:bg-white/[0.03]">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleFile(e.target.files?.[0])}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <span className="text-[13px] text-dither-muted-mid">{imageFile ? 'Replace image' : 'Drop image or click'}</span>
            </div>

            <div className="flex flex-row items-center justify-between gap-1">
              <label className="text-xs text-dither-muted-light">Canvas background</label>
              <button
                type="button"
                className={`px-2.5 py-1 text-xs bg-dither-panel border rounded-md cursor-pointer transition-colors ${previewBgWhite ? 'bg-[#252525] text-dither-text border-dither-border-light' : 'border-dither-border-hover text-dither-muted-mid'}`}
                onClick={() => setPreviewBgWhite((v) => !v)}
                title={previewBgWhite ? 'Switch to dark background' : 'Switch to white background'}
              >
                {previewBgWhite ? 'White' : 'Dark'}
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-dither-muted-mid">
                <span>Settings</span>
                <button type="button" onClick={handleReset} className="p-1 bg-transparent border-none text-dither-muted-mid cursor-pointer rounded hover:text-dither-muted-light hover:bg-white/[0.06]" title="Reset">
                  <RotateCcw size={14} />
                </button>
              </div>

              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-dither-muted-mid">Color</div>
                <Slider value={contrast} onChange={setContrast} min={-100} max={100} label="Contrast" />
                <Slider value={brightness} onChange={setBrightness} min={-100} max={100} label="Brightness" />
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-dither-muted-light">Levels</label>
                </div>
                <Slider value={levelsBlack} onChange={setLevelsBlack} min={0} max={255} label="Black" />
                <Slider value={levelsWhite} onChange={setLevelsWhite} min={0} max={255} label="White" />
                <Slider value={levelsGamma} onChange={setLevelsGamma} min={0.25} max={4} step={0.05} label="Mid (γ)" />
              </div>
            </div>
          </div>

          {svgOverlays.length > 0 && (
            <div className="flex-shrink-0 border-t border-dither-border p-3 flex flex-col gap-2 max-h-[min(280px,35vh)] overflow-y-auto overflow-x-hidden bg-dither-bg/80">
              <div className="text-[11px] font-medium text-dither-muted-light uppercase tracking-wider flex-shrink-0">
                Exported SVGs
              </div>
              {svgOverlays.map((o) => (
                <div
                  key={o.id}
                  className={`flex items-center gap-2 flex-shrink-0 rounded border overflow-hidden transition-opacity ${o.visible ? 'opacity-100 border-dither-border-light' : 'opacity-50 border-dither-border'}`}
                >
                  <button
                    type="button"
                    onClick={() => setSvgOverlayVisible(o.id, !o.visible)}
                    className="p-1.5 flex-shrink-0 text-dither-muted hover:text-dither-text hover:bg-white/10 cursor-pointer"
                    title={o.visible ? 'Hide' : 'Show'}
                  >
                    {o.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  {o.url && (
                    <img
                      src={o.url}
                      alt=""
                      className="w-16 h-16 object-contain flex-shrink-0 bg-dither-panel/50 pointer-events-none"
                    />
                  )}
                  <span className="text-[11px] text-dither-muted truncate min-w-0 flex-1" title={o.name}>
                    {o.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSvgOverlay(o.id)}
                    className="p-1.5 flex-shrink-0 text-dither-muted hover:text-red-400 hover:bg-white/10 cursor-pointer"
                    title="Remove from overlay"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>

        <div
          ref={previewContainerRef}
          className={`flex-1 min-w-0 flex items-center justify-center p-6 relative bg-dither-bg ${isPickingCenter ? 'cursor-crosshair' : ''}`}
          style={{ background: previewBgWhite ? '#ffffff' : undefined }}
          onClick={isPickingCenter ? handlePreviewClick : undefined}
          role={isPickingCenter ? 'button' : undefined}
          title={isPickingCenter ? (generativeMode === 'spirals' ? 'Click to set tilt center' : 'Click to set center') : undefined}
        >
          {!imageFile && (
            <span className="text-lg text-dither-muted-mid">Drop image anywhere or use sidebar</span>
          )}
          {isProcessing && (
            <div className="absolute w-8 h-8 border-[3px] border-dither-border-hover border-t-dither-muted rounded-full animate-dither-spin" />
          )}
          {imagePreviewUrl && (
            <img
              ref={imgRef}
              src={imagePreviewUrl}
              alt=""
              className="max-w-full max-h-full object-contain block absolute pointer-events-none"
              style={{ display: processedUrl ? 'none' : 'block' }}
              crossOrigin="anonymous"
              onLoad={() => {
                const img = imgRef.current;
                if (img) {
                  const hex = getMostUsedColorFromImage(img);
                  if (hex) setAccentColor(hex);
                }
                runDither(imageFile, imgRef.current);
                measureImageRect();
              }}
            />
          )}
          {processedUrl && (
            <img
              ref={processedImgRef}
              src={processedUrl}
              alt="Dithered"
              className="max-w-full max-h-full object-contain block"
              style={{ imageRendering: applyGenerative ? 'auto' : 'pixelated' }}
              onLoad={handleProcessedImageLoad}
            />
          )}

          {imageDisplayRect && svgOverlays.filter((o) => o.visible).length > 0 && (
            <div
              className="absolute z-10 pointer-events-none"
              style={{
                left: imageDisplayRect.left,
                top: imageDisplayRect.top,
                width: imageDisplayRect.width,
                height: imageDisplayRect.height,
              }}
              aria-hidden
            >
              {svgOverlays.filter((o) => o.visible).map((o) => o.url && (
                <img
                  key={o.id}
                  src={o.url}
                  alt=""
                  className="absolute inset-0 w-full h-full object-contain"
                />
              ))}
            </div>
          )}
        </div>

        <aside className="w-[260px] flex-shrink-0 min-h-0 max-h-full p-4 border-l border-dither-border flex flex-col gap-4 overflow-y-auto overflow-x-hidden">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-dither-muted-mid">
              Color
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-dither-muted-light">Accent (lines / circles / dither stroke)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-10 h-10 p-0 border border-dither-border-active rounded cursor-pointer bg-dither-panel flex-shrink-0"
                  title="Accent color for generative lines/circles and dither stroke"
                />
                <span className="text-[11px] text-dither-muted font-mono">{accentColor}</span>
              </div>
            </div>
          </div>

          {!applyDithering && (
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-dither-muted-mid">Dithering</div>
          )}
          {!applyDithering ? (
            <div
              className="flex items-center justify-between py-2.5 cursor-pointer transition-opacity mt-2 hover:opacity-85"
              onClick={() => setApplyDithering(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setApplyDithering(true); } }}
              title="Add dithering"
            >
              <span className="text-[13px] text-dither-muted-light font-normal">Add dithering</span>
              <span className="text-dither-muted text-lg leading-none flex-shrink-0">+</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-dither-muted-mid">Dithering</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleDitheringReset}
                    className="w-[22px] h-[22px] p-0 flex items-center justify-center bg-transparent border border-dither-border-hover rounded text-dither-muted text-sm cursor-pointer flex-shrink-0 hover:bg-[#222] hover:border-dither-border-light hover:text-dither-text"
                    title="Reset dithering to defaults"
                  >
                    <RotateCcw size={12} />
                  </button>
                  <button
                    type="button"
                    className="w-[22px] h-[22px] p-0 flex items-center justify-center bg-transparent border border-dither-border-hover rounded text-dither-muted text-sm cursor-pointer flex-shrink-0 hover:bg-[#222] hover:border-dither-border-light hover:text-dither-text"
                    onClick={(e) => { e.stopPropagation(); setApplyDithering(false); }}
                    title="Remove dithering"
                  >
                    −
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-dither-muted-light">Method</label>
                <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full py-1.5 px-2 text-[13px] bg-dither-panel border border-dither-border-hover rounded-md text-dither-text cursor-pointer">
                  {DITHER_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <Slider value={resolution} onChange={setResolution} min={50} max={1000} step={10} label="Resolution" unit="px" />
              <Slider value={threshold} onChange={setThreshold} min={0} max={255} label="Threshold" />
              <div className="flex flex-row items-center justify-between gap-1">
                <label className="text-xs text-dither-muted-light">Color palette</label>
                <button
                  type="button"
                  className={`px-2.5 py-1 text-xs border rounded-md cursor-pointer transition-colors ${usePalette ? 'bg-[#252525] text-dither-text border-dither-border-light' : 'bg-dither-panel border-dither-border-hover text-dither-muted-mid'}`}
                  onClick={() => setUsePalette((v) => !v)}
                >
                  {usePalette ? 'On' : 'Off'}
                </button>
              </div>
              {usePalette && (
                <>
                  <Slider value={paletteCount} onChange={(v) => setPaletteCount(Math.round(v))} min={2} max={16} step={1} label="Colors" />
                  {colorPalette.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {colorPalette.map((hex, i) => (
                        <input
                          key={i}
                          type="color"
                          value={hex}
                          onChange={(e) => {
                            const next = [...colorPalette];
                            next[i] = e.target.value;
                            setColorPalette(next);
                          }}
                          className="w-7 h-7 p-0 border border-dither-border-active rounded cursor-pointer bg-transparent"
                        />
                      ))}
                    </div>
                  )}
                </>
              )}

              <div className="flex flex-col gap-2.5 pt-2 border-t border-dither-border">
                <button
                  type="button"
                  className="flex items-center gap-1.5 py-1.5 bg-none border-none text-dither-muted-mid text-xs font-semibold uppercase tracking-wider cursor-pointer hover:text-dither-muted-light"
                  onClick={() => setExportOpen((v) => !v)}
                  aria-expanded={exportOpen}
                >
                  {exportOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>Export</span>
                </button>
                {exportOpen && (
                  <div className="flex flex-col gap-2.5 pl-1">
                    <div className="flex flex-row items-center justify-between gap-1">
                      <label className="text-xs text-dither-muted-light">Format</label>
                      <div className="flex -space-x-px">
                        <button
                          type="button"
                          className={`px-2.5 py-1 text-xs border rounded-l-md cursor-pointer transition-colors ${exportFormat === 'png' ? 'bg-[#252525] text-dither-text border-dither-border-light' : 'bg-dither-panel border-dither-border-hover text-dither-muted-mid'}`}
                          onClick={() => setExportFormat('png')}
                        >
                          PNG
                        </button>
                        <button
                          type="button"
                          className={`px-2.5 py-1 text-xs border rounded-r-md -ml-px cursor-pointer transition-colors ${exportFormat === 'svg' ? 'bg-[#252525] text-dither-text border-dither-border-light' : 'bg-dither-panel border-dither-border-hover text-dither-muted-mid'}`}
                          onClick={() => setExportFormat('svg')}
                        >
                          SVG
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="flex items-center justify-center gap-2 py-2.5 px-4 text-[13px] font-medium bg-dither-border border border-dither-border-active rounded-lg text-dither-text cursor-pointer transition-colors hover:bg-dither-border-hover hover:border-dither-border-light disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={exportFormat === 'svg' ? handleDownloadSvg : handleDownload}
                      disabled={exportFormat === 'svg' ? (!imageFile || isProcessing || isGeneratingSvg) : (!processedUrl || isProcessing)}
                      title={exportFormat === 'svg' ? 'Export as SVG' : 'Export as PNG'}
                    >
                      {exportFormat === 'svg' ? (
                        <>
                          <FileDown size={18} aria-hidden />
                          {isGeneratingSvg ? 'Generating…' : 'Download SVG'}
                        </>
                      ) : (
                        <>
                          <Download size={18} aria-hidden />
                          Download PNG
                        </>
                      )}
                    </button>
                    {exportFormat === 'svg' && (
                      <>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-dither-muted-light">Export mode</label>
                          <select value={exportMode} onChange={(e) => setExportMode(e.target.value)} className="w-full py-1.5 px-2 text-[13px] bg-dither-panel border border-dither-border-hover rounded-md text-dither-text cursor-pointer">
                            <option value="optimized">Optimized (VIP)</option>
                            <option value="simple">Simple</option>
                          </select>
                        </div>
                        <Slider value={pixelScale} onChange={setPixelScale} min={1} max={100} step={1} label="Pixel size" unit="%" />
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-dither-muted-light">Pixel shape</label>
                          <select value={pixelShape} onChange={(e) => setPixelShape(e.target.value)} className="w-full py-1.5 px-2 text-[13px] bg-dither-panel border border-dither-border-hover rounded-md text-dither-text cursor-pointer">
                            <option value="square">Square</option>
                            <option value="circle">Circle</option>
                          </select>
                        </div>
                        <div className="flex flex-row items-center justify-between gap-1">
                          <label className="text-xs text-dither-muted-light">Transparent BG, stroke only</label>
                          <input
                            type="checkbox"
                            checked={exportTransparentStrokeOnly}
                            onChange={(e) => setExportTransparentStrokeOnly(e.target.checked)}
                            className="w-4 h-4 accent-dither-muted cursor-pointer"
                            title="Export with transparent background and stroke only (dither and generative)"
                          />
                        </div>
                        <div className="flex flex-row items-center justify-between gap-1">
                          <label className="text-xs text-dither-muted-light">Render background</label>
                          <input
                            type="checkbox"
                            checked={renderBackground}
                            onChange={(e) => setRenderBackground(e.target.checked)}
                            className="w-4 h-4 accent-dither-muted cursor-pointer"
                            disabled={exportTransparentStrokeOnly}
                          />
                        </div>
                        <div className="flex flex-row items-center justify-between gap-1">
                          <label className="text-xs text-dither-muted-light">Stroke</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={strokeColor || '#000000'}
                              onChange={(e) => setStrokeColor(e.target.value)}
                              className="w-7 h-7 p-0 border border-dither-border-active rounded cursor-pointer bg-dither-panel"
                              title="Stroke color"
                            />
                            <button
                              type="button"
                              className={`px-2.5 py-1 text-xs border rounded-md cursor-pointer transition-colors ${strokeColor ? 'bg-[#252525] text-dither-text border-dither-border-light' : 'bg-dither-panel border-dither-border-hover text-dither-muted-mid'}`}
                              onClick={() => setStrokeColor((c) => (c ? null : '#000000'))}
                            >
                              {strokeColor ? 'On' : 'Off'}
                            </button>
                          </div>
                        </div>
                        {strokeColor && (
                          <Slider value={strokeWidth} onChange={setStrokeWidth} min={0.1} max={5} step={0.1} label="Stroke width" />
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {!applyGenerative && (
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-dither-muted-mid mt-5">
              Generative
            </div>
          )}
          {!applyGenerative ? (
            <div
              className="flex items-center justify-between py-2.5 cursor-pointer transition-opacity mt-2 hover:opacity-85"
              onClick={() => setApplyGenerative(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setApplyGenerative(true); } }}
              title="Add generative effect"
            >
              <span className="text-[13px] text-dither-muted-light font-normal">Add generative</span>
              <span className="text-dither-muted text-lg leading-none flex-shrink-0">+</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 pt-2 border-t border-dither-border mt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-dither-muted-mid">Generative</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="w-[22px] h-[22px] p-0 flex items-center justify-center bg-transparent border border-dither-border-hover rounded text-dither-muted text-sm cursor-pointer flex-shrink-0 hover:bg-[#222] hover:border-dither-border-light hover:text-dither-text"
                    onClick={(e) => { e.stopPropagation(); setApplyGenerative(false); }}
                    title="Remove generative"
                  >
                    −
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-dither-muted-light">Mode</label>
                <select value={generativeMode || 'lines'} onChange={(e) => setGenerativeMode(e.target.value)} className="w-full py-1.5 px-2 text-[13px] bg-dither-panel border border-dither-border-hover rounded-md text-dither-text cursor-pointer">
                  <option value="lines">Lines</option>
                  <option value="circles">Circles</option>
                  <option value="spiral">Spiral</option>
                  <option value="spirals">Spirals</option>
                  <option value="particles">Particles</option>
                  <option value="topomap">Topomap</option>
                </select>
              </div>
              {(generativeMode || 'lines') === 'topomap' && (
                <>
                  <div className="flex flex-row items-center justify-between gap-1">
                    <label className="text-xs text-dither-muted-light">Mask transparent area</label>
                    <button
                      type="button"
                      className={`px-2.5 py-1 text-xs border rounded-md cursor-pointer transition-colors ${generativeMaskOn ? 'bg-[#252525] text-dither-text border-dither-border-light' : 'bg-dither-panel border-dither-border-hover text-dither-muted-mid'}`}
                      onClick={() => setGenerativeMaskOn((v) => !v)}
                      title={generativeMaskOn ? 'Only draw over non-transparent, non-background pixels' : 'Draw contours everywhere'}
                    >
                      {generativeMaskOn ? 'On' : 'Off'}
                    </button>
                  </div>
                  <Slider value={generativeDensity} onChange={setGenerativeDensity} min={1} max={500} step={1} label="Density" />
                  <Slider value={generativeTopomapSmoothness} onChange={setGenerativeTopomapSmoothness} min={0} max={100} step={1} label="Smoothness" />
                </>
              )}
              {(generativeMode || 'lines') === 'particles' && (
                <>
                  <div className="flex flex-row items-center justify-between gap-1">
                    <label className="text-xs text-dither-muted-light">Mask transparent area</label>
                    <button
                      type="button"
                      className={`px-2.5 py-1 text-xs border rounded-md cursor-pointer transition-colors ${generativeMaskOn ? 'bg-[#252525] text-dither-text border-dither-border-light' : 'bg-dither-panel border-dither-border-hover text-dither-muted-mid'}`}
                      onClick={() => setGenerativeMaskOn((v) => !v)}
                      title={generativeMaskOn ? 'Only draw over non-transparent, non-background pixels' : 'Draw particles everywhere'}
                    >
                      {generativeMaskOn ? 'On' : 'Off'}
                    </button>
                  </div>
                  <Slider value={generativeDensity} onChange={setGenerativeDensity} min={1} max={500} step={1} label="Density" />
                  <Slider value={generativeParticleTilt} onChange={setGenerativeParticleTilt} min={0} max={3000} step={1} label="Tilt" />
                  <Slider value={generativeParticleGrain} onChange={setGenerativeParticleGrain} min={0} max={100} step={1} label="Grain" />
                  <Slider value={generativeParticleRotation} onChange={setGenerativeParticleRotation} min={0} max={360} step={1} label="Rotation" unit="°" />
                  <Slider value={generativeParticleSmoothness} onChange={setGenerativeParticleSmoothness} min={0} max={100} step={1} label="Smoothness" />
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-dither-muted-mid mt-2 mb-1">Wind</div>
                  <Slider value={generativeParticleWindX} onChange={setGenerativeParticleWindX} min={-100} max={100} step={1} label="X" />
                  <Slider value={generativeParticleWindY} onChange={setGenerativeParticleWindY} min={-100} max={100} step={1} label="Y" />
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-dither-muted-mid mt-2 mb-1">Perlin</div>
                  <Slider value={generativeParticlePerlinAmp} onChange={setGenerativeParticlePerlinAmp} min={0} max={100} step={1} label="Amplitude" />
                  <Slider value={generativeParticlePerlinFreq} onChange={setGenerativeParticlePerlinFreq} min={1} max={100} step={1} label="Frequency" />
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-dither-muted-mid mt-2 mb-1">Flocking</div>
                  <Slider value={generativeSeparation} onChange={setGenerativeSeparation} min={0} max={100} step={1} label="Separation" />
                  <Slider value={generativeCohesion} onChange={setGenerativeCohesion} min={0} max={100} step={1} label="Cohesion" />
                  <Slider value={generativeAlignment} onChange={setGenerativeAlignment} min={0} max={100} step={1} label="Alignment" />
                  <Slider value={generativeAvoidLines} onChange={setGenerativeAvoidLines} min={0} max={100} step={1} label="Avoid lines" title="Steer particles away from previously drawn path cells" />
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-dither-muted-mid mt-2 mb-1">Life & simulation</div>
                  <Slider value={generativeSimulationLength} onChange={setGenerativeSimulationLength} min={100} max={10000} step={100} label="Simulation steps" title="Total steps; simulation runs until this count then stops" />
                  <Slider value={generativeParticleLifetime} onChange={setGenerativeParticleLifetime} min={0} max={2000} step={50} label="Particle life (steps)" title="0 = unlimited; particle dies after this many steps" />
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-dither-muted-light">Spawn mode</span>
                    <select
                      value={generativeSpawnMode}
                      onChange={(e) => setGenerativeSpawnMode(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs bg-dither-panel border border-dither-border-active rounded text-dither-text"
                      title="Once: all at start. Respawn: replace when one dies. Drip: add one every N steps."
                    >
                      <option value="once">Once (all at start)</option>
                      <option value="respawn">Respawn (replace on death)</option>
                      <option value="drip">Drip (add over time)</option>
                    </select>
                  </div>
                  {generativeSpawnMode === 'drip' && (
                    <>
                      <Slider value={generativeSpawnInterval} onChange={setGenerativeSpawnInterval} min={10} max={200} step={5} label="Spawn interval (steps)" title="Steps between spawning a new particle" />
                      <Slider value={generativeMaxParticles} onChange={setGenerativeMaxParticles} min={500} max={5000} step={100} label="Max particles" title="Cap on number of particles in drip mode" />
                    </>
                  )}
                </>
              )}
              {(generativeMode || 'lines') === 'spiral' && (
                <>
                  <div className="flex flex-row items-center justify-between gap-1">
                    <label className="text-xs text-dither-muted-light">Mask transparent area</label>
                    <button
                      type="button"
                      className={`px-2.5 py-1 text-xs border rounded-md cursor-pointer transition-colors ${generativeMaskOn ? 'bg-[#252525] text-dither-text border-dither-border-light' : 'bg-dither-panel border-dither-border-hover text-dither-muted-mid'}`}
                      onClick={() => setGenerativeMaskOn((v) => !v)}
                      title={generativeMaskOn ? 'Only draw over non-transparent, non-background pixels' : 'Draw spirals everywhere'}
                    >
                      {generativeMaskOn ? 'On' : 'Off'}
                    </button>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-dither-muted-light">Mask covering spirals</label>
                    <select value={generativeMaskCoveringLines} onChange={(e) => setGenerativeMaskCoveringLines(e.target.value)} className="w-full py-1.5 px-2 text-[13px] bg-dither-panel border border-dither-border-hover rounded-md text-dither-text cursor-pointer">
                      <option value="off">Off</option>
                      <option value="top-down">Inside-out</option>
                      <option value="bottom-up">Outside-in</option>
                    </select>
                  </div>
                  {generativeMaskCoveringLines !== 'off' && (
                    <Slider value={generativeMaskCoverPadding} onChange={setGenerativeMaskCoverPadding} min={0} max={200} step={1} label="Mask padding" unit="px" />
                  )}
                  <Slider value={generativeRotation} onChange={setGenerativeRotation} min={0} max={360} step={1} label="Rotation" unit="°" />
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      className={`flex items-center justify-center gap-2 py-2.5 px-4 text-[13px] font-medium border rounded-lg cursor-pointer transition-colors mb-0 ${isPickingCenter ? 'bg-[#252525] text-dither-text border-dither-border-light' : 'bg-dither-border border-dither-border-active text-dither-text hover:bg-dither-border-hover hover:border-dither-border-light'}`}
                      onClick={() => setIsPickingCenter((v) => !v)}
                      title={isPickingCenter ? 'Cancel' : 'Click image to set spiral center'}
                    >
                      {isPickingCenter ? 'Click image to set center…' : 'Set center'}
                    </button>
                  </div>
                  <Slider value={generativeDensity} onChange={setGenerativeDensity} min={1} max={500} step={1} label="Density" />
                  <Slider value={generativeSpiralDent} onChange={setGenerativeSpiralDent} min={0} max={100} step={1} label="Dent" />
                  <Slider value={generativeSpiralTurns} onChange={setGenerativeSpiralTurns} min={1} max={20} step={0.5} label="Turns" />
                  <div className="flex flex-row items-center justify-between gap-1">
                    <label className="text-xs text-dither-muted-light">Hide back side</label>
                    <button
                      type="button"
                      className={`px-2.5 py-1 text-xs border rounded-md cursor-pointer transition-colors ${generativeSpiralDepthMask ? 'bg-[#252525] text-dither-text border-dither-border-light' : 'bg-dither-panel border-dither-border-hover text-dither-muted-mid'}`}
                      onClick={() => setGenerativeSpiralDepthMask((v) => !v)}
                      title={generativeSpiralDepthMask ? 'Hide lines behind the sphere' : 'Draw complete spiral'}
                    >
                      {generativeSpiralDepthMask ? 'On' : 'Off'}
                    </button>
                  </div>
                </>
              )}
              {(generativeMode || 'lines') === 'spirals' && (
                <>
                  <div className="flex flex-row items-center justify-between gap-1">
                    <label className="text-xs text-dither-muted-light">Mask transparent area</label>
                    <button
                      type="button"
                      className={`px-2.5 py-1 text-xs border rounded-md cursor-pointer transition-colors ${generativeMaskOn ? 'bg-[#252525] text-dither-text border-dither-border-light' : 'bg-dither-panel border-dither-border-hover text-dither-muted-mid'}`}
                      onClick={() => setGenerativeMaskOn((v) => !v)}
                      title={generativeMaskOn ? 'Only draw over non-transparent, non-background pixels' : 'Draw spirals everywhere'}
                    >
                      {generativeMaskOn ? 'On' : 'Off'}
                    </button>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      className={`flex items-center justify-center gap-2 py-2.5 px-4 text-[13px] font-medium border rounded-lg cursor-pointer transition-colors mb-0 ${isPickingCenter ? 'bg-[#252525] text-dither-text border-dither-border-light' : 'bg-dither-border border-dither-border-active text-dither-text hover:bg-dither-border-hover hover:border-dither-border-light'}`}
                      onClick={() => setIsPickingCenter((v) => !v)}
                      title={isPickingCenter ? 'Cancel' : 'Click image to set tilt center'}
                    >
                      {isPickingCenter ? 'Click image to set tilt center…' : 'Set tilt center'}
                    </button>
                  </div>
                  <Slider value={generativeDensity} onChange={setGenerativeDensity} min={1} max={100} step={1} label="Spirals" />
                  <Slider value={generativeSpiralSize} onChange={setGenerativeSpiralSize} min={1} max={100} step={1} label="Size" />
                  <Slider value={generativeSpiralSizeVariance} onChange={setGenerativeSpiralSizeVariance} min={0} max={100} step={1} label="Size variance" />
                  <Slider value={generativeSpiralDent} onChange={setGenerativeSpiralDent} min={0} max={100} step={1} label="Tilt" />
                  <Slider value={generativeSpiralTurns} onChange={setGenerativeSpiralTurns} min={1} max={20} step={0.5} label="Turns" />
                  <div className="flex flex-row items-center justify-between gap-1">
                    <label className="text-xs text-dither-muted-light">Hide back side</label>
                    <button
                      type="button"
                      className={`px-2.5 py-1 text-xs border rounded-md cursor-pointer transition-colors ${generativeSpiralDepthMask ? 'bg-[#252525] text-dither-text border-dither-border-light' : 'bg-dither-panel border-dither-border-hover text-dither-muted-mid'}`}
                      onClick={() => setGenerativeSpiralDepthMask((v) => !v)}
                      title={generativeSpiralDepthMask ? 'Hide lines behind the sphere' : 'Draw complete spiral'}
                    >
                      {generativeSpiralDepthMask ? 'On' : 'Off'}
                    </button>
                  </div>
                </>
              )}
              {((generativeMode || 'lines') === 'lines' || (generativeMode || 'lines') === 'circles') && (
                <>
                  <div className="flex flex-row items-center justify-between gap-1">
                    <label className="text-xs text-dither-muted-light">Mask transparent area</label>
                    <button
                      type="button"
                      className={`px-2.5 py-1 text-xs border rounded-md cursor-pointer transition-colors ${generativeMaskOn ? 'bg-[#252525] text-dither-text border-dither-border-light' : 'bg-dither-panel border-dither-border-hover text-dither-muted-mid'}`}
                      onClick={() => setGenerativeMaskOn((v) => !v)}
                      title={generativeMaskOn ? 'Only draw over non-transparent, non-background pixels' : 'Draw lines everywhere'}
                    >
                      {generativeMaskOn ? 'On' : 'Off'}
                    </button>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-dither-muted-light">Mask covering lines</label>
                    <select value={generativeMaskCoveringLines} onChange={(e) => setGenerativeMaskCoveringLines(e.target.value)} className="w-full py-1.5 px-2 text-[13px] bg-dither-panel border border-dither-border-hover rounded-md text-dither-text cursor-pointer">
                      <option value="off">Off</option>
                      <option value="top-down">Top-down</option>
                      <option value="bottom-up">Bottom-up</option>
                    </select>
                  </div>
                  {generativeMaskCoveringLines !== 'off' && (
                    <Slider value={generativeMaskCoverPadding} onChange={setGenerativeMaskCoverPadding} min={0} max={200} step={1} label="Mask padding" unit="px" />
                  )}
                  <Slider value={generativeRotation} onChange={setGenerativeRotation} min={0} max={360} step={1} label="Rotation" unit="°" />
                  {(generativeMode || 'lines') === 'lines' && (
                    <>
                      <div className="flex flex-row items-center justify-between gap-1">
                        <label className="text-xs text-dither-muted-light">Perspective</label>
                        <button
                          type="button"
                          className={`px-2.5 py-1 text-xs border rounded-md cursor-pointer transition-colors ${generativeLinesPerspective ? 'bg-[#252525] text-dither-text border-dither-border-light' : 'bg-dither-panel border-dither-border-hover text-dither-muted-mid'}`}
                          onClick={() => setGenerativeLinesPerspective((v) => !v)}
                          title={generativeLinesPerspective ? 'Lines radiate from center' : 'Horizontal lines'}
                        >
                          {generativeLinesPerspective ? 'On' : 'Off'}
                        </button>
                      </div>
                      {generativeLinesPerspective && (
                        <>
                          <Slider value={generativeCenterX} onChange={setGenerativeCenterX} min={0} max={1} step={0.01} label="Center X" />
                          <Slider value={generativeCenterY} onChange={setGenerativeCenterY} min={0} max={1} step={0.01} label="Center Y" />
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              className={`flex items-center justify-center gap-2 py-2.5 px-4 text-[13px] font-medium border rounded-lg cursor-pointer transition-colors mb-0 ${isPickingCenter ? 'bg-[#252525] text-dither-text border-dither-border-light' : 'bg-dither-border border-dither-border-active text-dither-text hover:bg-dither-border-hover hover:border-dither-border-light'}`}
                              onClick={() => setIsPickingCenter((v) => !v)}
                              title={isPickingCenter ? 'Cancel' : 'Click image to set perspective center'}
                            >
                              {isPickingCenter ? 'Click image to set center…' : 'Set center'}
                            </button>
                          </div>
                        </>
                      )}
                    </>
                  )}
                  {(generativeMode || 'lines') === 'circles' && (
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        className={`flex items-center justify-center gap-2 py-2.5 px-4 text-[13px] font-medium border rounded-lg cursor-pointer transition-colors mb-0 ${isPickingCenter ? 'bg-[#252525] text-dither-text border-dither-border-light' : 'bg-dither-border border-dither-border-active text-dither-text hover:bg-dither-border-hover hover:border-dither-border-light'}`}
                        onClick={() => setIsPickingCenter((v) => !v)}
                        title={isPickingCenter ? 'Cancel' : 'Click image to set circle center'}
                      >
                        {isPickingCenter ? 'Click image to set center…' : 'Set center'}
                      </button>
                    </div>
                  )}
                  <Slider value={generativeDensity} onChange={setGenerativeDensity} min={1} max={500} step={1} label="Density" />
                  <Slider value={generativeRegularity} onChange={setGenerativeRegularity} min={0} max={100} step={1} label="Regularity" />
                  <Slider value={generativeDislocate} onChange={setGenerativeDislocate} min={-50} max={50} step={0.1} label="Dislocate" />
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-dither-muted-mid mt-2 mb-1">Noise</div>
                  <Slider value={generativeNoiseAmplitude} onChange={setGenerativeNoiseAmplitude} min={0} max={50} step={0.1} label="Amplitude" />
                  <Slider value={generativeNoiseFrequency} onChange={setGenerativeNoiseFrequency} min={0.1} max={10} step={0.1} label="Frequency" />
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-dither-muted-mid mt-2 mb-1">Perlin</div>
                  <Slider value={generativePerlinAmplitude} onChange={setGenerativePerlinAmplitude} min={0} max={100} step={0.5} label="Amplitude" />
                  <Slider value={generativePerlinFrequency} onChange={setGenerativePerlinFrequency} min={1} max={500} step={1} label="Frequency" />
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-dither-muted-mid mt-2 mb-1">Sine</div>
                  <Slider value={generativeSineAmplitude} onChange={setGenerativeSineAmplitude} min={0} max={100} step={0.5} label="Amplitude" />
                  <Slider value={generativeSineFrequency} onChange={setGenerativeSineFrequency} min={0.5} max={50} step={0.5} label="Frequency" />
                </>
              )}
              <button
                type="button"
                className="flex items-center justify-center gap-2 py-2.5 px-4 text-[13px] font-medium bg-dither-border border border-dither-border-active rounded-lg text-dither-text cursor-pointer transition-colors hover:bg-dither-border-hover hover:border-dither-border-light disabled:opacity-50 disabled:cursor-not-allowed mt-3"
                onClick={handleExportGenerativeSvg}
                disabled={!imageFile || isProcessing || isGeneratingSvg}
                title="Export generative lines as vector SVG"
              >
                <FileDown size={18} aria-hidden />
                {isGeneratingSvg ? 'Generating…' : 'Export as SVG'}
              </button>
                <div className="flex flex-row items-center justify-between gap-1 mt-2">
                <label className="text-xs text-dither-muted-light">Export background</label>
                <input
                  type="checkbox"
                  checked={generativeRenderBackground}
                  onChange={(e) => setGenerativeRenderBackground(e.target.checked)}
                  className="w-4 h-4 accent-dither-muted cursor-pointer"
                  disabled={exportTransparentStrokeOnly}
                />
              </div>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
