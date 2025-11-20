import React, { useRef, useEffect, useState } from 'react';
import { useFrame, extend } from '@react-three/fiber';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import * as THREE from 'three';
import EdgeDetectionMaterial from './shaders/EdgeDetectionMaterial';

// Extend R3F with our custom material
extend({ EdgeDetectionMaterial });

function STLViewer({ file, onMeshLoaded, edgeSettings }) {
  const meshRef = useRef();
  const materialRef = useRef();
  const [geometry, setGeometry] = useState(null);

  useEffect(() => {
    if (!file) return;

    const loader = new STLLoader();
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target.result;
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

        setGeometry(stlGeometry);
        onMeshLoaded({
          geometry: stlGeometry,
          vertices: stlGeometry.attributes.position.count,
          faces: stlGeometry.attributes.position.count / 3
        });
      } catch (error) {
        console.error('Error loading STL:', error);
        alert('Error loading STL file: ' + error.message);
      }
    };

    reader.onerror = () => {
      alert('Error reading file');
    };

    reader.readAsArrayBuffer(file);
  }, [file, onMeshLoaded]);

  // Update material uniforms when edge settings change
  useFrame(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.edgeThreshold.value = edgeSettings.threshold;
      materialRef.current.uniforms.edgeColor.value = new THREE.Color(edgeSettings.color);
      materialRef.current.uniforms.edgeWidth.value = edgeSettings.width;
      materialRef.current.uniforms.shadingColors.value = edgeSettings.shadingColors;
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

