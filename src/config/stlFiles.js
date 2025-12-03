// Configuration for STL and image file sources
// Files are hosted on GitHub (raw.githubusercontent.com) to avoid Vercel bandwidth limits
// GitHub raw URLs support large files (>20MB) unlike jsDelivr CDN
// In development, use a public CORS proxy to avoid CORS issues
// In production, files are loaded directly from GitHub raw URLs

// Use CORS proxy in development, direct URLs in production
const FILE_SOURCE = process.env.NODE_ENV === 'production' ? 'github-direct' : 'github-proxy';

// GitHub configuration
const GITHUB_REPO = 'dfeles/files';
const GITHUB_BRANCH = 'main';
const GITHUB_RAW_BASE_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}`;
// CORS proxy for development (public proxy service)
const CORS_PROXY = 'https://corsproxy.io/?';

// STL file names
const STL_FILES = {
  '24_cell_Schlegel.stl': '24_cell_Schlegel.stl',
  '120_Cell.stl': '120_Cell.stl',
  '600_cell.stl': '600_cell.stl'
};

// Image file names
const IMAGE_FILES = {
  'clouds.jpg': 'clouds.jpg'
};

// Get the full URL for an STL file
export const getSTLFileURL = (filename) => {
  if (FILE_SOURCE === 'github-proxy') {
    // Development: use CORS proxy to avoid CORS issues
    const directUrl = `${GITHUB_RAW_BASE_URL}/${filename}`;
    return `${CORS_PROXY}${encodeURIComponent(directUrl)}`;
  } else {
    // Production: use direct GitHub raw URL
    return `${GITHUB_RAW_BASE_URL}/${filename}`;
  }
};

// Get the full URL for an image file
export const getImageFileURL = (filename) => {
  return getSTLFileURL(filename); // Same logic for images
};

export default {
  FILE_SOURCE,
  GITHUB_RAW_BASE_URL,
  GITHUB_REPO,
  GITHUB_BRANCH,
  STL_FILES,
  IMAGE_FILES
};

