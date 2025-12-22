import * as THREE from 'three';

let goldLeafTexture: THREE.CanvasTexture | null = null;

export const getGoldLeafTexture = () => {
  if (goldLeafTexture) return goldLeafTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255, 234, 180, 0.9)');
    gradient.addColorStop(0.4, 'rgba(255, 212, 120, 0.7)');
    gradient.addColorStop(1, 'rgba(255, 212, 120, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 28; i += 1) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const r = 6 + Math.random() * 12;
      const alpha = 0.35 + Math.random() * 0.4;
      ctx.fillStyle = `rgba(255, 215, 120, ${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.65, r, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  goldLeafTexture = texture;
  return texture;
};
