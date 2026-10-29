import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Recipe } from "./engine";
export default function RecipeScene({
  recipe,
  color,
  thickness,
  fold,
  replay,
  reduced,
  onFailure,
  selected,
}: {
  recipe: Recipe;
  color: string;
  thickness: number;
  fold: number;
  replay: number;
  reduced: boolean;
  onFailure: () => void;
  selected?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let frame = 0,
      renderer: THREE.WebGLRenderer | undefined,
      controls: OrbitControls | undefined,
      resize: ResizeObserver | undefined;
    const scene = new THREE.Scene();
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.domElement.setAttribute("role", "img");
      renderer.domElement.setAttribute(
        "aria-label",
        `${recipe.product.name}: measured panels with animated fold hinges. Equivalent cutting diagram and making steps follow.`,
      );
      el.append(renderer.domElement);
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 10000),
        extent = Math.max(recipe.blank.width, recipe.blank.length);
      camera.position.set(extent * 0.9, extent * 0.9, extent * 1.2);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.minDistance = 20;
      controls.maxDistance = 3000;
      scene.add(new THREE.HemisphereLight(0xffffff, 0x7d806d, 3));
      const light = new THREE.DirectionalLight(0xffffff, 3);
      light.position.set(300, 600, 400);
      scene.add(light);
      const root = new THREE.Group();
      root.rotation.x = -Math.PI / 2;
      scene.add(root);
      const nodes = new Map<string, THREE.Group>();
      recipe.panels.forEach((p) => {
        const node = new THREE.Group();
        if (p.parent) {
          const parent = recipe.panels.find((q) => q.id === p.parent)!;
          nodes.get(p.parent)!.add(node);
          node.position.set(p.x - parent.x, p.y - parent.y, 0);
        } else root.add(node);
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(p.width, 0);
        shape.lineTo(p.width, p.length);
        shape.lineTo(0, p.length);
        shape.closePath();
        for (const h of recipe.holes.filter(
          (h) => h.y >= p.y && h.y <= p.y + p.length,
        )) {
          const hole = new THREE.Path();
          hole.absarc(h.x - p.x, h.y - p.y, h.radius, 0, Math.PI * 2, true);
          shape.holes.push(hole);
        }
        const mesh = new THREE.Mesh(
          new THREE.ExtrudeGeometry(shape, {
            depth: thickness,
            bevelEnabled: false,
          }),
          new THREE.MeshStandardMaterial({
            color: selected === p.id ? "#d6d955" : p.tab ? "#d8b980" : color,
            roughness: 0.85,
            side: THREE.DoubleSide,
          }),
        );
        node.add(mesh);
        mesh.add(
          new THREE.LineSegments(
            new THREE.EdgesGeometry(mesh.geometry),
            new THREE.LineBasicMaterial({
              color: "#30483a",
              transparent: true,
              opacity: 0.65,
            }),
          ),
        );
        nodes.set(p.id, node);
      });
      const started = performance.now();
      const animate = () => {
        const progress = reduced
          ? fold
          : fold * Math.min(1, (performance.now() - started) / 850);
        for (const p of recipe.panels) {
          nodes.get(p.id)!.rotation.x = THREE.MathUtils.degToRad(
            (p.parent ? p.angle : p.rootAngle) * progress,
          );
        }
        root.updateMatrixWorld(true);
        root.position.set(0, 0, 0);
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root),
          center = box.getCenter(new THREE.Vector3());
        root.position.copy(center.multiplyScalar(-1));
        controls!.update();
        renderer!.render(scene, camera);
        frame = requestAnimationFrame(animate);
      };
      resize = new ResizeObserver(() => {
        const w = el.clientWidth,
          h = el.clientHeight || 400;
        renderer!.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      });
      resize.observe(el);
      renderer.domElement.addEventListener("webglcontextlost", onFailure, {
        once: true,
      });
      animate();
    } catch {
      onFailure();
    }
    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      controls?.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          o.geometry.dispose();
          const m = o.material;
          for (const material of Array.isArray(m) ? m : [m]) material.dispose();
        }
      });
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, [recipe, color, thickness, fold, replay, reduced, selected]);
  return <div className="mfg-scene" ref={host} />;
}
