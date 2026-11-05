package com.gamescroll.gameservices;

import android.content.Context;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.games.AuthenticationResult;
import com.google.android.gms.games.GamesSignInClient;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;
import com.google.android.gms.games.SnapshotsClient;
import com.google.android.gms.games.snapshot.Snapshot;
import com.google.android.gms.games.snapshot.SnapshotMetadataChange;
import com.google.android.gms.tasks.Task;
import java.nio.charset.StandardCharsets;

/**
 * Google Play Games Services v2: sign-in, achievements, leaderboards and saved games.
 * Stays switched off (signIn answers signedIn: false) until the Play Games project id is set in
 * android/app/src/main/res/values/strings.xml (game_services_project_id).
 */
@CapacitorPlugin(name = "GameServices")
public class GameServicesPlugin extends Plugin {

    private static final int RC_UI = 9004;
    private boolean ready = false;

    @Override
    public void load() {
        if (configured(getContext())) {
            PlayGamesSdk.initialize(getContext());
            ready = true;
        }
    }

    private static boolean configured(Context ctx) {
        int res = ctx.getResources().getIdentifier("game_services_project_id", "string", ctx.getPackageName());
        if (res == 0) return false;
        String id = ctx.getString(res);
        return id.matches("\\d{6,}") && !id.matches("0+");
    }

    private boolean notReady(PluginCall call) {
        if (ready) return false;
        call.reject("Play Games is not set up yet (game_services_project_id)");
        return true;
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        if (!ready) {
            JSObject r = new JSObject();
            r.put("signedIn", false);
            r.put("reason", "not-configured");
            call.resolve(r);
            return;
        }
        GamesSignInClient client = PlayGames.getGamesSignInClient(getActivity());
        // Play Games signs players in automatically at launch; signIn() shows the prompt again.
        Task<AuthenticationResult> task = call.getBoolean("interactive", false) ? client.signIn() : client.isAuthenticated();
        task.addOnCompleteListener(t -> {
            JSObject r = new JSObject();
            boolean ok = t.isSuccessful() && t.getResult() != null && t.getResult().isAuthenticated();
            r.put("signedIn", ok);
            if (!ok) { call.resolve(r); return; }
            PlayGames.getPlayersClient(getActivity()).getCurrentPlayer().addOnCompleteListener(p -> {
                if (p.isSuccessful() && p.getResult() != null) r.put("playerName", p.getResult().getDisplayName());
                call.resolve(r);
            });
        });
    }

    @PluginMethod
    public void unlockAchievement(PluginCall call) {
        if (notReady(call)) return;
        String id = call.getString("id");
        if (id == null) { call.reject("id is required"); return; }
        PlayGames.getAchievementsClient(getActivity()).unlock(id);
        call.resolve();
    }

    @PluginMethod
    public void submitScore(PluginCall call) {
        if (notReady(call)) return;
        String id = call.getString("leaderboardId");
        Long score = call.getLong("score");
        if (id == null || score == null) { call.reject("leaderboardId and score are required"); return; }
        PlayGames.getLeaderboardsClient(getActivity()).submitScore(id, score);
        call.resolve();
    }

    @PluginMethod
    public void showAchievements(PluginCall call) {
        if (notReady(call)) return;
        PlayGames.getAchievementsClient(getActivity()).getAchievementsIntent()
            .addOnSuccessListener(intent -> { getActivity().startActivityForResult(intent, RC_UI); call.resolve(); })
            .addOnFailureListener(e -> call.reject(e.getMessage()));
    }

    @PluginMethod
    public void showLeaderboards(PluginCall call) {
        if (notReady(call)) return;
        PlayGames.getLeaderboardsClient(getActivity()).getAllLeaderboardsIntent()
            .addOnSuccessListener(intent -> { getActivity().startActivityForResult(intent, RC_UI); call.resolve(); })
            .addOnFailureListener(e -> call.reject(e.getMessage()));
    }

    @PluginMethod
    public void saveGame(PluginCall call) {
        if (notReady(call)) return;
        String name = call.getString("name"), data = call.getString("data");
        if (name == null || data == null) { call.reject("name and data are required"); return; }
        String description = call.getString("description", "");
        SnapshotsClient snaps = PlayGames.getSnapshotsClient(getActivity());
        // The app merges every copy before saving, so the newest write is always the full picture.
        snaps.open(name, true, SnapshotsClient.RESOLUTION_POLICY_MOST_RECENTLY_MODIFIED).addOnCompleteListener(t -> {
            if (!t.isSuccessful() || t.getResult() == null) { call.reject("Could not open the save"); return; }
            SnapshotsClient.DataOrConflict<Snapshot> doc = t.getResult();
            Snapshot snap = doc.isConflict() ? doc.getConflict().getSnapshot() : doc.getData();
            snap.getSnapshotContents().writeBytes(data.getBytes(StandardCharsets.UTF_8));
            SnapshotMetadataChange meta = new SnapshotMetadataChange.Builder().setDescription(description).build();
            snaps.commitAndClose(snap, meta).addOnCompleteListener(c -> {
                if (c.isSuccessful()) call.resolve(); else call.reject("Could not write the save");
            });
        });
    }

    /** Returns { data, all }: when two devices saved at once, `all` holds both copies for the app to merge. */
    @PluginMethod
    public void loadGame(PluginCall call) {
        if (notReady(call)) return;
        String name = call.getString("name");
        if (name == null) { call.reject("name is required"); return; }
        SnapshotsClient snaps = PlayGames.getSnapshotsClient(getActivity());
        snaps.open(name, false, SnapshotsClient.RESOLUTION_POLICY_MANUAL).addOnCompleteListener(t -> {
            JSObject r = new JSObject();
            JSArray all = new JSArray();
            if (!t.isSuccessful() || t.getResult() == null) {   // no save yet
                r.put("data", null); r.put("all", all); call.resolve(r); return;
            }
            try {
                SnapshotsClient.DataOrConflict<Snapshot> doc = t.getResult();
                if (doc.isConflict()) {
                    SnapshotsClient.SnapshotConflict conflict = doc.getConflict();
                    all.put(read(conflict.getSnapshot()));
                    all.put(read(conflict.getConflictingSnapshot()));
                    // Keep one copy now; the app writes the merged data on its next save.
                    snaps.resolveConflict(conflict.getConflictId(), conflict.getSnapshot());
                } else {
                    Snapshot snap = doc.getData();
                    all.put(read(snap));
                    snaps.discardAndClose(snap);
                }
                r.put("data", all.length() > 0 ? all.getString(0) : null);
                r.put("all", all);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Could not read the save: " + e.getMessage());
            }
        });
    }

    private static String read(Snapshot snap) throws java.io.IOException {
        return new String(snap.getSnapshotContents().readFully(), StandardCharsets.UTF_8);
    }
}
