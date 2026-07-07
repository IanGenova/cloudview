export type DashboardThemePaletteId = string;

export type DashboardThemePaletteCategory =
  | 'CloudView Recommended'
  | 'Figma Minimal & Neutral'
  | 'Figma Warm'
  | 'Figma Cool'
  | 'Figma Vibrant & Bold'
  | 'Figma Modern';

export type DashboardThemePalette = {
  id: DashboardThemePaletteId;
  name: string;
  shortName: string;
  category: DashboardThemePaletteCategory;
  description: string;
  swatches: string[];
  variables: Record<string, string>;
};

export const THEME_PALETTE_STORAGE_KEY = 'cloudview-theme-palette';
export const THEME_PALETTE_EVENT = 'cloudview-theme-palette-change';
export const DEFAULT_THEME_PALETTE_ID: DashboardThemePaletteId = 'luxe-gold';

export const DASHBOARD_THEME_PALETTE_CATEGORIES: DashboardThemePaletteCategory[] = [
  'CloudView Recommended',
  'Figma Minimal & Neutral',
  'Figma Warm',
  'Figma Cool',
  'Figma Vibrant & Bold',
  'Figma Modern',
];

type PaletteInput = {
  id: string;
  name: string;
  shortName: string;
  category: DashboardThemePaletteCategory;
  description: string;
  ink: string;
  inkSoft: string;
  accent: string;
  accentStrong: string;
  accentHover: string;
  accentSoft: string;
  bg: string;
  card?: string;
  cardMuted?: string;
  border: string;
  text: string;
  muted: string;
  onAccent?: string;
  sidebarBg?: string;
  sidebarStrong?: string;
  sidebarGlow?: string;
  sidebarBorder?: string;
  sidebarText?: string;
  sidebarTextStrong?: string;
  sidebarMuted?: string;
  swatches?: string[];
};

function makePalette(input: PaletteInput): DashboardThemePalette {
  const card = input.card ?? '#FFFFFF';
  const cardMuted = input.cardMuted ?? input.accentSoft;
  const sidebarBg = input.sidebarBg ?? input.ink;
  const sidebarStrong = input.sidebarStrong ?? input.inkSoft;
  const sidebarGlow = input.sidebarGlow ?? input.accentStrong;
  const sidebarBorder = input.sidebarBorder ?? input.inkSoft;
  const sidebarText = input.sidebarText ?? input.accentHover;
  const sidebarTextStrong = input.sidebarTextStrong ?? '#FFFFFF';
  const sidebarMuted = input.sidebarMuted ?? input.muted;

  return {
    id: input.id,
    name: input.name,
    shortName: input.shortName,
    category: input.category,
    description: input.description,
    swatches: input.swatches ?? [input.ink, input.accent, input.accentHover, input.bg],
    variables: {
      '--background': input.bg,
      '--foreground': input.text,
      '--cv-ink': input.ink,
      '--cv-ink-soft': input.inkSoft,
      '--cv-on-accent': input.onAccent ?? '#FFFFFF',
      '--cv-accent': input.accent,
      '--cv-accent-strong': input.accentStrong,
      '--cv-accent-hover': input.accentHover,
      '--cv-accent-soft': input.accentSoft,
      '--cv-bg': input.bg,
      '--cv-card': card,
      '--cv-card-muted': cardMuted,
      '--cv-border': input.border,
      '--cv-text': input.text,
      '--cv-muted': input.muted,
      '--cv-sidebar-bg': sidebarBg,
      '--cv-sidebar-strong': sidebarStrong,
      '--cv-sidebar-glow': sidebarGlow,
      '--cv-sidebar-border': sidebarBorder,
      '--cv-sidebar-text': sidebarText,
      '--cv-sidebar-text-strong': sidebarTextStrong,
      '--cv-sidebar-muted': sidebarMuted,
    },
  };
}

