// Configuration for STL file sources
// STL files are hosted on GitHub Releases to avoid Vercel bandwidth limits
// GitHub Releases supports large files (>20MB) unlike jsDelivr CDN
// Since local files were removed, we always use GitHub Releases

// Always use GitHub Releases (local files were removed to save space)
const FILE_SOURCE = 'github-releases';

// GitHub Releases configuration
// Format: https://github.com/USERNAME/REPO/releases/download/TAG/FILENAME
// Example: https://github.com/dfeles/files/releases/download/v1.0.0/120_Cell.stl
const RELEASE_TAG = 'v1.0.0';
const GITHUB_REPO = 'dfeles/files';
const RELEASES_BASE_URL = `https://github.com/${GITHUB_REPO}/releases/download/${RELEASE_TAG}`;

// STL file names
const STL_FILES = {
  '24_cell_Schlegel.stl': '24_cell_Schlegel.stl',
  '120_Cell.stl': '120_Cell.stl',
  '600_cell.stl': '600_cell.stl'
};

// Get the full URL for an STL file
export const getSTLFileURL = (filename) => {
  if (FILE_SOURCE === 'github-releases') {
    return `${RELEASES_BASE_URL}/${filename}`;
  } else {
    // Local development - serve from public folder (files removed, won't work)
    return `/${filename}`;
  }
};

export default {
  FILE_SOURCE,
  RELEASES_BASE_URL,
  RELEASE_TAG,
  GITHUB_REPO,
  STL_FILES
};

