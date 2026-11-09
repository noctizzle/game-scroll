// Snapdragon Game Super Resolution 2 (SGSR 2), by Qualcomm: temporal upscaling. Each frame the camera
// is nudged by a fraction of a pixel (a Halton pattern), and the upscale pass blends the new small
// picture into the full-size picture of the frames before, moved to where things are now. Over a few
// frames that gives a sharper, steadier picture than one frame can (SGSR 1), with smoother edges.
// Used by Next Gen (hd3d.js) when the 3D is drawn below the screen's size; AR, screen-space
// reflections and WebGPU keep SGSR 1 or a plain stretch.
//
// Ported to WebGL 2 from sgsr/v2/include/glsl_2_pass_fs (sgsr2_convert.fs, sgsr2_upscale.fs) in
// github.com/SnapdragonStudios/snapdragon-gsr. Changes: textureGather (not in WebGL 2) is done with
// four texelFetch reads; there is no motion vector buffer, so every pixel's motion comes from its depth
// and the camera's move (the shader's own fallback); depth is WebGL's 0..1, turned into -1..1 for the
// reprojection; texelFetch reads are clamped to the picture; it reads three.js's vUv; the output is
// opaque.
//
// ---------------------------------------------------------------------------------------------------
// Copyright (c) 2024, Qualcomm Innovation Center, Inc. All rights reserved.
//
// Redistribution and use in source and binary forms, with or without modification, are permitted
// provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice, this list of conditions
//    and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice, this list of
//    conditions and the following disclaimer in the documentation and/or other materials provided
//    with the distribution.
// 3. Neither the name of the copyright holder nor the names of its contributors may be used to
//    endorse or promote products derived from this software without specific prior written
//    permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
// IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
// FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR
// CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
// DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
// IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT
// OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
// SPDX-License-Identifier: BSD-3-Clause
// ---------------------------------------------------------------------------------------------------

import { ShaderMaterial, WebGLRenderTarget, HalfFloatType, LinearFilter, Vector2, Matrix4 } from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// Convert: per low-res pixel, the motion back to last frame (from depth and the camera's move) and how
// much the depth jumps around it (depth clip: history is less trusted at edges in depth).
const CONVERT = /* glsl */`
  precision highp float;
  precision highp int;
  uniform highp sampler2D InputDepth;
  uniform mat4 clipToPrevClip;
  uniform vec2 renderSize, renderSizeRcp;
  uniform float cameraFovAngleHor;
  varying vec2 vUv;

  // textureGather(InputDepth, coord, 0) with four texelFetch reads
  vec4 gatherD(vec2 coord) {
    ivec2 size = ivec2(renderSize), hi = size - 1;
    ivec2 p = ivec2(floor(coord * renderSize - 0.5));
    ivec2 p00 = clamp(p, ivec2(0), hi), p11 = clamp(p + 1, ivec2(0), hi);
    return vec4(texelFetch(InputDepth, ivec2(p00.x, p11.y), 0).r, texelFetch(InputDepth, p11, 0).r,
                texelFetch(InputDepth, ivec2(p11.x, p00.y), 0).r, texelFetch(InputDepth, p00, 0).r);
  }

  void main() {
    vec2 texCoord = vUv;
    vec2 gatherCoord = texCoord - vec2(0.5) * renderSizeRcp;
    vec4 btmLeft = gatherD(gatherCoord);
    vec4 btmRight = gatherD(gatherCoord + vec2(renderSizeRcp.x * 2.0, 0.0));
    vec4 topLeft = gatherD(gatherCoord + vec2(0.0, renderSizeRcp.y * 2.0));
    vec4 topRight = gatherD(gatherCoord + renderSizeRcp * 2.0);
    float maxC = min(min(min(btmLeft.z, btmRight.w), topLeft.y), topRight.x);
    float btmLeft4 = min(min(min(btmLeft.y, btmLeft.x), btmLeft.z), btmLeft.w);
    float btmLeftMax9 = min(topLeft.x, min(min(maxC, btmLeft4), btmRight.x));

    float depthclip = 0.0;
    if (maxC < 1.0 - 1.0e-05) {
      float btmRight4 = min(min(min(btmRight.y, btmRight.x), btmRight.z), btmRight.w);
      float topLeft4 = min(min(min(topLeft.y, topLeft.x), topLeft.z), topLeft.w);
      float topRight4 = min(min(min(topRight.y, topRight.x), topRight.z), topRight.w);
      float Wdepth = 0.0;
      float Ksep_Kfov_diagonal = 1.37e-05 * cameraFovAngleHor * length(renderSize);
      float Depthsep = Ksep_Kfov_diagonal * (1.0 - maxC);
      const float EPSILON = 1.19e-07;
      Wdepth += clamp(Depthsep / (abs(maxC - btmLeft4) + EPSILON), 0.0, 1.0);
      Wdepth += clamp(Depthsep / (abs(maxC - btmRight4) + EPSILON), 0.0, 1.0);
      Wdepth += clamp(Depthsep / (abs(maxC - topLeft4) + EPSILON), 0.0, 1.0);
      Wdepth += clamp(Depthsep / (abs(maxC - topRight4) + EPSILON), 0.0, 1.0);
      depthclip = clamp(1.0 - Wdepth * 0.25, 0.0, 1.0);
    }

    // no motion vectors: reproject the nearest depth with the camera's move
    vec2 ScreenPos = 2.0 * texCoord - 1.0;
    vec4 PreClip = clipToPrevClip * vec4(ScreenPos, btmLeftMax9 * 2.0 - 1.0, 1.0);
    vec2 motion = ScreenPos - PreClip.xy / PreClip.w;
    gl_FragColor = vec4(motion, depthclip, 0.0);
  }`;