const cloudViewRecommended: DashboardThemePalette[] = [
  makePalette({
    id: 'luxe-gold',
    name: 'CloudView Luxe Gold',
    shortName: 'Luxe Gold',
    category: 'CloudView Recommended',
    description: 'Premium hotel black, champagne gold, and warm pearl surfaces.',
    ink: '#11100B',
    inkSoft: '#1C1710',
    accent: '#C99C38',
    accentStrong: '#9A6B18',
    accentHover: '#F1C66A',
    accentSoft: '#FFF8E7',
    bg: '#FAF7F0',
    cardMuted: '#F6F1E8',
    border: '#E8E1D4',
    text: '#171717',
    muted: '#6B665C',
    onAccent: '#090806',
    sidebarBg: '#070604',
    sidebarStrong: '#15110A',
    sidebarGlow: '#39290F',
    sidebarBorder: '#272014',
    sidebarText: '#D8CAA7',
    sidebarTextStrong: '#FFF2C9',
    sidebarMuted: '#8A7A58',
  }),
  makePalette({
    id: 'emerald-hotel',
    name: 'Emerald Hotel',
    shortName: 'Emerald',
    category: 'CloudView Recommended',
    description: 'Fresh boutique-hotel green with warm neutral cards.',
    ink: '#071A13',
    inkSoft: '#0E2A20',
    accent: '#10B981',
    accentStrong: '#047857',
    accentHover: '#6EE7B7',
    accentSoft: '#DFFBF0',
    bg: '#F3FBF7',
    cardMuted: '#ECFDF5',
    border: '#CDEFE1',
    text: '#10221B',
    muted: '#527064',
    onAccent: '#04110C',
    sidebarBg: '#04110C',
    sidebarStrong: '#0B241A',
    sidebarGlow: '#0E3B2B',
    sidebarBorder: '#123D2D',
    sidebarText: '#BFE8D7',
    sidebarTextStrong: '#E9FFF5',
    sidebarMuted: '#72A48F',
  }),
  makePalette({
    id: 'sapphire-desk',
    name: 'Sapphire Desk',
    shortName: 'Sapphire',
    category: 'CloudView Recommended',
    description: 'Clean front-desk navy with sapphire action highlights.',
    ink: '#071225',
    inkSoft: '#101B33',
    accent: '#2563EB',
    accentStrong: '#1D4ED8',
    accentHover: '#93C5FD',
    accentSoft: '#DBEAFE',
    bg: '#F5F8FF',
    cardMuted: '#EFF6FF',
    border: '#D7E4F8',
    text: '#0F172A',
    muted: '#52627A',
    onAccent: '#F8FBFF',
    sidebarBg: '#030A18',
    sidebarStrong: '#071225',
    sidebarGlow: '#123A78',
    sidebarBorder: '#15294D',
    sidebarText: '#BFDBFE',
    sidebarTextStrong: '#EFF6FF',
    sidebarMuted: '#7EA6D9',
  }),
  makePalette({
    id: 'rose-premium',
    name: 'Rose Premium',
    shortName: 'Rose',
    category: 'CloudView Recommended',
    description: 'Elegant wine and rose-gold palette for premium properties.',
    ink: '#1C0711',
    inkSoft: '#2A0D19',
    accent: '#E11D48',
    accentStrong: '#BE123C',
    accentHover: '#FDA4AF',
    accentSoft: '#FFE4E6',
    bg: '#FFF5F7',
    cardMuted: '#FFF1F2',
    border: '#F6D5DB',
    text: '#241018',
    muted: '#785A63',
    onAccent: '#FFF7F9',
    sidebarBg: '#12050B',
    sidebarStrong: '#230814',
    sidebarGlow: '#4A1023',
    sidebarBorder: '#3B1020',
    sidebarText: '#FBCDD5',
    sidebarTextStrong: '#FFF1F3',
    sidebarMuted: '#B47A88',
  }),
  makePalette({
    id: 'minimal-slate',
    name: 'Minimal Slate',
    shortName: 'Slate',
    category: 'CloudView Recommended',
    description: 'Neutral modern dashboard palette with quiet slate accents.',
    ink: '#0F172A',
    inkSoft: '#1E293B',
    accent: '#64748B',
    accentStrong: '#334155',
    accentHover: '#CBD5E1',
    accentSoft: '#F1F5F9',
    bg: '#F8FAFC',
    cardMuted: '#F1F5F9',
    border: '#E2E8F0',
    text: '#0F172A',
    muted: '#64748B',
    onAccent: '#F8FAFC',
    sidebarBg: '#020617',
    sidebarStrong: '#0F172A',
    sidebarGlow: '#1E293B',
    sidebarBorder: '#1E293B',
    sidebarText: '#CBD5E1',
    sidebarTextStrong: '#F8FAFC',
    sidebarMuted: '#94A3B8',
  }),
];

