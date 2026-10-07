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
  /** Hauptlicht seitlich/vorn verschieben (Maus), je −1 … 1 */
  light?: [number, number];
  /** Ofen-Gegenlicht 0–1.5 */
  glow?: number;
  /** Licht-Sweep beim Laden: 0–1 Position, < 0 aus */
  sweep?: number;
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
uniform vec3 uLight;
uniform vec3 uBack;
uniform float uRim;
uniform float uSweep;
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
  // Tiefenunschärfe: hinten weicher (Mip-Bias), vorne knackig
  float dist = length(uEye - vW);
  float bias = clamp((dist - uFocus) * uDof, -0.5, 2.4);
  vec3 tex = texture2D(uTex, vUv, bias).rgb;

  vec3 N = normalize(vN);
  // Relief aus der Textur (Käseblasen, Salamiränder, Krustenporen)
  vec2 e = uTexel * 2.0;
  float hx = lum(texture2D(uTex, vUv + vec2(e.x, 0.0), bias).rgb) - lum(texture2D(uTex, vUv - vec2(e.x, 0.0), bias).rgb);
  float hz = lum(texture2D(uTex, vUv + vec2(0.0, e.y), bias).rgb) - lum(texture2D(uTex, vUv - vec2(0.0, e.y), bias).rgb);
  vec3 bumpM = vec3(-hx, 0.0, -hz) * 1.6;
  vec3 Nb = normalize(N + uModelRot * bumpM * smoothstep(0.55, 0.95, N.y));

  vec3 L = normalize(uLight);
  vec3 V = normalize(uEye - vW);
  // Geometrieschattierung relativ zur flachen Oberseite (Foto ist schon belichtet)
  float shade = 1.0 + 0.85 * (dot(N, L) - L.y) + 0.16 * (dot(Nb, L) - dot(N, L));
  // Unterseite der Kante dunkler, wie Ofenboden/Schatten
  float under = smoothstep(0.0, uPeak * 0.55, vY);
  vec3 col = tex * 1.1 * shade * mix(0.48, 1.0, under);

  float sat = max(tex.r, max(tex.g, tex.b)) - min(tex.r, min(tex.g, tex.b));
  float inner = 1.0 - smoothstep(0.72, 0.8, length(vUv - 0.5) / 0.47);

  // Ofen-Gegenlicht: Kanten und Krustenrand glühen warm (Fresnel + Rückseite)
  vec3 ember = vec3(1.0, 0.5, 0.16);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.4);
  float back = max(dot(N, normalize(uBack)), 0.0);
  col += ember * fres * (0.25 + 0.75 * back) * uRim * (0.55 + 0.45 * lum(tex));
  // dünner Teig durchscheinend, wenn er von hinten Licht bekommt
  float dough = smoothstep(0.5, 0.8, lum(tex)) * (1.0 - inner);
  col += ember * 0.22 * back * dough * uRim;

  // Fettglanz: Salami/Öl (gesättigt rot-orange) und Käse fangen Licht
  vec3 H = normalize(L + V);
  float oily = smoothstep(0.25, 0.55, sat) * smoothstep(0.25, 0.7, tex.r);
  float cheese = smoothstep(0.7, 0.92, lum(tex)) * (1.0 - smoothstep(0.15, 0.35, sat));
  // nur der Belag glänzt, die Kruste bleibt matt
  float gloss = (oily * 1.0 + cheese * 0.55) * smoothstep(0.55, 0.95, N.y) * inner;
  float nh = max(dot(Nb, H), 0.0);
  float sp = pow(nh, 90.0) * 2.6 + pow(nh, 22.0) * 0.32 + pow(nh, 6.0) * 0.06;
  col += vec3(1.0, 0.95, 0.86) * sp * gloss * uSpec;

  // Licht-Sweep: ein Lichtband läuft einmal über die Pizza
  if (uSweep >= 0.0) {
    float bx = mix(-1.5, 1.5, uSweep);
    float band = exp(-pow((vW.x + vW.z * 0.4 - bx) * 2.6, 2.0));
    col += vec3(1.0, 0.9, 0.74) * band * (0.08 + 1.1 * gloss + 0.22 * smoothstep(0.6, 0.9, lum(tex)));
  }

  // Hotspot: Bereich minimal aufhellen
  vec2 d = vUv - uHot.xy;
  col *= 1.0 + 0.12 * uHot.z * exp(-dot(d, d) / 0.006);

  // Spitzlichter weich abfangen, leicht warm graden
  col = col / (1.0 + max(col - 0.85, 0.0) * 0.9);
  col = pow(max(col, 0.0), vec3(0.97, 1.0, 1.05));
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
  float soft = 1.0 - smoothstep(0.55, 1.45, length(vP - uOff));
  float contact = 1.0 - smoothstep(0.9, 1.07, r);
  float a = soft * 0.42 + contact * 0.38;
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
    light: loc(prog, 'uLight'),
    back: loc(prog, 'uBack'),
    rim: loc(prog, 'uRim'),
    sweep: loc(prog, 'uSweep'),
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
      gl.uniform2f(SU.off, 0.06, -0.12);
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
      gl.uniform3f(U.light, -0.45 + lx * 0.55, 0.8, 0.38 + ly * 0.45);
      gl.uniform3f(U.back, 0.18, 0.42, -1.0);
      gl.uniform1f(U.rim, v.glow ?? 1);
      gl.uniform1f(U.sweep, v.sweep ?? -1);
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
