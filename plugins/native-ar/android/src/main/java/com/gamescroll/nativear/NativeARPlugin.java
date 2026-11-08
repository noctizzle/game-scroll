package com.gamescroll.nativear;

import android.Manifest;
import android.graphics.Color;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.view.Surface;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebView;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.ar.core.ArCoreApk;
import com.google.ar.core.Camera;
import com.google.ar.core.Config;
import com.google.ar.core.Frame;
import com.google.ar.core.HitResult;
import com.google.ar.core.LightEstimate;
import com.google.ar.core.Plane;
import com.google.ar.core.Point;
import com.google.ar.core.Session;
import com.google.ar.core.Trackable;
import com.google.ar.core.TrackingState;
import java.util.ArrayList;
import java.util.List;
import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

/**
 * Native AR for the AR · 3D games (src/kit/ar3d.js), using ARCore.
 *
 * The camera picture is drawn by a GLSurfaceView placed BEHIND the (transparent) WebView, and every
 * frame the phone's pose, the projection and the light estimate go to JavaScript as a "frame" event,
 * where three.js draws the game on top. Detected horizontal surfaces go out as a "planes" event a few
 * times a second, and hitTest() finds where a screen point meets a real surface.
 *
 * JS: start() -> { started, reason? }, stop(), hitTest({ x, y }) (CSS pixels) -> { hits: [{ pose, kind }] },
 * available() -> { supported, installed, status }. Matrices are 16 floats, column-major, in metres.
 */
