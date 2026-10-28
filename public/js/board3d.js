// Bàn cờ 3D bằng Three.js: bàn có chất liệu, quân dựng bằng hình học, bóng đổ,
// xoay camera bằng tay, hiệu ứng trượt quân. Chỉ được nạp khi người chơi chọn chế độ 3D.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const FILES = 'abcdefgh';
const ease = (k) => 1 - Math.pow(1 - k, 3);
const squareX = (i) => (i & 7) - 3.5;
const squareZ = (i) => (i >> 3) - 3.5;
const DEFAULT_POLAR = 0.95; // góc từ trục đứng xuống (radian)
const DEFAULT_RADIUS = 15;

const BOARD_THEMES = {
  wood: { light: '#f0d9b5', dark: '#b58863', frame: '#4a2e17', kind: 'wood', roughness: 0.55 },
  green: { light: '#eeeed2', dark: '#769656', frame: '#2f4420', kind: 'grain', roughness: 0.6 },
  blue: { light: '#dee3e6', dark: '#8ca2ad', frame: '#2d4352', kind: 'grain', roughness: 0.6 },
  marble: { light: '#f4f4f1', dark: '#7d8a97', frame: '#58606a', kind: 'marble', roughness: 0.22 },
  night: { light: '#6b7a93', dark: '#2f3a4f', frame: '#10141d', kind: 'grain', roughness: 0.4 },
};

// Tạo vân gỗ / vân đá / nhiễu nhẹ bằng canvas để mặt ô cờ không bị phẳng.
function makeTexture(color, kind, seed) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);

  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;

  if (kind === 'wood') {
    for (let y = 0; y < size; y += 2) {
      g.strokeStyle = `rgba(60,30,10,${0.03 + rand() * 0.08})`;
      g.lineWidth = 1 + rand() * 1.5;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= size; x += 32) g.lineTo(x, y + Math.sin(x / 40 + y / 17) * 3 + (rand() - 0.5) * 2);
      g.stroke();
    }
  } else if (kind === 'marble') {
    for (let k = 0; k < 8; k++) {
      g.strokeStyle = `rgba(80,90,100,${0.08 + rand() * 0.14})`;
      g.lineWidth = 0.6 + rand() * 1.8;
      g.beginPath();
      let x = rand() * size;
      let y = 0;
      g.moveTo(x, y);
      for (let t = 0; t < 8; t++) {
        x += (rand() - 0.5) * 70;
        y += size / 8;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }

  const image = g.getImageData(0, 0, size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = (rand() - 0.5) * 9;
    image.data[i] += n;
    image.data[i + 1] += n;
    image.data[i + 2] += n;
  }
  g.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function labelTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d');
  g.fillStyle = '#e8dcc4';
  g.font = '700 40px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 32, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function radialTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,40,40,0.95)');
  gradient.addColorStop(0.5, 'rgba(230,60,60,0.55)');
  gradient.addColorStop(1, 'rgba(230,60,60,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

// ---------- Quân cờ ----------

function addShadowFlags(object) {
  object.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return object;
}

function lathe(profile, material) {
  const points = profile.map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.Mesh(new THREE.LatheGeometry(points, 36), material);
}

function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}

function extrudeShape(shape, material, depth = 0.24) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: 0.035,
    bevelThickness: 0.04,
    bevelSegments: 3,
    curveSegments: 18,
  });
  geometry.translate(0, 0.14, -depth / 2);
  return new THREE.Mesh(geometry, material);
}

// Đầu ngựa kiểu cổ điển, vẽ theo cùng đường nét với quân SVG (quay mặt về phía -x).
function classicKnightShape() {
  const K = 0.0125;
  const P = (x, y) => [(x - 50) * K, (76 - y) * K];
  const shape = new THREE.Shape();
  shape.moveTo(...P(27, 76));
  shape.bezierCurveTo(...P(27, 61), ...P(35, 53), ...P(43, 49));
  shape.bezierCurveTo(...P(37, 50), ...P(29, 51), ...P(25, 47));
  shape.bezierCurveTo(...P(21, 43), ...P(23, 38), ...P(29, 32));
  shape.bezierCurveTo(...P(34, 27), ...P(39, 24), ...P(39, 17));
  shape.lineTo(...P(41, 9));
  shape.lineTo(...P(49, 15));
  shape.bezierCurveTo(...P(66, 16), ...P(77, 38), ...P(74, 76));
  shape.closePath();
  return shape;
}