// Upscale: a Lanczos filter of the 5 nearest low-res pixels, a colour box from them, history clamped
// to that box, then blended.
const UPSCALE = /* glsl */`
  precision mediump float;
  precision highp int;
  uniform mediump sampler2D PrevOutput, MotionDepthClipAlphaBuffer, InputColor;
  uniform highp vec2 renderSize, outputSize, renderSizeRcp, jitterOffset, scaleRatio;
  uniform highp float minLerpContribution, reset;
  varying highp vec2 vUv;

  float FastLanczos(float base) { float y = base - 1.0; float y2 = y * y; float y_temp = 0.75 * y + y2; return y_temp * y2; }
  vec3 fetch(ivec2 p) { return texelFetch(InputColor, clamp(p, ivec2(0), ivec2(renderSize) - 1), 0).xyz; }

  vec4 Upsampledcw; vec3 rectboxcenter, rectboxvar, rectboxmin, rectboxmax; float rectboxweight;
  void tap(vec3 samplecolor, vec2 baseoffset, float kernelbias2, float curvebias, bool first) {
    float baseoffset_dot = dot(baseoffset, baseoffset);
    float base = clamp(baseoffset_dot * kernelbias2, 0.0, 1.0);
    float weight = FastLanczos(base);
    Upsampledcw += vec4(samplecolor * weight, weight);
    float boxweight = exp(baseoffset_dot * curvebias);
    if (first) { rectboxmin = samplecolor; rectboxmax = samplecolor; }
    else { rectboxmin = min(rectboxmin, samplecolor); rectboxmax = max(rectboxmax, samplecolor); }
    vec3 wsample = samplecolor * boxweight;
    rectboxcenter += wsample;
    rectboxvar += samplecolor * wsample;
    rectboxweight += boxweight;
  }

  void main() {
    float Biasmax_viewportXScale = scaleRatio.x;
    float scalefactor = scaleRatio.y;
    highp vec2 Hruv = vUv;
    highp vec2 Jitteruv = clamp(Hruv + jitterOffset * renderSizeRcp, 0.0, 1.0);
    highp ivec2 InputPos = ivec2(Jitteruv * renderSize);

    highp vec3 mda = textureLod(MotionDepthClipAlphaBuffer, Jitteruv, 0.0).xyz;
    highp vec2 Motion = mda.xy;
    highp vec2 PrevUV = clamp(-0.5 * Motion + Hruv, 0.0, 1.0);
    float depthfactor = mda.z;
    vec3 HistoryColor = textureLod(PrevOutput, PrevUV, 0.0).xyz;

    Upsampledcw = vec4(0.0);
    float biasmax = Biasmax_viewportXScale;
    float biasmin = max(1.0, 0.3 + 0.3 * biasmax);
    float biasfactor = 0.25 * depthfactor;
    float kernelbias = mix(biasmax, biasmin, biasfactor);
    float motion_viewport_len = length(Motion * outputSize);
    float curvebias = mix(-2.0, -3.0, clamp(motion_viewport_len * 0.02, 0.0, 1.0));

    rectboxcenter = vec3(0.0); rectboxvar = vec3(0.0); rectboxweight = 0.0;
    highp vec2 srcpos = vec2(InputPos) + vec2(0.5) - jitterOffset;
    kernelbias *= 0.5;
    float kernelbias2 = kernelbias * kernelbias;
    vec2 srcpos_srcOutputPos = srcpos - Hruv * renderSize;
    tap(fetch(InputPos + ivec2(0, 1)), srcpos_srcOutputPos + vec2(0.0, 1.0), kernelbias2, curvebias, true);
    tap(fetch(InputPos + ivec2(1, 0)), srcpos_srcOutputPos + vec2(1.0, 0.0), kernelbias2, curvebias, false);
    tap(fetch(InputPos + ivec2(-1, 0)), srcpos_srcOutputPos + vec2(-1.0, 0.0), kernelbias2, curvebias, false);
    tap(fetch(InputPos), srcpos_srcOutputPos, kernelbias2, curvebias, false);
    tap(fetch(InputPos + ivec2(0, -1)), srcpos_srcOutputPos + vec2(0.0, -1.0), kernelbias2, curvebias, false);

    rectboxweight = 1.0 / rectboxweight;
    rectboxcenter *= rectboxweight;
    rectboxvar *= rectboxweight;
    rectboxvar = sqrt(abs(rectboxvar - rectboxcenter * rectboxcenter));

    Upsampledcw.xyz = clamp(Upsampledcw.xyz / Upsampledcw.w, rectboxmin - vec3(0.075), rectboxmax + vec3(0.075));
    Upsampledcw.w = Upsampledcw.w * (1.0 / 3.0);

    float baseupdate = 1.0 - depthfactor;
    baseupdate = min(baseupdate, mix(baseupdate, Upsampledcw.w * 10.0, clamp(10.0 * motion_viewport_len, 0.0, 1.0)));
    baseupdate = min(baseupdate, mix(baseupdate, Upsampledcw.w, clamp(motion_viewport_len * 0.05, 0.0, 1.0)));
    float basealpha = baseupdate;

    const float EPSILON = 1.192e-07;
    float boxscale = max(depthfactor, clamp(motion_viewport_len * 0.05, 0.0, 1.0));
    float boxsize = mix(scalefactor, 1.0, boxscale);
    vec3 sboxvar = rectboxvar * boxsize;
    vec3 boxmin = rectboxcenter - sboxvar;
    vec3 boxmax = rectboxcenter + sboxvar;
    rectboxmax = min(rectboxmax, boxmax);
    rectboxmin = max(rectboxmin, boxmin);

    vec3 clampedcolor = clamp(HistoryColor, rectboxmin, rectboxmax);
    float startLerpValue = minLerpContribution;
    if ((abs(mda.x) + abs(mda.y)) > 0.000001) startLerpValue = 0.0;
    float lerpcontribution = (any(greaterThan(rectboxmin, HistoryColor)) || any(greaterThan(HistoryColor, rectboxmax))) ? startLerpValue : 1.0;

    HistoryColor = mix(clampedcolor, HistoryColor, clamp(lerpcontribution, 0.0, 1.0));
    float basemin = min(basealpha, 0.1);
    basealpha = mix(basemin, basealpha, clamp(lerpcontribution, 0.0, 1.0));

    float alphasum = max(EPSILON, basealpha + Upsampledcw.w);
    float alpha = clamp(Upsampledcw.w / alphasum + reset, 0.0, 1.0);
    gl_FragColor = vec4(mix(HistoryColor, Upsampledcw.xyz, alpha), 1.0);
  }`;

