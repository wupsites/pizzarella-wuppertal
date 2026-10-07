/**
 * Dampf über der Pizza: ein Shader auf einer eigenen, halb aufgelösten
 * Fläche über dem ganzen Hero (Dampf ist weich, mehr Pixel bringen nichts).
 *
 * Dichte: verwirbeltes Rauschen, das nach oben zieht, aus der Oberseite der
 * Pizza (Ellipse, folgt jeder Drehung) aufsteigt, sich verbreitert und
 * verliert. Über dem Belag schwächer, damit nichts vernebelt wird.
 * Licht: Gegenlicht der Ofenglut (Vorwärtsstreuung – Dampf leuchtet, wo er
 * vor der Glut steht) und der Spot von oben als sichtbarer Lichtkegel.
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

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * noise(p);
    p = p * 2.02 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}

void main() {
  // CSS-Pixel, y nach unten
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uScale;
  float R = uEll.z;
  vec2 q = (px - uEll.xy) / R;
  // Höhe über dem vorderen Drittel der Oberseite, in Pizzaradien
  float h = -q.y + uEll.w / R * 0.35;
  const float TOP = 1.05;
  if (h < 0.0 || h > TOP) { gl_FragColor = vec4(0.0); return; }

  float t = uTime;
  // Säule: unten so breit wie die Pizza, oben breiter und lockerer
  float width = 0.66 + 0.36 * h;
  float sway = sin(h * 2.3 + t * 0.4) * 0.07 * h;
  float side = exp(-pow(abs(q.x + sway) / width, 3.0));
  float rise = smoothstep(0.0, 0.22, h) * pow(max(1.0 - h / TOP, 0.0), 1.3);
  // einzelne Fahnen: heiße Stellen auf der Pizza, die langsam wandern
  float src = smoothstep(0.46, 0.8, noise(vec2((q.x + sway) * 2.6 + 3.0, t * 0.05)));

  // Strömung: nach oben ziehen, mit langsam wanderndem Wirbelfeld
  vec2 p = vec2(q.x * 2.6, h * 2.4 - t * 0.3);
  vec2 w = vec2(fbm(p * 0.8 + vec2(0.0, t * 0.06)), fbm(p * 0.8 + vec2(5.2, 1.3 - t * 0.05)));
  float n = fbm(p + (w - 0.5) * (1.3 + 1.2 * h));
  // dünne Schwaden statt Wolken: Grate des Rauschens
  float ridge = 1.0 - abs(2.0 * n - 1.0);
  float wisps = pow(ridge, 8.0) * smoothstep(0.36, 0.62, n);

  // über dem Belag schwächer (Ellipse der Oberseite)
  vec2 e = (px - uEll.xy) / uEll.zw;
  float over = mix(0.4, 1.0, smoothstep(0.75, 1.15, length(e)));
  float d = wisps * side * rise * over * (0.12 + 0.88 * src);

  // Licht: Gegenlicht der Glut (Vorwärtsstreuung) + Spot von oben
  vec2 o = (px - uOven.xy) / R;
  float back = exp(-dot(o, o) * 1.35) * uOven.z;
  // Abstand zur Mittellinie des Spots (Spitze oben bei x = uBeam.x, Neigung uBeam.y)
  float bx = px.x - (uBeam.x + px.y * tan(uBeam.y));
  float cone = 0.12 * uRes.x / uScale + px.y * 0.42;
  float spot = exp(-pow(bx / max(cone, 1.0), 2.0) * 2.2) * uBeam.z;
  vec3 col = vec3(1.0, 0.97, 0.93) * (0.85 + 0.5 * spot) + vec3(1.0, 0.72, 0.45) * back * 0.9;
  float a = clamp(d * uAmt * 1.9, 0.0, 0.65);
  // Dampf streut vor allem Licht (heller), schluckt kaum – nie „schmutzig“ über dem Essen
  gl_FragColor = vec4(col * a, a * 0.3);
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

  return {
    resize(cssW, cssH) {
      // halbe Auflösung: Dampf ist weich, spart drei Viertel der Pixel
      scale = Math.min(window.devicePixelRatio || 1, maxDpr) * 0.5;
      canvas.width = Math.max(1, Math.round(cssW * scale));
      canvas.height = Math.max(1, Math.round(cssH * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
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
