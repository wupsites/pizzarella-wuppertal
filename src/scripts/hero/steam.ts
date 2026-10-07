/**
 * Dampf von der Pizza: ein Shader auf einer eigenen, reduziert aufgelösten
 * Fläche (Dampf ist weich, volle Auflösung bringt nichts). Die Fläche liegt HINTER Pizza
 * und Schrift: der Dampf steigt hinter dem Rand auf und legt sich nie wie
 * ein Filter über Essen oder Headline.
 *
 * Dichte: 3D-Rauschen, das sich beim Aufsteigen selbst verwirbelt (kein
 * gleitendes Muster), dünne Fahnen aus wenigen heißen Stellen.
 * Licht: sichtbar fast nur im Gegenlicht der Ofenglut (Vorwärtsstreuung),
 * wie echter Dampf vor dunklem Grund; der Spot von oben hellt leicht auf.
 */

export interface SteamView {
  time: number;
  /** Oberseite der Pizza: Mitte x/y und Radien in CSS-Pixeln (Hero) */
  ell: [number, number, number, number];
  /** Ofenglut: x/y in CSS-Pixeln, Stärke */
  oven: [number, number, number];
  /** Spot von oben: x der Spitze, Neigung (rad), Stärke */
  beam: [number, number, number];
  /** Gesamtmenge 0–1 (blendet beim Verlassen aus) */
  amount: number;
}

export interface Steam {
  resize(cssW: number, cssH: number): void;
  /** Auflösungsfaktor 0.7–1 (Sicherheitsnetz für schwache GPUs) */
  setQuality(q: number): void;
  draw(v: SteamView): void;
}

const VERT = `
attribute vec2 aP;
void main() { gl_Position = vec4(aP, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uScale;
uniform float uTime;
uniform vec4 uEll;
uniform vec3 uOven;
uniform vec3 uBeam;
uniform float uAmt;

float hash3(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
float fbm3(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * noise3(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}

void main() {
  // CSS-Pixel, y nach unten
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uScale;
  float R = uEll.z;
  vec2 q = (px - uEll.xy) / R;
  // Höhe über der Mitte der Oberseite, in Pizzaradien (der Fuß liegt hinter der Pizza)
  float h = -q.y;
  const float TOP = 1.15;
  if (h < 0.05 || h > TOP) { gl_FragColor = vec4(0.0); return; }
  // hinter der Pizza sieht man nichts: dort gar nicht erst rechnen
  vec2 e = (px - uEll.xy) / uEll.zw;
  if (dot(e, e) < 0.92) { gl_FragColor = vec4(0.0); return; }

  float t = uTime;
  // Säule über der Pizza, oben etwas breiter
  float sway = sin(h * 2.1 + t * 0.35) * 0.06 * h;
  float side = exp(-pow(abs(q.x + sway) / (0.52 + 0.38 * h), 3.0));
  float rise = smoothstep(0.12, 0.5, h) * pow(max(1.0 - h / TOP, 0.0), 1.6);
  if (side * rise < 0.01) { gl_FragColor = vec4(0.0); return; }
  // wenige Fahnen: heiße Stellen, die langsam wandern
  float src = smoothstep(0.52, 0.86, noise3(vec3((q.x + sway) * 2.4 + 3.0, 0.0, t * 0.045)));

  // Strömung: steigt langsam, das Wirbelfeld verändert sich dabei selbst
  vec3 p = vec3(q.x * 3.4, h * 2.8 - t * 0.2, t * 0.08);
  vec2 w = vec2(fbm3(p * 0.7), fbm3(p * 0.7 + vec3(5.2, 1.3, 2.7)));
  float n = fbm3(p + vec3((w - 0.5) * (1.2 + 1.8 * h), 0.0));
  // dünne Schwaden statt Wolken: Grate des Rauschens
  float ridge = 1.0 - abs(2.0 * n - 1.0);
  float wisps = pow(ridge, 11.0) * smoothstep(0.3, 0.62, n);
  float d = wisps * side * rise * (0.1 + 0.9 * src);

  // Licht: Gegenlicht der Glut (Vorwärtsstreuung) + etwas Spot von oben
  vec2 o = (px - uOven.xy) / R;
  float back = exp(-dot(o, o) * 1.1) * uOven.z;
  float bx = px.x - (uBeam.x + px.y * tan(uBeam.y));
  float cone = 0.12 * uRes.x / uScale + px.y * 0.42;
  float spot = exp(-pow(bx / max(cone, 1.0), 2.0) * 2.2) * uBeam.z;
  float vis = 0.1 + 0.85 * back + 0.2 * spot;
  vec3 col = mix(vec3(1.0, 0.95, 0.88), vec3(1.0, 0.74, 0.48), clamp(back * 0.6, 0.0, 0.7));
  float a = clamp(d * vis * uAmt * 1.5, 0.0, 0.4);
  // Dampf streut Licht (heller), schluckt kaum
  gl_FragColor = vec4(col * a, a * 0.25);
}`;

export function createSteam(canvas: HTMLCanvasElement, maxDpr: number): Steam | null {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return null;
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  let prog: WebGLProgram;
  try {
    prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
  } catch (e) {
    console.warn('[hero] Dampf nicht verfügbar', e);
    return null;
  }
  gl.useProgram(prog);
  const b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aP = gl.getAttribLocation(prog, 'aP');
  gl.enableVertexAttribArray(aP);
  gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);
  const u = (n: string) => gl.getUniformLocation(prog, n);
  const U = { res: u('uRes'), scale: u('uScale'), time: u('uTime'), ell: u('uEll'), oven: u('uOven'), beam: u('uBeam'), amt: u('uAmt') };
  let scale = 1;
  let quality = 1;
  let cssSize: [number, number] = [0, 0];

  return {
    resize(cssW, cssH) {
      cssSize = [cssW, cssH];
      // reduzierte Auflösung: Dampf ist weich, die feinen Fäden brauchen aber etwas Schärfe
      scale = Math.min(window.devicePixelRatio || 1, maxDpr) * 0.6 * quality;
      canvas.width = Math.max(1, Math.round(cssW * scale));
      canvas.height = Math.max(1, Math.round(cssH * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    setQuality(q) {
      quality = q;
      if (cssSize[0]) this.resize(...cssSize);
    },
    draw(v) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (v.amount <= 0.001) return;
      gl.uniform2f(U.res, canvas.width, canvas.height);
      gl.uniform1f(U.scale, scale);
      gl.uniform1f(U.time, v.time);
      gl.uniform4f(U.ell, ...v.ell);
      gl.uniform3f(U.oven, ...v.oven);
      gl.uniform3f(U.beam, ...v.beam);
      gl.uniform1f(U.amt, v.amount);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