function modernKnightShape() {
  const K = 0.0125;
  const P = (x, y) => [(x - 50) * K, (80 - y) * K];
  const shape = new THREE.Shape();
  shape.moveTo(...P(28, 80));
  for (const [x, y] of [[31, 50], [24, 43], [43, 14], [51, 25], [69, 32], [74, 80]]) shape.lineTo(...P(x, y));
  shape.closePath();
  return shape;
}

function darkSpot(material, x, y, z) {
  return mesh(new THREE.SphereGeometry(0.035, 12, 10), material, x, y, z);
}

const PLINTH = [[0, 0], [0.36, 0], [0.38, 0.03], [0.38, 0.07], [0.33, 0.11], [0.29, 0.15]];

const CLASSIC = {
  P(mat) {
    const g = new THREE.Group();
    g.add(lathe([...PLINTH, [0.2, 0.22], [0.14, 0.36], [0.13, 0.46], [0.2, 0.5], [0.2, 0.54], [0.12, 0.58], [0, 0.58]], mat));
    g.add(mesh(new THREE.SphereGeometry(0.17, 24, 16), mat, 0, 0.7, 0));
    return g;
  },
  R(mat) {
    const g = new THREE.Group();
    g.add(lathe([...PLINTH, [0.25, 0.22], [0.21, 0.36], [0.21, 0.62], [0.28, 0.68], [0.31, 0.72], [0.31, 0.86], [0, 0.86]], mat));
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      const merlon = mesh(new THREE.BoxGeometry(0.2, 0.13, 0.12), mat, Math.cos(a) * 0.24, 0.925, Math.sin(a) * 0.24);
      merlon.rotation.y = -a - Math.PI / 2;
      g.add(merlon);
    }
    return g;
  },
  N(mat, accent) {
    const g = new THREE.Group();
    g.add(lathe([...PLINTH, [0.27, 0.17], [0, 0.17]], mat));
    g.add(extrudeShape(classicKnightShape(), mat));
    for (const side of [-1, 1]) g.add(darkSpot(accent, -0.1125, 0.73, side * 0.17));
    return g;
  },
  B(mat, accent) {
    const g = new THREE.Group();
    g.add(lathe([...PLINTH, [0.22, 0.22], [0.15, 0.36], [0.12, 0.52], [0.2, 0.56], [0.2, 0.6], [0.12, 0.64], [0, 0.64]], mat));
    const head = mesh(new THREE.SphereGeometry(0.2, 28, 20), mat, 0, 0.9, 0);
    head.scale.y = 1.5;
    g.add(head);
    g.add(mesh(new THREE.SphereGeometry(0.06, 16, 12), mat, 0, 1.24, 0));
    const slit = mesh(new THREE.BoxGeometry(0.03, 0.26, 0.5), accent, 0, 0.97, 0);
    slit.rotation.z = 0.55;
    g.add(slit);
    return g;
  },
  Q(mat) {
    const g = new THREE.Group();
    g.add(lathe([...PLINTH, [0.25, 0.22], [0.17, 0.38], [0.15, 0.66], [0.22, 0.74], [0.3, 0.9], [0.31, 1.0], [0.22, 1.02], [0, 1.02]], mat));
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const x = Math.cos(a) * 0.25;
      const z = Math.sin(a) * 0.25;
      g.add(mesh(new THREE.ConeGeometry(0.05, 0.16, 10), mat, x, 1.08, z));
      g.add(mesh(new THREE.SphereGeometry(0.045, 12, 10), mat, x, 1.18, z));
    }
    g.add(mesh(new THREE.SphereGeometry(0.1, 20, 14), mat, 0, 1.12, 0));
    return g;
  },
  K(mat) {
    const g = new THREE.Group();
    g.add(lathe([...PLINTH, [0.25, 0.22], [0.17, 0.38], [0.15, 0.7], [0.23, 0.8], [0.3, 0.96], [0.28, 1.08], [0.18, 1.12], [0, 1.12]], mat));
    g.add(mesh(new THREE.BoxGeometry(0.09, 0.34, 0.09), mat, 0, 1.3, 0));
    g.add(mesh(new THREE.BoxGeometry(0.26, 0.09, 0.09), mat, 0, 1.35, 0));
    return g;
  },
};

