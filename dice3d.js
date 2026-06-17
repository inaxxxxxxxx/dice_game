/*
  dice3d.js
  3つのサイコロを「碗」の中で振って転がし、止まったら出目を読み取る。
  物理エンジンは使わず、軽量な疑似物理（重力・反発・摩擦・回転減衰）で実装。
*/

(function(){

  const INK = 0x1c2b3a;
  const PAPER = 0xfafaf8;
  const RED = 0xc4432e;

  // ---- public state ----
  const Dice3D = {
    onSettled: null, // callback(eyesArray) called once all dice stop
  };

  let scene, camera, renderer, canvas;
  let diceMeshes = [];
  let diceBodies = [];
  let animating = false;
  let bowlRadius = 2.6;
  let floorY = -1.4;

  const DICE_SIZE = 0.62;
  const GRAVITY = -20.0;

  function init(canvasEl){
    canvas = canvasEl;
    scene = new THREE.Scene();

    const aspect = 1;
    camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 100);
    camera.position.set(0, 4.6, 5.4);
    camera.lookAt(0, -0.6, 0);

    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    // lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.55);
    dir.position.set(2.5, 6, 3);
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0xffffff, 0.25);
    fill.position.set(-3, 2, -2);
    scene.add(fill);

    // bowl floor (visual only, subtle)
    const floorGeo = new THREE.CircleGeometry(bowlRadius + 0.3, 48);
    const floorMat = new THREE.MeshStandardMaterial({
      color: PAPER, roughness: 0.95, metalness: 0,
      transparent: true, opacity: 0.0
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = floorY;
    scene.add(floor);

    diceMeshes = [makeDie(), makeDie(), makeDie()];
    diceMeshes.forEach(m => scene.add(m));
    resetBodies();

    resize();
    window.addEventListener('resize', resize);

    renderStatic();
  }

  function resize(){
    if(!canvas) return;
    const parent = canvas.parentElement;
    const size = Math.min(parent.clientWidth, parent.clientHeight);
    renderer.setSize(size, size, false);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
  }

  // ---- die construction ----
  // Standard die pip layout, opposite faces sum to 7.
  // Face order for BoxGeometry materials: +x, -x, +y, -y, +z, -z
  // We assign: +x=1, -x=6, +y=2, -y=5, +z=3, -z=4  (a valid right-handed die)
  const FACE_VALUES = [1, 6, 2, 5, 3, 4]; // px, nx, py, ny, pz, nz

  function makePipTexture(value){
    const s = 256;
    const cv = document.createElement('canvas');
    cv.width = s; cv.height = s;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#FAFAF8';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(28,43,58,0.12)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, s-4, s-4);

    const pipColor = (value === 1) ? '#C4432E' : '#1C2B3A';
    ctx.fillStyle = pipColor;

    const r = s * 0.082;
    const positions = {
      center: [[0.5,0.5]],
      corners: [[0.27,0.27],[0.73,0.73],[0.27,0.73],[0.73,0.27]],
      mid: [[0.27,0.5],[0.73,0.5]],
    };

    function drawAt(pts){
      pts.forEach(([px,py])=>{
        ctx.beginPath();
        ctx.arc(px*s, py*s, r, 0, Math.PI*2);
        ctx.fill();
      });
    }

    switch(value){
      case 1:
        drawAt(positions.center);
        break;
      case 2:
        drawAt([[0.27,0.27],[0.73,0.73]]);
        break;
      case 3:
        drawAt([[0.27,0.27],[0.5,0.5],[0.73,0.73]]);
        break;
      case 4:
        drawAt(positions.corners);
        break;
      case 5:
        drawAt(positions.corners.concat(positions.center));
        break;
      case 6:
        drawAt([[0.27,0.27],[0.73,0.27],[0.27,0.5],[0.73,0.5],[0.27,0.73],[0.73,0.73]]);
        break;
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    return tex;
  }

  let cachedMaterials = null;
  function getMaterials(){
    if(cachedMaterials) return cachedMaterials;
    cachedMaterials = FACE_VALUES.map(v=>{
      return new THREE.MeshStandardMaterial({
        map: makePipTexture(v),
        roughness: 0.55,
        metalness: 0.02,
      });
    });
    return cachedMaterials;
  }

  function makeDie(){
    const geo = new THREE.BoxGeometry(DICE_SIZE, DICE_SIZE, DICE_SIZE, 1, 1, 1);
    // slightly bevel look via edge lines
    const mats = getMaterials();
    const mesh = new THREE.Mesh(geo, mats);
    const edges = new THREE.EdgesGeometry(geo);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x1c2b3a, transparent: true, opacity: 0.18 });
    const lines = new THREE.LineSegments(edges, edgeMat);
    mesh.add(lines);
    return mesh;
  }

  // ---- pseudo-physics ----
  function resetBodies(){
    diceBodies = diceMeshes.map((mesh, i)=>{
      const angle = (i / 3) * Math.PI * 2;
      mesh.position.set(Math.cos(angle)*0.5, 2.0 + i*0.3, Math.sin(angle)*0.5);
      mesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
      return {
        pos: mesh.position,
        vel: new THREE.Vector3(0,0,0),
        angVel: new THREE.Vector3(0,0,0),
        rest: false,
        restTimer: 0,
      };
    });
  }

  function renderStatic(){
    renderer.render(scene, camera);
  }

  function throwDice(){
    if(animating) return;
    animating = true;

    diceMeshes.forEach((mesh, i)=>{
      const angle = Math.random() * Math.PI * 2;
      const spread = 0.4 + Math.random()*0.5;
      mesh.position.set(Math.cos(angle)*spread, 3.2 + Math.random()*0.8, Math.sin(angle)*spread);
      mesh.rotation.set(Math.random()*Math.PI*2, Math.random()*Math.PI*2, Math.random()*Math.PI*2);

      const body = diceBodies[i];
      body.vel.set(
        (Math.random()-0.5)*6.0,
        4.5 + Math.random()*1.5,
        (Math.random()-0.5)*6.0
      );
      body.angVel.set(
        (Math.random()-0.5)*42,
        (Math.random()-0.5)*42,
        (Math.random()-0.5)*42
      );
      body.rest = false;
      body.restTimer = 0;
    });

    let lastT = performance.now();
    const maxSteps = 60 * 6; // safety cap (~6s)
    let steps = 0;

    function step(){
      const now = performance.now();
      let dt = (now - lastT) / 1000;
      dt = Math.min(dt, 1/30);
      lastT = now;
      steps++;

      let allRest = true;
      const floorLevel = floorY + DICE_SIZE*0.5;

      diceMeshes.forEach((mesh, i)=>{
        const body = diceBodies[i];
        if(body.rest){ return; }
        allRest = false;

        body.vel.y += GRAVITY * dt;
        mesh.position.x += body.vel.x * dt;
        mesh.position.y += body.vel.y * dt;
        mesh.position.z += body.vel.z * dt;

        mesh.rotation.x += body.angVel.x * dt;
        mesh.rotation.y += body.angVel.y * dt;
        mesh.rotation.z += body.angVel.z * dt;

        // floor collision
        if(mesh.position.y <= floorLevel){
          mesh.position.y = floorLevel;
          if(body.vel.y < 0){
            body.vel.y *= -0.55; // bounce damping
          }
          body.vel.x *= 0.88;
          body.vel.z *= 0.88;
          body.angVel.multiplyScalar(0.86);

          if(Math.abs(body.vel.y) < 0.55 && Math.abs(body.vel.x) < 0.25 && Math.abs(body.vel.z) < 0.25){
            body.vel.y = 0;
          }
        }

        // bowl wall collision (soft circular boundary)
        const distFromCenter = Math.sqrt(mesh.position.x**2 + mesh.position.z**2);
        const wallLimit = bowlRadius - DICE_SIZE*0.5;
        if(distFromCenter > wallLimit){
          const nx = mesh.position.x / distFromCenter;
          const nz = mesh.position.z / distFromCenter;
          mesh.position.x = nx * wallLimit;
          mesh.position.z = nz * wallLimit;
          const vDotN = body.vel.x*nx + body.vel.z*nz;
          body.vel.x -= 1.5 * vDotN * nx;
          body.vel.z -= 1.5 * vDotN * nz;
          body.vel.x *= 0.7;
          body.vel.z *= 0.7;
        }

        // general damping (air/surface friction)
        body.vel.x *= 0.992;
        body.vel.z *= 0.992;
        body.angVel.multiplyScalar(0.978);
      });

      // dice-dice collision
      const minDist = DICE_SIZE * 1.05;
      for(let a = 0; a < diceMeshes.length; a++){
        for(let b = a+1; b < diceMeshes.length; b++){
          const pa = diceMeshes[a].position, pb = diceMeshes[b].position;
          const dx = pb.x - pa.x, dy = pb.y - pa.y, dz = pb.z - pa.z;
          const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
          if(dist < minDist && dist > 0.001){
            const nx = dx/dist, ny = dy/dist, nz = dz/dist;
            const overlap = (minDist - dist) * 0.5;
            pa.x -= nx*overlap; pa.y -= ny*overlap; pa.z -= nz*overlap;
            pb.x += nx*overlap; pb.y += ny*overlap; pb.z += nz*overlap;
            const ba = diceBodies[a], bb = diceBodies[b];
            const dvx = bb.vel.x - ba.vel.x, dvy = bb.vel.y - ba.vel.y, dvz = bb.vel.z - ba.vel.z;
            const vDotN = dvx*nx + dvy*ny + dvz*nz;
            if(vDotN < 0){
              const imp = vDotN * 0.55;
              ba.vel.x += imp*nx; ba.vel.y += imp*ny; ba.vel.z += imp*nz;
              bb.vel.x -= imp*nx; bb.vel.y -= imp*ny; bb.vel.z -= imp*nz;
            }
          }
        }
      }

      diceMeshes.forEach((mesh, i)=>{
        const body = diceBodies[i];
        if(body.rest){ return; }

        // settle detection
        const speed = body.vel.length();
        const angSpeed = body.angVel.length();
        const onFloor = mesh.position.y <= floorLevel + 0.01;

        if(onFloor && speed < 0.12 && angSpeed < 0.35){
          body.restTimer += dt;
          if(body.restTimer > 0.18){
            body.rest = true;
            snapRotation(mesh);
          }
        } else {
          body.restTimer = 0;
        }
      });

      renderer.render(scene, camera);

      if(!allRest && steps < maxSteps){
        requestAnimationFrame(step);
      } else {
        // force-settle any stragglers
        diceMeshes.forEach((mesh)=>{ snapRotation(mesh); });
        renderer.render(scene, camera);
        animating = false;
        const eyes = diceMeshes.map(readTopFace);
        if(typeof Dice3D.onSettled === 'function'){
          Dice3D.onSettled(eyes);
        }
      }
    }

    requestAnimationFrame(step);
  }

  // Snap die rotation so it rests flat on a face (visual cleanup after physics stop)
  function snapRotation(mesh){
    const snap = (a)=> Math.round(a / (Math.PI/2)) * (Math.PI/2);
    mesh.rotation.x = snap(mesh.rotation.x);
    mesh.rotation.y = snap(mesh.rotation.y);
    mesh.rotation.z = snap(mesh.rotation.z);
  }

  // Determine which face value points up (+Y world) after rotation
  function readTopFace(mesh){
    const faceNormals = [
      new THREE.Vector3(1,0,0),  // px -> value FACE_VALUES[0]
      new THREE.Vector3(-1,0,0), // nx
      new THREE.Vector3(0,1,0),  // py
      new THREE.Vector3(0,-1,0), // ny
      new THREE.Vector3(0,0,1),  // pz
      new THREE.Vector3(0,0,-1), // nz
    ];
    let best = -Infinity;
    let bestIdx = 0;
    faceNormals.forEach((n, idx)=>{
      const world = n.clone().applyEuler(mesh.rotation);
      if(world.y > best){
        best = world.y;
        bestIdx = idx;
      }
    });
    return FACE_VALUES[bestIdx];
  }

  // 各出目を上面に向ける基本回転（Euler XYZ）
  // FACE_VALUES = [1,6,2,5,3,4] → +x=1,-x=6,+y=2,-y=5,+z=3,-z=4
  const VALUE_BASE_EULER = {
    1: [ 0,           0,  Math.PI/2],  // +x → +y: Rz(+90°)
    6: [ 0,           0, -Math.PI/2],  // -x → +y: Rz(-90°)
    2: [ 0,           0,  0        ],  // +y → +y: そのまま
    5: [ Math.PI,     0,  0        ],  // -y → +y: Rx(180°)
    3: [-Math.PI/2,   0,  0        ],  // +z → +y: Rx(-90°)
    4: [ Math.PI/2,   0,  0        ],  // -z → +y: Rx(+90°)
  };

  // 指定した出目配列に合わせてサイコロの向きを更新する
  function setDiceToValues(values){
    values.forEach((v, i) => {
      const mesh = diceMeshes[i];
      const [rx, , rz] = VALUE_BASE_EULER[v];
      const qBase = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz));
      // ワールドY軸周りにランダム回転（上面を維持したまま向きを変える）
      const randomY = Math.floor(Math.random() * 4) * (Math.PI / 2);
      const qWorldY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), randomY);
      mesh.setRotationFromQuaternion(qWorldY.multiply(qBase));
    });
    renderer.render(scene, camera);
  }

  Dice3D.init = init;
  Dice3D.throwDice = throwDice;
  Dice3D.resetBodies = resetBodies;
  Dice3D.renderStatic = renderStatic;
  Dice3D.resize = resize;
  Dice3D.isAnimating = ()=> animating;
  Dice3D.setDiceToValues = setDiceToValues;

  window.Dice3D = Dice3D;
})();
