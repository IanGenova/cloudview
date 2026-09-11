/**
 * How the guest guide's search understands what a guest typed.
 *
 * The first version was a substring match against the hotel's own spelling,
 * and it returned the section a match lived in rather than the card that held
 * the answer. On the live site "wifi" found nothing while "Wi-Fi" found two,
 * and "breakfast" returned the Dining drawer instead of the Restaurant Hours
 * card. Guests type on phones, fast, without hyphens; the search has to meet
 * them there.
 *
 * Two rules, both pure so they can be tested without React:
 *   - text is compared with case, accents, spaces and punctuation folded away,
 *     so "wi fi", "wifi" and "Wi-Fi" are one word;
 *   - a short synonym table maps the words guests actually use onto the words
 *     hotels actually write.
 *
 * Results are items first -- the answers -- then the sections whose own
 * title, subtitle, description or photo captions matched.
 */

export type GuideSearchItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  content?: string | null;
  hours?: string | null;
  location?: string | null;
  contact?: string | null;
};

export type GuideSearchSection<Item extends GuideSearchItem = GuideSearchItem> = {
  id: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  iconKey?: string | null;
  galleryImages?: Array<{ title?: string | null; caption?: string | null }>;
  items: Item[];
};

export type GuideSearchResult<
  Section extends GuideSearchSection = GuideSearchSection,
> = {
  sections: Section[];
  items: Array<{ section: Section; item: Section['items'][number] }>;
};

/*
 * Guest word -> the words a hotel's guide is likely to contain. Each entry is
 * matched as a whole normalised token, and the expansion is one-directional:
 * a guest who types "internet" should reach the Wi-Fi card; a guest who types
 * "wifi" is already there.
 */
const SYNONYMS: Record<string, string[]> = {
  internet: ['wifi', 'wireless', 'network'],
  wireless: ['wifi'],
  password: ['wifi'],
  login: ['wifi'],
  departure: ['checkout', 'checkin'],
  leave: ['checkout'],
  leaving: ['checkout'],
  arrival: ['checkin', 'checkout'],
  arrive: ['checkin'],
  food: ['dining', 'restaurant', 'breakfast', 'menu'],
  eat: ['dining', 'restaurant', 'menu'],
  dinner: ['dining', 'restaurant'],
  lunch: ['dining', 'restaurant'],
  swim: ['pool'],
  swimming: ['pool'],
  gym: ['fitness'],
  fitness: ['gym'],
  taxi: ['transport', 'transportation', 'car', 'shuttle'],
  airport: ['transport', 'transportation', 'shuttle'],
  phone: ['contact', 'extension', 'call'],
  call: ['contact', 'extension', 'phone'],
  reception: ['frontdesk', 'lobby'],
  frontdesk: ['reception', 'lobby'],
  rules: ['policy', 'policies'],
  smoking: ['policy', 'policies'],
  laundry: ['housekeeping'],
  towels: ['housekeeping'],
  cleaning: ['housekeeping'],
};

/* Case, accents, spaces and punctuation folded away: "Wi-Fi" -> "wifi". */
export function normalizeGuideSearchText(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/*
 * The query is first tried whole -- "check out" folds to "checkout" and must
 * match "Check-out" -- then word by word, so "pool hours" still finds a card
 * that mentions either. Every candidate carries its synonyms.
 */
function queryCandidates(query: string) {
  const whole = normalizeGuideSearchText(query);
  const words = query
    .split(/[^\p{L}\p{N}]+/u)
    .map(normalizeGuideSearchText)
    .filter((word) => word.length >= 2);

  const candidates = new Set<string>();

  for (const token of [whole, ...words]) {
    if (!token) continue;
    candidates.add(token);
    for (const synonym of SYNONYMS[token] ?? []) {
      candidates.add(synonym);
    }
  }

  return [...candidates];
}

function haystackMatches(
  parts: Array<string | null | undefined>,
  candidates: string[]
) {
  const haystack = normalizeGuideSearchText(parts.filter(Boolean).join(' '));

  if (!haystack) return false;

  return candidates.some((candidate) => haystack.includes(candidate));
}

export function searchGuide<Section extends GuideSearchSection>(
  sections: Section[],
  query: string
): GuideSearchResult<Section> {
  const candidates = queryCandidates(query);

  if (candidates.length === 0) {
    return { sections: [], items: [] };
  }

  const matchedSections: Section[] = [];
  const matchedItems: GuideSearchResult<Section>['items'] = [];

  for (const section of sections) {
    const sectionOwnText = [
      section.title,
      section.subtitle,
      section.description,
      ...(section.galleryImages ?? []).map(
        (image) => `${image.title ?? ''} ${image.caption ?? ''}`
      ),
    ];

    if (haystackMatches(sectionOwnText, candidates)) {
      matchedSections.push(section);
    }

    for (const item of section.items) {
      const itemText = [
        item.title,
        item.subtitle,
        item.content,
        item.hours,
        item.location,
        item.contact,
      ];

      if (haystackMatches(itemText, candidates)) {
        matchedItems.push({ section, item });
      }
    }
  }

  return { sections: matchedSections, items: matchedItems };
}
