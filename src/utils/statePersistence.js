/**
 * State persistence utility for saving and loading user state
 * Uses localStorage to persist state across page refreshes
 */

const STATE_KEY = 'defaultModeNetwork_state';
const LOADED_IMAGES_KEY = 'defaultModeNetwork_loadedImages';

/**
 * Get estimated size of an object in bytes (rough estimate)
 */
function getObjectSize(obj) {
  const str = JSON.stringify(obj);
  return new Blob([str]).size;
}

/**
 * Clean up old localStorage data if it's getting too large
 */
function cleanupOldState() {
  try {
    const stateKey = 'defaultModeNetwork_state';
    const imagesKey = 'defaultModeNetwork_loadedImages';
    
    const state = localStorage.getItem(stateKey);
    const images = localStorage.getItem(imagesKey);
    
    const totalSize = (state ? state.length : 0) + (images ? images.length : 0);
    
    // If total size exceeds 1MB, clear old data
    if (totalSize > 1024 * 1024) {
      console.warn('localStorage size exceeds 1MB, clearing old state');
      localStorage.removeItem(stateKey);
      localStorage.removeItem(imagesKey);
    }
  } catch (error) {
    console.error('Error cleaning up old state:', error);
  }
}

/**
 * Save application state to localStorage
 * Note: File objects cannot be serialized, so we save metadata instead
 */
export function saveState(state) {
  try {
    // Clean up old state if needed
    cleanupOldState();
    
    const serializableState = {
      // File references (save metadata only)
      selectedDefaultFile: state.selectedDefaultFile,
      currentImageFileName: state.imageFile?.name || null,
      currentStlFileName: state.stlFile?.name || null,
      
      // Input mode
      inputMode: state.inputMode,
      viewMode: state.viewMode,
      
      // Edge settings (for STL files)
      edgeSettings: state.edgeSettings,
      
      // Dithering settings
      applyDithering: state.applyDithering,
      ditheringResolution: state.ditheringResolution,
      ditheringThreshold: state.ditheringThreshold,
      ditheringContrast: state.ditheringContrast,
      ditheringBrightness: state.ditheringBrightness,
      ditheringColorCount: state.ditheringColorCount,
      ditheringColorPalette: state.ditheringColorPalette,
      ditheringGradient: state.ditheringGradient,
      ditheringMethod: state.ditheringMethod,
      
      // Export settings
      exportMode: state.exportMode,
      pixelFilter: state.pixelFilter,
      strokeColor: state.strokeColor,
      strokeWidth: state.strokeWidth,
      
      // View settings
      initialScale: state.initialScale,
      
      // Timestamp for debugging
      savedAt: new Date().toISOString()
    };
    
    localStorage.setItem(STATE_KEY, JSON.stringify(serializableState));
    return true;
  } catch (error) {
    console.error('Error saving state:', error);
    return false;
  }
}

/**
 * Load application state from localStorage
 */
export function loadState() {
  try {
    const saved = localStorage.getItem(STATE_KEY);
    if (!saved) {
      return null;
    }
    
    const state = JSON.parse(saved);
    return state;
  } catch (error) {
    console.error('Error loading state:', error);
    return null;
  }
}

/**
 * Clear saved state
 */
export function clearState() {
  try {
    localStorage.removeItem(STATE_KEY);
    localStorage.removeItem(LOADED_IMAGES_KEY);
    return true;
  } catch (error) {
    console.error('Error clearing state:', error);
    return false;
  }
}

/**
 * Save loaded images metadata (for file list persistence)
 * Note: We can't save File objects, so we save metadata
 * The actual files will need to be re-uploaded or loaded from default files
 */
export function saveLoadedImages(loadedImages) {
  try {
    // Limit the number of saved images to prevent localStorage bloat
    const MAX_SAVED_IMAGES = 50;
    const imagesToSave = loadedImages.slice(0, MAX_SAVED_IMAGES);
    
    // Save only metadata that can be serialized
    const serializableImages = imagesToSave.map(img => ({
      name: img.name,
      type: img.type,
      id: img.id,
      // Note: thumbnailUrl and file cannot be saved
      // They will need to be regenerated on load
    }));
    
    const serialized = JSON.stringify(serializableImages);
    
    // Check size before saving
    if (serialized.length > 500 * 1024) { // 500KB limit
      console.warn('Loaded images data too large, truncating');
      const truncated = serializableImages.slice(0, Math.floor(serializableImages.length / 2));
      localStorage.setItem(LOADED_IMAGES_KEY, JSON.stringify(truncated));
    } else {
      localStorage.setItem(LOADED_IMAGES_KEY, serialized);
    }
    
    return true;
  } catch (error) {
    console.error('Error saving loaded images:', error);
    // If quota exceeded, try to clear and save fewer images
    if (error.name === 'QuotaExceededError') {
      try {
        const truncated = loadedImages.slice(0, 10).map(img => ({
          name: img.name,
          type: img.type,
          id: img.id,
        }));
        localStorage.setItem(LOADED_IMAGES_KEY, JSON.stringify(truncated));
        return true;
      } catch (e) {
        console.error('Error saving truncated images:', e);
        return false;
      }
    }
    return false;
  }
}

/**
 * Load saved images metadata
 */
export function loadLoadedImages() {
  try {
    const saved = localStorage.getItem(LOADED_IMAGES_KEY);
    if (!saved) {
      return null;
    }
    
    const images = JSON.parse(saved);
    return images;
  } catch (error) {
    console.error('Error loading images:', error);
    return null;
  }
}

