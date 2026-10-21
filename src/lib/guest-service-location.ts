type ServiceLocationDetails = {
  code: string;
  category: string;
};

// The existing catalog has no location-scope column. Keep public NFC menus
// conservative until each hotel can configure that scope explicitly.
const PUBLIC_SERVICE_CODES = new Set([
  'EXTRA_TOWELS',
  'WATER_REFILL',
  'MAINTENANCE',
  'OTHER_REQUEST',
]);

const PUBLIC_CATEGORY_NAMES = new Set([
  'POOL',
  'POOL SERVICES',
  'PUBLIC AREA',
  'PUBLIC AREAS',
  'LOCATION SERVICES',
]);

export function isServiceAvailableAtPublicLocation(
  service: ServiceLocationDetails
) {
  return (
    PUBLIC_SERVICE_CODES.has(service.code.trim().toUpperCase()) ||
    PUBLIC_CATEGORY_NAMES.has(service.category.trim().toUpperCase())
  );
}
