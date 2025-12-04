import React from 'react';
import { Image as ImageIcon, Box } from 'lucide-react';
import './ControlPanel.css';

function ControlPanel({ onFileUpload, inputMode, selectedDefaultFile, onDefaultFileSelect, loadedImages, currentImageFileName }) {
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Determine file type
    const isImage = file.type.startsWith('image/') || 
                   /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file.name);
    const isSTL = file.name.endsWith('.stl');
    
    if (isImage) {
      onFileUpload(file, 'image');
    } else if (isSTL) {
      onFileUpload(file, 'stl');
    } else {
      alert('Please select a valid STL file or image (jpg, png, gif, etc.)');
    }
    
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const defaultFiles = [
    { value: 'clouds.jpg', label: 'Clouds', type: 'image', thumbnailUrl: '/clouds.jpg' },
    { value: '24_cell_Schlegel.stl', label: '24-Cell (Schlegel)', type: 'stl' },
    { value: '120_Cell.stl', label: '120-Cell', type: 'stl' },
    { value: '600_cell.stl', label: '600-Cell', type: 'stl' }
  ];

  const handleFileListItemClick = (fileEntry) => {
    if (fileEntry.type === 'image') {
      // Check if it's a preloaded image (from GitHub) or uploaded image
      if (fileEntry.file) {
        // Reload the image file - this is an existing selection, don't reorder
        onFileUpload(fileEntry.file, 'image', true);
      } else {
        // Preloaded image from GitHub
        onDefaultFileSelect(fileEntry.value);
      }
    } else {
      // Load default STL file or preloaded image
      onDefaultFileSelect(fileEntry.value);
    }
  };

  return (
    <div className="control-panel">
      <div className="panel-section">
        <label className="file-upload-button">
          <input
            type="file"
            accept=".stl,image/*"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          Load STL or Image
        </label>

        <div className="file-list-container">
          <div className="file-list">
            {/* Loaded images at the top */}
            {loadedImages.map(imageEntry => (
              <div
                key={imageEntry.id}
                data-type="image"
                className={`file-list-item ${inputMode === 'image' && currentImageFileName === imageEntry.name ? 'active' : ''}`}
                onClick={() => handleFileListItemClick(imageEntry)}
              >
                {imageEntry.thumbnailUrl ? (
                  <img 
                    src={imageEntry.thumbnailUrl} 
                    alt={imageEntry.name}
                    className="file-list-thumbnail"
                  />
                ) : (
                  <div className="file-list-icon">
                    <ImageIcon size={16} />
                  </div>
                )}
                <span className="file-list-name">{imageEntry.name}</span>
              </div>
            ))}
            
            {/* Default files (STL and images) */}
            {defaultFiles.map(file => (
              <div
                key={file.value}
                data-type={file.type}
                className={`file-list-item ${selectedDefaultFile === file.value ? 'active' : ''}`}
                onClick={() => handleFileListItemClick(file)}
              >
                {file.thumbnailUrl ? (
                  <img 
                    src={file.thumbnailUrl} 
                    alt={file.label}
                    className="file-list-thumbnail"
                  />
                ) : (
                  <div className="file-list-icon">
                    {file.type === 'image' ? (
                      <ImageIcon size={16} />
                    ) : (
                      <Box size={16} />
                    )}
                  </div>
                )}
                <span className="file-list-name">{file.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel-section">
        <h3>Controls</h3>
        <ul className="controls-list">
          <li><strong>Left Click + Drag:</strong> Rotate</li>
          <li><strong>Right Click + Drag:</strong> Pan</li>
          <li><strong>Scroll:</strong> Zoom</li>
        </ul>
      </div>
    </div>
  );
}

export default ControlPanel;

