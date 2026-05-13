# Code Review & Enhancement Plan

## Review scope

Reviewed the React/Tauri video player flow across player playback, keyboard shortcuts, playlist state, library scanning, settings persistence, and package scripts.

## Findings and enhancements

### 1. Player source sync uses stale settings

`Player.tsx` only re-runs the track sync effect when the file path changes, while it reads default volume, default playback rate, remember-position state, and saved positions. This can make playback initialize with stale settings and requires an ESLint disable.

**Implementation:** include all required dependencies, memoize the current saved resume position, remove the lint suppression, and reset player state when no track is loaded.

### 2. Playback position is only persisted every 5 seconds while playing

If a user pauses, switches tracks, or closes soon after seeking, the final position can be lost.

**Implementation:** persist position on pause, seek completion, and cleanup, while keeping the periodic save as a fallback.

### 3. Media state can remain stale after clearing the source

When there is no current track, the video source is removed but store values such as duration/current time/buffered can remain from the previous video.

**Implementation:** add a `resetMediaState` store action and call it when clearing the video source.

### 4. Store values need stronger clamping

`playbackRate`, `duration`, `currentTime`, and `buffered` setters currently accept any finite/non-finite values. Settings can also be set generically without normalization.

**Implementation:** add numeric clamp helpers and normalize player/settings store updates.

### 5. Playlist edge cases

Shuffle can select the same item repeatedly, `repeat: one` with invalid current index can return undefined behavior, and queue start index can become negative.

**Implementation:** clamp queue indices, improve shuffle selection, and guard invalid current indices.

### 6. Library refresh lacks per-folder fault tolerance

A single folder scan failure rejects the entire refresh and leaves no successful folder results.

**Implementation:** use `Promise.allSettled`, keep successful results, and log failed folders without breaking the UI.

### 7. Keyboard shortcut discoverability/conflicts

The playlist button advertises `L`, but `L` is also used for long seek. This is misleading.

**Implementation:** add `q` as a keyboard shortcut for playlist toggle and update the button label to `Q`.

## Validation plan

- Run TypeScript/Vite production build.
- Run ESLint.
- Verify no new lint suppression is needed for the player sync effect.
