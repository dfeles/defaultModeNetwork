# STL to SVG Converter

A React-based web application for converting STL files to SVG format with shader-based edge detection.

## Features

- **Interactive 3D Viewer**: Upload and view STL files in an interactive 3D canvas
- **Shader-based Edge Detection**: Real-time edge detection using custom shaders
- **Adjustable Settings**: Control edge threshold, color, width, and shading
- **SVG Export**: Export the current view as an optimized SVG file
- **Depth Shading**: Optional discrete color bands for depth-based shading

## Installation

```bash
cd defaultModeNetwork
npm install
```

## Usage

```bash
npm start
```

The application will open in your browser at `http://localhost:3000`.

## Controls

- **Left Click + Drag**: Rotate the model
- **Right Click + Drag**: Pan the view
- **Scroll**: Zoom in/out

## Features

### Edge Detection Settings

- **Edge Threshold**: Controls the sensitivity of edge detection (0.0 - 1.0)
- **Edge Color**: Choose the color for detected edges
- **Edge Width**: Adjust the thickness of edges in the SVG output
- **Shading Colors**: Number of discrete color bands for depth shading (1 = no shading)

### SVG Export

Click "Export as SVG" to download the current view as an SVG file. The export includes:
- Visible edges only (back-face culling)
- Optimized path grouping by color
- Configurable precision and edge filtering

## Technology Stack

- **React**: UI framework
- **Three.js**: 3D graphics and STL loading
- **@react-three/fiber**: React renderer for Three.js
- **@react-three/drei**: Useful helpers for Three.js
- **Custom Shaders**: GLSL shaders for edge detection

## Project Structure

```
defaultModeNetwork/
├── src/
│   ├── components/
│   │   ├── STLViewer.js          # 3D mesh viewer component
│   │   ├── ControlPanel.js       # UI controls
│   │   └── shaders/
│   │       └── EdgeDetectionMaterial.js  # Custom shader material
│   ├── utils/
│   │   └── svgExporter.js        # SVG export functionality
│   ├── App.js                    # Main application component
│   └── index.js                  # Entry point
└── public/
    └── index.html
```

## License

MIT

