import React, { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

function ImageViewer({ imageFile, onImageLoaded }) {
  const meshRef = useRef();
  const [texture, setTexture] = useState(null);
  const { size } = useThree();

  useEffect(() => {
    if (!imageFile) {
      if (texture) {
        texture.dispose();
        setTexture(null);
      }
      return;
    }

    const loader = new THREE.TextureLoader();
    const objectUrl = URL.createObjectURL(imageFile);

    loader.load(
      objectUrl,
      (loadedTexture) => {
        // Clean up old texture
        if (texture) {
          texture.dispose();
        }
        
        // Configure texture
        loadedTexture.flipY = false; // Don't flip Y for images
        loadedTexture.needsUpdate = true;
        
        setTexture(loadedTexture);
        
        if (onImageLoaded) {
          onImageLoaded({
            width: loadedTexture.image.width,
            height: loadedTexture.image.height,
            texture: loadedTexture
          });
        }
      },
      undefined,
      (error) => {
        console.error('Error loading image:', error);
        URL.revokeObjectURL(objectUrl);
        if (onImageLoaded) {
          onImageLoaded(null);
        }
      }
    );

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [imageFile, onImageLoaded]);

  useEffect(() => {
    return () => {
      if (texture) {
        texture.dispose();
      }
    };
  }, [texture]);

  if (!texture) {
    return null;
  }

  // Calculate aspect ratio and scale to fit viewport
  const imageAspect = texture.image.width / texture.image.height;
  const viewportAspect = size.width / size.height;
  
  let scaleX = 1;
  let scaleY = 1;
  
  if (imageAspect > viewportAspect) {
    // Image is wider than viewport
    scaleX = 1;
    scaleY = viewportAspect / imageAspect;
  } else {
    // Image is taller than viewport
    scaleX = imageAspect / viewportAspect;
    scaleY = 1;
  }

  // Scale to fit nicely (use 90% of viewport)
  const scale = 0.9;
  scaleX *= scale;
  scaleY *= scale;

  return (
    <mesh ref={meshRef} position={[0, 0, 0]}>
      <planeGeometry args={[scaleX * 2, scaleY * 2]} />
      <meshBasicMaterial map={texture} />
    </mesh>
  );
}

export default ImageViewer;

