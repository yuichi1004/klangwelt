"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

import {
  EMPTY_FAVORITES,
  getFavoritesServerSnapshot,
  getFavoritesSnapshot,
  persistFavorites,
  subscribeToFavorites,
  toggleFavorite as toggle,
} from "@/lib/favorites";

interface FavoritesContextValue {
  workIds: string[];
  /**
   * False until localStorage has been read. The site is statically exported,
   * so the server HTML cannot know the user's favourites — stars render in a
   * neutral state until this flips, which avoids a hydration mismatch and a
   * visible flicker from "off" to "on".
   */
  ready: boolean;
  isFavorite: (workId: string) => boolean;
  toggleFavorite: (workId: string) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  // localStorage is an external store, so React subscribes to it directly
  // rather than mirroring it into component state.
  const state = useSyncExternalStore(
    subscribeToFavorites,
    getFavoritesSnapshot,
    getFavoritesServerSnapshot,
  );

  const toggleFavorite = useCallback((workId: string) => {
    persistFavorites(toggle(getFavoritesSnapshot(), workId));
  }, []);

  const value = useMemo<FavoritesContextValue>(() => {
    const current = state ?? EMPTY_FAVORITES;
    const ids = new Set(current.workIds);
    return {
      workIds: current.workIds,
      ready: state !== null,
      isFavorite: (workId: string) => ids.has(workId),
      toggleFavorite,
    };
  }, [state, toggleFavorite]);

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error("useFavorites must be used inside FavoritesProvider");
  }
  return context;
}
