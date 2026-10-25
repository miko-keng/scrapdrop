import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Kit } from "./model";
import { Art } from "./ProjectArt";
type Props = {
  kit: Kit;
  presentation?: boolean;
  exploded?: boolean;
  selected?: string;
  step?: number;
  onSelect?: (id: string) => void;
  reset?: number;
};
export default function KitViewer({
  kit,
  presentation = false,
  exploded = false,
  selected = "",
  step = 0,
  onSelect,
  reset = 0,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    runtime = useRef<any>(null),
    select = useRef(onSelect),
    [failed, setFailed] = useState(false);
  select.current = onSelect;
  useEffect(() => {
    if (!host.current) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0, 0);
    host.current.appendChild(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(35, 1, 1, 3000),
      controls = new OrbitControls(camera, renderer.domElement);
    camera.zoom = presentation ? 1.65 : 1.08;
    camera.updateProjectionMatrix();
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.minDistance = 120;
    controls.maxDistance = 1600;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.enablePan = false;
    scene.add(new THREE.HemisphereLight(0xfff8e9, 0x87927f, 3));
    const key = new THREE.DirectionalLight(0xfff7e7, 3.1);
    key.position.set(150, 250, 180);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 1.2);
    fill.position.set(-200, 100, -100);
    scene.add(fill);
    // Original procedural surface studies; illustrative grain, never uploaded photos.
    const surfaceTextures = new Map<string, THREE.CanvasTexture>();
    function surface(type: string) {
      if (surfaceTextures.has(type)) return surfaceTextures.get(type)!;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext("2d")!;
      const pixels = ctx.createImageData(128, 128);
      let seed = 19;
      for (let y = 0; y < 128; y++)
        for (let x = 0; x < 128; x++) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          const fiber =
            type === "fabric"
              ? (x % 4 === 0 ? 25 : 0) + (y % 4 === 0 ? 20 : 0)
              : type === "ribbon"
                ? x % 3 === 0
                  ? 24
                  : 0
                : 0;
          const v = 135 + (seed % 45) + fiber,
            i = (y * 128 + x) * 4;
          pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v;
          pixels.data[i + 3] = 255;
        }
      ctx.putImageData(pixels, 0, 0);
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(type === "card" ? 5 : 3, type === "card" ? 5 : 3);
      surfaceTextures.set(type, texture);
      return texture;
    }
    const group = new THREE.Group();
    scene.add(group);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 64),
      new THREE.MeshBasicMaterial({
        color: 0x42513e,
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -3;
    scene.add(shadow);
    let meshes: THREE.Mesh[] = [],
      visible = true,
      movingUntil = Date.now() + 1500;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ray = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    let start = [0, 0];
    function down(e: PointerEvent) {
      start = [e.clientX, e.clientY];
    }
    function click(e: PointerEvent) {
      if (Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 5) return;
      const box = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - box.left) / box.width) * 2 - 1,
        (-(e.clientY - box.top) / box.height) * 2 + 1,
      );
      ray.setFromCamera(pointer, camera);
      const hit = ray
        .intersectObjects(meshes)
        .find((h) => !h.object.userData.context);
      if (hit) select.current?.(hit.object.userData.stockId);
    }
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointerup", click);
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive three-dimensional project preview. Drag to rotate, scroll to zoom. Named material controls are below.",
    );
    renderer.domElement.setAttribute("role", "img");
    const resize = new ResizeObserver(() => {
      if (!host.current) return;
      const w = host.current.clientWidth,
        h = host.current.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      movingUntil = Date.now() + 1000;
    });
    resize.observe(host.current);
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      movingUntil = Date.now() + 1000;
    });
    observer.observe(host.current);
    controls.addEventListener("change", () => {
      movingUntil = Date.now() + 800;
    });
    function disposeGroup() {
      group.traverse((o: any) => {
        o.geometry?.dispose();
        if (o.material) {
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            m.dispose();
        }
      });
      group.clear();
      meshes = [];
    }
    const resetCamera = () => {
      const box = new THREE.Box3();
      for (const mesh of meshes) {
        const half = new THREE.Vector3(...mesh.userData.size).multiplyScalar(
          0.5,
        );
        box.expandByPoint(mesh.userData.target.clone().add(half));
        box.expandByPoint(mesh.userData.target.clone().sub(half));
      }
      const center = box.getCenter(new THREE.Vector3()),
        size = box.getSize(new THREE.Vector3()),
        s = Math.max(size.x / Math.min(camera.aspect, 1.4), size.y, size.z, 85);
      controls.target.copy(center);
      camera.position.set(
        center.x + s * 1.45,
        center.y + s * 1.1,
        center.z + s * 1.85,
      );
      controls.update();
      movingUntil = Date.now() + 1500;
    };
    runtime.current = {
      update: (k: Kit, explode: boolean, chosen: string, assembly: number) => {
        const previousByIndex = meshes.map((mesh) => ({
          position: mesh.position.clone(),
          color: (mesh.material as THREE.MeshStandardMaterial).color.clone(),
        }));
        disposeGroup();
        for (const part of k.parts) {
          const geometry = new THREE.BoxGeometry(...part.size),
            material = new THREE.MeshStandardMaterial({
              color: part.color,
              roughness:
                k.materials.find((m) => m.id === part.stockId)?.type ===
                "fabric"
                  ? 0.97
                  : 0.84,
              bumpMap: part.context
                ? null
                : surface(
                    k.materials.find((m) => m.id === part.stockId)?.type ||
                      "card",
                  ),
              bumpScale: 0.12,
              metalness: 0,
              transparent: !!part.context,
              opacity: part.context ? 0.6 : 1,
            });
          const mesh = new THREE.Mesh(geometry, material);
          const old = previousByIndex[meshes.length];
          mesh.position.copy(
            old?.position || new THREE.Vector3(...part.position),
          );
          if (old) material.color.copy(old.color);
          mesh.userData = {
            ...part,
            targetColor: new THREE.Color(part.color),
            target: new THREE.Vector3(
              ...(explode ? part.exploded : part.position),
            ),
          };
          if (assembly > 0 && !part.context) {
            const i = k.parts.indexOf(part),
              limit = Math.ceil((k.parts.length * assembly) / 4);
            if (i >= limit) {
              mesh.userData.target = new THREE.Vector3(...part.exploded);
              material.opacity = 0.18;
              material.transparent = true;
            }
          }
          if (chosen && part.stockId !== chosen && !part.context) {
            material.opacity = 0.38;
            material.transparent = true;
          }
          const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(geometry),
            new THREE.LineBasicMaterial({
              color: new THREE.Color(part.color).multiplyScalar(0.7),
              transparent: true,
              opacity: 0.42,
            }),
          );
          mesh.add(edges);
          group.add(mesh);
          meshes.push(mesh);
        }
        shadow.scale.set(
          k.config.width * 0.9 + 30,
          (k.template.id === "giftbox" ? k.config.depth : k.config.height) *
            0.8 +
            22,
          1,
        );
        movingUntil = Date.now() + 1800;
      },
      reset: resetCamera,
    };
    let lastTemplate = "",
      lastMode = "";
    runtime.current.setKit = (k: Kit, e: boolean, s: string, a: number) => {
      runtime.current.update(k, e, s, a);
      const mode = `${e}:${a}:${k.config.width}:${k.config.depth}:${k.config.height}`;
      if (lastTemplate !== k.template.id || lastMode !== mode) {
        resetCamera();
        lastTemplate = k.template.id;
        lastMode = mode;
      }
    };
    renderer.setAnimationLoop(() => {
      if (!visible || document.hidden) return;
      controls.update();
      if (Date.now() > movingUntil) return;
      for (const mesh of meshes) {
        mesh.position.lerp(mesh.userData.target, reduced ? 1 : 0.1);
        (mesh.material as THREE.MeshStandardMaterial).color.lerp(
          mesh.userData.targetColor,
          reduced ? 1 : 0.12,
        );
      }
      renderer.render(scene, camera);
    });
    const lost = (e: Event) => {
      e.preventDefault();
      setFailed(true);
    };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    return () => {
      runtime.current = null;
      resize.disconnect();
      observer.disconnect();
      controls.dispose();
      renderer.setAnimationLoop(null);
      disposeGroup();
      surfaceTextures.forEach((texture) => texture.dispose());
      shadow.geometry.dispose();
      (shadow.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointerup", click);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      renderer.domElement.remove();
    };
  }, []);
  useEffect(() => {
    runtime.current?.setKit(kit, exploded, selected, step);
  }, [kit, exploded, selected, step, failed]);
  useEffect(() => {
    runtime.current?.reset();
  }, [reset]);
  return (
    <div className="sd-viewer" ref={host}>
      {failed && (
        <div className="sd-view-fallback">
          <Art kit={kit} />
          <p>2D design illustration · 3D is unavailable on this device.</p>
          <span>See the exact cutting diagram and dimensions below.</span>
        </div>
      )}
    </div>
  );
}
