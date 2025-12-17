import React, { useRef, useEffect, useState } from 'react';
import { useFrame, extend } from '@react-three/fiber';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import * as THREE from 'three';
import EdgeDetectionMaterial from './shaders/EdgeDetectionMaterial';

// Extend R3F with our custom material
extend({ EdgeDetectionMaterial });

function STLViewer({ file, onMeshLoaded, onError, edgeSettings }) {
  const meshRef = useRef();
  const materialRef = useRef();
  const [geometry, setGeometry] = useState(null);
  const fileRef = useRef(null);
  const isLoadingRef = useRef(false);
  const previousGeometryRef = useRef(null);

  // Cleanup geometry on unmount or when file changes
  useEffect(() => {
    return () => {
      // Dispose previous geometry when component unmounts or file changes
      if (previousGeometryRef.current) {
        previousGeometryRef.current.dispose();
        previousGeometryRef.current = null;
      }
      if (geometry) {
        geometry.dispose();
      }
      // Dispose material if it exists
      if (materialRef.current) {
        materialRef.current.dispose();
        materialRef.current = null;
      }
    };
  }, [geometry]);

  useEffect(() => {
    if (!file) {
      if (geometry) {
        previousGeometryRef.current = geometry;
        setGeometry(null);
      }
      return;
    }

    // Only reset if it's actually a different file
    if (fileRef.current === file) {
      return; // Same file, no need to reload
    }
    
    // Dispose previous geometry before loading new one
    if (previousGeometryRef.current) {
      previousGeometryRef.current.dispose();
      previousGeometryRef.current = null;
    }
    
    // Mark as loading but keep old geometry visible
    isLoadingRef.current = true;
    fileRef.current = file;

    const loader = new STLLoader();
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target.result;
        
        // Validate array buffer size
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
          throw new Error('File is empty or invalid');
        }
        
        // Check if file is too large (sanity check - might be HTML error page)
        if (arrayBuffer.byteLength > 500 * 1024 * 1024) { // 500MB limit
          throw new Error('File is too large. This might be an error page instead of an STL file.');
        }
        
        // Quick check: STL files start with specific bytes or text
        // Binary STL starts with 80 bytes of header, ASCII STL starts with "solid"
        const uint8View = new Uint8Array(arrayBuffer, 0, Math.min(80, arrayBuffer.byteLength));
        const textDecoder = new TextDecoder();
        const headerText = textDecoder.decode(uint8View).trim().toLowerCase();
        
        // If it looks like HTML/error page, reject it with more details
        if (headerText.startsWith('<!doctype') || headerText.startsWith('<html')) {
          const preview = textDecoder.decode(new Uint8Array(arrayBuffer, 0, Math.min(500, arrayBuffer.byteLength)));
          console.error('Received HTML instead of STL. Preview:', preview);
          throw new Error('Received HTML error page instead of STL file. The file might not exist at the URL. Check browser console for details.');
        }
        
        // Check for common error messages
        if (headerText.includes('404') || headerText.includes('not found') || headerText.includes('cannot get')) {
          const preview = textDecoder.decode(new Uint8Array(arrayBuffer, 0, Math.min(500, arrayBuffer.byteLength)));
          console.error('Received error page. Preview:', preview);
          throw new Error('File not found. Check browser console for details.');
        }
        
        const stlGeometry = loader.parse(arrayBuffer);
        
        // Compute normals if not present
        if (!stlGeometry.attributes.normal) {
          stlGeometry.computeVertexNormals();
        }

        // Center the geometry
        stlGeometry.center();

        // Scale to fit in view
        const box = new THREE.Box3().setFromObject(new THREE.Mesh(stlGeometry));
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2 / maxDim;
        stlGeometry.scale(scale, scale, scale);

        // Dispose old geometry before setting new one
        if (geometry) {
          previousGeometryRef.current = geometry;
        }
        
        // Only update geometry after new one is ready (keeps old one visible during load)
        setGeometry(stlGeometry);
        isLoadingRef.current = false;
        onMeshLoaded({
          geometry: stlGeometry,
          vertices: stlGeometry.attributes.position.count,
          faces: stlGeometry.attributes.position.count / 3
        });
      } catch (error) {
        console.error('Error loading STL:', error);
        isLoadingRef.current = false;
        // Don't clear geometry on error - keep showing the old one
        if (onError) {
          onError(error);
        } else {
          alert('Error loading STL file: ' + error.message);
        }
      }
    };

    reader.onerror = () => {
      isLoadingRef.current = false;
      const error = new Error('Error reading file');
      if (onError) {
        onError(error);
      } else {
        alert('Error reading file');
      }
    };

    reader.readAsArrayBuffer(file);
  }, [file, onMeshLoaded]);

  // Update material uniforms when edge settings change
  const prevSettingsRef = useRef(edgeSettings);
  useFrame(() => {
    if (materialRef.current && geometry) {
      const prev = prevSettingsRef.current;
      // Only update if values actually changed to avoid unnecessary re-renders
      if (prev.threshold !== edgeSettings.threshold) {
        materialRef.current.uniforms.edgeThreshold.value = edgeSettings.threshold;
      }
      if (prev.color !== edgeSettings.color) {
        // Dispose old color object if it exists
        const oldColor = materialRef.current.uniforms.edgeColor.value;
        if (oldColor && oldColor.dispose) {
          oldColor.dispose();
        }
        materialRef.current.uniforms.edgeColor.value = new THREE.Color(edgeSettings.color);
      }
      if (prev.width !== edgeSettings.width) {
        materialRef.current.uniforms.edgeWidth.value = edgeSettings.width;
      }
      if (prev.shadingColors !== edgeSettings.shadingColors) {
        materialRef.current.uniforms.shadingColors.value = edgeSettings.shadingColors;
      }
      prevSettingsRef.current = edgeSettings;
    }
  });

  if (!geometry) {
    return null;
  }

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <edgeDetectionMaterial ref={materialRef} />
    </mesh>
  );
}

export default STLViewer;

