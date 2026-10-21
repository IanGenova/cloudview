export function getGuestContact(
  settings?: { contactPhone?: string | null; contactEmail?: string | null } | null
) {
  const rawPhone = settings?.contactPhone?.trim() ?? '';
  const digits = rawPhone.replace(/\D/g, '');
  const phone =
    digits && digits !== '639000000000' && !/^0+$/.test(digits)
      ? rawPhone
      : null;

  const rawEmail = settings?.contactEmail?.trim() ?? '';
  const email =
    rawEmail &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) &&
    !/\.(?:test|example|invalid)$/i.test(rawEmail)
      ? rawEmail
      : null;

  return { phone, email };
}
