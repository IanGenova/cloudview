import { type ReactNode } from 'react';
import { DashboardModule } from '@prisma/client';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
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

export default async function SettingsPage() {
  const user = await requireDashboardPermission(
    DashboardModule.HOTEL_SETTINGS,
    'canView'
  );

  const hotels = await db.hotel.findMany({
    where: user.role === 'SUPER_ADMIN' ? {} : { id: user.hotelId! },
    include: { settings: true },
    orderBy: { name: 'asc' }
  });

  const hotel = hotels[0];
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
};

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Branding, operating information, taxes, service charge, Wi-Fi, policies, and guide content."
      />


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

            {user.role === 'SUPER_ADMIN' ? (
              <FormField label="Hotel / Property" helper="Select which hotel account you want to update.">
                <Select name="hotelId" required defaultValue={hotel?.id}>
                  {hotels.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </Select>
              </FormField>
            ) : (
              <input type="hidden" name="hotelId" value={hotel?.id} />
            )}

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