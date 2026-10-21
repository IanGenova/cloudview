const demoMenuImages: Record<string, string> = {
  'Cloud Club Sandwich': '/cloudview/menu/cloud-club-sandwich.webp',
  'Signature Burger': '/cloudview/menu/signature-burger.webp',
  'Breakfast Pancakes': '/cloudview/menu/breakfast-pancakes.webp',
  'Iced Tea': '/cloudview/menu/iced-tea.webp',
  'Adobong Manok': '/cloudview/menu/adobong-manok.webp',
};

export function getDemoMenuFallback(hotelSlug: string, name: string) {
  return hotelSlug === 'cloud-view-demo' ? demoMenuImages[name] ?? null : null;
}
