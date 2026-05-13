import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { MediaFile } from "@/types/media";

interface LibraryFolder {
  path: string;
  addedAt: number;
}

interface LibraryState {
  folders: LibraryFolder[];
  items: MediaFile[];
  loading: boolean;
  query: string;
  setItems: (items: MediaFile[]) => void;
  addFolder: (path: string) => void;
  removeFolder: (path: string) => void;
  setLoading: (loading: boolean) => void;
  setQuery: (q: string) => void;
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    immer((set) => ({
      folders: [],
      items: [],
      loading: false,
      query: "",
      setItems: (items) =>
        set((s) => {
          s.items = items;
        }),
      addFolder: (path) =>
        set((s) => {
          if (!s.folders.some((f) => f.path === path)) {
            s.folders.push({ path, addedAt: Date.now() });
          }
        }),
      removeFolder: (path) =>
        set((s) => {
          s.folders = s.folders.filter((f) => f.path !== path);
        }),
      setLoading: (loading) =>
        set((s) => {
          s.loading = loading;
        }),
      setQuery: (q) =>
        set((s) => {
          s.query = q;
        }),
    })),
    {
      name: "tunxkit.library",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ folders: s.folders }),
    },
  ),
);
