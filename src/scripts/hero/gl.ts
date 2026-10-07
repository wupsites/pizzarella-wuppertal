/**
 * Tiefen-Parallaxe für das Pizzafoto (2.5D): ein Quad, eine Textur.
 * Die Tiefe ergibt sich aus der Lage im Bild – hinterer Rand fern, vorderer
 * Rand nah. Verschiebt sich die „Kamera“, wandern nahe Teile gegenläufig zu
 * fernen; das liest sich wie eine kleine Kamerafahrt um die Pizza.
 * Gezeichnet wird nur auf Anfrage (draw), nie in einer Dauerschleife.
 */

export interface PizzaView {
  /** Kamera seitlich/vertikal, ca. −1 … 1 */
  yaw: number;
  pitch: number;
  /** Lichtkante (0–1 über die Bildbreite) für den Glanz */
  light: number;
  /** Glanzstärke 0–1 */
  spec: number;
  /** aktiver Hotspot (u, v, Stärke 0–1) */
  hot: [number, number, number];
}

export interface PizzaGL {
  /** true bei Software-Rendering (keine GPU) – dann keine Dauerbewegung */
  readonly slow: boolean;
  draw(view: PizzaView): void;
  resize(cssW: number, cssH: number): void;
  destroy(): void;
  readonly canvas: HTMLCanvasElement;
}

/** Rand um das Bild, damit verschobene Teile nicht abgeschnitten werden */
export const MARGIN = { x: 0.045, y: 0.14 };
/** maximale Verschiebung in Bildbreiten bei yaw/pitch = 1 */
const SHIFT = { x: 0.024, y: 0.05 };

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
uniform sampler2D uTex;
uniform vec2 uMargin;
uniform vec2 uCam;
uniform vec2 uRim;
uniform vec3 uHot;
uniform float uLight;
uniform float uSpec;
uniform float uAspect;
varying vec2 vUv;
void main() {
  vec2 uv = vUv * (1.0 + 2.0 * uMargin) - uMargin;
  // 0 = hinterer Rand, 1 = Vorderkante
  float t = clamp((uv.y - uRim.x) / (uRim.y - uRim.x), 0.0, 1.0);
  float z = 1.0 - smoothstep(0.0, 0.8, t);
  float k = 0.5 - z;
  // seitlich etwas weniger Verschiebung als in der Mitte (Rundung)
  float bow = 1.0 - 0.35 * pow(abs(uv.x - 0.5) * 2.0, 2.0);
  vec2 s = uv - vec2(uCam.x * k * bow, uCam.y * k);
  vec4 c = texture2D(uTex, clamp(s, 0.0, 1.0));
  float inside = step(0.0, s.x) * step(s.x, 1.0) * step(0.0, s.y) * step(s.y, 1.0);
  c *= inside;
  // Glanz: helle Stellen (Käse, Öl) fangen eine wandernde Lichtkante
  float a = max(c.a, 0.0001);
  float lum = dot(c.rgb / a, vec3(0.299, 0.587, 0.114));
  float band = exp(-pow((s.x - uLight) * 3.4, 2.0));
  float spec = smoothstep(0.6, 0.93, lum) * band * uSpec;
  c.rgb += vec3(1.0, 0.94, 0.86) * spec * 0.11 * c.a;
  // Hotspot: Bereich minimal aufhellen
  vec2 d = (s - uHot.xy) * vec2(uAspect, 1.0);
  float h = exp(-dot(d, d) / 0.035) * uHot.z;
  c.rgb *= 1.0 + 0.09 * h;
  gl_FragColor = c;
}`;

export function createPizzaGL(
  img: HTMLImageElement,
  geo: { farRim: number; nearEdge: number; aspect: number },
  opts: { maxDpr: number },
): PizzaGL | null {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
  if (!gl) return null;

  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader');
    return sh;
  };
  let prog: WebGLProgram;
  try {
    prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
  } catch (e) {
    console.warn('[hero] WebGL nicht verfügbar', e);
    return null;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = (n: string) => gl.getUniformLocation(prog, n);
  const uMargin = u('uMargin');
  const uCam = u('uCam');
  const uRim = u('uRim');
  const uHot = u('uHot');
  const uLight = u('uLight');
  const uSpec = u('uSpec');
  const uAspect = u('uAspect');
  gl.uniform2f(uMargin, MARGIN.x, MARGIN.y);
  gl.uniform2f(uRim, geo.farRim, geo.nearEdge);
  gl.uniform1f(uAspect, geo.aspect);
  gl.uniform1i(u('uTex'), 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.clearColor(0, 0, 0, 0);

  let texW = 0;
  /** Textur in passender Größe hochladen (verkleinert vorher sauber per 2D-Canvas) */
  const upload = (targetW: number) => {
    const w = Math.min(img.naturalWidth, Math.round(targetW));
    if (Math.abs(w - texW) < 32) return;
    texW = w;
    let source: TexImageSource = img;
    if (w < img.naturalWidth) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = Math.round((w * img.naturalHeight) / img.naturalWidth);
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      source = c;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  };

  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  const slow = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);

  let last: PizzaView | null = null;
  const api: PizzaGL = {
    canvas,
    slow,
    resize(cssW, cssH) {
      const dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr);
      const fullW = cssW * (1 + 2 * MARGIN.x);
      const fullH = cssH * (1 + 2 * MARGIN.y);
      canvas.style.width = `${fullW}px`;
      canvas.style.height = `${fullH}px`;
      canvas.style.left = `${-cssW * MARGIN.x}px`;
      canvas.style.top = `${-cssH * MARGIN.y}px`;
      canvas.width = Math.round(fullW * dpr);
      canvas.height = Math.round(fullH * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      upload(cssW * dpr);
      if (last) api.draw(last);
    },
    draw(v) {
      last = v;
      gl.uniform2f(uCam, v.yaw * SHIFT.x, v.pitch * SHIFT.y);
      gl.uniform1f(uLight, v.light);
      gl.uniform1f(uSpec, v.spec);
      gl.uniform3f(uHot, v.hot[0], v.hot[1], v.hot[2]);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    destroy() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    },
  };
  return api;
}
