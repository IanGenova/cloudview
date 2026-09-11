/**
 * The slug a guest guide section is addressed by: /t/<tag>/guide/<slug>.
 *
 * Built from the title on both ends -- the guide home links to it, and the
 * section page finds the section by rebuilding it from every title -- so the
 * one rule must be shared. It used to be copied into both guest files; the
 * dashboard's "Open in guest portal" link is the third caller and the reason
 * it moved here. A change here changes guest URLs.
 */
export function createGuideSlug(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