const COPY = /* glsl */`uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0); }`;

const mat = (fragmentShader, uniforms) => new ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false });
const rt = () => new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter });
const halton = (i, b) => { let f = 1, r = 0; for (; i > 0; i = Math.floor(i / b)) { f /= b; r += f * (i % b); } return r; };
const VP = new Matrix4(), INV = new Matrix4();

// Reads the depth of the composer's buffer straight after the scene is drawn (before any pass clears it).
class ConvertPass extends Pass {
  constructor(s) { super(); this.s = s; this.needsSwap = false; }
  render(r, writeBuffer, readBuffer) {
    const s = this.s; s.cu.InputDepth.value = readBuffer.depthTexture;
    s.quad.material = s.convert; r.setRenderTarget(s.mdc); s.quad.render(r);
  }
}
// Upscales the finished small picture into the history, then shows it.
class UpscalePass extends Pass {
  constructor(s) { super(); this.s = s; this.needsSwap = false; }
  render(r, writeBuffer, readBuffer) {
    const s = this.s, u = s.uu, out = s.hist[s.cur];
    u.InputColor.value = readBuffer.texture; u.PrevOutput.value = s.hist[1 - s.cur].texture; u.MotionDepthClipAlphaBuffer.value = s.mdc.texture;
    s.quad.material = s.upscale; r.setRenderTarget(out); s.quad.render(r);
    s.copy.uniforms.tDiffuse.value = out.texture; s.quad.material = s.copy; r.setRenderTarget(null); s.quad.render(r);
    s.cur = 1 - s.cur;
  }
}

