/**
 * Get SVG path for a character using preset line-based icons
 * Characters are represented as simple geometric patterns
 * This is used both for WebGL rendering and SVG export
 */
export function getCharPath(char, cellSize) {
  // Normalize cell size to a standard size for path generation
  // Use edge-to-edge with minimal padding (just for stroke width)
  const size = cellSize;
  const padding = Math.max(0.5, size / 64); // Very small padding for stroke width (half pixel minimum)
  const half = size / 2;
  const quarter = size / 4;
  const eighth = size / 8;
  const edgeStart = padding;
  const edgeEnd = size - padding;
  
  // Character to path mapping - simple line-based patterns
  const charPaths = {
    // Space - empty
    ' ': '',
    '\u00A0': '', // Non-breaking space
    
    // Dots and minimal
    '.': `M ${half},${half} m -${eighth},0 a ${eighth},${eighth} 0 1,1 ${size/4},0 a ${eighth},${eighth} 0 1,1 -${size/4},0`,
    
    // Lines - edge to edge
    '-': `M ${edgeStart},${half} L ${edgeEnd},${half}`,
    '_': `M ${edgeStart},${edgeEnd} L ${edgeEnd},${edgeEnd}`,
    '|': `M ${half},${edgeStart} L ${half},${edgeEnd}`,
    '/': `M ${edgeStart},${edgeStart} L ${edgeEnd},${edgeEnd}`,
    '\\': `M ${edgeEnd},${edgeStart} L ${edgeStart},${edgeEnd}`,
    
    // Cross patterns - edge to edge
    '+': `M ${half},${edgeStart} L ${half},${edgeEnd} M ${edgeStart},${half} L ${edgeEnd},${half}`,
    'x': `M ${edgeStart},${edgeStart} L ${edgeEnd},${edgeEnd} M ${edgeEnd},${edgeStart} L ${edgeStart},${edgeEnd}`,
    
    // Grid patterns - edge to edge
    '#': `M ${quarter},${edgeStart} L ${quarter},${edgeEnd} M ${half},${edgeStart} L ${half},${edgeEnd} M ${size - quarter},${edgeStart} L ${size - quarter},${edgeEnd} M ${edgeStart},${quarter} L ${edgeEnd},${quarter} M ${edgeStart},${half} L ${edgeEnd},${half} M ${edgeStart},${size - quarter} L ${edgeEnd},${size - quarter}`,
    
    // Hatching - edge to edge
    '=': `M ${edgeStart},${half - eighth} L ${edgeEnd},${half - eighth} M ${edgeStart},${half + eighth} L ${edgeEnd},${half + eighth}`,
    ':': `M ${half},${half - quarter} m -${eighth},0 a ${eighth},${eighth} 0 1,1 ${size/4},0 a ${eighth},${eighth} 0 1,1 -${size/4},0 M ${half},${half + quarter} m -${eighth},0 a ${eighth},${eighth} 0 1,1 ${size/4},0 a ${eighth},${eighth} 0 1,1 -${size/4},0`,
    
    // Dense patterns - edge to edge
    '*': `M ${half},${edgeStart} L ${half},${edgeEnd} M ${edgeStart},${half} L ${edgeEnd},${half} M ${quarter + eighth},${quarter + eighth} L ${size - quarter - eighth},${size - quarter - eighth} M ${size - quarter - eighth},${quarter + eighth} L ${quarter + eighth},${size - quarter - eighth}`,
    
    // Blocks and fills - edge to edge
    '@': `M ${edgeStart},${edgeStart} L ${edgeEnd},${edgeStart} L ${edgeEnd},${edgeEnd} L ${edgeStart},${edgeEnd} Z M ${quarter + eighth},${quarter + eighth} L ${size - quarter - eighth},${quarter + eighth} L ${size - quarter - eighth},${size - quarter - eighth} L ${quarter + eighth},${size - quarter - eighth} Z`,
    '%': `M ${quarter},${quarter} L ${size - quarter},${size - quarter} M ${half - quarter},${quarter} a ${quarter},${quarter} 0 1,1 ${size/2},0 a ${quarter},${quarter} 0 1,1 -${size/2},0 M ${half - quarter},${size - quarter} a ${quarter},${quarter} 0 1,0 ${size/2},0 a ${quarter},${quarter} 0 1,0 -${size/2},0`,
    
    // Common ASCII art characters - edge to edge
    "'": `M ${half},${edgeStart} L ${half},${half}`,
    '`': `M ${half - eighth},${edgeStart} L ${half},${edgeStart + eighth}`,
    '^': `M ${half},${edgeStart} L ${half - quarter},${half} L ${half + quarter},${half} Z`,
    '"': `M ${half - quarter},${edgeStart} L ${half - quarter},${half} M ${half + quarter},${edgeStart} L ${half + quarter},${half}`,
    ',': `M ${half},${half} L ${half - eighth},${half + quarter}`,
    ';': `M ${half},${half - quarter} m -${eighth},0 a ${eighth},${eighth} 0 1,1 ${size/4},0 a ${eighth},${eighth} 0 1,1 -${size/4},0 M ${half},${half} L ${half - eighth},${half + quarter}`,
    '!': `M ${half},${edgeStart} L ${half},${half} M ${half},${half + quarter} m -${eighth},0 a ${eighth},${eighth} 0 1,1 ${size/4},0 a ${eighth},${eighth} 0 1,1 -${size/4},0`,
    '?': `M ${half - quarter},${edgeStart} a ${quarter},${quarter} 0 1,1 ${size/2},0 M ${half},${half} L ${half},${half + quarter} M ${half},${half + quarter} m -${eighth},0 a ${eighth},${eighth} 0 1,1 ${size/4},0 a ${eighth},${eighth} 0 1,1 -${size/4},0`,
    
    // Brackets - edge to edge
    '[': `M ${edgeStart},${edgeStart} L ${edgeStart},${edgeEnd} M ${edgeStart},${edgeStart} L ${half},${edgeStart} M ${edgeStart},${edgeEnd} L ${half},${edgeEnd}`,
    ']': `M ${edgeEnd},${edgeStart} L ${edgeEnd},${edgeEnd} M ${half},${edgeStart} L ${edgeEnd},${edgeStart} M ${half},${edgeEnd} L ${edgeEnd},${edgeEnd}`,
    '{': `M ${edgeEnd},${edgeStart} L ${half},${edgeStart} L ${half},${half} L ${edgeStart},${half} L ${half},${half} L ${half},${edgeEnd} L ${edgeEnd},${edgeEnd}`,
    '}': `M ${edgeStart},${edgeStart} L ${half},${edgeStart} L ${half},${half} L ${edgeEnd},${half} L ${half},${half} L ${half},${edgeEnd} L ${edgeStart},${edgeEnd}`,
    '(': `M ${half},${edgeStart} Q ${edgeStart},${half} ${half},${edgeEnd}`,
    ')': `M ${half},${edgeStart} Q ${edgeEnd},${half} ${half},${edgeEnd}`,
    
    // More patterns - edge to edge
    '<': `M ${edgeEnd},${edgeStart} L ${edgeStart},${half} L ${edgeEnd},${edgeEnd}`,
    '>': `M ${edgeStart},${edgeStart} L ${edgeEnd},${half} L ${edgeStart},${edgeEnd}`,
    '~': `M ${edgeStart},${half} Q ${half},${edgeStart} ${edgeEnd},${half}`,
    
    // Numbers - edge to edge
    '0': `M ${half},${edgeStart} a ${quarter},${quarter} 0 1,1 0,${edgeEnd - edgeStart} a ${quarter},${quarter} 0 1,1 0,-${edgeEnd - edgeStart} M ${half - quarter},${half} L ${half + quarter},${half}`,
    '1': `M ${half - quarter},${edgeStart} L ${half},${edgeStart} L ${half},${edgeEnd} M ${edgeStart},${edgeEnd} L ${edgeEnd},${edgeEnd}`,
    '2': `M ${edgeStart},${edgeStart} L ${edgeEnd},${edgeStart} L ${edgeEnd},${half} L ${edgeStart},${half} L ${edgeStart},${edgeEnd} L ${edgeEnd},${edgeEnd}`,
    '3': `M ${edgeStart},${edgeStart} L ${edgeEnd},${edgeStart} M ${half},${half} L ${edgeEnd},${half} M ${edgeStart},${edgeEnd} L ${edgeEnd},${edgeEnd}`,
    '4': `M ${edgeStart},${edgeStart} L ${edgeStart},${half} L ${edgeEnd},${half} M ${edgeEnd},${edgeStart} L ${edgeEnd},${edgeEnd}`,
    '5': `M ${edgeEnd},${edgeStart} L ${edgeStart},${edgeStart} L ${edgeStart},${half} L ${edgeEnd},${half} L ${edgeEnd},${edgeEnd} L ${edgeStart},${edgeEnd}`,
    '6': `M ${edgeEnd},${edgeStart} L ${edgeStart},${edgeStart} L ${edgeStart},${edgeEnd} L ${edgeEnd},${edgeEnd} L ${edgeEnd},${half} L ${edgeStart},${half}`,
    '7': `M ${edgeStart},${edgeStart} L ${edgeEnd},${edgeStart} L ${half},${edgeEnd}`,
    '8': `M ${half},${edgeStart} a ${quarter},${quarter} 0 1,1 0,${quarter} a ${quarter},${quarter} 0 1,1 0,-${quarter} M ${half},${half} a ${quarter},${quarter} 0 1,1 0,${quarter} a ${quarter},${quarter} 0 1,1 0,-${quarter}`,
    '9': `M ${edgeStart},${edgeEnd} L ${edgeEnd},${edgeEnd} L ${edgeEnd},${half} L ${edgeStart},${half} L ${edgeStart},${edgeStart} L ${edgeEnd},${edgeStart}`,
    
    // Letters - edge to edge
    'A': `M ${edgeStart},${edgeEnd} L ${half},${edgeStart} L ${edgeEnd},${edgeEnd} M ${quarter + eighth},${half} L ${size - quarter - eighth},${half}`,
    'B': `M ${edgeStart},${edgeStart} L ${edgeStart},${edgeEnd} M ${edgeStart},${edgeStart} L ${half},${edgeStart} a ${eighth},${eighth} 0 0,1 ${eighth},${eighth} L ${half},${half} a ${eighth},${eighth} 0 0,1 -${eighth},${eighth} L ${edgeStart},${half} M ${half},${half} L ${edgeEnd},${half} a ${eighth},${eighth} 0 0,1 ${eighth},${eighth} L ${edgeEnd},${edgeEnd} L ${edgeStart},${edgeEnd}`,
    'C': `M ${edgeEnd},${edgeStart} Q ${edgeStart},${edgeStart} ${edgeStart},${half} Q ${edgeStart},${edgeEnd} ${edgeEnd},${edgeEnd}`,
    'D': `M ${edgeStart},${edgeStart} L ${edgeStart},${edgeEnd} M ${edgeStart},${edgeStart} Q ${edgeEnd},${edgeStart} ${edgeEnd},${half} Q ${edgeEnd},${edgeEnd} ${edgeStart},${edgeEnd}`,
    'E': `M ${edgeStart},${edgeStart} L ${edgeStart},${edgeEnd} M ${edgeStart},${edgeStart} L ${edgeEnd},${edgeStart} M ${edgeStart},${half} L ${half},${half} M ${edgeStart},${edgeEnd} L ${edgeEnd},${edgeEnd}`,
    'F': `M ${edgeStart},${edgeStart} L ${edgeStart},${edgeEnd} M ${edgeStart},${edgeStart} L ${edgeEnd},${edgeStart} M ${edgeStart},${half} L ${half},${half}`,
    'G': `M ${edgeEnd},${edgeStart} Q ${edgeStart},${edgeStart} ${edgeStart},${half} Q ${edgeStart},${edgeEnd} ${edgeEnd},${edgeEnd} L ${edgeEnd},${half} L ${half},${half}`,
    'H': `M ${edgeStart},${edgeStart} L ${edgeStart},${edgeEnd} M ${edgeEnd},${edgeStart} L ${edgeEnd},${edgeEnd} M ${edgeStart},${half} L ${edgeEnd},${half}`,
    'I': `M ${half},${edgeStart} L ${half},${edgeEnd} M ${edgeStart},${edgeStart} L ${edgeEnd},${edgeStart} M ${edgeStart},${edgeEnd} L ${edgeEnd},${edgeEnd}`,
    'J': `M ${edgeEnd},${edgeStart} L ${edgeEnd},${half} Q ${edgeEnd},${edgeEnd} ${half},${edgeEnd} L ${edgeStart},${edgeEnd}`,
    'K': `M ${edgeStart},${edgeStart} L ${edgeStart},${edgeEnd} M ${edgeStart},${half} L ${edgeEnd},${edgeStart} M ${edgeStart},${half} L ${edgeEnd},${edgeEnd}`,
    'L': `M ${edgeStart},${edgeStart} L ${edgeStart},${edgeEnd} L ${edgeEnd},${edgeEnd}`,
    'M': `M ${edgeStart},${edgeEnd} L ${edgeStart},${edgeStart} L ${half},${half} L ${edgeEnd},${edgeStart} L ${edgeEnd},${edgeEnd}`,
    'N': `M ${edgeStart},${edgeEnd} L ${edgeStart},${edgeStart} L ${edgeEnd},${edgeEnd} L ${edgeEnd},${edgeStart}`,
    'O': `M ${half},${edgeStart} a ${quarter},${quarter} 0 1,1 0,${edgeEnd - edgeStart} a ${quarter},${quarter} 0 1,1 0,-${edgeEnd - edgeStart}`,
    'P': `M ${edgeStart},${edgeStart} L ${edgeStart},${edgeEnd} M ${edgeStart},${edgeStart} L ${half},${edgeStart} a ${eighth},${eighth} 0 0,1 ${eighth},${eighth} L ${half},${half} L ${edgeStart},${half}`,
    'Q': `M ${half},${edgeStart} a ${quarter},${quarter} 0 1,1 0,${edgeEnd - edgeStart} a ${quarter},${quarter} 0 1,1 0,-${edgeEnd - edgeStart} M ${half + eighth},${half + eighth} L ${edgeEnd},${edgeEnd}`,
    'R': `M ${edgeStart},${edgeStart} L ${edgeStart},${edgeEnd} M ${edgeStart},${edgeStart} L ${half},${edgeStart} a ${eighth},${eighth} 0 0,1 ${eighth},${eighth} L ${half},${half} L ${edgeStart},${half} M ${half},${half} L ${edgeEnd},${edgeEnd}`,
    'S': `M ${edgeEnd},${edgeStart} L ${edgeStart},${edgeStart} L ${edgeStart},${half} L ${edgeEnd},${half} L ${edgeEnd},${edgeEnd} L ${edgeStart},${edgeEnd}`,
    'T': `M ${half},${edgeStart} L ${half},${edgeEnd} M ${edgeStart},${edgeStart} L ${edgeEnd},${edgeStart}`,
    'U': `M ${edgeStart},${edgeStart} L ${edgeStart},${edgeEnd} Q ${edgeStart},${edgeEnd} ${half},${edgeEnd} Q ${edgeEnd},${edgeEnd} ${edgeEnd},${edgeEnd} L ${edgeEnd},${edgeStart}`,
    'V': `M ${edgeStart},${edgeStart} L ${half},${edgeEnd} L ${edgeEnd},${edgeStart}`,
    'W': `M ${edgeStart},${edgeStart} L ${edgeStart},${edgeEnd} L ${half},${half} L ${edgeEnd},${edgeEnd} L ${edgeEnd},${edgeStart}`,
    'X': `M ${edgeStart},${edgeStart} L ${edgeEnd},${edgeEnd} M ${edgeEnd},${edgeStart} L ${edgeStart},${edgeEnd}`,
    'Y': `M ${edgeStart},${edgeStart} L ${half},${half} L ${edgeEnd},${edgeStart} M ${half},${half} L ${half},${edgeEnd}`,
    'Z': `M ${edgeStart},${edgeStart} L ${edgeEnd},${edgeStart} L ${edgeStart},${edgeEnd} L ${edgeEnd},${edgeEnd}`,
  };
  
  // Get path for character, or return empty for unknown characters
  const path = charPaths[char] || '';
  
  return path;
}

/**
 * Render a character path to a canvas context
 */
export function renderCharToCanvas(ctx, char, x, y, size, strokeWidth = 1) {
  const path = getCharPath(char, size);
  if (!path) return; // Skip empty characters (like space)
  
  // Create a temporary SVG element to parse and render the path
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  
  const pathElement = document.createElementNS(svgNS, 'path');
  pathElement.setAttribute('d', path);
  pathElement.setAttribute('fill', 'none');
  pathElement.setAttribute('stroke', '#ffffff');
  pathElement.setAttribute('stroke-width', strokeWidth.toString());
  pathElement.setAttribute('stroke-linecap', 'round');
  pathElement.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(pathElement);
  
  // Convert SVG to image and draw to canvas
  const svgData = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  const blob = new Blob([svgData], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  
  return new Promise((resolve) => {
    img.onload = () => {
      ctx.drawImage(img, x, y, size, size);
      URL.revokeObjectURL(url);
      resolve();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    img.src = url;
  });
}

