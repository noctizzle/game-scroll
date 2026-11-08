// Snapdragon Game Super Resolution 1 (SGSR 1), by Qualcomm: one shader pass that upscales the 3D
// picture (rendered smaller to keep the frame rate up) to the full screen with sharp edges, using a
// 12-tap Lanczos-like filter and adaptive sharpening. Works on any phone GPU, not only Snapdragon.
// Used by Next Gen and AR (hd3d.js) whenever the 3D is drawn below the screen's resolution.
//
// Ported to WebGL 2 from sgsr/v1/include/glsl/sgsr1_shader_mobile.frag in
// github.com/SnapdragonStudios/snapdragon-gsr (RGBA mode, edge threshold 8/255, sharpness 2).
// Changes: textureGather (not in WebGL 2) is done with four texelFetch reads, the alpha channel is
// kept (AR draws over the camera), and it reads three.js's vUv.
//
// ---------------------------------------------------------------------------------------------------
// Copyright (c) 2023-2025, Qualcomm Innovation Center, Inc. All rights reserved.
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

export const SGSR = {
  name: 'SGSR1',
  uniforms: { tDiffuse: { value: null }, ViewportInfo: { value: [0, 0, 1, 1] } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    precision mediump float;
    precision highp int;
    uniform highp vec4 ViewportInfo;   // 1/width, 1/height, width, height of the low-res picture
    uniform mediump sampler2D tDiffuse;
    varying highp vec2 vUv;
    #define EdgeThreshold (8.0 / 255.0)
    #define EdgeSharpness 2.0

    // textureGather(tex, coord, 1): the green of the 2x2 texels around coord, in gather order
    vec4 gatherG(highp vec2 coord) {
      highp ivec2 size = ivec2(ViewportInfo.zw);
      highp ivec2 p = ivec2(floor(coord * ViewportInfo.zw - 0.5));
      highp ivec2 hi = size - 1;
      highp ivec2 p00 = clamp(p, ivec2(0), hi), p11 = clamp(p + 1, ivec2(0), hi);
      return vec4(texelFetch(tDiffuse, ivec2(p00.x, p11.y), 0).g, texelFetch(tDiffuse, p11, 0).g,
                  texelFetch(tDiffuse, ivec2(p11.x, p00.y), 0).g, texelFetch(tDiffuse, p00, 0).g);
    }
    float fastLanczos2(float x) { float wA = x - 4.0; float wB = x * wA - wA; wA *= wA; return wB * wA; }
    vec2 weightY(float dx, float dy, float c, float std) {
      float x = ((dx * dx) + (dy * dy)) * 0.55 + clamp(abs(c) * std, 0.0, 1.0);
      float w = fastLanczos2(x);
      return vec2(w, w * c);
    }
    void main() {
      vec4 src = textureLod(tDiffuse, vUv, 0.0);
      vec4 color = vec4(src.xyz, 0.0);
      highp vec2 imgCoord = (vUv * ViewportInfo.zw) + vec2(-0.5, 0.5);
      highp vec2 imgCoordPixel = floor(imgCoord);
      highp vec2 coord = imgCoordPixel * ViewportInfo.xy;
      vec2 pl = imgCoord - imgCoordPixel;
      vec4 left = gatherG(coord);
      float edgeVote = abs(left.z - left.y) + abs(color.y - left.y) + abs(color.y - left.z);
      if (edgeVote > EdgeThreshold) {
        coord.x += ViewportInfo.x;
        vec4 right = gatherG(coord + vec2(ViewportInfo.x, 0.0));
        vec4 upDown;
        upDown.xy = gatherG(coord + vec2(0.0, -ViewportInfo.y)).wz;
        upDown.zw = gatherG(coord + vec2(0.0, ViewportInfo.y)).yx;
        float mean = (left.y + left.z + right.x + right.w) * 0.25;
        left -= vec4(mean); right -= vec4(mean); upDown -= vec4(mean);
        color.w = color.y - mean;
        float sum = abs(left.x) + abs(left.y) + abs(left.z) + abs(left.w) + abs(right.x) + abs(right.y) + abs(right.z) + abs(right.w)
                  + abs(upDown.x) + abs(upDown.y) + abs(upDown.z) + abs(upDown.w);
        float std = 2.181818 / max(sum, 1e-5);
        vec2 aWY = weightY(pl.x, pl.y + 1.0, upDown.x, std);
        aWY += weightY(pl.x - 1.0, pl.y + 1.0, upDown.y, std);
        aWY += weightY(pl.x - 1.0, pl.y - 2.0, upDown.z, std);
        aWY += weightY(pl.x, pl.y - 2.0, upDown.w, std);
        aWY += weightY(pl.x + 1.0, pl.y - 1.0, left.x, std);
        aWY += weightY(pl.x, pl.y - 1.0, left.y, std);
        aWY += weightY(pl.x, pl.y, left.z, std);
        aWY += weightY(pl.x + 1.0, pl.y, left.w, std);
        aWY += weightY(pl.x - 1.0, pl.y - 1.0, right.x, std);
        aWY += weightY(pl.x - 2.0, pl.y - 1.0, right.y, std);
        aWY += weightY(pl.x - 2.0, pl.y, right.z, std);
        aWY += weightY(pl.x - 1.0, pl.y, right.w, std);
        float finalY = aWY.y / aWY.x;
        float maxY = max(max(left.y, left.z), max(right.x, right.w));
        float minY = min(min(left.y, left.z), min(right.x, right.w));
        finalY = clamp(EdgeSharpness * finalY, minY, maxY);
        float deltaY = clamp(finalY - color.w, -23.0 / 255.0, 23.0 / 255.0);   // smooth high-contrast input
        color.xyz = clamp(color.xyz + deltaY, 0.0, 1.0);
      }
      gl_FragColor = vec4(color.xyz, src.a);
    }`,
};
