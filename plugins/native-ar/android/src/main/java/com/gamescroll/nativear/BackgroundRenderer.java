package com.gamescroll.nativear;

import android.opengl.GLES11Ext;
import android.opengl.GLES20;
import com.google.ar.core.Coordinates2d;
import com.google.ar.core.Frame;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;

/** Draws ARCore's camera picture full screen (the standard external-texture quad). GL thread only. */
class BackgroundRenderer {

    private static final String VS =
        "attribute vec4 a_Position;\n" +
        "attribute vec2 a_TexCoord;\n" +
        "varying vec2 v_TexCoord;\n" +
        "void main() { gl_Position = a_Position; v_TexCoord = a_TexCoord; }\n";

    private static final String FS =
        "#extension GL_OES_EGL_image_external : require\n" +
        "precision mediump float;\n" +
        "varying vec2 v_TexCoord;\n" +
        "uniform samplerExternalOES u_Texture;\n" +
        "void main() { gl_FragColor = texture2D(u_Texture, v_TexCoord); }\n";

    private static final float[] QUAD = { -1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f };

    private final FloatBuffer quad = buffer(8);
    private final FloatBuffer uv = buffer(8);
    private int textureId = -1;
    private int program, aPos, aTex, uTex;

    private static FloatBuffer buffer(int n) {
        return ByteBuffer.allocateDirect(n * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
    }

    int textureId() {
        return textureId;
    }

    void create() {
        int[] t = new int[1];
        GLES20.glGenTextures(1, t, 0);
        textureId = t[0];
        int target = GLES11Ext.GL_TEXTURE_EXTERNAL_OES;
        GLES20.glBindTexture(target, textureId);
        GLES20.glTexParameteri(target, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameteri(target, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameteri(target, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(target, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);

        quad.put(QUAD).position(0);
        program = GLES20.glCreateProgram();
        GLES20.glAttachShader(program, shader(GLES20.GL_VERTEX_SHADER, VS));
        GLES20.glAttachShader(program, shader(GLES20.GL_FRAGMENT_SHADER, FS));
        GLES20.glLinkProgram(program);
        aPos = GLES20.glGetAttribLocation(program, "a_Position");
        aTex = GLES20.glGetAttribLocation(program, "a_TexCoord");
        uTex = GLES20.glGetUniformLocation(program, "u_Texture");
    }

    private static int shader(int type, String src) {
        int s = GLES20.glCreateShader(type);
        GLES20.glShaderSource(s, src);
        GLES20.glCompileShader(s);
        return s;
    }

    void draw(Frame frame) {
        if (frame.hasDisplayGeometryChanged()) {
            quad.position(0);
            uv.position(0);
            frame.transformCoordinates2d(Coordinates2d.OPENGL_NORMALIZED_DEVICE_COORDINATES, quad, Coordinates2d.TEXTURE_NORMALIZED, uv);
        }
        if (frame.getTimestamp() == 0) return; // no camera picture yet
        quad.position(0);
        uv.position(0);
        GLES20.glDisable(GLES20.GL_DEPTH_TEST);
        GLES20.glDepthMask(false);
        GLES20.glUseProgram(program);
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0);
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId);
        GLES20.glUniform1i(uTex, 0);
        GLES20.glVertexAttribPointer(aPos, 2, GLES20.GL_FLOAT, false, 0, quad);
        GLES20.glVertexAttribPointer(aTex, 2, GLES20.GL_FLOAT, false, 0, uv);
        GLES20.glEnableVertexAttribArray(aPos);
        GLES20.glEnableVertexAttribArray(aTex);
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
        GLES20.glDisableVertexAttribArray(aPos);
        GLES20.glDisableVertexAttribArray(aTex);
        GLES20.glDepthMask(true);
        GLES20.glEnable(GLES20.GL_DEPTH_TEST);
    }
}
