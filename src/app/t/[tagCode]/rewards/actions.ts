'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { claimRewardsForCurrentNfcSession } from '@/lib/nfc-rewards';

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

export async function claimNfcRewardsAction(formData: FormData) {
  const tagCode = getString(formData, 'tagCode');
  const name = getString(formData, 'name');
  const phone = getString(formData, 'phone');
  const email = getString(formData, 'email');

  if (!tagCode) {
    throw new Error('NFC tag is required.');
  }

  if (!name) {
    redirect(`/t/${encodeURIComponent(tagCode)}/rewards?error=name-required`);
  }

  if (!phone && !email) {
    redirect(`/t/${encodeURIComponent(tagCode)}/rewards?error=contact-required`);
  }

  const result = await claimRewardsForCurrentNfcSession({
    tagCode,
    name,
    phone: phone || null,
    email: email || null,
  });

  revalidatePath(`/t/${tagCode}`);
  revalidatePath(`/t/${tagCode}/rewards`);

  redirect(
    `/t/${encodeURIComponent(tagCode)}/rewards?claimed=1&points=${
      result.nfcAward.points
    }&reason=${encodeURIComponent(result.nfcAward.reason)}`
  );
}