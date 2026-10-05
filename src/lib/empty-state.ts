/**
 * One empty-state vocabulary.
 *
 * The product had two and chose between them by habit: 20 screens said "No
 * <thing> found", which reports on a query, and 35 said "No <thing> yet",
 * which reports on the world. Six then added "Try changing your search or
 * filter" underneath — including on screens where no search had been typed,
 * so a fresh install told the reader to undo something they had never done.
 * On the guest's services screen that was the whole of the dead end: the only
 * instruction on the screen was to clear a filter that was not set.
 *
 * The distinction is not stylistic. If nothing exists, say so and say what
 * would put the first one there. If something exists and a filter is hiding
 * it, say that and offer the way back. A filter cannot hide what was never
 * there, so an empty collection always reports on the world, whatever the
 * filter happens to be set to.
 */

export function pluralise(noun: string, count: number, plural?: string) {
  if (count === 1) {
    return noun;
  }

  return plural ?? `${noun}s`;
}

export type EmptyState = {
  title: string;
  detail: string;
  /** True only when clearing a filter would actually reveal something. */
  canClear: boolean;
};

export function emptyState({
  total,
  filtered,
  noun,
  plural,
  query,
  emptyDetail,
}: {
  /** How many exist before any filter is applied. */
  total: number;
  /** Whether a search term or a filter is currently narrowing the list. */
  filtered: boolean;
  noun: string;
  plural?: string;
  /** The search term, when there is one, so the message can quote it. */
  query?: string;
  /** What would put the first one here. Written by the screen that knows. */
  emptyDetail?: string;
}): EmptyState {
  const many = pluralise(noun, 2, plural);

  if (total === 0) {
    return {
      title: `No ${many} yet`,
      detail: emptyDetail ?? `Nothing has been added here yet.`,
      canClear: false,
    };
  }

  const counted = `${total} ${pluralise(noun, total, plural)}`;

  return {
    title: 'Nothing matches that',
    detail: query
      ? `Nothing here matches “${query}”. There are ${counted} in total.`
      : `The current filters hide all ${counted}.`,
    canClear: true,
  };
}
