/**
 * Gemeinsame Geometrie der 3D-Pizza: Profil (Teigboden, Randwulst, Kante),
 * Kamera und Projektion. Wird vom Renderer, von den Hotspots und beim Build
 * (Lage im Layout) benutzt – daher ohne DOM-Abhängigkeiten.
 *
 * Einheiten: Pizzaradius = 1. Modell: x rechts, y oben, z zur Kamera.
 * Textur: u rechts, v unten (v wächst zur Kamera hin).
 */

export const TEX_RADIUS = 0.47; // Pizzaradius in der Textur (Anteil der Kantenlänge)
export const R_IN = 0.78; // hier beginnt der Rand
export const R_PEAK = 0.9; // höchste Stelle des Randes
export const H_BASE = 0.022; // Belagoberfläche über dem Boden
export const H_PEAK = 0.078; // Randhöhe
/** Lage im Foto: Rand innen → Kuppe → Außenkante (Textur wird nach Bogenlänge verteilt) */
export const TEX_PEAK = 0.9;
export const FOV_Y = (16 * Math.PI) / 180;
export const STAGE_AR = 1.5; // Breite/Höhe der Bühne
export const FIT = 1.09; // halbe Bildbreite in Pizzaradien
export const TARGET_Y = 0.05;
/** Kamerahöhe im Ruhezustand (rad) – Standbild und erster WebGL-Frame */
export const E0 = 0.42;

export type Vec3 = [number, number, number];
export type Mat4 = Float32Array;

export interface ProfilePoint {
  r: number;
  y: number;
  nr: number;
  ny: number;
  /** Radius im Foto, aus dem dieser Punkt seine Farbe holt */
  tr: number;
}

/** Querschnitt von der Mitte bis zur Unterkante */
export function profile(): ProfilePoint[] {
  const pts: { r: number; y: number }[] = [];
  const CENTER = 16;
  for (let i = 0; i <= CENTER; i++) {
    const r = (R_IN * i) / CENTER;
    // minimal tiefer in der Mitte (Belag sackt ein), sanft zum Rand
    pts.push({ r, y: H_BASE - 0.004 * (1 - (r / R_IN) ** 2) });
  }
  const RISE = 10;
  for (let i = 1; i <= RISE; i++) {
    const t = i / RISE;
    const e = t * t * (3 - 2 * t);
    pts.push({ r: R_IN + (R_PEAK - R_IN) * t, y: H_BASE + (H_PEAK - H_BASE) * Math.sin((e * Math.PI) / 2) });
  }
  const ROLL = 14;
  for (let i = 1; i <= ROLL; i++) {
    const phi = ((i / ROLL) * Math.PI) / 2;
    pts.push({ r: R_PEAK + (1 - R_PEAK) * Math.pow(Math.sin(phi), 0.6), y: H_PEAK * Math.cos(phi) });
  }
  // Fotoradius: Mitte planar, Rand nach Bogenlänge auf den Krustenring verteilt
  const arc = [0];
  for (let i = 1; i < pts.length; i++) arc.push(arc[i - 1] + Math.hypot(pts[i].r - pts[i - 1].r, pts[i].y - pts[i - 1].y));
  const iIn = CENTER;
  const iPeak = CENTER + RISE;
  const last = pts.length - 1;
  const tr = pts.map((p, i) => {
    if (i <= iIn) return p.r;
    if (i <= iPeak) return R_IN + ((TEX_PEAK - R_IN) * (arc[i] - arc[iIn])) / (arc[iPeak] - arc[iIn]);
    return TEX_PEAK + ((0.995 - TEX_PEAK) * (arc[i] - arc[iPeak])) / (arc[last] - arc[iPeak]);
  });
  // Normalen aus der Tangente (r, y) → (−dy, dr)
  return pts.map((p, i) => {
    const a = pts[Math.max(i - 1, 0)];
    const b = pts[Math.min(i + 1, pts.length - 1)];
    let nr = -(b.y - a.y);
    let ny = b.r - a.r;
    const l = Math.hypot(nr, ny) || 1;
    nr /= l;
    ny /= l;
    if (i === 0) [nr, ny] = [0, 1];
    return { ...p, nr, ny, tr: tr[i] };
  });
}

/** Höhe der Oberseite bei Radius r (0–1) */
export function heightAt(r: number): number {
  if (r <= R_IN) return H_BASE - 0.004 * (1 - (r / R_IN) ** 2);
  if (r <= R_PEAK) {
    const t = (r - R_IN) / (R_PEAK - R_IN);
    const e = t * t * (3 - 2 * t);
    return H_BASE + (H_PEAK - H_BASE) * Math.sin((e * Math.PI) / 2);
  }
  const s = Math.min(1, (r - R_PEAK) / (1 - R_PEAK));
  return H_PEAK * Math.cos(Math.asin(Math.pow(s, 1 / 0.6)));
}

/** Randhöhe je Winkel (Faktor um 1): unregelmäßig aufgegangener Teig */
export function rimPuff(theta: number): number {
  return 1 + 0.13 * Math.sin(3 * theta + 1.3) + 0.07 * Math.sin(7 * theta + 0.4) + 0.04 * Math.sin(13 * theta + 2.2);
}

