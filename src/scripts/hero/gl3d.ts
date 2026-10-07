/**
 * 3D-Pizza in WebGL: ein echtes Foto (Draufsicht) als Textur auf einem
 * Rotationskörper mit Randwulst. Dadurch dreht sich die Pizza wirklich –
 * Belag wandert, Rand und Kante verdecken sich korrekt –, bleibt aber in
 * jedem Pixel Fotografie.
 *
 * Licht: die Fotobeleuchtung bleibt erhalten; zusätzlich schattiert die
 * Geometrie relativ zur flachen Oberseite (der Rand bekommt Form, die beim
 * Drehen mitwandert), Fettglanz über ein Relief aus der Textur, leichte
 * Tiefenunschärfe hinten wie bei Food-Fotografie, weicher Kontaktschatten.
 * Gezeichnet wird nur auf Anfrage.
 */
import { camera, outline, profile, rimPuff, H_BASE, H_PEAK, R_IN, TEX_RADIUS, type Camera } from './camera.ts';

export interface View3D {
  yaw: number; // rad
  elev: number; // rad
  /** aktiver Hotspot: u, v, Stärke */
  hot: [number, number, number];
  /** Glanz 0–1 */
  spec: number;
  /** Ofen-Gegenlicht 0–1.5 */
  glow?: number;
  /** Zeit in Sekunden (Hitzeflimmern) */
  time?: number;
  /** Hitzeflimmern 0–1 */
  heat?: number;
  /** Schatten-Versatz durch die Lichtrichtung */
  light?: [number, number];
  /** Lage der Ofenglut hinter der Pizza (−1 links … 1 rechts): lenkt das Gegenlicht */
  oven?: number;
}

export interface Pizza3D {
  readonly canvas: HTMLCanvasElement;
  readonly slow: boolean;
  aspect: number;
  cam: Camera;
  setTexture(img: TexImageSource): void;
  resize(cssW: number, cssH: number): void;
  draw(v: View3D): void;
  destroy(): void;
}

const VERT = `
attribute vec3 aPos;
attribute vec3 aNrm;
attribute vec2 aUv;
uniform mat4 uModel;
uniform mat4 uViewProj;
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
varying float vY;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vW = w.xyz;
  vN = mat3(uModel) * aNrm;
  vUv = aUv;
  vY = aPos.y;
  gl_Position = uViewProj * w;
}`;

const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform vec3 uEye;
uniform vec3 uKey;
uniform vec3 uSoft;
uniform vec3 uBack;
uniform float uRim;
uniform float uTime;
uniform float uHeat;
uniform vec2 uTexel;
uniform vec4 uHot;
uniform float uSpec;
uniform float uFocus;
uniform float uDof;
uniform float uPeak;
uniform mat3 uModelRot;
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
varying float vY;

