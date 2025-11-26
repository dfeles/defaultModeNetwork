# STL File Hosting Setup Guide

This guide explains how to host your STL files on jsDelivr CDN (via GitHub) to avoid Vercel bandwidth limits.

## Why jsDelivr?

- ✅ **Completely free** - No cost, no credit card needed
- ✅ **No bandwidth limits** - Unlimited bandwidth for reasonable use
- ✅ **Fast global CDN** - Files served from edge locations worldwide
- ✅ **Simple upload** - Just push files to GitHub
- ✅ **No account setup** - Uses your existing GitHub account

## Setup Steps

### 1. Create a GitHub Repository

1. Go to [GitHub](https://github.com) and create a new repository
   - Name it something like `stl-files` or `default-mode-network-assets`
   - Make it **public** (required for jsDelivr)
   - Don't initialize with README (we'll add files directly)

### 2. Upload STL Files

You have two options:

#### Option A: Using GitHub Web Interface (Easiest)

1. Go to your new repository on GitHub
2. Click "Add file" → "Upload files"
3. Drag and drop these files from `defaultModeNetwork/public/`:
   - `24_cell_Schlegel.stl`
   - `120_Cell.stl`
   - `600_cell.stl`
4. Click "Commit changes"

#### Option B: Using Git Command Line

```bash
cd /Users/mzx/Documents/life/CURSOR_projects/art/defaultModeNetwork/public

# Initialize git repo (if not already a git repo)
git init
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Copy STL files to a temporary location
mkdir -p /tmp/stl-files
cp 24_cell_Schlegel.stl 120_Cell.stl 600_cell.stl /tmp/stl-files/

# Navigate to the temp directory
cd /tmp/stl-files

# Initialize git and push
git init
git add *.stl
git commit -m "Add STL files"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

### 3. Update Configuration

1. Open `src/config/stlFiles.js`
2. Replace `YOUR_USERNAME` with your GitHub username
3. Replace `YOUR_REPO` with your repository name

For example, if your GitHub username is `johndoe` and your repo is `stl-files`:

```javascript
const CDN_BASE_URL = 'https://cdn.jsdelivr.net/gh/johndoe/stl-files@main';
```

### 4. Test It

1. Build your app: `npm run build`
2. The production build will now load STL files from jsDelivr
3. For local development, it will still use local files from the `public/` folder

## How It Works

- **Development mode**: Files are loaded from `/public/` folder (local)
- **Production mode**: Files are loaded from jsDelivr CDN (free, unlimited bandwidth)

The jsDelivr URL format is:
```
https://cdn.jsdelivr.net/gh/USERNAME/REPO@BRANCH/FILENAME.stl
```

## Adding New STL Files

1. Upload the new `.stl` file to your GitHub repository
2. Add it to the `STL_FILES` object in `src/config/stlFiles.js` (if needed)
3. The file will automatically be available via jsDelivr

## Alternative: Other Free Hosting Options

If you prefer other options:

1. **Cloudflare R2** - 10GB free storage, but requires setup
2. **AWS S3** - 5GB free tier, but requires AWS account
3. **GitHub Releases** - Attach files to releases, then use jsDelivr

jsDelivr is recommended because it's the simplest and has no bandwidth limits.

