import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useFireData } from '../context/FireDataContext.jsx';
import { confidenceColor, confidenceLabel, formatAcqTime } from '../utils/fireUtils.js';
import { Globe2, RotateCcw, Play, Pause, Flame } from 'lucide-react';

const GLOBE_RADIUS = 2.0;

/**
 * Procedurally generates a mission-control dark Earth canvas texture
 * with continent outlines and lat/long graticules.
 */
function createEarthTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // 1. Deep space/ocean background
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  oceanGrad.addColorStop(0, '#060d17');
  oceanGrad.addColorStop(0.5, '#0a1424');
  oceanGrad.addColorStop(1, '#060d17');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Latitude & Longitude graticules
  ctx.strokeStyle = 'rgba(30, 58, 95, 0.35)';
  ctx.lineWidth = 1;

  // Latitudes (every 15 deg)
  for (let lat = -75; lat <= 75; lat += 15) {
    const y = ((90 - lat) / 180) * canvas.height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Longitudes (every 30 deg)
  for (let lon = -180; lon <= 180; lon += 30) {
    const x = ((lon + 180) / 360) * canvas.width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  // Equator emphasis
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
  ctx.lineWidth = 2;
  const eqY = canvas.height / 2;
  ctx.beginPath();
  ctx.moveTo(0, eqY);
  ctx.lineTo(canvas.width, eqY);
  ctx.stroke();

  // Prime meridian
  const pmX = canvas.width / 2;
  ctx.beginPath();
  ctx.moveTo(pmX, 0);
  ctx.lineTo(pmX, canvas.height);
  ctx.stroke();

  // 3. Simplified continent landmasses (procedural vector shapes)
  ctx.fillStyle = 'rgba(26, 44, 66, 0.75)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
  ctx.lineWidth = 1.5;

  const toX = (lon) => ((lon + 180) / 360) * canvas.width;
  const toY = (lat) => ((90 - lat) / 180) * canvas.height;

  // Helper to draw continent polygon
  const drawPoly = (coords) => {
    if (coords.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(toX(coords[0][0]), toY(coords[0][1]));
    for (let i = 1; i < coords.length; i++) {
      ctx.lineTo(toX(coords[i][0]), toY(coords[i][1]));
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };

  // North America
  drawPoly([
    [-168, 65], [-140, 70], [-100, 75], [-60, 60], [-55, 45], [-75, 30],
    [-80, 25], [-97, 20], [-105, 23], [-120, 34], [-125, 48], [-165, 60]
  ]);
  // Central America
  drawPoly([[-105, 23], [-90, 15], [-78, 8], [-83, 10], [-98, 18]]);
  // South America
  drawPoly([
    [-78, 10], [-50, -2], [-35, -5], [-38, -15], [-50, -30], [-65, -55],
    [-75, -50], [-72, -35], [-80, -5], [-80, 5]
  ]);
  // Europe
  drawPoly([
    [-10, 36], [-8, 44], [0, 50], [10, 55], [25, 71], [40, 68],
    [30, 45], [25, 40], [15, 38], [5, 43], [-5, 36]
  ]);
  // Africa
  drawPoly([
    [-17, 15], [-5, 36], [10, 37], [32, 31], [43, 12], [51, 10],
    [40, -10], [32, -30], [20, -35], [12, -20], [8, 5], [-15, 10]
  ]);
  // Asia
  drawPoly([
    [40, 68], [80, 75], [140, 72], [170, 65], [140, 50], [130, 35],
    [105, 20], [100, 5], [80, 10], [70, 25], [60, 25], [50, 40], [40, 45]
  ]);
  // India
  drawPoly([[68, 24], [78, 30], [88, 22], [80, 8]]);
  // Southeast Asia & Indonesia
  drawPoly([[100, 5], [108, 10], [108, 1], [100, 1]]);
  drawPoly([[110, -5], [120, -5], [115, -8]]);
  // Australia
  drawPoly([
    [114, -22], [130, -12], [142, -10], [153, -28], [150, -37],
    [135, -35], [115, -35]
  ]);

  return new THREE.CanvasTexture(canvas);
}

export default function GlobeView() {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const instancedMeshRef = useRef(null);
  const animFrameId = useRef(null);
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

  const [selectedInfo, setSelectedInfo] = useState(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const autoRotateRef = useRef(autoRotate);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  const { globeFires, filteredFires, selectedFire, setSelectedFire } = useFireData();

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 580;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a0e17');
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 1, 5.5);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.8;
    controls.minDistance = 2.6;
    controls.maxDistance = 8.0;
    controlsRef.current = controls;

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x38bdf8, 1.5);
    dirLight.position.set(5, 3, 5);
    scene.add(dirLight);

    // 6. Earth Mesh
    const earthGeometry = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
    const earthTexture = createEarthTexture();
    const earthMaterial = new THREE.MeshPhongMaterial({
      map: earthTexture,
      shininess: 15,
      specular: new THREE.Color(0x1e3a5f),
    });
    const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earthMesh);

    // 7. Atmospheric Glow Layer
    const atmosphereGeometry = new THREE.SphereGeometry(GLOBE_RADIUS + 0.04, 64, 64);
    const atmosphereMaterial = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.15,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    });
    const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    scene.add(atmosphereMesh);

    // 8. Animation loop
    const animate = () => {
      animFrameId.current = requestAnimationFrame(animate);

      if (autoRotateRef.current && controlsRef.current) {
        earthMesh.rotation.y += 0.001;
        if (instancedMeshRef.current) {
          instancedMeshRef.current.rotation.y = earthMesh.rotation.y;
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 9. Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: newWidth, height: newHeight } = entry.contentRect;
        if (newWidth > 0 && newHeight > 0) {
          camera.aspect = newWidth / newHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(newWidth, newHeight);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animFrameId.current);
      resizeObserver.disconnect();
      renderer.dispose();
      earthGeometry.dispose();
      earthMaterial.dispose();
      if (earthTexture) earthTexture.dispose();
      atmosphereGeometry.dispose();
      atmosphereMaterial.dispose();
      controls.dispose();
    };
  }, []);

  // Update Fire Detection Points on Globe
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove previous instanced mesh
    if (instancedMeshRef.current) {
      scene.remove(instancedMeshRef.current);
      instancedMeshRef.current.geometry.dispose();
      instancedMeshRef.current.material.dispose();
      instancedMeshRef.current = null;
    }

    if (globeFires.length === 0) return;

    const count = globeFires.length;
    const markerGeometry = new THREE.SphereGeometry(0.018, 8, 8);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const instancedMesh = new THREE.InstancedMesh(markerGeometry, markerMaterial, count);

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const fire = globeFires[i];

      // Convert lat, lon to Cartesian coordinates on sphere
      const phi = (90 - fire.latitude) * (Math.PI / 180);
      const theta = (fire.longitude + 180) * (Math.PI / 180);
      const r = GLOBE_RADIUS + 0.02;

      const x = -(r * Math.sin(phi) * Math.cos(theta));
      const z = r * Math.sin(phi) * Math.sin(theta);
      const y = r * Math.cos(phi);

      dummy.position.set(x, y, z);

      // Scale by FRP
      const scale = fire.frp ? Math.min(2.5, Math.max(1.0, 1.0 + Math.sqrt(fire.frp) * 0.05)) : 1.0;
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();

      instancedMesh.setMatrixAt(i, dummy.matrix);

      // Color by confidence category
      const hexColor = confidenceColor(fire.confidence);
      color.set(hexColor);
      instancedMesh.setColorAt(i, color);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) {
      instancedMesh.instanceColor.needsUpdate = true;
    }

    scene.add(instancedMesh);
    instancedMeshRef.current = instancedMesh;
  }, [globeFires]);

  // Click handler to pick wildfires
  const handleClick = useCallback((e) => {
    const container = containerRef.current;
    const camera = cameraRef.current;
    const instancedMesh = instancedMeshRef.current;
    if (!container || !camera || !instancedMesh) return;

    const rect = container.getBoundingClientRect();
    mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.current.setFromCamera(mouse.current, camera);
    const intersects = raycaster.current.intersectObject(instancedMesh);

    if (intersects.length > 0) {
      const instanceId = intersects[0].instanceId;
      if (instanceId !== undefined && globeFires[instanceId]) {
        const fire = globeFires[instanceId];
        setSelectedInfo(fire);
        if (setSelectedFire) setSelectedFire(fire);
      }
    }
  }, [globeFires, setSelectedFire]);

  // Smoothly fly to selected fire
  useEffect(() => {
    if (!selectedFire || !cameraRef.current || !controlsRef.current) return;

    const phi = (90 - selectedFire.latitude) * (Math.PI / 180);
    const theta = (selectedFire.longitude + 180) * (Math.PI / 180);
    const camDist = 3.8;

    const targetX = -(camDist * Math.sin(phi) * Math.cos(theta));
    const targetZ = camDist * Math.sin(phi) * Math.sin(theta);
    const targetY = camDist * Math.cos(phi);

    const camera = cameraRef.current;
    const controls = controlsRef.current;

    // Stop auto-rotation when focusing
    setAutoRotate(false);

    camera.position.set(targetX, targetY, targetZ);
    controls.target.set(0, 0, 0);
    controls.update();
    setSelectedInfo(selectedFire);
  }, [selectedFire]);

  // Reset view to default
  const resetCamera = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.set(0, 1, 5.5);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  }, []);

  return (
    <div className="globe-container">
      <div className="globe-header">
        <div className="globe-title-row">
          <Globe2 size={16} />
          <h2>3D Earth Globe — Orbital View</h2>
        </div>
        <span className="globe-count">
          {globeFires.length.toLocaleString()} active detections
          {globeFires.length < filteredFires.length && (
            <> (sampled from {filteredFires.length.toLocaleString()})</>
          )}
        </span>
      </div>

      <div
        className="globe-wrapper"
        ref={containerRef}
        onClick={handleClick}
        style={{ cursor: 'grab' }}
      />

      <div className="globe-controls">
        <button
          onClick={resetCamera}
          className="btn-secondary"
          type="button"
          aria-label="Reset camera view"
        >
          <RotateCcw size={14} />
          Reset View
        </button>

        <button
          onClick={() => setAutoRotate(!autoRotate)}
          className={`btn-secondary ${autoRotate ? 'active' : ''}`}
          type="button"
          aria-label="Toggle auto rotation"
        >
          {autoRotate ? <Pause size={14} /> : <Play size={14} />}
          {autoRotate ? 'Pause Rotation' : 'Auto Rotate'}
        </button>
      </div>

      {selectedInfo && (
        <div className="globe-info-panel">
          <div className="globe-info-header">
            <Flame size={16} className="fire-icon-pulse" />
            <h3>Wildfire Detection</h3>
            <button
              className="close-info-btn"
              onClick={() => setSelectedInfo(null)}
              aria-label="Close details"
            >
              ✕
            </button>
          </div>
          <div className="fire-popup-row">
            <span className="fire-popup-label">Location:</span>
            <span className="fire-popup-value">
              {selectedInfo.latitude?.toFixed(4)}°, {selectedInfo.longitude?.toFixed(4)}°
            </span>
          </div>
          <div className="fire-popup-row">
            <span className="fire-popup-label">FRP:</span>
            <span className="fire-popup-value">
              {selectedInfo.frp !== null ? `${selectedInfo.frp?.toFixed(1)} MW` : 'N/A'}
            </span>
          </div>
          <div className="fire-popup-row">
            <span className="fire-popup-label">Confidence:</span>
            <span
              className="fire-popup-value"
              style={{ color: confidenceColor(selectedInfo.confidence), fontWeight: 700 }}
            >
              {confidenceLabel(selectedInfo.confidence)}
            </span>
          </div>
          <div className="fire-popup-row">
            <span className="fire-popup-label">Satellite:</span>
            <span className="fire-popup-value">{selectedInfo.satellite || 'N/A'}</span>
          </div>
          <div className="fire-popup-row">
            <span className="fire-popup-label">Acquired:</span>
            <span className="fire-popup-value">
              {selectedInfo.acq_date || 'N/A'} {formatAcqTime(selectedInfo.acq_time)} UTC
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
