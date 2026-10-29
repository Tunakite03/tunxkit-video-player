import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { isRecord } from "@/lib/persisted";
import type { MediaFile } from "@/types/media";

interface LibraryFolder {
  path: string;
  addedAt: number;
}

interface LibraryState {
  folders: LibraryFolder[];
  items: MediaFile[];
  /** Folders + options that `items` was scanned with; a match means no rescan is needed. */
  scannedKey: string | null;
  loading: boolean;
  query: string;
  setItems: (items: MediaFile[], scannedKey: string | null) => void;
  addFolder: (path: string) => void;
  removeFolder: (path: string) => void;
  setLoading: (loading: boolean) => void;
  setQuery: (q: string) => void;
}

/** Stored library folders that are well formed, without repeats. */
function restoreFolders(value: unknown): LibraryFolder[] | null {
  if (!Array.isArray(value)) return null;
  const folders: LibraryFolder[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const { path, addedAt } = entry;
    if (typeof path !== "string" || path === "" || folders.some((f) => f.path === path)) continue;
    folders.push({ path, addedAt: typeof addedAt === "number" ? addedAt : 0 });
  }
  return folders;
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    immer((set) => ({
      folders: [],
      items: [],
      scannedKey: null,
      loading: false,
      query: "",
      setItems: (items, scannedKey) =>
        set((s) => {
          s.items = items;
          s.scannedKey = scannedKey;
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
      merge: (persisted, current) => ({
        ...current,
        folders: (isRecord(persisted) && restoreFolders(persisted.folders)) || current.folders,
      }),
    },
  ),
);
