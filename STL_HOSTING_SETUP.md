# STL File Hosting Setup Guide

This guide explains how to host your STL files on GitHub Releases to avoid Vercel bandwidth limits.

## Why GitHub Releases?

- ✅ **Completely free** - No cost, no credit card needed
- ✅ **No file size limits** - Supports files larger than 20MB (unlike jsDelivr)
- ✅ **No bandwidth limits** - Unlimited bandwidth for reasonable use
- ✅ **Simple upload** - Just create a release and attach files
- ✅ **No account setup** - Uses your existing GitHub account

## Setup Steps

### 1. Create a GitHub Repository

1. Go to [GitHub](https://github.com) and create a new repository
   - Name it something like `files` or `stl-files`
   - Make it **public** (required for public access)
   - Don't initialize with README (we'll add files directly)

### 2. Upload STL Files to a Release

**Using GitHub CLI (Easiest):**

```bash
cd /path/to/your/stl/files
gh release create v1.0.0 --title "STL Files" --notes "Initial release" *.stl
```

**Using GitHub Web Interface:**

1. Go to your repository on GitHub
2. Click "Releases" → "Create a new release"
3. Tag version: `v1.0.0`
4. Release title: "STL Files"
5. Drag and drop your STL files to attach them
6. Click "Publish release"

### 3. Update Configuration

1. Open `src/config/stlFiles.js`
2. Update the following:
   - `RELEASE_TAG` - The version tag you used (e.g., `v1.0.0`)
   - `GITHUB_REPO` - Your username and repo name (e.g., `dfeles/files`)

For example:
```javascript
const RELEASE_TAG = 'v1.0.0';
const GITHUB_REPO = 'dfeles/files';
```

### 4. Test It

1. The app will now load STL files from GitHub Releases
2. Files are served directly from GitHub's CDN
3. No bandwidth limits and supports files larger than 20MB

## How It Works

- Files are loaded from GitHub Releases URLs
- Format: `https://github.com/USERNAME/REPO/releases/download/TAG/FILENAME.stl`
- GitHub automatically redirects to the actual file location
- Works for files of any size (unlike jsDelivr which has a 20MB limit)

## Adding New STL Files

1. Create a new release or update the existing one
2. Attach the new `.stl` file to the release
3. Add it to the `STL_FILES` object in `src/config/stlFiles.js` (if needed)
4. The file will be available at: `https://github.com/USERNAME/REPO/releases/download/TAG/NEW_FILE.stl`

## Updating Files

To update an existing file:
1. Create a new release with a new tag (e.g., `v1.0.1`)
2. Attach the updated files
3. Update `RELEASE_TAG` in `src/config/stlFiles.js`