const figmaInspiredPalettes: DashboardThemePalette[] = [
  makePalette({ id: 'figma-ink-wash', name: 'Figma Ink Wash', shortName: 'Ink Wash', category: 'Figma Minimal & Neutral', description: 'Monochrome gray inspired by editorial readability and focus.', ink: '#151515', inkSoft: '#2A2A2A', accent: '#5F6368', accentStrong: '#3F4247', accentHover: '#C7CCD1', accentSoft: '#F1F3F5', bg: '#F7F7F6', cardMuted: '#F1F1F0', border: '#DADDE1', text: '#171717', muted: '#6B7280', onAccent: '#FFFFFF', swatches: ['#151515', '#5F6368', '#C7CCD1', '#F7F7F6'] }),
  makePalette({ id: 'figma-neutral-elegance', name: 'Figma Neutral Elegance', shortName: 'Neutral', category: 'Figma Minimal & Neutral', description: 'Beige, gray, and brown for a serene luxury atmosphere.', ink: '#2C241D', inkSoft: '#44382E', accent: '#A68462', accentStrong: '#70543B', accentHover: '#D8C4A8', accentSoft: '#F3ECE2', bg: '#FAF6EF', cardMuted: '#F4EEE6', border: '#DED3C5', text: '#2A2520', muted: '#75685B', onAccent: '#1C140E', swatches: ['#2C241D', '#A68462', '#D8C4A8', '#FAF6EF'] }),
  makePalette({ id: 'figma-jade-pebble-morning', name: 'Figma Jade Pebble Morning', shortName: 'Jade', category: 'Figma Minimal & Neutral', description: 'Cool green and blue shades for calm, natural hierarchy.', ink: '#0B2C2A', inkSoft: '#16423F', accent: '#2BAE8A', accentStrong: '#147764', accentHover: '#8EDAC5', accentSoft: '#E4F6F1', bg: '#F2FAF7', cardMuted: '#EAF6F5', border: '#CBE7E0', text: '#102B2A', muted: '#4F7770', onAccent: '#FFFFFF', swatches: ['#0B2C2A', '#2BAE8A', '#8EDAC5', '#F2FAF7'] }),
  makePalette({ id: 'figma-woodland', name: 'Figma Woodland', shortName: 'Woodland', category: 'Figma Minimal & Neutral', description: 'Earth brown with chartreuse energy for sustainable, outdoor brands.', ink: '#241B12', inkSoft: '#3A2B1A', accent: '#9EB23B', accentStrong: '#6D7F1F', accentHover: '#D5E580', accentSoft: '#F2F6DA', bg: '#FAF8EF', cardMuted: '#F3EDE0', border: '#DDD2BC', text: '#241B12', muted: '#746851', onAccent: '#141406', swatches: ['#241B12', '#9EB23B', '#D5E580', '#FAF8EF'] }),
  makePalette({ id: 'figma-driftwood-pearl-morning', name: 'Figma Driftwood Pearl Morning', shortName: 'Driftwood', category: 'Figma Minimal & Neutral', description: 'Rose-gold warmth, chocolate depth, and soft blue readability.', ink: '#32231E', inkSoft: '#533A32', accent: '#C6867B', accentStrong: '#8A4E46', accentHover: '#9CB7C8', accentSoft: '#F6E8E4', bg: '#F7F3EF', cardMuted: '#EFE8E3', border: '#DED3CD', text: '#32231E', muted: '#74645F', onAccent: '#FFFFFF', swatches: ['#32231E', '#C6867B', '#9CB7C8', '#F7F3EF'] }),
  makePalette({ id: 'figma-graphite', name: 'Figma Graphite', shortName: 'Graphite', category: 'Figma Minimal & Neutral', description: 'Cool gray, muted wellness tones, and grounded blue-gray contrast.', ink: '#1F252A', inkSoft: '#303A40', accent: '#6B8F8C', accentStrong: '#456F73', accentHover: '#B9CCD1', accentSoft: '#EDF3F3', bg: '#F6F7F7', cardMuted: '#EEF1F2', border: '#D7DEE1', text: '#20282D', muted: '#607077', onAccent: '#FFFFFF', swatches: ['#1F252A', '#6B8F8C', '#B9CCD1', '#F6F7F7'] }),
  makePalette({ id: 'figma-urban-slate', name: 'Figma Urban Slate', shortName: 'Urban Slate', category: 'Figma Minimal & Neutral', description: 'Foggy city gray, brown, and blue for calm professional depth.', ink: '#1F2933', inkSoft: '#34424D', accent: '#607D8B', accentStrong: '#3D5966', accentHover: '#B0BEC5', accentSoft: '#EEF3F5', bg: '#F7F8F8', cardMuted: '#EFF1F2', border: '#D8DEE2', text: '#1F2933', muted: '#64727A', onAccent: '#FFFFFF', swatches: ['#1F2933', '#607D8B', '#B0BEC5', '#F7F8F8'] }),
  makePalette({ id: 'figma-pearl', name: 'Figma Pearl', shortName: 'Pearl', category: 'Figma Minimal & Neutral', description: 'Neutral brown with purple accent for refined luxury touchpoints.', ink: '#2C211C', inkSoft: '#49372F', accent: '#7C5AA6', accentStrong: '#5B3F7C', accentHover: '#C9B6E4', accentSoft: '#F1EBF8', bg: '#FAF7F4', cardMuted: '#F3EEE9', border: '#DED5CE', text: '#2C211C', muted: '#726760', onAccent: '#FFFFFF', swatches: ['#2C211C', '#7C5AA6', '#C9B6E4', '#FAF7F4'] }),
  makePalette({ id: 'figma-vichy', name: 'Figma Vichy', shortName: 'Vichy', category: 'Figma Minimal & Neutral', description: 'Soft gray and crisp white with energetic teal accents.', ink: '#17282B', inkSoft: '#274247', accent: '#00A99D', accentStrong: '#007C74', accentHover: '#7FE0D8', accentSoft: '#DFF8F6', bg: '#F8FAFA', cardMuted: '#F0F4F4', border: '#D7E3E3', text: '#17282B', muted: '#62777A', onAccent: '#FFFFFF', swatches: ['#17282B', '#00A99D', '#7FE0D8', '#F8FAFA'] }),
  makePalette({ id: 'figma-sorbet', name: 'Figma Sorbet', shortName: 'Sorbet', category: 'Figma Minimal & Neutral', description: 'Soft browns and greens for peaceful, cozy minimalism.', ink: '#2D251F', inkSoft: '#4A3F34', accent: '#8AA17A', accentStrong: '#637D54', accentHover: '#CDDCC0', accentSoft: '#F0F5EA', bg: '#FAF7EF', cardMuted: '#F3EEE5', border: '#E0D7C9', text: '#2D251F', muted: '#756B5C', onAccent: '#1C2418', swatches: ['#2D251F', '#8AA17A', '#CDDCC0', '#FAF7EF'] }),
  makePalette({ id: 'figma-frozen-mist', name: 'Figma Frozen Mist', shortName: 'Frozen Mist', category: 'Figma Minimal & Neutral', description: 'Neutral gray base with cinnamon CTA warmth.', ink: '#23272B', inkSoft: '#3A4148', accent: '#B85C38', accentStrong: '#8C3F25', accentHover: '#F0B18E', accentSoft: '#FAE9E0', bg: '#F7F8F8', cardMuted: '#EEF0F1', border: '#DADFE2', text: '#23272B', muted: '#68737A', onAccent: '#FFFFFF', swatches: ['#23272B', '#B85C38', '#F0B18E', '#F7F8F8'] }),
  makePalette({ id: 'figma-yacht-club', name: 'Figma Yacht Club', shortName: 'Yacht', category: 'Figma Minimal & Neutral', description: 'Cool grays, rich indigo, and mahogany maritime depth.', ink: '#111C2E', inkSoft: '#1E2E4A', accent: '#38598A', accentStrong: '#243B5E', accentHover: '#AFC3D7', accentSoft: '#E8EEF5', bg: '#F6F7F8', cardMuted: '#EEF1F4', border: '#D5DEE8', text: '#111C2E', muted: '#637386', onAccent: '#FFFFFF', swatches: ['#111C2E', '#38598A', '#7A3F2A', '#F6F7F8'] }),

  makePalette({ id: 'figma-amber-walnut-morning', name: 'Figma Amber Walnut Morning', shortName: 'Walnut', category: 'Figma Warm', description: 'Warm earthy browns with excellent contrast and comfort.', ink: '#26160D', inkSoft: '#4A2A17', accent: '#B8792C', accentStrong: '#85531B', accentHover: '#E5B46C', accentSoft: '#F8EEDC', bg: '#FCF7EF', cardMuted: '#F5E9D9', border: '#E3D0B9', text: '#26160D', muted: '#79634D', onAccent: '#160C05', swatches: ['#26160D', '#B8792C', '#E5B46C', '#FCF7EF'] }),
  makePalette({ id: 'figma-copper-aquamarine-dream', name: 'Figma Copper Aquamarine Dream', shortName: 'Copper Aqua', category: 'Figma Warm', description: 'Burnt orange grounded by tranquil blue-green coastal tones.', ink: '#2A1C18', inkSoft: '#51372E', accent: '#C96B3C', accentStrong: '#934322', accentHover: '#6DC6C1', accentSoft: '#E5F7F5', bg: '#FBF4ED', cardMuted: '#F4E8DF', border: '#E4D3C7', text: '#2A1C18', muted: '#7A665B', onAccent: '#FFFFFF', swatches: ['#2A1C18', '#C96B3C', '#6DC6C1', '#FBF4ED'] }),
  makePalette({ id: 'figma-cocoa-topaz-noonday', name: 'Figma Cocoa Topaz Noonday', shortName: 'Cocoa', category: 'Figma Warm', description: 'Cozy autumn brown with bright orange and calm slate blue.', ink: '#2B1B14', inkSoft: '#4D3325', accent: '#F97316', accentStrong: '#C2410C', accentHover: '#8CA6C8', accentSoft: '#FFF1E7', bg: '#FCF7F1', cardMuted: '#F4E9DD', border: '#E5D2C0', text: '#2B1B14', muted: '#7A6558', onAccent: '#FFFFFF', swatches: ['#2B1B14', '#F97316', '#8CA6C8', '#FCF7F1'] }),
  makePalette({ id: 'figma-sandstone-aquamarine-serenity', name: 'Figma Sandstone Aquamarine Serenity', shortName: 'Sand Aqua', category: 'Figma Warm', description: 'Natural sandstone tones with refreshing aquamarine accents.', ink: '#2D241B', inkSoft: '#4A3928', accent: '#69C3D0', accentStrong: '#2C8792', accentHover: '#BDECF0', accentSoft: '#E9FAFC', bg: '#FBF6EB', cardMuted: '#F4ECD9', border: '#E3D5BB', text: '#2D241B', muted: '#756B5B', onAccent: '#073337', swatches: ['#2D241B', '#C2A176', '#69C3D0', '#FBF6EB'] }),
  makePalette({ id: 'figma-honey-opal-sunset', name: 'Figma Honey Opal Sunset', shortName: 'Honey Opal', category: 'Figma Warm', description: 'Honey warmth and opal softness for welcoming CTAs.', ink: '#2A1F12', inkSoft: '#4A3218', accent: '#D99A20', accentStrong: '#A36B0D', accentHover: '#FAD06B', accentSoft: '#FFF4D6', bg: '#FFF9EF', cardMuted: '#FFF1D8', border: '#EAD9B7', text: '#2A1F12', muted: '#806B43', onAccent: '#1C1103', swatches: ['#2A1F12', '#D99A20', '#FAD06B', '#FFF9EF'] }),
  makePalette({ id: 'figma-seashell-garnet-afternoon', name: 'Figma Seashell Garnet Afternoon', shortName: 'Garnet', category: 'Figma Warm', description: 'Soft seashell surfaces with deep garnet emphasis.', ink: '#2B1418', inkSoft: '#4A232B', accent: '#9F2733', accentStrong: '#701A24', accentHover: '#E7A5A9', accentSoft: '#FBE8E7', bg: '#FFF7F3', cardMuted: '#FBEDE8', border: '#EAD2CB', text: '#2B1418', muted: '#7E5F5C', onAccent: '#FFFFFF', swatches: ['#2B1418', '#9F2733', '#E7A5A9', '#FFF7F3'] }),
  makePalette({ id: 'figma-rose-quartz-evening', name: 'Figma Rose Quartz Evening', shortName: 'Quartz', category: 'Figma Warm', description: 'Evening rose quartz warmth with plush, muted contrast.', ink: '#2A1622', inkSoft: '#462337', accent: '#C76B8E', accentStrong: '#914765', accentHover: '#F0B7CC', accentSoft: '#FBE8F0', bg: '#FFF6F9', cardMuted: '#F8EAF0', border: '#E8CED9', text: '#2A1622', muted: '#7B6070', onAccent: '#FFFFFF', swatches: ['#2A1622', '#C76B8E', '#F0B7CC', '#FFF6F9'] }),
  makePalette({ id: 'figma-calcite', name: 'Figma Calcite', shortName: 'Calcite', category: 'Figma Warm', description: 'Mineral cream and terracotta for grounded hospitality warmth.', ink: '#2A2018', inkSoft: '#4A382A', accent: '#C77845', accentStrong: '#914F2A', accentHover: '#E9B68D', accentSoft: '#F9E9DD', bg: '#FBF7EF', cardMuted: '#F2EADF', border: '#E1D2C1', text: '#2A2018', muted: '#75675B', onAccent: '#FFFFFF', swatches: ['#2A2018', '#C77845', '#E9B68D', '#FBF7EF'] }),
  makePalette({ id: 'figma-fireside', name: 'Figma Fireside', shortName: 'Fireside', category: 'Figma Warm', description: 'Deep hearth brown with ember accents for cozy action states.', ink: '#21100B', inkSoft: '#3A1D13', accent: '#D94A26', accentStrong: '#A33218', accentHover: '#F0A070', accentSoft: '#FBE7DD', bg: '#FCF4EC', cardMuted: '#F4E5DA', border: '#E4CDBE', text: '#21100B', muted: '#7B5F52', onAccent: '#FFFFFF', swatches: ['#21100B', '#D94A26', '#F0A070', '#FCF4EC'] }),
  makePalette({ id: 'figma-terrazzo', name: 'Figma Terrazzo', shortName: 'Terrazzo', category: 'Figma Warm', description: 'Playful warm neutrals with peach and clay flecks.', ink: '#2B211B', inkSoft: '#44362E', accent: '#E48D67', accentStrong: '#AD5B3D', accentHover: '#F3C0A8', accentSoft: '#FBECE4', bg: '#FCF8F3', cardMuted: '#F4EDE6', border: '#E3D7CC', text: '#2B211B', muted: '#766960', onAccent: '#2A1008', swatches: ['#2B211B', '#E48D67', '#F3C0A8', '#FCF8F3'] }),

  makePalette({ id: 'figma-sapphire-nightfall-whisper', name: 'Figma Sapphire Nightfall Whisper', shortName: 'Nightfall', category: 'Figma Cool', description: 'Deep sapphire atmosphere with soft blue contrast.', ink: '#07122F', inkSoft: '#0E2050', accent: '#315DDC', accentStrong: '#2142A4', accentHover: '#9DB7FF', accentSoft: '#E8EEFF', bg: '#F4F7FF', cardMuted: '#EEF3FF', border: '#D5E0F7', text: '#07122F', muted: '#566785', onAccent: '#FFFFFF', swatches: ['#07122F', '#315DDC', '#9DB7FF', '#F4F7FF'] }),
  makePalette({ id: 'figma-lapis-velvet-evening', name: 'Figma Lapis Velvet Evening', shortName: 'Lapis', category: 'Figma Cool', description: 'Velvety lapis blue with sophisticated evening contrast.', ink: '#0B102C', inkSoft: '#171D4A', accent: '#3F51B5', accentStrong: '#2A357E', accentHover: '#A4AFE8', accentSoft: '#E9ECFA', bg: '#F6F7FD', cardMuted: '#ECEFFC', border: '#D8DDF3', text: '#0B102C', muted: '#5A6184', onAccent: '#FFFFFF', swatches: ['#0B102C', '#3F51B5', '#A4AFE8', '#F6F7FD'] }),
  makePalette({ id: 'figma-marina', name: 'Figma Marina', shortName: 'Marina', category: 'Figma Cool', description: 'Harbor blue and seafoam for fresh operational clarity.', ink: '#082431', inkSoft: '#123D4F', accent: '#008FB3', accentStrong: '#00677F', accentHover: '#8FD7E7', accentSoft: '#E2F7FB', bg: '#F2FAFC', cardMuted: '#EAF6F9', border: '#CDE5ED', text: '#082431', muted: '#57747E', onAccent: '#FFFFFF', swatches: ['#082431', '#008FB3', '#8FD7E7', '#F2FAFC'] }),
  makePalette({ id: 'figma-emerald-lavender-lake', name: 'Figma Emerald Lavender Lake', shortName: 'Emerald Lake', category: 'Figma Cool', description: 'Emerald greens softened by lavender lake highlights.', ink: '#08251F', inkSoft: '#123C34', accent: '#1B9C7A', accentStrong: '#0E6D55', accentHover: '#B8A9E6', accentSoft: '#EEEAFB', bg: '#F4FBF8', cardMuted: '#EAF6F1', border: '#CCE7DE', text: '#08251F', muted: '#59786E', onAccent: '#FFFFFF', swatches: ['#08251F', '#1B9C7A', '#B8A9E6', '#F4FBF8'] }),
  makePalette({ id: 'figma-sage-peridot-morning', name: 'Figma Sage Peridot Morning', shortName: 'Sage', category: 'Figma Cool', description: 'Gentle sage and peridot for calm morning freshness.', ink: '#15261D', inkSoft: '#294235', accent: '#7CA982', accentStrong: '#55795B', accentHover: '#D0E5B8', accentSoft: '#F0F7EA', bg: '#F8FBF4', cardMuted: '#EEF6EC', border: '#D6E6D2', text: '#15261D', muted: '#637A69', onAccent: '#122016', swatches: ['#15261D', '#7CA982', '#D0E5B8', '#F8FBF4'] }),
  makePalette({ id: 'figma-amethyst-dawn-haze', name: 'Figma Amethyst Dawn Haze', shortName: 'Amethyst', category: 'Figma Cool', description: 'Amethyst haze with soft dawn surfaces and calm hierarchy.', ink: '#211736', inkSoft: '#352450', accent: '#8B5CF6', accentStrong: '#6D3ED6', accentHover: '#C4B5FD', accentSoft: '#F0EBFF', bg: '#FAF8FF', cardMuted: '#F3EEFF', border: '#E1D8F7', text: '#211736', muted: '#6C5D84', onAccent: '#FFFFFF', swatches: ['#211736', '#8B5CF6', '#C4B5FD', '#FAF8FF'] }),
  makePalette({ id: 'figma-moon-dust', name: 'Figma Moon Dust', shortName: 'Moon Dust', category: 'Figma Cool', description: 'Muted cosmic neutrals with blue-violet action accents.', ink: '#171A26', inkSoft: '#2A2F42', accent: '#6C7BD9', accentStrong: '#4955A8', accentHover: '#B4BDF2', accentSoft: '#EEF0FE', bg: '#F8F8FB', cardMuted: '#F0F1F7', border: '#DBDEEA', text: '#171A26', muted: '#646B81', onAccent: '#FFFFFF', swatches: ['#171A26', '#6C7BD9', '#B4BDF2', '#F8F8FB'] }),
  makePalette({ id: 'figma-turquoise-amber-autumn', name: 'Figma Turquoise Amber Autumn', shortName: 'Turq Amber', category: 'Figma Cool', description: 'Cool turquoise balanced by warm amber autumn accents.', ink: '#0E2527', inkSoft: '#1E4245', accent: '#0FB5AE', accentStrong: '#0A7C78', accentHover: '#F0B84A', accentSoft: '#E2FAF8', bg: '#F8FBF8', cardMuted: '#EEF7F5', border: '#D3E7E2', text: '#0E2527', muted: '#5C7778', onAccent: '#042321', swatches: ['#0E2527', '#0FB5AE', '#F0B84A', '#F8FBF8'] }),
  makePalette({ id: 'figma-sapphire-ash-morning', name: 'Figma Sapphire Ash Morning', shortName: 'Sapphire Ash', category: 'Figma Cool', description: 'Sapphire accent over ash-gray morning surfaces.', ink: '#111827', inkSoft: '#263244', accent: '#2563EB', accentStrong: '#1D4ED8', accentHover: '#B9C9E9', accentSoft: '#EAF0FF', bg: '#F6F7F9', cardMuted: '#ECEFF4', border: '#D8DEE8', text: '#111827', muted: '#667085', onAccent: '#FFFFFF', swatches: ['#111827', '#2563EB', '#B9C9E9', '#F6F7F9'] }),
  makePalette({ id: 'figma-frosted-aura', name: 'Figma Frosted Aura', shortName: 'Frosted', category: 'Figma Cool', description: 'Icy glass tones with glowing blue-green accents.', ink: '#102A33', inkSoft: '#1D4552', accent: '#38BDF8', accentStrong: '#0284C7', accentHover: '#A7F3D0', accentSoft: '#E0F7FF', bg: '#F5FCFF', cardMuted: '#ECF8FB', border: '#CFEAF2', text: '#102A33', muted: '#5B7781', onAccent: '#06202A', swatches: ['#102A33', '#38BDF8', '#A7F3D0', '#F5FCFF'] }),
  makePalette({ id: 'figma-royal-glimmer', name: 'Figma Royal Glimmer', shortName: 'Royal', category: 'Figma Cool', description: 'Royal blue with bright glimmer highlights for premium clarity.', ink: '#0A102B', inkSoft: '#18214B', accent: '#3B82F6', accentStrong: '#1D4ED8', accentHover: '#F8D66D', accentSoft: '#EAF1FF', bg: '#F7F9FF', cardMuted: '#EEF3FF', border: '#D7E1F5', text: '#0A102B', muted: '#5C6685', onAccent: '#FFFFFF', swatches: ['#0A102B', '#3B82F6', '#F8D66D', '#F7F9FF'] }),
  makePalette({ id: 'figma-neptune', name: 'Figma Neptune', shortName: 'Neptune', category: 'Figma Cool', description: 'Oceanic navy, teal, and pale surf for calm technical systems.', ink: '#061A2A', inkSoft: '#0E344F', accent: '#008C95', accentStrong: '#00636B', accentHover: '#7DDEE3', accentSoft: '#DDF7F8', bg: '#F2FAFB', cardMuted: '#E8F5F7', border: '#CBE5EA', text: '#061A2A', muted: '#567581', onAccent: '#FFFFFF', swatches: ['#061A2A', '#008C95', '#7DDEE3', '#F2FAFB'] }),

  makePalette({ id: 'figma-tropical-jade-sunrise', name: 'Figma Tropical Jade Sunrise', shortName: 'Tropical Jade', category: 'Figma Vibrant & Bold', description: 'Vibrant jade with sunrise warmth for energetic interfaces.', ink: '#06231B', inkSoft: '#0B3B2F', accent: '#00B884', accentStrong: '#008D68', accentHover: '#FFB84D', accentSoft: '#E3FFF6', bg: '#F4FFF9', cardMuted: '#EAFBF4', border: '#C9EDDF', text: '#06231B', muted: '#557A6B', onAccent: '#04170F', swatches: ['#06231B', '#00B884', '#FFB84D', '#F4FFF9'] }),
  makePalette({ id: 'figma-amethyst-mint-harmony', name: 'Figma Amethyst Mint Harmony', shortName: 'Mint Amethyst', category: 'Figma Vibrant & Bold', description: 'Purple and mint contrast for playful but balanced products.', ink: '#1F1235', inkSoft: '#352058', accent: '#8B5CF6', accentStrong: '#6D3ED6', accentHover: '#7FFFD4', accentSoft: '#F1EBFF', bg: '#FBF8FF', cardMuted: '#F2EEFF', border: '#E2D8F7', text: '#1F1235', muted: '#6B5A82', onAccent: '#FFFFFF', swatches: ['#1F1235', '#8B5CF6', '#7FFFD4', '#FBF8FF'] }),
  makePalette({ id: 'figma-hibiscus-aura', name: 'Figma Hibiscus Aura', shortName: 'Hibiscus', category: 'Figma Vibrant & Bold', description: 'Hibiscus pink aura for bold, high-energy CTAs.', ink: '#2A1020', inkSoft: '#4A1C38', accent: '#E91E63', accentStrong: '#B3124B', accentHover: '#FF9AC1', accentSoft: '#FFE7F1', bg: '#FFF6FA', cardMuted: '#FFF0F6', border: '#F4D2E0', text: '#2A1020', muted: '#7D5B6C', onAccent: '#FFFFFF', swatches: ['#2A1020', '#E91E63', '#FF9AC1', '#FFF6FA'] }),
  makePalette({ id: 'figma-ocean-ruby-radiance', name: 'Figma Ocean Ruby Radiance', shortName: 'Ocean Ruby', category: 'Figma Vibrant & Bold', description: 'Ocean blue with ruby radiance for strong contrast.', ink: '#061B2A', inkSoft: '#0D344F', accent: '#0077B6', accentStrong: '#00527A', accentHover: '#E63946', accentSoft: '#E2F4FF', bg: '#F4FBFF', cardMuted: '#EAF6FB', border: '#CDE6F2', text: '#061B2A', muted: '#587482', onAccent: '#FFFFFF', swatches: ['#061B2A', '#0077B6', '#E63946', '#F4FBFF'] }),
  makePalette({ id: 'figma-tropical-heat', name: 'Figma Tropical Heat', shortName: 'Heat', category: 'Figma Vibrant & Bold', description: 'Tropical orange, coral, and mango for striking action flows.', ink: '#2D1208', inkSoft: '#55220E', accent: '#FF6B00', accentStrong: '#C94E00', accentHover: '#FFD166', accentSoft: '#FFF0DF', bg: '#FFF8EF', cardMuted: '#FFF0E2', border: '#F0D2B5', text: '#2D1208', muted: '#7B614E', onAccent: '#2A1000', swatches: ['#2D1208', '#FF6B00', '#FFD166', '#FFF8EF'] }),
  makePalette({ id: 'figma-celestial', name: 'Figma Celestial', shortName: 'Celestial', category: 'Figma Vibrant & Bold', description: 'Deep night blue with cosmic cyan and star-gold highlights.', ink: '#080B2A', inkSoft: '#151A50', accent: '#5B8CFF', accentStrong: '#3259D9', accentHover: '#FDE68A', accentSoft: '#EEF2FF', bg: '#F8FAFF', cardMuted: '#EEF3FF', border: '#D8E1F5', text: '#080B2A', muted: '#5D6684', onAccent: '#FFFFFF', swatches: ['#080B2A', '#5B8CFF', '#FDE68A', '#F8FAFF'] }),
  makePalette({ id: 'figma-festive-eve', name: 'Figma Festive Eve', shortName: 'Festive', category: 'Figma Vibrant & Bold', description: 'Festive evening jewel tones for celebratory experiences.', ink: '#180C2A', inkSoft: '#2D164A', accent: '#D946EF', accentStrong: '#A21CAF', accentHover: '#22C55E', accentSoft: '#FAE8FF', bg: '#FFF8FF', cardMuted: '#F7EEFA', border: '#E7D3EE', text: '#180C2A', muted: '#725F7F', onAccent: '#FFFFFF', swatches: ['#180C2A', '#D946EF', '#22C55E', '#FFF8FF'] }),
  makePalette({ id: 'figma-freshly-squeezed', name: 'Figma Freshly Squeezed', shortName: 'Fresh', category: 'Figma Vibrant & Bold', description: 'Citrus orange and clean cream for lively hospitality moments.', ink: '#2A1808', inkSoft: '#4A2B10', accent: '#F59E0B', accentStrong: '#B45309', accentHover: '#FFE66D', accentSoft: '#FFF4D6', bg: '#FFFDF4', cardMuted: '#FFF6DB', border: '#EADBA8', text: '#2A1808', muted: '#7C6844', onAccent: '#241404', swatches: ['#2A1808', '#F59E0B', '#FFE66D', '#FFFDF4'] }),
  makePalette({ id: 'figma-jelly-shoes', name: 'Figma Jelly Shoes', shortName: 'Jelly', category: 'Figma Vibrant & Bold', description: 'Translucent candy colors with playful blue-pink energy.', ink: '#141432', inkSoft: '#25255A', accent: '#00B4D8', accentStrong: '#0077A3', accentHover: '#FF70A6', accentSoft: '#E5F9FF', bg: '#F8FCFF', cardMuted: '#EEF9FD', border: '#D0E9F2', text: '#141432', muted: '#62637F', onAccent: '#061D26', swatches: ['#141432', '#00B4D8', '#FF70A6', '#F8FCFF'] }),

  makePalette({ id: 'figma-opaline', name: 'Figma Opaline', shortName: 'Opaline', category: 'Figma Modern', description: 'Opal-like neutral glow with modern soft blue highlights.', ink: '#17202A', inkSoft: '#2A3642', accent: '#83AFCB', accentStrong: '#527C99', accentHover: '#D5E9F5', accentSoft: '#EEF7FB', bg: '#FAFBFC', cardMuted: '#F1F5F7', border: '#DCE5EA', text: '#17202A', muted: '#667683', onAccent: '#0A1B24', swatches: ['#17202A', '#83AFCB', '#D5E9F5', '#FAFBFC'] }),
  makePalette({ id: 'figma-gossamer', name: 'Figma Gossamer', shortName: 'Gossamer', category: 'Figma Modern', description: 'Soft translucent neutrals with gentle lilac undertones.', ink: '#1F1B2D', inkSoft: '#343048', accent: '#A78BFA', accentStrong: '#7C5FD6', accentHover: '#DDD6FE', accentSoft: '#F3F0FF', bg: '#FBFAFF', cardMuted: '#F3F1FA', border: '#E3DFF0', text: '#1F1B2D', muted: '#6B657F', onAccent: '#FFFFFF', swatches: ['#1F1B2D', '#A78BFA', '#DDD6FE', '#FBFAFF'] }),
  makePalette({ id: 'figma-clockwork', name: 'Figma Clockwork', shortName: 'Clockwork', category: 'Figma Modern', description: 'Industrial charcoal, brass, and cream for precise dashboards.', ink: '#171411', inkSoft: '#2A2620', accent: '#B58B2A', accentStrong: '#7D5F18', accentHover: '#E2C16F', accentSoft: '#F6EFD8', bg: '#F9F7F1', cardMuted: '#F0ECE3', border: '#DCD5C7', text: '#171411', muted: '#6E675C', onAccent: '#0F0A02', swatches: ['#171411', '#B58B2A', '#E2C16F', '#F9F7F1'] }),
  makePalette({ id: 'figma-lemon-granite-morning', name: 'Figma Lemon Granite Morning', shortName: 'Lemon Granite', category: 'Figma Modern', description: 'Granite gray with lemon brightness for fresh modern UX.', ink: '#20242A', inkSoft: '#343A42', accent: '#EAB308', accentStrong: '#A16207', accentHover: '#FEF08A', accentSoft: '#FEF9C3', bg: '#F8F8F5', cardMuted: '#F0F1ED', border: '#DEDFD8', text: '#20242A', muted: '#676C73', onAccent: '#1C1602', swatches: ['#20242A', '#EAB308', '#FEF08A', '#F8F8F5'] }),
  makePalette({ id: 'figma-arctic-reflection', name: 'Figma Arctic Reflection', shortName: 'Arctic', category: 'Figma Modern', description: 'Bright arctic whites and icy blue reflection accents.', ink: '#10212B', inkSoft: '#203845', accent: '#6BB7D6', accentStrong: '#3F88A6', accentHover: '#C7ECF7', accentSoft: '#ECFAFF', bg: '#FAFDFF', cardMuted: '#EFF8FC', border: '#D6EAF2', text: '#10212B', muted: '#5F7680', onAccent: '#071F2A', swatches: ['#10212B', '#6BB7D6', '#C7ECF7', '#FAFDFF'] }),
  makePalette({ id: 'figma-slate', name: 'Figma Slate', shortName: 'Figma Slate', category: 'Figma Modern', description: 'Modern slate neutrals with restrained cool accent.', ink: '#0F172A', inkSoft: '#1E293B', accent: '#475569', accentStrong: '#334155', accentHover: '#CBD5E1', accentSoft: '#F1F5F9', bg: '#F8FAFC', cardMuted: '#F1F5F9', border: '#E2E8F0', text: '#0F172A', muted: '#64748B', onAccent: '#F8FAFC', swatches: ['#0F172A', '#475569', '#CBD5E1', '#F8FAFC'] }),
  makePalette({ id: 'figma-autumn-luxe', name: 'Figma Autumn Luxe', shortName: 'Autumn Luxe', category: 'Figma Modern', description: 'Luxurious autumn brown, muted orange, and cream.', ink: '#21160F', inkSoft: '#3B281B', accent: '#B96528', accentStrong: '#804218', accentHover: '#D9A06C', accentSoft: '#F7E8DA', bg: '#FCF7F0', cardMuted: '#F4EAE0', border: '#E2D0BF', text: '#21160F', muted: '#756252', onAccent: '#FFFFFF', swatches: ['#21160F', '#B96528', '#D9A06C', '#FCF7F0'] }),
  makePalette({ id: 'figma-inked', name: 'Figma Inked', shortName: 'Inked', category: 'Figma Modern', description: 'High-contrast ink black with refined blue-gray support.', ink: '#090A0C', inkSoft: '#171A1F', accent: '#334155', accentStrong: '#1E293B', accentHover: '#94A3B8', accentSoft: '#E8EEF5', bg: '#F7F8FA', cardMuted: '#F0F2F5', border: '#DCE1E8', text: '#090A0C', muted: '#5F6673', onAccent: '#FFFFFF', swatches: ['#090A0C', '#334155', '#94A3B8', '#F7F8FA'] }),
  makePalette({ id: 'figma-wraith', name: 'Figma Wraith', shortName: 'Wraith', category: 'Figma Modern', description: 'Ghosted charcoal and mist gray for restrained sophistication.', ink: '#141417', inkSoft: '#28282E', accent: '#7C7D86', accentStrong: '#555760', accentHover: '#D1D5DB', accentSoft: '#F3F4F6', bg: '#FAFAFA', cardMuted: '#F1F2F3', border: '#E0E1E4', text: '#141417', muted: '#686A72', onAccent: '#FFFFFF', swatches: ['#141417', '#7C7D86', '#D1D5DB', '#FAFAFA'] }),
  makePalette({ id: 'figma-urban-nocturne', name: 'Figma Urban Nocturne', shortName: 'Nocturne', category: 'Figma Modern', description: 'Nocturnal urban black with electric blue-gray highlights.', ink: '#05070D', inkSoft: '#111827', accent: '#2563EB', accentStrong: '#1D4ED8', accentHover: '#60A5FA', accentSoft: '#EAF2FF', bg: '#F7F9FC', cardMuted: '#EEF3F8', border: '#D9E2EC', text: '#05070D', muted: '#5B6573', onAccent: '#FFFFFF', swatches: ['#05070D', '#2563EB', '#60A5FA', '#F7F9FC'] }),
];

export const DASHBOARD_THEME_PALETTES: DashboardThemePalette[] = [
  ...cloudViewRecommended,
  ...figmaInspiredPalettes,
];

export function getDashboardThemePalette(id?: string | null) {
  return (
    DASHBOARD_THEME_PALETTES.find((palette) => palette.id === id) ??
    DASHBOARD_THEME_PALETTES[0]
  );
}

export function applyDashboardThemePalette(id?: string | null) {
  if (typeof document === 'undefined') {
    return getDashboardThemePalette(id).id;
  }

  const palette = getDashboardThemePalette(id);

  document.documentElement.dataset.cloudviewPalette = palette.id;

  for (const [property, value] of Object.entries(palette.variables)) {
    document.documentElement.style.setProperty(property, value);
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(THEME_PALETTE_STORAGE_KEY, palette.id);
  }

  return palette.id;
}

export function getSavedDashboardThemePaletteId() {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME_PALETTE_ID;
  }

  const saved = window.localStorage.getItem(THEME_PALETTE_STORAGE_KEY);

  return getDashboardThemePalette(saved).id;
}
