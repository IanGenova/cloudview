import { type ReactNode } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { DashboardModule } from '@prisma/client';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { db } from '@/lib/db';
import { requireDashboardPermission } from '@/lib/dashboard-permissions';
import { saveHotelSettingsAction } from './actions';
import { HotelSettingsFormClient } from './HotelSettingsFormClient';
import { ThemePaletteSelector } from '@/components/dashboard/ThemePaletteSelector';

function FormField({
  label,
  helper,
  children,
  className = '',
}: {
  label: string;
  helper?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`grid gap-2 rounded-[1.25rem] border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 ${className}`}>
      <span className="text-sm font-black text-neutral-900 dark:text-white">
        {label}
      </span>
      {children}
      {helper ? (
        <span className="text-xs font-medium leading-relaxed text-neutral-500 dark:text-neutral-400">
          {helper}
        </span>
      ) : null}
    </label>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="md:col-span-2 rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-950">
      <h3 className="text-lg font-black text-neutral-950 dark:text-white">
        {title}
      </h3>
      <p className="mt-1 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
        {description}
      </p>
    </div>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    hotelId?: string;
  }>;
}) {
  const params = await searchParams;

  const user = await requireDashboardPermission(
    DashboardModule.HOTEL_SETTINGS,
    'canView'
  );

  const hotels = await db.hotel.findMany({
    where: user.role === 'SUPER_ADMIN' ? {} : { id: user.hotelId! },
    include: { settings: true },
    orderBy: { name: 'asc' }
  });

  const hotel =
    user.role === 'SUPER_ADMIN'
      ? hotels.find((item) => item.id === params?.hotelId) ?? hotels[0]
      : hotels[0];

  const initialSettingsValues = {
  hotelId: hotel?.id ?? '',
  hotelName: hotel?.name ?? '',
  logoUrl: hotel?.logoUrl ?? '',
  guestPortalHeroImageUrl: hotel?.settings?.guestPortalHeroImageUrl ?? '',
  brandColor: hotel?.brandColor ?? '',
  accentColor: hotel?.accentColor ?? '',
  currency: hotel?.settings?.currency ?? 'PHP',
  taxRate: String(hotel?.settings?.taxRate ?? 0),
  serviceChargeRate: String(hotel?.settings?.serviceChargeRate ?? 0),
  wifiName: hotel?.settings?.wifiName ?? '',
  wifiPassword: hotel?.settings?.wifiPassword ?? '',
  checkInTime: hotel?.settings?.checkInTime ?? '2:00 PM',
  checkOutTime: hotel?.settings?.checkOutTime ?? '12:00 PM',
  poolHours: hotel?.settings?.poolHours ?? '7:00 AM - 9:00 PM',
  contactPhone: hotel?.settings?.contactPhone ?? '',
  contactEmail: hotel?.settings?.contactEmail ?? '',
  poolRules: hotel?.settings?.poolRules ?? '',
  policies: hotel?.settings?.policies ?? '',
  guideText: hotel?.settings?.guideText ?? '',
  nfcRoomPasscodeEnabled:
    (hotel?.settings?.nfcRoomPasscodeEnabled ?? true) ? 'on' : '',
};

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Branding, NFC access security, operating information, billing, Wi-Fi, policies, and guide content."
      />

      {user.role === 'SUPER_ADMIN' && hotels.length > 1 ? (
        <form
          method="get"
          className="mb-6 flex flex-col gap-3 rounded-[1.5rem] border border-neutral-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end dark:border-neutral-800 dark:bg-neutral-900"
        >
          <label className="grid flex-1 gap-2">
            <span className="text-xs font-black uppercase tracking-wide text-neutral-500">
              Hotel / Property
            </span>
            <select
              name="hotelId"
              defaultValue={hotel?.id}
              className="h-12 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-black text-neutral-900 outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
            >
              {hotels.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="h-12 rounded-2xl bg-black px-5 text-sm font-black text-white transition hover:bg-neutral-800 dark:bg-gold dark:text-black"
          >
            Load Hotel Settings
          </button>
        </form>
      ) : null}

      <section className="mb-6 rounded-[2rem] border border-[var(--cv-border)] bg-[var(--cv-card)] p-5 shadow-sm">
        <ThemePaletteSelector />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Hotel settings</CardTitle>
          <p className="mt-2 text-sm text-neutral-500">
            These settings control the guest portal content, hotel guide, pool information, and billing defaults.
          </p>
        </CardHeader>

        <CardContent>
         <HotelSettingsFormClient
            action={saveHotelSettingsAction}
            initialValues={initialSettingsValues}
          >
            <SectionTitle
              title="Property Identity"
              description="Basic hotel branding shown on the guest portal and dashboard."
            />

            <input type="hidden" name="hotelId" value={hotel?.id ?? ''} />

            <FormField label="Hotel Display Name" helper="The name guests will see in the mobile guest portal.">
              <Input name="hotelName" defaultValue={hotel?.name} placeholder="Cloud View Demo Hotel" required />
            </FormField>

            <FormField label="Logo URL" helper="Optional image URL for the hotel logo. Leave blank if you do not have one yet.">
              <Input name="logoUrl" defaultValue={hotel?.logoUrl ?? ''} placeholder="https://yourdomain.com/logo.png" />
            </FormField>

            <FormField
  label="Guest Portal Hero Image"
  helper="This image appears as the main background image on the guest portal front page. Uploading a file will override the pasted URL."
  className="md:col-span-2"
>
  <div className="grid gap-4 rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-4 md:grid-cols-[240px_1fr]">
    <div className="h-40 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      {hotel?.settings?.guestPortalHeroImageUrl ? (
        <img
          src={hotel.settings.guestPortalHeroImageUrl}
          alt="Guest portal hero preview"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="grid h-full place-items-center text-center text-xs font-black text-neutral-400">
          No hero image yet
        </div>
      )}
    </div>

    <div className="grid gap-3">
      <div>
        <span className="mb-1 block text-xs font-black uppercase text-neutral-500">
          Upload Hero Image
        </span>

        <input
          name="guestPortalHeroImage"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="block w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold transition file:mr-4 file:rounded-xl file:border-0 file:bg-[#11100b] file:px-4 file:py-2 file:text-sm file:font-black file:text-white hover:border-[#c99c38]/50"
        />

        <p className="mt-1 text-xs font-medium text-neutral-500">
          JPG, PNG, or WEBP only. Maximum 4MB.
        </p>
      </div>

      <div>
        <span className="mb-1 block text-xs font-black uppercase text-neutral-500">
          Or Paste Hero Image URL
        </span>

        <Input
          name="guestPortalHeroImageUrl"
          defaultValue={hotel?.settings?.guestPortalHeroImageUrl ?? ''}
          placeholder="https://yourdomain.com/guest-portal-hero.jpg"
        />
      </div>
    </div>
  </div>