/**
 * What SGSR 2 needs from the frame, the same on WebGL and WebGPU (hd3d-gpu.js): sizes, the camera's
 * move since last frame (without the jitter), whether to start over, and this frame's jitter, which
 * begin() puts on the camera and end() takes off. yDown: the renderer's pictures count rows from the
 * top (WebGPU), so the jitter's y is turned round to stay in picture pixels.
 */
export class SgsrFrame {
  constructor() {
    this.renderSize = new Vector2(); this.outputSize = new Vector2(); this.jitter = new Vector2(); this.scaleRatio = new Vector2();
    this.clipToPrevClip = new Matrix4(); this.fovH = 1; this.minLerp = 0; this.reset = 1;
    this.prevVP = new Matrix4(); this.saved = new Matrix4(); this.savedInv = new Matrix4();
    this.frame = 0; this.still = 0; this.view = null; this.lastT = 0; this.key = '';
  }
  begin(cam, pw, ph, ow, oh, view, now, cut = false, yDown = false) {
    const key = `${pw}x${ph}>${ow}x${oh}`, resized = key !== this.key; this.key = key;
    const reset = cut || resized || this.view !== view || now - this.lastT > 1000;   // a cut: another view drew in between, or a long pause
    this.view = view; this.lastT = now;
    this.renderSize.set(pw, ph); this.outputSize.set(ow, oh);
    const k = ow / pw;
    this.scaleRatio.set(k, Math.min(20, Math.pow((ow * oh) / (pw * ph), 3)));
    this.fovH = cam.isPerspectiveCamera ? Math.tan(cam.fov * Math.PI / 360) * pw / ph : 1;
    // the camera's move: this frame's clip space to last frame's (without the jitter)
    cam.updateMatrixWorld();
    VP.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    let d = 0; for (let i = 0; i < 16; i++) d += Math.abs(VP.elements[i] - this.prevVP.elements[i]);
    this.still = !reset && d < 1e-5 ? this.still + 1 : 0;
    this.clipToPrevClip.multiplyMatrices(reset ? VP : this.prevVP, INV.copy(VP).invert());
    this.prevVP.copy(VP);
    this.minLerp = this.still ? .3 : 0;
    this.reset = reset ? 1 : 0;
    // jitter: a Halton (2, 3) point inside the pixel, more of them the bigger the upscale
    const n = Math.min(32, Math.max(8, Math.ceil(8 * k * k)));
    this.frame = (this.frame % n) + 1;
    const jx = halton(this.frame, 2) - .5, jy = halton(this.frame, 3) - .5;
    this.jitter.set(jx, jy);
    // move the picture by (jx, jy) picture pixels: clip x += 2 jx / pw * w (works for both camera kinds)
    this.saved.copy(cam.projectionMatrix); this.savedInv.copy(cam.projectionMatrixInverse);
    const e = cam.projectionMatrix.elements, tx = 2 * jx / pw, ty = (yDown ? -2 : 2) * jy / ph;
    for (let c = 0; c < 4; c++) { e[c * 4] += tx * e[c * 4 + 3]; e[c * 4 + 1] += ty * e[c * 4 + 3]; }
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }
  /** After drawing: the camera without jitter again. */
  end(cam) { cam.projectionMatrix.copy(this.saved); cam.projectionMatrixInverse.copy(this.savedInv); }
}