const modernBase = (mat) => mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.12, 32), mat, 0, 0.06, 0);

const MODERN = {
  P(mat) {
    const g = new THREE.Group();
    g.add(modernBase(mat));
    g.add(mesh(new THREE.ConeGeometry(0.27, 0.48, 32), mat, 0, 0.36, 0));
    g.add(mesh(new THREE.SphereGeometry(0.17, 24, 16), mat, 0, 0.68, 0));
    return g;
  },
  R(mat) {
    const g = new THREE.Group();
    g.add(modernBase(mat));
    g.add(mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.6, 32), mat, 0, 0.42, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 32), mat, 0, 0.78, 0));
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      const merlon = mesh(new THREE.BoxGeometry(0.2, 0.12, 0.12), mat, Math.cos(a) * 0.25, 0.9, Math.sin(a) * 0.25);
      merlon.rotation.y = -a - Math.PI / 2;
      g.add(merlon);
    }
    return g;
  },
  N(mat, accent) {
    const g = new THREE.Group();
    g.add(modernBase(mat));
    g.add(extrudeShape(modernKnightShape(), mat));
    for (const side of [-1, 1]) g.add(darkSpot(accent, -0.08, 0.68, side * 0.17));
    return g;
  },
  B(mat) {
    const g = new THREE.Group();
    g.add(modernBase(mat));
    g.add(mesh(new THREE.ConeGeometry(0.27, 0.8, 32), mat, 0, 0.52, 0));
    g.add(mesh(new THREE.SphereGeometry(0.15, 24, 16), mat, 0, 1.0, 0));
    return g;
  },
  Q(mat) {
    const g = new THREE.Group();
    g.add(modernBase(mat));
    g.add(mesh(new THREE.CylinderGeometry(0.14, 0.3, 0.95, 32), mat, 0, 0.58, 0));
    const ring = mesh(new THREE.TorusGeometry(0.2, 0.04, 12, 32), mat, 0, 1.0, 0);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    g.add(mesh(new THREE.SphereGeometry(0.12, 24, 16), mat, 0, 1.2, 0));
    return g;
  },
  K(mat) {
    const g = new THREE.Group();
    g.add(modernBase(mat));
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.0, 32), mat, 0, 0.62, 0));
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.34, 0.1), mat, 0, 1.3, 0));
    g.add(mesh(new THREE.BoxGeometry(0.28, 0.1, 0.1), mat, 0, 1.36, 0));
    return g;
  },
};

// ---------- Bàn cờ ----------