@CapacitorPlugin(name = "NativeAR", permissions = { @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera") })
public class NativeARPlugin extends Plugin implements GLSurfaceView.Renderer {

    private Session session;
    private GLSurfaceView glView;
    private final BackgroundRenderer background = new BackgroundRenderer();
    private volatile boolean running = false;
    private boolean installRequested = false;
    private boolean textureSet = false;
    private int frameNo = 0;
    private final List<PluginCall> pendingHits = new ArrayList<>();

    @PluginMethod
    public void available(PluginCall call) {
        ArCoreApk.Availability a = ArCoreApk.getInstance().checkAvailability(getContext());
        JSObject r = new JSObject();
        r.put("supported", a.isSupported() || a.isTransient());
        r.put("installed", a == ArCoreApk.Availability.SUPPORTED_INSTALLED);
        r.put("status", a.name());
        call.resolve(r);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "cameraPermission");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void cameraPermission(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) begin(call);
        else notStarted(call, "camera");
    }

    private void notStarted(PluginCall call, String reason) {
        JSObject r = new JSObject();
        r.put("started", false);
        r.put("reason", reason);
        call.resolve(r);
    }

    private void begin(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (session == null) {
                    // First use: ARCore (Google Play Services for AR) may need installing from the Play Store.
                    ArCoreApk.InstallStatus st = ArCoreApk.getInstance().requestInstall(getActivity(), !installRequested);
                    if (st == ArCoreApk.InstallStatus.INSTALL_REQUESTED) {
                        installRequested = true;
                        notStarted(call, "installing");
                        return;
                    }
                    session = new Session(getContext());
                    Config cfg = new Config(session);
                    cfg.setPlaneFindingMode(Config.PlaneFindingMode.HORIZONTAL);
                    cfg.setLightEstimationMode(Config.LightEstimationMode.AMBIENT_INTENSITY);
                    cfg.setFocusMode(Config.FocusMode.AUTO);
                    cfg.setUpdateMode(Config.UpdateMode.LATEST_CAMERA_IMAGE);
                    session.configure(cfg);
                }
                if (glView == null) {
                    glView = new GLSurfaceView(getContext());
                    glView.setPreserveEGLContextOnPause(true);
                    glView.setEGLContextClientVersion(2);
                    glView.setEGLConfigChooser(8, 8, 8, 8, 16, 0);
                    glView.setRenderer(this);
                    glView.setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);
                }
                WebView web = getBridge().getWebView();
                ViewGroup parent = (ViewGroup) web.getParent();
                if (glView.getParent() == null) {
                    // behind the WebView, exactly its size and place (the page is made see-through while
                    // an AR game plays, and the game lines its 3D up with the WebView's area)
                    parent.addView(glView, parent.indexOfChild(web), new ViewGroup.LayoutParams(Math.max(1, web.getWidth()), Math.max(1, web.getHeight())));
                    matchWebView(web);
                    if (!layoutHooked) {
                        layoutHooked = true;
                        web.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> { if (glView != null && glView.getParent() != null) matchWebView(web); });
                    }
                }
                web.setBackgroundColor(Color.TRANSPARENT);
                session.resume();
                glView.onResume();
                running = true;
                frameNo = 0;
                JSObject r = new JSObject();
                r.put("started", true);
                call.resolve(r);
            } catch (Exception e) {
                Logger.error("NativeAR", "start failed", e);
                teardown();
                notStarted(call, e.getClass().getSimpleName());
            }
        });
    }

    private boolean layoutHooked = false;

    private void matchWebView(WebView web) {
        ViewGroup.LayoutParams lp = glView.getLayoutParams();
        if (lp.width != web.getWidth() || lp.height != web.getHeight()) {
            lp.width = Math.max(1, web.getWidth());
            lp.height = Math.max(1, web.getHeight());
            glView.setLayoutParams(lp);
        }
        glView.setX(web.getX());
        glView.setY(web.getY());
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            teardown();
            call.resolve();
        });
    }

    private static final int APP_BACKGROUND = Color.parseColor("#0c0e12");

    private void teardown() {
        running = false;
        if (session != null) session.pause();
        if (glView != null) {
            glView.onPause();
            if (glView.getParent() != null) ((ViewGroup) glView.getParent()).removeView(glView);
        }
        // start() made the page see-through so the camera shows behind it: make it solid again
        // (the app's background colour, capacitor.config.json backgroundColor).
        WebView web = getBridge().getWebView();
        if (web != null) web.setBackgroundColor(APP_BACKGROUND);
        textureSet = false;
        synchronized (pendingHits) {
            for (PluginCall c : pendingHits) c.resolve(noHits());
            pendingHits.clear();
        }
    }

    /** Where a point on the screen (CSS pixels) meets a real surface. Answered on the next frame. */
    @PluginMethod
    public void hitTest(PluginCall call) {
        if (!running) {
            call.resolve(noHits());
            return;
        }
        synchronized (pendingHits) {
            pendingHits.add(call);
        }
    }

    private static JSObject noHits() {
        JSObject r = new JSObject();
        r.put("hits", new JSArray());
        return r;
    }

    @Override
    protected void handleOnPause() {
        if (running && session != null) {
            session.pause();
            if (glView != null) glView.onPause();
        }
    }

    @Override
    protected void handleOnResume() {
        if (running && session != null) {
            try {
                session.resume();
                if (glView != null) glView.onResume();
            } catch (Exception e) {
                Logger.error("NativeAR", "resume failed", e);
            }
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (session != null) session.close();
        session = null;
    }

    /* ---------- GL thread ---------- */

    @Override
    public void onSurfaceCreated(GL10 gl, EGLConfig config) {
        GLES20.glClearColor(0f, 0f, 0f, 1f);
        background.create();
        textureSet = false;
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onSurfaceChanged(GL10 gl, int width, int height) {
        GLES20.glViewport(0, 0, width, height);
        WindowManager wm = getActivity().getWindowManager();
        int rotation = wm.getDefaultDisplay().getRotation();
        if (session != null) session.setDisplayGeometry(rotation, width, height);
    }

    @Override
    public void onDrawFrame(GL10 gl) {
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT | GLES20.GL_DEPTH_BUFFER_BIT);
        if (!running || session == null) return;
        try {
            if (!textureSet) {
                session.setCameraTextureName(background.textureId());
                textureSet = true;
            }
            Frame frame = session.update();
            background.draw(frame);
            Camera cam = frame.getCamera();

            JSObject d = new JSObject();
            float[] pose = new float[16];
            float[] proj = new float[16];
            cam.getDisplayOrientedPose().toMatrix(pose, 0);
            cam.getProjectionMatrix(proj, 0, 0.05f, 100f);
            d.put("t", frame.getTimestamp() / 1e6);
            d.put("tracking", cam.getTrackingState().name());
            d.put("pose", JSArray.from(pose));
            d.put("proj", JSArray.from(proj));
            LightEstimate le = frame.getLightEstimate();
            if (le.getState() == LightEstimate.State.VALID) {
                float[] cc = new float[4];
                le.getColorCorrection(cc, 0);
                JSObject light = new JSObject();
                light.put("intensity", le.getPixelIntensity());
                light.put("color", JSArray.from(new float[] { cc[0], cc[1], cc[2] }));
                d.put("light", light);
            }
            getActivity().runOnUiThread(() -> notifyListeners("frame", d));

            if (frameNo++ % 15 == 0) sendPlanes();
            answerHits(frame);
        } catch (Exception e) {
            Logger.error("NativeAR", "frame failed", e);
        }
    }

    private void sendPlanes() {
        JSArray list = new JSArray();
        for (Plane p : session.getAllTrackables(Plane.class)) {
            if (p.getTrackingState() != TrackingState.TRACKING || p.getSubsumedBy() != null) continue;
            if (p.getType() != Plane.Type.HORIZONTAL_UPWARD_FACING) continue;
            float[] m = new float[16];
            p.getCenterPose().toMatrix(m, 0);
            JSObject o = new JSObject();
            o.put("id", String.valueOf(p.hashCode()));
            o.put("pose", JSArray.from(m));
            o.put("w", p.getExtentX());
            o.put("d", p.getExtentZ());
            list.put(o);
        }
        JSObject d = new JSObject();
        d.put("planes", list);
        getActivity().runOnUiThread(() -> notifyListeners("planes", d));
    }

    private void answerHits(Frame frame) {
        List<PluginCall> calls;
        synchronized (pendingHits) {
            if (pendingHits.isEmpty()) return;
            calls = new ArrayList<>(pendingHits);
            pendingHits.clear();
        }
        float density = getContext().getResources().getDisplayMetrics().density;
        for (PluginCall call : calls) {
            float x = call.getFloat("x", 0f) * density, y = call.getFloat("y", 0f) * density;
            JSArray hits = new JSArray();
            for (HitResult h : frame.hitTest(x, y)) {
                Trackable t = h.getTrackable();
                boolean plane = t instanceof Plane && ((Plane) t).isPoseInPolygon(h.getHitPose()) && ((Plane) t).getType() == Plane.Type.HORIZONTAL_UPWARD_FACING;
                boolean point = t instanceof Point;
                if (!plane && !point) continue;
                float[] m = new float[16];
                h.getHitPose().toMatrix(m, 0);
                JSObject o = new JSObject();
                o.put("pose", JSArray.from(m));
                o.put("kind", plane ? "plane" : "point");
                hits.put(o);
                break;
            }
            JSObject r = new JSObject();
            r.put("hits", hits);
            call.resolve(r);
        }
    }
}