float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  float rTex = length(vUv - 0.5) / 0.47;
  // Hitzeflimmern: winzige Verzerrung, nur hinten über dem Belag
  vec2 uv = vUv;
  float far = smoothstep(0.1, -0.6, vW.z);
  uv += vec2(sin(vW.x * 38.0 + uTime * 2.3), cos(vW.z * 31.0 + uTime * 1.7)) * 0.00045 * uHeat * far;

  // Tiefenunschärfe: hinten weicher (Mip-Bias), vorne knackig
  float dist = length(uEye - vW);
  float bias = clamp((dist - uFocus) * uDof, -0.5, 2.4);
  vec3 tex = texture2D(uTex, uv, bias).rgb;

  vec3 N = normalize(vN);
  // Relief aus der Textur (Käseblasen, Salamiränder, Krustenporen)
  vec2 e = uTexel * 2.0;
  float hx = lum(texture2D(uTex, uv + vec2(e.x, 0.0), bias).rgb) - lum(texture2D(uTex, uv - vec2(e.x, 0.0), bias).rgb);
  float hz = lum(texture2D(uTex, uv + vec2(0.0, e.y), bias).rgb) - lum(texture2D(uTex, uv - vec2(0.0, e.y), bias).rgb);
  float top = smoothstep(0.55, 0.95, N.y);
  vec3 Nb = normalize(N + uModelRot * vec3(-hx, 0.0, -hz) * 1.8 * top);

  vec3 V = normalize(uEye - vW);
  vec3 Lk = normalize(uKey);
  vec3 Lb = normalize(uBack);
  vec3 Lf = normalize(vec3(0.7, 0.35, 0.6));

  float sat = max(tex.r, max(tex.g, tex.b)) - min(tex.r, min(tex.g, tex.b));
  float inner = 1.0 - smoothstep(0.72, 0.8, rTex);
  float crust = 1.0 - inner;

  // --- diffuses Licht relativ zur flachen Oberseite (das Foto ist schon belichtet)
  float wrapK = 0.35 + 0.65 * max(dot(N, Lk), 0.0);
  float wrapRef = 0.35 + 0.65 * Lk.y;
  float key = wrapK / wrapRef;
  float micro = 1.0 + 0.2 * (dot(Nb, Lk) - dot(N, Lk));
  float fill = 0.1 * max(dot(N, Lf), 0.0);
  // Kehle zwischen Belag und Randwulst, Unterseite der Kante
  float crease = 1.0 - 0.16 * exp(-pow((rTex - 0.79) / 0.035, 2.0));
  float under = mix(0.46, 1.0, smoothstep(0.0, uPeak * 0.55, vY));
  vec3 col = tex * (key * micro + fill) * crease * under;

  // --- Ofenlicht von hinten unten: trifft nur, was ihm zugewandt ist,
  //     färbt das Material (kein aufgesetzter Neonrand)
  vec3 oven = vec3(1.0, 0.58, 0.27);
  // nur Flächen, die wirklich nach hinten zeigen (Rand, Silhouette) – nicht die Oberseite
  float backD = clamp((dot(N, Lb) - 0.28) / 0.72, 0.0, 1.0);
  float graze = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += tex * oven * (backD * 0.5 + graze * backD * 1.6) * uRim;
  // dünner Teig am Rand lässt Ofenlicht durchscheinen
  col += tex * oven * 0.28 * pow(backD, 1.5) * crust * smoothstep(0.45, 0.8, lum(tex)) * uRim;
  // Kantenlicht: nur an der Silhouette, nur wo das Ofenlicht von hinten hinkommt,
  // in der Farbe des Teigs – trennt den Rand sauber vom dunklen Grund
  float rimSide = smoothstep(-0.15, 0.75, dot(N, Lb));
  col += mix(tex, oven * 0.7, 0.3) * oven * graze * rimSide * 1.15 * uRim;

  // --- Glanz je Material: große Softbox schräg hinten oben (Food-Fotografie),
  //     Schlick-Fresnel, Rauheit je Oberfläche – Öl glänzt, Käse schimmert, Teig kaum
  vec3 Ls = normalize(uSoft);
  vec3 H = normalize(Ls + V);
  // für den Glanz ein ruhigeres Relief als fürs diffuse Licht: kein Glitzern
  vec3 Ns = normalize(mix(N, Nb, 0.5));
  float nh = max(dot(Ns, H), 0.0);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(V, H), 0.0), 5.0);
  float oily = smoothstep(0.25, 0.55, sat) * smoothstep(0.25, 0.7, tex.r) * inner;
  float cheese = smoothstep(0.66, 0.92, lum(tex)) * (1.0 - smoothstep(0.15, 0.35, sat)) * inner;
  float spec = oily * (pow(nh, 120.0) * 0.6 + pow(nh, 36.0) * 0.16)
             + cheese * (pow(nh, 30.0) * 0.2 + pow(nh, 8.0) * 0.035)
             + crust * pow(nh, 9.0) * 0.035;
  col += vec3(1.0, 0.97, 0.92) * spec * (0.7 + 2.2 * fres) * top * uSpec;
  // Kantenglanz der Kruste im Ofenlicht (seidig, breit)
  float nb = max(dot(Nb, normalize(Lb + V)), 0.0);
  col += oven * pow(nb, 14.0) * 0.22 * crust * uRim;

  // --- Hotspot: Bereich minimal aufhellen
  vec2 d = vUv - uHot.xy;
  col *= 1.0 + 0.08 * uHot.z * exp(-dot(d, d) / 0.008);

  // --- gemeinsamer „Kamera“-Look: Spitzlichter weich abfangen, etwas mehr
  //     Tiefe (S-Kurve), Farben des Fotos behalten, minimal warm
  col = col / (1.0 + max(col - 0.82, 0.0) * 1.1);
  vec3 sc = clamp(col, 0.0, 1.0);
  col = mix(col, sc * sc * (3.0 - 2.0 * sc), 0.28);
  float l = lum(col);
  col = mix(vec3(l), col, 1.06);
  col = pow(max(col, 0.0), vec3(0.985, 1.0, 1.04));
  // feines Filmkorn (fest im Bild), wie das Korn auf dem Grund
  vec3 g3 = fract(floor(gl_FragCoord.xyx) * 0.1031);
  g3 += dot(g3, g3.yzx + 33.33);
  float grain = fract((g3.x + g3.y) * g3.z);
  col *= 1.0 + (grain - 0.5) * 0.09;
  gl_FragColor = vec4(col, 1.0);
}`;

const SHADOW_VERT = `
attribute vec2 aXZ;
uniform mat4 uViewProj;
varying vec2 vP;
void main() {
  vP = aXZ;
  gl_Position = uViewProj * vec4(aXZ.x, -0.002, aXZ.y, 1.0);
}`;

const SHADOW_FRAG = `
precision mediump float;
uniform vec2 uOff;
varying vec2 vP;
void main() {
  float r = length(vP);
  // weiter Umgebungsschatten (zur Lichtrichtung versetzt) + dichter Kontaktschatten
  float soft = 1.0 - smoothstep(0.5, 1.55, length((vP - uOff) * vec2(1.0, 1.15)));
  float contact = 1.0 - smoothstep(0.88, 1.06, length(vP - uOff * 0.25));
  float a = soft * soft * 0.5 + contact * 0.42;
  gl_FragColor = vec4(0.0, 0.0, 0.0, a);
}`;

function buildMesh(prof: number[], segments: number) {
  const P = profile();
  const rings = P.length;
  const cols = segments + 1;
  const pos = new Float32Array(rings * cols * 3);
  const nrm = new Float32Array(rings * cols * 3);
  const uv = new Float32Array(rings * cols * 2);
  for (let j = 0; j < cols; j++) {
    const th = -Math.PI + (j / segments) * Math.PI * 2;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const k = outline(prof, th);
    // Teig geht nie gleichmäßig auf: Randhöhe schwankt um den Umfang
    const puff = rimPuff(th);
    for (let i = 0; i < rings; i++) {
      const p = P[i];
      const o = i * cols + j;
      const rr = p.r * k;
      const tr = p.tr * k;
      const y = p.r > R_IN ? H_BASE + (p.y - H_BASE) * puff : p.y;
      pos.set([rr * c, Math.max(0, y), rr * s], o * 3);
      nrm.set([p.nr * c, p.ny, p.nr * s], o * 3);
      uv.set([0.5 + tr * c * TEX_RADIUS, 0.5 + tr * s * TEX_RADIUS], o * 2);
    }
  }
  const idx = new Uint16Array((rings - 1) * segments * 6);
  let n = 0;
  for (let i = 0; i < rings - 1; i++)
    for (let j = 0; j < segments; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c2 = a + cols;
      const d = c2 + 1;
      idx.set([a, c2, b, b, c2, d], n);
      n += 6;
    }
  return { pos, nrm, uv, idx };
}

export function createPizza3D(prof: number[], opts: { maxDpr: number; segments: number; preserve?: boolean }): Pizza3D | null {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, depth: true, stencil: false, preserveDrawingBuffer: !!opts.preserve, powerPreference: 'default' });
  if (!gl) return null;

  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader');
    return sh;
  };
  const program = (vs: string, fs: string) => {
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
    return p;
  };
  let prog: WebGLProgram;
  let shadowProg: WebGLProgram;
  try {
    prog = program(VERT, FRAG);
    shadowProg = program(SHADOW_VERT, SHADOW_FRAG);
  } catch (e) {
    console.warn('[hero] WebGL nicht verfügbar', e);
    return null;
  }

  const mesh = buildMesh(prof, opts.segments);
  const buf = (data: BufferSource, target: number = gl.ARRAY_BUFFER) => {
    const b = gl.createBuffer();
    gl.bindBuffer(target, b);
    gl.bufferData(target, data, gl.STATIC_DRAW);
    return b;
  };
  const bPos = buf(mesh.pos);
  const bNrm = buf(mesh.nrm);
  const bUv = buf(mesh.uv);
  const bIdx = buf(mesh.idx, gl.ELEMENT_ARRAY_BUFFER);
  const bShadow = buf(new Float32Array([-1.7, -1.7, 1.7, -1.7, -1.7, 1.7, 1.7, 1.7]));

  const loc = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
  const U = {
    model: loc(prog, 'uModel'),
    viewProj: loc(prog, 'uViewProj'),
    modelRot: loc(prog, 'uModelRot'),
    eye: loc(prog, 'uEye'),
    key: loc(prog, 'uKey'),
    soft: loc(prog, 'uSoft'),
    back: loc(prog, 'uBack'),
    rim: loc(prog, 'uRim'),
    time: loc(prog, 'uTime'),
    heat: loc(prog, 'uHeat'),
    texel: loc(prog, 'uTexel'),
    hot: loc(prog, 'uHot'),
    spec: loc(prog, 'uSpec'),
    focus: loc(prog, 'uFocus'),
    dof: loc(prog, 'uDof'),
    peak: loc(prog, 'uPeak'),
    tex: loc(prog, 'uTex'),
  };
  const SU = { viewProj: loc(shadowProg, 'uViewProj'), off: loc(shadowProg, 'uOff') };
  const A = { pos: gl.getAttribLocation(prog, 'aPos'), nrm: gl.getAttribLocation(prog, 'aNrm'), uv: gl.getAttribLocation(prog, 'aUv'), xz: gl.getAttribLocation(shadowProg, 'aXZ') };

  const tex = gl.createTexture();
  let texSize = 1024;
  let hasTex = false;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  const slow = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');

  let last: View3D | null = null;
  const api: Pizza3D = {
    canvas,
    slow,
    aspect: 1.5,
    cam: camera(0, 0.45, 1.5),
    setTexture(img) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      texSize = (img as { width: number }).width || 1024;
      const pot = (texSize & (texSize - 1)) === 0;
      if (pot) gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, pot ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      hasTex = true;
      if (last) api.draw(last);
    },
    resize(cssW, cssH) {
      const dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
      api.aspect = cssW / cssH;
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (last) api.draw(last);
    },
    draw(v) {
      last = v;
      const cam = camera(v.yaw, v.elev, api.aspect);
      api.cam = cam;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (!hasTex) return;

      // Schatten auf unsichtbarem Boden
      gl.useProgram(shadowProg);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniformMatrix4fv(SU.viewProj, false, cam.viewProj);
      const slx = v.light?.[0] ?? 0;
      const sly = v.light?.[1] ?? 0;
      gl.uniform2f(SU.off, 0.1 - slx * 0.07, -0.08 - sly * 0.05);
      gl.bindBuffer(gl.ARRAY_BUFFER, bShadow);
      gl.enableVertexAttribArray(A.xz);
      gl.vertexAttribPointer(A.xz, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disableVertexAttribArray(A.xz);

      // Pizza
      gl.useProgram(prog);
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE);
      gl.uniformMatrix4fv(U.model, false, cam.model);
      gl.uniformMatrix4fv(U.viewProj, false, cam.viewProj);
      const m = cam.model;
      gl.uniformMatrix3fv(U.modelRot, false, new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]));
      gl.uniform3f(U.eye, cam.eye[0], cam.eye[1], cam.eye[2]);
      const lx = v.light?.[0] ?? 0;
      const ly = v.light?.[1] ?? 0;
      // Hauptlicht weich von oben links vorn; wandert mit dem Licht (Zeiger oder Drift)
      gl.uniform3f(U.key, -0.5 + lx * 0.38, 0.85, 0.42 + ly * 0.25);
      // Ofenlicht von hinten, knapp über der Belaghöhe; wandert mit der Glut im Hintergrund
      gl.uniform3f(U.back, 0.22 + (v.oven ?? 0) * 1.1, 0.2, -1.0);
      // Softbox für die Glanzlichter: schräg hinten oben, Glanz läuft mit dem Licht
      gl.uniform3f(U.soft, 0.12 + lx * 0.42, 0.9, -0.5 + ly * 0.3);
      gl.uniform1f(U.rim, v.glow ?? 1);
      gl.uniform1f(U.time, v.time ?? 0);
      gl.uniform1f(U.heat, v.heat ?? 0);
      gl.uniform2f(U.texel, 1 / texSize, 1 / texSize);
      gl.uniform4f(U.hot, v.hot[0], v.hot[1], v.hot[2], 0);
      gl.uniform1f(U.spec, v.spec);
      const d = Math.hypot(...cam.eye);
      gl.uniform1f(U.focus, d - 0.25);
      gl.uniform1f(U.dof, 1.6);
      gl.uniform1f(U.peak, H_PEAK);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(U.tex, 0);
      const attr = (b: WebGLBuffer | null, l: number, size: number) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.enableVertexAttribArray(l);
        gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0);
      };
      attr(bPos, A.pos, 3);
      attr(bNrm, A.nrm, 3);
      attr(bUv, A.uv, 2);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bIdx);
      gl.drawElements(gl.TRIANGLES, mesh.idx.length, gl.UNSIGNED_SHORT, 0);
    },
    destroy() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    },
  };
  return api;
}
