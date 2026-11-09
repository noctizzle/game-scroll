package com.gamescroll.phoneai;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import com.google.common.util.concurrent.FutureCallback;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.genai.common.DownloadCallback;
import com.google.mlkit.genai.common.FeatureStatus;
import com.google.mlkit.genai.common.GenAiException;
import com.google.mlkit.genai.prompt.Candidate;
import com.google.mlkit.genai.prompt.GenerateContentRequest;
import com.google.mlkit.genai.prompt.GenerateContentResponse;
import com.google.mlkit.genai.prompt.Generation;
import com.google.mlkit.genai.prompt.TextPart;
import com.google.mlkit.genai.prompt.java.GenerativeModelFutures;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executor;

/**
 * Game Scroll's on-device smarts (src/kit/hear.js Voice, src/kit/phoneai.js PhoneAI).
 *
 * Speech: only the phone's ON-DEVICE recogniser (Android 12+, SpeechRecognizer.createOnDeviceSpeechRecognizer),
 * so what the player says never leaves the phone. Phones without one say speechAvailable false and
 * games use their touch controls instead.
 *   speechAvailable({ language }) -> { available }
 *   speechStart({ language, words })  events 'speech' { text, final } and 'speechEnd' {}
 *   speechStop()
 *
 * Language model: Gemini Nano through ML Kit GenAI (AICore), where the phone has it.
 *   modelAvailable() -> { available, status: 'available' | 'downloadable' | 'downloading' | 'unavailable' }
 *   modelAsk({ prompt, instructions, maxTokens, temperature }) -> { text } (text null when it couldn't answer)
 */