export function createBoard3D(container, { onSquare }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'board3d-canvas';
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.minDistance = 9;
  controls.maxDistance = 24;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = 1.38;
  controls.rotateSpeed = 0.8;

  // Ánh sáng
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6a6a78, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.position.set(4, 11, 6);
  sun.castShadow = true;
  const shadowSize = window.matchMedia('(pointer: coarse)').matches ? 1024 : 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xbcc8ff, 0.6);
  fill.position.set(-6, 5, -5);
  scene.add(fill);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.3 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.34;
  ground.receiveShadow = true;
  scene.add(ground);

  const boardGroup = new THREE.Group();
  const piecesGroup = new THREE.Group();
  const overlayGroup = new THREE.Group();
  scene.add(boardGroup, piecesGroup, overlayGroup);

  // Vật liệu quân dùng chung
  const pieceMaterials = {
    w: new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.38, metalness: 0.05 }),
    b: new THREE.MeshStandardMaterial({ color: '#2d2926', roughness: 0.3, metalness: 0.2 }),
  };
  const accentMaterials = {
    w: new THREE.MeshStandardMaterial({ color: '#5a4a38', roughness: 0.6 }),
    b: new THREE.MeshStandardMaterial({ color: '#9a9184', roughness: 0.6 }),
  };

  // Vật liệu làm nổi bật ô
  const overlayMats = {
    selected: new THREE.MeshBasicMaterial({ color: 0xf6f669, transparent: true, opacity: 0.6, depthWrite: false }),
    last: new THREE.MeshBasicMaterial({ color: 0xffeb3b, transparent: true, opacity: 0.35, depthWrite: false }),
    target: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
    capture: new THREE.MeshBasicMaterial({ color: 0xd04040, transparent: true, opacity: 0.75, depthWrite: false }),
    check: new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true, depthWrite: false }),
  };
  const planeGeo = new THREE.PlaneGeometry(0.98, 0.98);
  const dotGeo = new THREE.CircleGeometry(0.17, 24);
  const ringGeo = new THREE.RingGeometry(0.36, 0.46, 32);

  let themeKey = '';
  let squareMats = null;
  let frameMesh = null;
  let labelGroups = null;
  const squareMeshes = [];
  const slots = new Array(64).fill(null); // { piece, group }
  let currentView = null;
  let pieceStyle = 'classic';

  // ----- Hoạt ảnh theo yêu cầu (chỉ vẽ khi có thay đổi) -----
  const tweens = [];
  let frameId = 0;

  function requestRender() {
    if (!frameId) frameId = requestAnimationFrame(frame);
  }

  function animate(duration, step, done) {
    tweens.push({ duration, start: performance.now(), step, done });
    requestRender();
  }

  function frame() {
    frameId = 0;
    const now = performance.now();
    for (const tw of [...tweens]) {
      const k = Math.min(1, (now - tw.start) / tw.duration);
      tw.step(ease(k));
      if (k >= 1) {
        tweens.splice(tweens.indexOf(tw), 1);
        tw.done?.();
      }
    }
    controls.update();
    renderer.render(scene, camera);
    if (tweens.length > 0) requestRender();
  }
  controls.addEventListener('change', requestRender);

  // ----- Bàn và khung -----
  function showLabels() {
    if (!labelGroups) return;
    labelGroups.w.visible = currentView !== 'b';
    labelGroups.b.visible = currentView === 'b';
  }

  function buildBoard(themeName) {
    const theme = BOARD_THEMES[themeName] ?? BOARD_THEMES.wood;
    for (const child of [...boardGroup.children]) {
      boardGroup.remove(child);
      child.geometry?.dispose();
    }
    if (squareMats) {
      squareMats.light.map?.dispose();
      squareMats.dark.map?.dispose();
    }
    squareMats = {
      light: new THREE.MeshStandardMaterial({ map: makeTexture(theme.light, theme.kind, 11), roughness: theme.roughness }),
      dark: new THREE.MeshStandardMaterial({ map: makeTexture(theme.dark, theme.kind, 29), roughness: theme.roughness }),
    };

    frameMesh = new THREE.Mesh(
      new THREE.BoxGeometry(9.5, 0.34, 9.5),
      new THREE.MeshStandardMaterial({ color: theme.frame, roughness: 0.5 }),
    );
    frameMesh.position.y = -0.19;
    frameMesh.receiveShadow = true;
    frameMesh.castShadow = true;
    boardGroup.add(frameMesh);

    const squareGeo = new THREE.BoxGeometry(1, 0.2, 1);
    squareMeshes.length = 0;
    for (let i = 0; i < 64; i++) {
      const isDark = ((i >> 3) + (i & 7)) % 2 === 1;
      const sq = new THREE.Mesh(squareGeo, isDark ? squareMats.dark : squareMats.light);
      sq.position.set(squareX(i), -0.1, squareZ(i));
      sq.receiveShadow = true;
      sq.userData.square = i;
      squareMeshes.push(sq);
      boardGroup.add(sq);
    }

    // Tọa độ a-h, 1-8 trên khung: mỗi phía có một bộ nhãn đặt đúng chiều chữ,
    // chỉ hiện bộ nhãn của phía đang nhìn.
    const labelMat = (text) => new THREE.MeshBasicMaterial({ map: labelTexture(text), transparent: true });
    const labelGeo = new THREE.PlaneGeometry(0.4, 0.4);
    const addLabel = (group, text, x, z, spin) => {
      const label = mesh(labelGeo, labelMat(text), x, -0.015, z);
      label.rotation.set(-Math.PI / 2, 0, spin);
      group.add(label);
    };
    labelGroups = { w: new THREE.Group(), b: new THREE.Group() };
    for (let c = 0; c < 8; c++) {
      addLabel(labelGroups.w, FILES[c], c - 3.5, 4.35, 0);
      addLabel(labelGroups.b, FILES[c], c - 3.5, -4.35, Math.PI);
    }
    for (let r = 0; r < 8; r++) {
      addLabel(labelGroups.w, String(8 - r), -4.35, r - 3.5, 0);
      addLabel(labelGroups.b, String(8 - r), 4.35, r - 3.5, Math.PI);
    }
    boardGroup.add(labelGroups.w, labelGroups.b);
    showLabels();
  }

  // ----- Quân cờ -----
  function createPiece(piece, square, { pop = false } = {}) {
    const builders = pieceStyle === 'modern' ? MODERN : CLASSIC;
    const color = piece[0];
    const group = addShadowFlags(builders[piece[1]](pieceMaterials[color], accentMaterials[color]));
    if (piece[1] === 'N') group.rotation.y = (color === 'w' ? -Math.PI / 2 : Math.PI / 2) + 0.55;
    group.position.set(squareX(square), 0, squareZ(square));
    group.userData.square = square;
    piecesGroup.add(group);
    if (pop) {
      group.scale.setScalar(0.2);
      animate(260, (k) => group.scale.setScalar(0.2 + 0.8 * k));
    }
    return { piece, group };
  }

  function disposeGroup(group) {
    piecesGroup.remove(group);
    group.traverse((o) => o.geometry?.dispose());
  }

  function removePiece(slot) {
    disposeGroup(slot.group);
  }

  function fadeOut(slot) {
    const { group } = slot;
    animate(220, (k) => group.scale.setScalar(Math.max(0.001, 1 - k)), () => disposeGroup(group));
  }

  function slideTo(group, square, hop) {
    const from = group.position.clone();
    const to = new THREE.Vector3(squareX(square), 0, squareZ(square));
    animate(
      260,
      (k) => {
        group.position.lerpVectors(from, to, k);
        group.position.y = Math.sin(k * Math.PI) * hop;
      },
      () => group.position.copy(to),
    );
  }

  function syncPieces(vm) {
    if (vm.moved) {
      for (const mv of [vm.moved, vm.moved.rook].filter(Boolean)) {
        const slot = slots[mv.from];
        if (!slot) continue;
        const victim = slots[mv.to];
        if (victim && victim !== slot) fadeOut(victim);
        slots[mv.to] = slot;
        slots[mv.from] = null;
        slot.group.userData.square = mv.to;
        slideTo(slot.group, mv.to, slot.piece[1] === 'N' ? 0.7 : 0.25);
      }
    }
    for (let i = 0; i < 64; i++) {
      const want = vm.board[i];
      if (slots[i] && slots[i].piece !== want) {
        removePiece(slots[i]);
        slots[i] = null;
      }
      if (want && !slots[i]) slots[i] = createPiece(want, i, { pop: Boolean(vm.moved?.promo) && i === vm.moved.to });
    }
  }

  function rebuildPieces(board) {
    for (let i = 0; i < 64; i++) {
      if (slots[i]) removePiece(slots[i]);
      slots[i] = null;
    }
    for (let i = 0; i < 64; i++) if (board[i]) slots[i] = createPiece(board[i], i);
  }

  // ----- Làm nổi bật ô -----
  function drawOverlays(vm) {
    for (const child of [...overlayGroup.children]) overlayGroup.remove(child);
    const flat = (geometry, material, square, y) => {
      const m = mesh(geometry, material, squareX(square), y, squareZ(square));
      m.rotation.x = -Math.PI / 2;
      m.userData.square = square;
      m.renderOrder = 2;
      overlayGroup.add(m);
    };
    if (vm.last) {
      flat(planeGeo, overlayMats.last, vm.last.from, 0.006);
      flat(planeGeo, overlayMats.last, vm.last.to, 0.006);
    }
    if (vm.selected !== null) flat(planeGeo, overlayMats.selected, vm.selected, 0.008);
    if (vm.kingSquare >= 0) flat(planeGeo, overlayMats.check, vm.kingSquare, 0.01);
    for (const square of vm.targets) {
      if (vm.board[square]) flat(ringGeo, overlayMats.capture, square, 0.012);
      else flat(dotGeo, overlayMats.target, square, 0.012);
    }
    for (let i = 0; i < 64; i++) {
      if (slots[i] && !tweens.length) slots[i].group.position.y = i === vm.selected ? 0.16 : 0;
    }
  }

  // ----- Camera -----
  const spherical = () => {
    const p = camera.position;
    const radius = p.length();
    return { radius, polar: Math.acos(p.y / radius), azimuth: Math.atan2(p.x, p.z) };
  };

  function placeCamera({ radius, polar, azimuth }) {
    camera.position.set(
      radius * Math.sin(polar) * Math.sin(azimuth),
      radius * Math.cos(polar),
      radius * Math.sin(polar) * Math.cos(azimuth),
    );
    camera.lookAt(0, 0, 0);
  }

  function setView(color, { instant = false } = {}) {
    currentView = color;
    showLabels();
    const target = color === 'w' ? 0 : Math.PI;
    if (instant) {
      placeCamera({ radius: DEFAULT_RADIUS, polar: DEFAULT_POLAR, azimuth: target });
      requestRender();
      return;
    }
    const start = spherical();
    let delta = target - start.azimuth;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    animate(550, (k) => placeCamera({ ...start, azimuth: start.azimuth + delta * k }));
  }

  function resetCamera() {
    const start = spherical();
    const target = currentView === 'b' ? Math.PI : 0;
    let delta = target - start.azimuth;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    animate(450, (k) =>
      placeCamera({
        radius: start.radius + (DEFAULT_RADIUS - start.radius) * k,
        polar: start.polar + (DEFAULT_POLAR - start.polar) * k,
        azimuth: start.azimuth + delta * k,
      }),
    );
  }

  // ----- Kích thước -----
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Chọn góc nhìn sao cho mép gần của bàn cờ (phần rộng nhất trên màn hình) vừa khít bề ngang khung hình.
    const nearEdgeDepth = DEFAULT_RADIUS - 4.75 * Math.sin(DEFAULT_POLAR);
    const halfFov = Math.atan(Math.max(4.95 / (nearEdgeDepth * camera.aspect), 0.3));
    camera.fov = THREE.MathUtils.radToDeg(2 * halfFov);
    camera.updateProjectionMatrix();
    requestRender();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  // ----- Chọn ô bằng cách chạm -----
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down = null;

  renderer.domElement.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, time: performance.now() };
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.time < 700;
    down = null;
    if (moved > 8 || !quick) return; // đang kéo để xoay camera
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    for (const hit of raycaster.intersectObjects([overlayGroup, piecesGroup, boardGroup], true)) {
      let obj = hit.object;
      while (obj && obj.userData.square === undefined) obj = obj.parent;
      if (obj) {
        onSquare(obj.userData.square);
        return;
      }
    }
  });

  buildBoard('wood');
  placeCamera({ radius: DEFAULT_RADIUS, polar: DEFAULT_POLAR, azimuth: 0 });
  resize();

  return {
    // vm: { board, selected, targets:Set, last, kingSquare, view, moved, boardTheme, pieceStyle }
    update(vm) {
      let rebuilt = false;
      if (vm.boardTheme !== themeKey) {
        themeKey = vm.boardTheme;
        buildBoard(themeKey);
      }
      if (vm.pieceStyle !== pieceStyle) {
        pieceStyle = vm.pieceStyle;
        rebuildPieces(vm.board);
        rebuilt = true;
      }
      if (!rebuilt) syncPieces(vm);
      drawOverlays(vm);
      if (vm.view !== currentView) setView(vm.view, { instant: currentView === null });
      resize();
      requestRender();
    },
    resetCamera,
    resize,
    // Tọa độ trên màn hình (px) của tâm một ô, dùng cho kiểm thử.
    screenPoint(square, height = 0.02, offsetX = 0) {
      camera.updateMatrixWorld();
      const v = new THREE.Vector3(squareX(square) + offsetX, height, squareZ(square)).project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
    },
    dispose() {
      observer.disconnect();
      cancelAnimationFrame(frameId);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
