/**
 * Keyboard shortcut catalog for the player.
 * Single source of truth: features bind handlers and the help dialog lists these entries.
 */

export interface Shortcut {
  /** Display string for the user. */
  keys: string;
  description: string;
  /** Group label. */
  group: "Playback" | "Navigation" | "Audio" | "View" | "Files";
}

export const SHORTCUTS: Shortcut[] = [
  { keys: "Space", description: "Play / Pause", group: "Playback" },
  { keys: "K", description: "Play / Pause", group: "Playback" },
  { keys: "←", description: "Seek backward 5s", group: "Navigation" },
  { keys: "→", description: "Seek forward 5s", group: "Navigation" },
  { keys: "J", description: "Seek backward 10s", group: "Navigation" },
  { keys: "L", description: "Seek forward 10s", group: "Navigation" },
  { keys: "Home", description: "Jump to start", group: "Navigation" },
  { keys: "End", description: "Jump to end", group: "Navigation" },
  { keys: ",", description: "Frame step back", group: "Navigation" },
  { keys: ".", description: "Frame step forward", group: "Navigation" },
  { keys: "↑", description: "Volume up", group: "Audio" },
  { keys: "↓", description: "Volume down", group: "Audio" },
  { keys: "M", description: "Mute / Unmute", group: "Audio" },
  { keys: "F", description: "Toggle fullscreen", group: "View" },
  { keys: "P", description: "Toggle picture-in-picture", group: "View" },
  { keys: "Esc", description: "Exit fullscreen", group: "View" },
  { keys: "0-9", description: "Seek to 0%-90%", group: "Navigation" },
  { keys: ">", description: "Speed up", group: "Playback" },
  { keys: "<", description: "Slow down", group: "Playback" },
  { keys: "Ctrl+O", description: "Open file…", group: "Files" },
  { keys: "Ctrl+Shift+O", description: "Open folder…", group: "Files" },
];