@CapacitorPlugin(
    name = "PhoneAI",
    permissions = { @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone") }
)
public class PhoneAIPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Executor onMain = main::post;
    private SpeechRecognizer recognizer;
    private GenerativeModelFutures model;
    private boolean downloading = false;

    // ------------------------------------------------------------------ speech

    private boolean onDeviceSpeech() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
    }

    @PluginMethod
    public void speechAvailable(PluginCall call) {
        JSObject r = new JSObject();
        r.put("available", onDeviceSpeech());
        call.resolve(r);
    }

    @PluginMethod
    public void speechStart(PluginCall call) {
        if (!onDeviceSpeech()) { JSObject r = new JSObject(); r.put("started", false); call.resolve(r); return; }
        if (getPermissionState("microphone") != PermissionState.GRANTED) { requestPermissionForAlias("microphone", call, "micAnswered"); return; }
        startListening(call);
    }

    @PermissionCallback
    private void micAnswered(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) { JSObject r = new JSObject(); r.put("started", false); call.resolve(r); return; }
        startListening(call);
    }

    private void startListening(PluginCall call) {
        final String language = call.getString("language", "en-GB");
        main.post(() -> {
            try {
                stopRecognizer();
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) { JSObject r = new JSObject(); r.put("started", false); call.resolve(r); return; }
                recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
                recognizer.setRecognitionListener(new RecognitionListener() {
                    @Override public void onReadyForSpeech(Bundle params) {}
                    @Override public void onBeginningOfSpeech() {}
                    @Override public void onRmsChanged(float rmsdB) {}
                    @Override public void onBufferReceived(byte[] buffer) {}
                    @Override public void onEndOfSpeech() {}
                    @Override public void onError(int error) { ended(); }
                    @Override public void onResults(Bundle results) { send(results, true); ended(); }
                    @Override public void onPartialResults(Bundle partialResults) { send(partialResults, false); }
                    @Override public void onEvent(int eventType, Bundle params) {}
                });
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                recognizer.startListening(intent);
                JSObject r = new JSObject(); r.put("started", true); call.resolve(r);
            } catch (Exception e) {
                stopRecognizer();
                JSObject r = new JSObject(); r.put("started", false); call.resolve(r);
            }
        });
    }

    private void send(Bundle b, boolean isFinal) {
        if (b == null) return;
        ArrayList<String> m = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (m == null || m.isEmpty()) return;
        JSObject r = new JSObject();
        r.put("text", m.get(0));
        r.put("final", isFinal);
        notifyListeners("speech", r);
    }

    private void ended() {
        main.post(this::stopRecognizer);
        notifyListeners("speechEnd", new JSObject());
    }

    private void stopRecognizer() {
        if (recognizer == null) return;
        try { recognizer.cancel(); recognizer.destroy(); } catch (Exception ignored) {}
        recognizer = null;
    }

    @PluginMethod
    public void speechStop(PluginCall call) {
        main.post(this::stopRecognizer);
        call.resolve();
    }

    @Override
    protected void handleOnPause() { main.post(this::stopRecognizer); super.handleOnPause(); }

    @Override
    protected void handleOnDestroy() { main.post(this::stopRecognizer); super.handleOnDestroy(); }

    // ------------------------------------------------------------------ language model

    private GenerativeModelFutures model() {
        if (model == null) model = GenerativeModelFutures.from(Generation.INSTANCE.getClient());
        return model;
    }

    private static String statusName(int s) {
        switch (s) {
            case FeatureStatus.AVAILABLE: return "available";
            case FeatureStatus.DOWNLOADABLE: return "downloadable";
            case FeatureStatus.DOWNLOADING: return "downloading";
            default: return "unavailable";
        }
    }

    @PluginMethod
    public void modelAvailable(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) { answerStatus(call, FeatureStatus.UNAVAILABLE); return; }
        try {
            Futures.addCallback(model().checkStatus(), new FutureCallback<Integer>() {
                @Override public void onSuccess(Integer s) {
                    int status = s == null ? FeatureStatus.UNAVAILABLE : s;
                    // the model isn't on the phone yet but can be: fetch it in the background (once)
                    if (status == FeatureStatus.DOWNLOADABLE && !downloading) fetchModel();
                    answerStatus(call, status);
                }
                @Override public void onFailure(Throwable t) { answerStatus(call, FeatureStatus.UNAVAILABLE); }
            }, onMain);
        } catch (Throwable t) {
            answerStatus(call, FeatureStatus.UNAVAILABLE);
        }
    }

    private void answerStatus(PluginCall call, int status) {
        JSObject r = new JSObject();
        r.put("available", status == FeatureStatus.AVAILABLE);
        r.put("status", statusName(status));
        call.resolve(r);
    }

    private void fetchModel() {
        downloading = true;
        try {
            model().download(new DownloadCallback() {
                @Override public void onDownloadStarted(long bytesToDownload) {}
                @Override public void onDownloadProgress(long totalBytesDownloaded) {}
                @Override public void onDownloadCompleted() { downloading = false; }
                @Override public void onDownloadFailed(GenAiException e) { downloading = false; }
            });
        } catch (Throwable t) { downloading = false; }
    }

    @PluginMethod
    public void modelAsk(PluginCall call) {
        String prompt = call.getString("prompt", "");
        String instructions = call.getString("instructions", "");
        if (prompt != null && instructions != null && !instructions.isEmpty()) prompt = instructions + "\n\n" + prompt;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || prompt == null || prompt.isEmpty()) { answerText(call, null); return; }
        try {
            GenerateContentRequest.Builder b = new GenerateContentRequest.Builder(new TextPart(prompt));
            b.setTemperature(call.getFloat("temperature", 0.8f));
            b.setMaxOutputTokens(Math.max(8, Math.min(256, call.getInt("maxTokens", 80))));
            b.setCandidateCount(1);
            ListenableFuture<GenerateContentResponse> f = model().generateContent(b.build());
            Futures.addCallback(f, new FutureCallback<GenerateContentResponse>() {
                @Override public void onSuccess(GenerateContentResponse res) {
                    String text = null;
                    if (res != null) {
                        List<Candidate> c = res.getCandidates();
                        if (c != null && !c.isEmpty()) text = c.get(0).getText();
                    }
                    answerText(call, text);
                }
                @Override public void onFailure(Throwable t) { answerText(call, null); }
            }, onMain);
        } catch (Throwable t) {
            answerText(call, null);
        }
    }

    private void answerText(PluginCall call, String text) {
        JSObject r = new JSObject();
        if (text == null) r.put("text", JSObject.NULL); else r.put("text", text);
        call.resolve(r);
    }
}
