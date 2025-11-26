// Configuration for STL file sources
// For production, use jsDelivr CDN to avoid Vercel bandwidth limits
// For development, you can use local files

// Set to 'cdn' for production (jsDelivr) or 'local' for development
const FILE_SOURCE = process.env.NODE_ENV === 'production' ? 'cdn' : 'local';

// jsDelivr CDN configuration
// Format: https://cdn.jsdelivr.net/gh/USERNAME/REPO@BRANCH/PATH/FILE.stl
// Example: https://cdn.jsdelivr.net/gh/yourusername/stl-files@main/120_Cell.stl
const CDN_BASE_URL = 'https://cdn.jsdelivr.net/gh/dfeles/files@main';

// STL file names
const STL_FILES = {
  '24_cell_Schlegel.stl': '24_cell_Schlegel.stl',
  '120_Cell.stl': '120_Cell.stl',
  '600_cell.stl': '600_cell.stl'
};

// Get the full URL for an STL file
export const getSTLFileURL = (filename) => {
  if (FILE_SOURCE === 'cdn') {
    return `${CDN_BASE_URL}/${filename}`;
  } else {
    // Local development - serve from public folder
    return `/${filename}`;
  }
};

export default {
  FILE_SOURCE,
  CDN_BASE_URL,
  STL_FILES
};

