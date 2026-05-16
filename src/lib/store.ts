import { create } from 'zustand';
import type { DocSlug } from './docs';
import type { Tag } from './tags';
import type { TagLocation } from './tagIndex';

export type Highlight = {
  tag: Tag;
  location: TagLocation;
};

type DemoState = {
  activeDoc: DocSlug;
  setActiveDoc: (slug: DocSlug) => void;
  highlights: Highlight[];
  setHighlights: (highlights: Highlight[]) => void;
  clearHighlights: () => void;
  selectTag: (tag: Tag, locations: TagLocation[]) => void;
  applyBeatHighlights: (highlights: Highlight[]) => void;
};

export const useDemoStore = create<DemoState>((set) => ({
  activeDoc: 'pid',
  setActiveDoc: (activeDoc) => set({ activeDoc }),
  highlights: [],
  setHighlights: (highlights) => set({ highlights }),
  clearHighlights: () => set({ highlights: [] }),
  selectTag: (tag, locations) =>
    set((state) => {
      const highlights = locations.map((location) => ({ tag, location }));
      const first = locations[0];
      return {
        highlights,
        activeDoc: first ? first.slug : state.activeDoc,
      };
    }),
  applyBeatHighlights: (highlights) =>
    set((state) => {
      const first = highlights[0];
      return {
        highlights,
        activeDoc: first ? first.location.slug : state.activeDoc,
      };
    }),
}));