/** Umrissfaktor je Winkel aus dem Profil (256 Werte, zyklisch) */
export function outline(prof: number[], theta: number): number {
  const n = prof.length;
  const f = (((theta + Math.PI) / (2 * Math.PI)) * n - 0.5 + n) % n;
  const i = Math.floor(f);
  const t = f - i;
  return prof[i % n] * (1 - t) + prof[(i + 1) % n] * t;
}

/** Texturpunkt → Modellpunkt auf der Oberseite */
export function uvToModel(u: number, v: number): Vec3 {
  const x = (u - 0.5) / TEX_RADIUS;
  const z = (v - 0.5) / TEX_RADIUS;
  return [x, heightAt(Math.hypot(x, z)), z];
}

export function distance(aspect: number): number {
  const tanX = Math.tan(FOV_Y / 2) * aspect;
  return FIT / tanX;
}

// ---------- Matrizen (spaltenweise, wie WebGL) ----------
export function perspective(fovy: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovy / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

export function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const zx = eye[0] - target[0];
  const zy = eye[1] - target[1];
  const zz = eye[2] - target[2];
  let l = Math.hypot(zx, zy, zz);
  const z: Vec3 = [zx / l, zy / l, zz / l];
  const x: Vec3 = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]];
  l = Math.hypot(...x);
  x[0] /= l;
  x[1] /= l;
  x[2] /= l;
  const y: Vec3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const m = new Float32Array(16);
  m[0] = x[0];
  m[4] = x[1];
  m[8] = x[2];
  m[1] = y[0];
  m[5] = y[1];
  m[9] = y[2];
  m[2] = z[0];
  m[6] = z[1];
  m[10] = z[2];
  m[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
  m[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
  m[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
  m[15] = 1;
  return m;
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
}

export function rotateY(a: number): Mat4 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const m = new Float32Array(16);
  m[0] = c;
  m[2] = -s;
  m[5] = 1;
  m[8] = s;
  m[10] = c;
  m[15] = 1;
  return m;
}

export interface Camera {
  eye: Vec3;
  model: Mat4;
  viewProj: Mat4;
}

/** yaw: Drehung der Pizza um die eigene Achse, elev: Kamerahöhe (rad) */
export function camera(yaw: number, elev: number, aspect: number): Camera {
  const d = distance(aspect);
  const eye: Vec3 = [0, TARGET_Y + d * Math.sin(elev), d * Math.cos(elev)];
  const view = lookAt(eye, [0, TARGET_Y, 0], [0, 1, 0]);
  const proj = perspective(FOV_Y, aspect, Math.max(0.1, d - 2.5), d + 2.5);
  return { eye, model: rotateY(yaw), viewProj: multiply(proj, view) };
}

/** Modellpunkt → Bildpunkt (0–1, y nach unten) */
export function project(cam: Camera, p: Vec3): [number, number] {
  const m = cam.model;
  const w = [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  const v = cam.viewProj;
  const x = v[0] * w[0] + v[4] * w[1] + v[8] * w[2] + v[12];
  const y = v[1] * w[0] + v[5] * w[1] + v[9] * w[2] + v[13];
  const q = v[3] * w[0] + v[7] * w[1] + v[11] * w[2] + v[15];
  return [(x / q) * 0.5 + 0.5, 0.5 - (y / q) * 0.5];
}

/** Bildpunkt (0–1) → Texturkoordinate auf der Belagebene, oder null */
export function unproject(cam: Camera, sx: number, sy: number, aspect: number): [number, number] | null {
  const d = distance(aspect);
  const tanY = Math.tan(FOV_Y / 2);
  const nx = (sx * 2 - 1) * tanY * aspect;
  const ny = (1 - sy * 2) * tanY;
  // Kamerabasis aus lookAt nachbauen
  const f: Vec3 = [-cam.eye[0], TARGET_Y - cam.eye[1], -cam.eye[2]];
  const fl = Math.hypot(...f);
  f[0] /= fl;
  f[1] /= fl;
  f[2] /= fl;
  const right: Vec3 = [-f[2], 0, f[0]];
  const rl = Math.hypot(...right);
  right[0] /= rl;
  right[2] /= rl;
  const up: Vec3 = [right[1] * f[2] - right[2] * f[1], right[2] * f[0] - right[0] * f[2], right[0] * f[1] - right[1] * f[0]];
  const dir: Vec3 = [f[0] + right[0] * nx + up[0] * ny, f[1] + right[1] * nx + up[1] * ny, f[2] + right[2] * nx + up[2] * ny];
  if (Math.abs(dir[1]) < 1e-6) return null;
  const t = (H_BASE - cam.eye[1]) / dir[1];
  if (t <= 0) return null;
  const wx = cam.eye[0] + dir[0] * t;
  const wz = cam.eye[2] + dir[2] * t;
  // Modell-Rotation rückgängig (rotateY transponiert)
  const m = cam.model;
  const x = m[0] * wx + m[2] * wz;
  const z = m[8] * wx + m[10] * wz;
  void d;
  return [0.5 + x * TEX_RADIUS, 0.5 + z * TEX_RADIUS];
}

/** Lage der Pizza in der Bühne bei Startansicht (Anteile 0–1), für das Layout */
export function stageLayout() {
  const cam = camera(0, E0, STAGE_AR);
  const far = project(cam, [0, H_PEAK, -1])[1];
  const near = project(cam, [0, 0, 1.02])[1];
  return { far, near };
}
