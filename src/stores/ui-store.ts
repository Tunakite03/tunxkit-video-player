import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

interface UIState {
  sidebarOpen: boolean;
  playlistOpen: boolean;
  shortcutsHelpOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  togglePlaylist: () => void;
  setPlaylistOpen: (open: boolean) => void;
  openShortcuts: () => void;
  closeShortcuts: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    immer((set) => ({
      sidebarOpen: true,
      playlistOpen: false,
      shortcutsHelpOpen: false,
      toggleSidebar: () =>
        set((s) => {
          s.sidebarOpen = !s.sidebarOpen;
        }),
      setSidebarOpen: (open) =>
        set((s) => {
          s.sidebarOpen = open;
        }),
      togglePlaylist: () =>
        set((s) => {
          s.playlistOpen = !s.playlistOpen;
        }),
      setPlaylistOpen: (open) =>
        set((s) => {
          s.playlistOpen = open;
        }),
      openShortcuts: () =>
        set((s) => {
          s.shortcutsHelpOpen = true;
        }),
      closeShortcuts: () =>
        set((s) => {
          s.shortcutsHelpOpen = false;
        }),
    })),
    {
      name: "tunxkit.ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        playlistOpen: state.playlistOpen,
      }),
    },
  ),
);
