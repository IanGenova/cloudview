/**
 * What a gallery photo is called when nobody named it.
 *
 * The dashboard upload used the file's name as the photo's title, with the
 * hyphens turned into spaces. Phones and downloads name files things like
 * "d885ab12-d9f0-43c2-9976-02eddeebb8db.jpg" and "IMG_20260911_101512.jpg",
 * so the live Facilities page showed a guest the caption
 * "d885ab12 d9f0 43c2 9976 02eddeebb8db" in serif type over a hotel photo.
 *
 * A file name is a title only when it reads like one. Otherwise the photo has
 * no title and the screen shows nothing rather than a machine's bookkeeping.
 * The same test is applied when displaying titles already stored, so rows
 * saved before this existed are shown as untitled without a data change.
 */

const MAX_TITLE_LENGTH = 120;

function stripExtension(fileName: string) {
  return fileName.replace(/\.[a-z0-9]{2,5}$/i, '');
}

/* Everything that is not a letter or digit, collapsed to single spaces. */
function tokens(name: string) {
  return name
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

/*
 * The shapes a camera, a phone, a messaging app or a download gives a file.
 * Each is matched against the separator-collapsed name, so "IMG_4521",
 * "IMG-4521" and "IMG 4521" are one shape.
 */
const MACHINE_SHAPES: RegExp[] = [
  /^[0-9a-f]{8} [0-9a-f]{4} [0-9a-f]{4} [0-9a-f]{4} [0-9a-f]{12}$/, // uuid
  /^[0-9a-f]{12,}$/, // bare hex hash
  /^(img|dsc|dscf|dscn|dcim|pxl|mvimg|vid|mov|pano|burst|cimg|sam|p)( ?\d+)+( \d+)*$/,
  /^(screenshot|screen shot|capture|snapshot)\b.*$/,
  /^(whatsapp|telegram|signal|viber|messenger|facebook|instagram) (image|video|photo)\b.*$/,
  /^(image|photo|picture|download|unnamed|untitled|file|new|scan|attachment|upload)( \d+)*$/,
  /^\d[\d ]*$/, // digits only, however separated
];

export function isMachineGeneratedImageName(fileName: string) {
  const name = tokens(stripExtension(fileName));

  if (!name) {
    return true;
  }

  if (MACHINE_SHAPES.some((shape) => shape.test(name))) {
    return true;
  }

  /* A name that is mostly digits is a counter or a timestamp, not a title. */
  const digits = name.replace(/[^0-9]/g, '').length;
  const letters = name.replace(/[^\p{L}]/gu, '').length;

  return digits > 0 && digits >= letters * 2;
}

function humanize(name: string) {
  const spaced = name
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!spaced) {
    return '';
  }

  return (spaced.charAt(0).toUpperCase() + spaced.slice(1)).slice(0, MAX_TITLE_LENGTH);
}

/* The title a freshly uploaded file gets when the form gave none. */
export function imageTitleFromFileName(fileName: string) {
  if (isMachineGeneratedImageName(fileName)) {
    return '';
  }

  return humanize(stripExtension(fileName));
}

/* The title to show for a stored row; machine names present as nothing. */
export function presentableImageTitle(title: string | null | undefined) {
  const trimmed = String(title ?? '').trim();

  if (!trimmed || isMachineGeneratedImageName(trimmed)) {
    return '';
  }

  return trimmed;
}