export class SGSR2 {
  constructor() {
    this.cu = { InputDepth: { value: null }, clipToPrevClip: { value: new Matrix4() }, renderSize: { value: new Vector2() }, renderSizeRcp: { value: new Vector2() }, cameraFovAngleHor: { value: 1 } };
    this.uu = { PrevOutput: { value: null }, MotionDepthClipAlphaBuffer: { value: null }, InputColor: { value: null }, renderSize: this.cu.renderSize, renderSizeRcp: this.cu.renderSizeRcp,
      outputSize: { value: new Vector2() }, jitterOffset: { value: new Vector2() }, scaleRatio: { value: new Vector2() }, minLerpContribution: { value: 0 }, reset: { value: 1 } };
    this.convert = mat(CONVERT, this.cu); this.upscale = mat(UPSCALE, this.uu); this.copy = mat(COPY, { tDiffuse: { value: null } });
    this.quad = new FullScreenQuad(null);
    this.mdc = rt(); this.hist = [rt(), rt()]; this.cur = 0;
    this.convertPass = new ConvertPass(this); this.upscalePass = new UpscalePass(this);
    this.f = new SgsrFrame();
  }
  /** Before drawing: sizes, the camera's move since last frame, and this frame's jitter on cam. */
  begin(cam, pw, ph, ow, oh, view, now, cut = false) {
    const cu = this.cu, uu = this.uu, f = this.f;
    if (this.mdc.width !== pw || this.mdc.height !== ph || this.hist[0].width !== ow || this.hist[0].height !== oh) { this.mdc.setSize(pw, ph); for (const h of this.hist) h.setSize(ow, oh); }
    f.begin(cam, pw, ph, ow, oh, view, now, cut);
    cu.renderSize.value.copy(f.renderSize); cu.renderSizeRcp.value.set(1 / pw, 1 / ph); uu.outputSize.value.copy(f.outputSize);
    uu.scaleRatio.value.copy(f.scaleRatio); cu.cameraFovAngleHor.value = f.fovH; cu.clipToPrevClip.value.copy(f.clipToPrevClip);
    uu.minLerpContribution.value = f.minLerp; uu.reset.value = f.reset; uu.jitterOffset.value.copy(f.jitter);
  }
  /** After drawing: the camera without jitter again. */
  end(cam) { this.f.end(cam); }
  dispose() { this.mdc.dispose(); for (const h of this.hist) h.dispose(); this.convert.dispose(); this.upscale.dispose(); this.copy.dispose(); this.quad.dispose(); }
}