</FormField>

            <FormField label="Primary Brand Color" helper="Main dark color used for premium headers and buttons.">
              <Input name="brandColor" defaultValue={hotel?.brandColor} placeholder="#111111" />
            </FormField>

            <FormField label="Accent Color" helper="Gold/accent color used for highlights, badges, and premium details.">
              <Input name="accentColor" defaultValue={hotel?.accentColor} placeholder="#B88938" />
            </FormField>

            <SectionTitle
              title="Billing Defaults"
              description="Currency, tax, and service charge used for guest orders. Use decimals for percentage rates."
            />

            <FormField label="Currency" helper="Currency code displayed on menu prices and order totals. Example: PHP.">
              <Input name="currency" defaultValue={hotel?.settings?.currency ?? 'PHP'} placeholder="PHP" required />
            </FormField>

            <FormField label="Tax Rate" helper="Example: 0.12 means 12% tax. Use 0 if tax is not applied.">
              <Input name="taxRate" type="number" step="0.0001" defaultValue={String(hotel?.settings?.taxRate ?? 0)} placeholder="0.12" />
            </FormField>

            <FormField label="Service Charge Rate" helper="Example: 0.10 means 10% service charge. Use 0 if not applied.">
              <Input name="serviceChargeRate" type="number" step="0.0001" defaultValue={String(hotel?.settings?.serviceChargeRate ?? 0)} placeholder="0.10" />
            </FormField>

            <SectionTitle
              title="Wi-Fi and Guest Access"
              description="Information shown in the hotel guide after guests tap the NFC panel."
            />

            <div className="md:col-span-2 overflow-hidden rounded-[1.5rem] border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#fff4d6] text-[#9a6b18] dark:bg-gold/15 dark:text-gold">
                    <ShieldCheck className="size-5" />
                  </span>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-black text-neutral-950 dark:text-white">
                        NFC Room Security Code
                      </h3>

                      <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                        Room tags only
                      </span>
                    </div>

                    <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-neutral-500 dark:text-neutral-400">
                      When enabled, guests must enter the room passcode after
                      scanning a private room NFC tag. When disabled, an active
                      room stay can open the guest portal directly after the NFC
                      scan.
                    </p>

                    <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                      <KeyRound className="mt-0.5 size-4 shrink-0" />
                      The NFC tag scan secret remains required. This setting only
                      controls the additional guest room passcode and device-limit
                      authorization step.
                    </div>
                  </div>
                </div>

                <label className="relative flex shrink-0 cursor-pointer items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-950">
                  <input
                    name="nfcRoomPasscodeEnabled"
                    type="checkbox"
                    defaultChecked={
                      hotel?.settings?.nfcRoomPasscodeEnabled ?? true
                    }
                    className="peer sr-only"
                  />

                  <span className="relative h-7 w-12 rounded-full bg-neutral-300 transition peer-checked:bg-emerald-500 peer-checked:[&>span]:translate-x-5 dark:bg-neutral-700">
                    <span className="absolute left-1 top-1 size-5 rounded-full bg-white shadow transition-transform" />
                  </span>

                  <span className="hidden min-w-20 peer-checked:block">
                    <span className="block text-sm font-black text-emerald-700 dark:text-emerald-300">
                      Enabled
                    </span>
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                      Security code
                    </span>
                  </span>

                  <span className="min-w-20 peer-checked:hidden">
                    <span className="block text-sm font-black text-neutral-600 dark:text-neutral-300">
                      Disabled
                    </span>
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                      Security code
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <FormField label="Wi-Fi Network Name" helper="The Wi-Fi name/SSID guests should connect to.">
              <Input name="wifiName" defaultValue={hotel?.settings?.wifiName ?? ''} placeholder="CloudView-Guest" />
            </FormField>

            <FormField label="Wi-Fi Password" helper="Guest Wi-Fi password shown inside the hotel guide.">
              <Input name="wifiPassword" defaultValue={hotel?.settings?.wifiPassword ?? ''} placeholder="one-tap-away" />
            </FormField>

            <SectionTitle
              title="Operating Information"
              description="Check-in, check-out, pool hours, and front desk contact details."
            />

            <FormField label="Check-in Time" helper="Standard guest check-in time shown in the hotel guide.">
              <Input name="checkInTime" defaultValue={hotel?.settings?.checkInTime ?? '2:00 PM'} placeholder="2:00 PM" />
            </FormField>

            <FormField label="Check-out Time" helper="Standard guest check-out time shown in the hotel guide.">
              <Input name="checkOutTime" defaultValue={hotel?.settings?.checkOutTime ?? '12:00 PM'} placeholder="12:00 PM" />
            </FormField>

            <FormField label="Pool Hours" helper="Operating hours displayed on the Pool Information page.">
              <Input name="poolHours" defaultValue={hotel?.settings?.poolHours ?? '7:00 AM - 9:00 PM'} placeholder="7:00 AM - 9:00 PM" />
            </FormField>

            <FormField label="Contact Phone" helper="Front desk or guest support number. This appears in Contact Staff.">
              <Input name="contactPhone" defaultValue={hotel?.settings?.contactPhone ?? ''} placeholder="+63 900 000 0000" />
            </FormField>

            <FormField label="Contact Email" helper="Guest support email address shown in Contact Staff or Hotel Guide.">
              <Input name="contactEmail" type="email" defaultValue={hotel?.settings?.contactEmail ?? ''} placeholder="frontdesk@cloudview.test" />
            </FormField>

            <SectionTitle
              title="Guest Portal Content"
              description="Long-form information shown to guests from NFC room, pool, and hotel guide pages."
            />

            <FormField label="Pool Rules" helper="Rules and safety reminders shown on the Pool Information page." className="md:col-span-2">
              <Textarea
                name="poolRules"
                defaultValue={hotel?.settings?.poolRules ?? ''}
                placeholder="Example: No running. Children must be supervised. Shower before entering. No glassware in the pool area."
              />
            </FormField>

            <FormField label="Hotel Policies" helper="Quiet hours, towel policy, maintenance instructions, smoking policy, or other house rules." className="md:col-span-2">
              <Textarea
                name="policies"
                defaultValue={hotel?.settings?.policies ?? ''}
                placeholder="Example: Quiet hours begin at 10:00 PM. Please contact staff for assistance, extra towels, or maintenance."
              />
            </FormField>

            <FormField label="Hotel Guide / Tourist Information" helper="Amenities, transport options, tourist tips, maps, nearby places, or general guest guide content." className="md:col-span-2">
              <Textarea
                name="guideText"
                defaultValue={hotel?.settings?.guideText ?? ''}
                placeholder="Example: Amenities include pool, restaurant, cafe, and lobby lounge. Transportation and tourist information are available at the front desk."
              />
            </FormField>

        </HotelSettingsFormClient>
        </CardContent>
      </Card>
    </div>
  );
}