import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Kit } from "./model";
import { giftBoxPanels } from "./recipes";
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export default function TutorialScene({
  kit,
  step,
  replay,
  resetView,
  paused,
  reduced,
  onFailure,
}: {
  kit: Kit;
  step: number;
  replay: number;
  resetView: number;
  paused: boolean;
  reduced: boolean;
  onFailure: () => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    pause = useRef(paused),
    previous = useRef(step),
    resetCamera = useRef<() => void>(() => {});
  pause.current = paused;
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let frame = 0,
      renderer: THREE.WebGLRenderer | undefined,
      resize: ResizeObserver | undefined,
      controls: OrbitControls | undefined;
    const scene = new THREE.Scene();
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setClearColor(0, 0);
      renderer.domElement.setAttribute(
        "aria-label",
        "Animated making step. Drag to rotate. Use the numbered step controls and 2D guide for equivalent instructions.",
      );
      renderer.domElement.setAttribute("role", "img");
      el.appendChild(renderer.domElement);
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 20000),
        [w, d, h] = kit.finished;
      const extent =
        step < 3
          ? Math.max(kit.cut.width, kit.cut.height)
          : Math.max(w, d, h) * 1.7;
      camera.position.set(extent * 0.9, extent * 1.1, extent * 1.3);
      camera.lookAt(0, h / 3, 0);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, step < 3 ? 0 : h / 3, 0);
      controls.saveState();
      resetCamera.current = () => controls?.reset();
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.minDistance = 30;
      controls.maxDistance = 6000;
      scene.add(new THREE.HemisphereLight(0xffffff, 0x777366, 2.8));
      const light = new THREE.DirectionalLight(0xffffff, 2.5);
      light.position.set(-300, 500, 300);
      scene.add(light);
      const material =
          kit.batch?.plan.allocations.find((a) => a.type !== "ribbon")?.color ||
          kit.materials[0].color,
        ribbon =
          kit.batch?.plan.allocations.find((a) => a.type === "ribbon")?.color ||
          kit.materials[1].color;
      function box(
        parent: THREE.Object3D,
        size: [number, number, number],
        pos: [number, number, number],
        color = material,
      ) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(...size),
          new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
        );
        mesh.position.set(...pos);
        parent.add(mesh);
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(mesh.geometry),
          new THREE.LineBasicMaterial({
            color: 0x344d40,
            transparent: true,
            opacity: 0.5,
          }),
        );
        mesh.add(edges);
        return mesh;
      }
      const root = new THREE.Group();
      scene.add(root);
      const hinges: {
        group: THREE.Group;
        axis: "x" | "z";
        angle: number;
        phase: number;
        offset?: number;
      }[] = [];
      function hinge(
        parent: THREE.Object3D,
        pos: [number, number, number],
        axis: "x" | "z",
        angle: number,
        phase: number,
      ) {
        const group = new THREE.Group();
        group.position.set(...pos);
        parent.add(group);
        hinges.push({ group, axis, angle, phase });
        return group;
      }
      const ribbons = new THREE.Group();
      root.add(ribbons);
      const ribbonGeometries: THREE.BufferGeometry[] = [];
      function ribbonPath(points: number[][], closed = true) {
        const curve = new THREE.CatmullRomCurve3(
          points.map(
            (p) => new THREE.Vector3(...(p as [number, number, number])),
          ),
          closed,
          "centripetal",
        );
        const g = new THREE.TubeGeometry(
          curve,
          100,
          Math.max(0.7, kit.materials[1].width / 9),
          5,
          false,
        );
        ribbonGeometries.push(g);
        ribbons.add(
          new THREE.Mesh(
            g,
            new THREE.MeshStandardMaterial({ color: ribbon, roughness: 0.9 }),
          ),
        );
      }
      let second: THREE.Object3D | undefined,
        notebook: THREE.Object3D | undefined,
        punch: THREE.Object3D | undefined;
      const holeCaps: THREE.Object3D[] = [];
      if (kit.template.id === "giftbox") {
        box(root, [w, 0.7, d], [0, 0, 0]);
        const groups = new Map<string, THREE.Object3D>([["base", root]]);
        for (const p of giftBoxPanels(w, d, h)) {
          const group = hinge(
            groups.get(p.parent)!,
            p.pivot,
            p.axis,
            p.angle,
            p.phase,
          );
          groups.set(p.id, group);
          hinges.find((x) => x.group === group)!.offset = p.offset;
          box(
            group,
            p.size,
            p.center,
            p.id.includes("tab") && step === 4 ? "#d98b56" : material,
          );
        }
        ribbonPath([
          [-w / 2 - 2, h + 2, 0],
          [-w / 2 - 2, -2, 0],
          [w / 2 + 2, -2, 0],
          [w / 2 + 2, h + 2, 0],
        ]);
        ribbonPath([
          [0, h + 2, -d / 2 - 2],
          [0, -2, -d / 2 - 2],
          [0, -2, d / 2 + 2],
          [0, h + 2, d / 2 + 2],
        ]);
        const bow = box(ribbons, [w / 4, 1.5, 6], [0, h + 4, 0], ribbon);
        bow.rotation.y = 0.45;
      } else if (kit.template.id === "wrap") {
        box(root, [h, 0.6, d], [0, 0, 0]);
        for (const sign of [-1, 1]) {
          const cover = hinge(
            root,
            [(sign * h) / 2, 0, 0],
            "z",
            (sign * Math.PI) / 2,
            5,
          );
          box(cover, [w, 0.6, d], [(sign * w) / 2, 0, 0]);
          const pocket = hinge(
            cover,
            [sign * w, 0, 0],
            "z",
            -sign * Math.PI,
            4,
          );
          box(pocket, [30, 0.5, d], [sign * 15, 0.4, 0]);
          for (const end of [-1, 1]) {
            const hem = hinge(
              cover,
              [(sign * w) / 2, 0, (end * d) / 2],
              "x",
              end * Math.PI,
              3,
            );
            box(hem, [w, 0.5, 20], [0, 0, end * 10]);
          }
        }
        notebook = box(
          root,
          [Math.max(1, h - 2), w - 2, d - 2],
          [0, w / 2, 0],
          "#fff9e8",
        );
        ribbonPath([
          [-h / 2 - 2, w * 0.6, -d / 2 - 2],
          [-h / 2 - 2, w * 0.6, d / 2 + 2],
          [h / 2 + 2, w * 0.6, d / 2 + 2],
          [h / 2 + 2, w * 0.6, -d / 2 - 2],
        ]);
      } else {
        const layer = kit.materials[0].thickness;
        function strip(parent: THREE.Object3D) {
          const shape = new THREE.Shape();
          shape.moveTo(-w / 2, -d / 2);
          shape.lineTo(w / 2, -d / 2);
          shape.lineTo(w / 2, d / 2);
          shape.lineTo(-w / 2, d / 2);
          shape.closePath();
          const hole = new THREE.Path();
          hole.absarc(0, d / 2 - 12, 2, 0, Math.PI * 2, true);
          shape.holes.push(hole);
          const geom = new THREE.ExtrudeGeometry(shape, {
            depth: layer,
            bevelEnabled: false,
          });
          const mesh = new THREE.Mesh(
            geom,
            new THREE.MeshStandardMaterial({
              color: material,
              roughness: 0.85,
            }),
          );
          mesh.rotation.x = -Math.PI / 2;
          parent.add(mesh);
          const cap = new THREE.Mesh(
            new THREE.CircleGeometry(2, 24),
            new THREE.MeshStandardMaterial({ color: material }),
          );
          cap.rotation.x = -Math.PI / 2;
          cap.position.set(0, layer + 0.02, -d / 2 + 12);
          parent.add(cap);
          holeCaps.push(cap);
          return mesh;
        }
        strip(root);
        second = new THREE.Group();
        root.add(second);
        strip(second);
        punch = box(root, [8, 18, 8], [0, 30, -d / 2 + 12], "#db9b63");
        ribbonPath(
          [
            [0, layer * 2 + 2, -d / 2 + 12],
            [0, 8, -d / 2 - 20],
            [10, 4, -d / 2 - 28],
            [0, 2, -d / 2 + 12],
            [-10, 4, -d / 2 - 28],
          ],
          false,
        );
      }
      const lines = new THREE.Group();
      root.add(lines);
      const cx =
          kit.template.id === "giftbox"
            ? h + 10 + w / 2
            : kit.template.id === "bookmark"
              ? w / 2
              : kit.cut.width / 2,
        cy =
          kit.template.id === "giftbox"
            ? h + 10 + d / 2
            : kit.template.id === "bookmark"
              ? d / 2
              : kit.cut.height / 2;
      for (const f of kit.cut.folds) {
        const geom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(f.x1 - cx, 1, f.y1 - cy),
          new THREE.Vector3(f.x2 - cx, 1, f.y2 - cy),
        ]);
        const line = new THREE.Line(
          geom,
          new THREE.LineDashedMaterial({
            color: 0x425ad2,
            dashSize: 4,
            gapSize: 2,
          }),
        );
        line.computeLineDistances();
        lines.add(line);
      }
      const grid = new THREE.GridHelper(
        Math.max(kit.cut.width, kit.cut.height) * 1.3,
        20,
        0xcac5a8,
        0xe4dec8,
      );
      grid.position.y = -4;
      scene.add(grid);
      resize = new ResizeObserver(() => {
        if (!renderer) return;
        const width = el.clientWidth || 600,
          height = el.clientHeight || 390;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      });
      resize.observe(el);
      let elapsed = 0,
        last = performance.now();
      const prior =
        previous.current === step ? Math.max(0, step - 1) : previous.current;
      previous.current = step;
      const tick = (now: number) => {
        frame = requestAnimationFrame(tick);
        if (!pause.current) elapsed += Math.min(50, now - last);
        last = now;
        const t = reduced ? 1 : clamp(elapsed / 1800),
          ease = t * t * (3 - 2 * t),
          phase = prior + (step - prior) * ease;
        for (const h of hinges) {
          const value =
            h.offset !== undefined
              ? clamp((phase - 2) * 4 - h.offset)
              : clamp(phase - h.phase + 1);
          h.group.rotation[h.axis] = h.angle * value;
        }
        if (second) {
          const mix = clamp(phase - 2);
          second.position.set(
            (w + 10) * (1 - mix),
            kit.materials[0].thickness * mix + Math.sin(mix * Math.PI) * 18,
            0,
          );
        }
        if (punch) {
          punch.visible = step === 4;
          punch.position.y = 25 - 20 * Math.sin(clamp(phase - 3) * Math.PI);
        }
        holeCaps.forEach((c) => (c.visible = phase < 3.8));
        if (notebook) notebook.visible = phase > 4.3;
        const ribbonPhase = kit.template.id === "bookmark" ? 5 : 6;
        ribbons.visible = phase > ribbonPhase - 1;
        for (const g of ribbonGeometries)
          g.setDrawRange(
            0,
            Math.floor(
              ((g.index?.count || 0) * clamp(phase - ribbonPhase + 1)) / 3,
            ) * 3,
          );
        lines.visible = step === 2 && phase < 3;
        controls?.update();
        renderer!.render(scene, camera);
      };
      frame = requestAnimationFrame(tick);
    } catch {
      onFailure();
    }
    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      controls?.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        if (m.material)
          (Array.isArray(m.material) ? m.material : [m.material]).forEach((v) =>
            v.dispose(),
          );
      });
      renderer?.dispose();
      el.replaceChildren();
    };
  }, [kit, step, replay, reduced]);
  useEffect(() => {
    resetCamera.current();
  }, [resetView]);
  return <div className="sd-tutorial-scene" ref={host} />;
}
