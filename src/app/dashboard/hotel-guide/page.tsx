import { DashboardModule, Role, TagStatus, TagType } from "@prisma/client";
import { PageHeader } from "@/components/dashboard/PageHeader";
import {
  getUserDashboardPermissions,
  hasDashboardPermission,
  requireDashboardPermission,
} from "@/lib/dashboard-permissions";
import { db } from "@/lib/db";
import {
  buildSecureNfcLaunchUrl,
  resolveNfcPublicOrigin,
} from "@/lib/nfc-public-url";
import { readableTagSecret } from "@/lib/nfc-secret-storage";
import { HotelGuideClient } from "./HotelGuideClient";

/*
  The tap URL of one of the hotel's public tags, so "Open in guest portal" can
  show a manager their guide exactly as a guest sees it. A room tag would land
  on the passcode screen, so only public types qualify. The URL carries the
  tag's scan secret -- the same value the NFC Tags page shows -- so it is only
  produced for users who may view that page; everyone else gets no link rather
  than a secret they are not cleared for.
*/
async function resolveGuestPreviewUrl(
  user: { id: string; role: Role },
  hotelId: string,
) {
  if (!hotelId) return null;

  if (user.role !== Role.SUPER_ADMIN) {
    const permissions = await getUserDashboardPermissions(user.id, user.role);

    if (!hasDashboardPermission(permissions, DashboardModule.NFC_TAGS)) {
      return null;
    }
  }

  const tag = await db.nfcTag.findFirst({
    where: {
      hotelId,
      status: TagStatus.ACTIVE,
      deletedAt: null,
      tagType: { not: TagType.ROOM },
    },
    select: {
      code: true,
      scanSecret: true,
      scanSecretCipher: true,
    },
    orderBy: [{ lastScannedAt: "desc" }, { createdAt: "asc" }],
  });

  if (!tag) return null;

  const url = buildSecureNfcLaunchUrl({
    origin: await resolveNfcPublicOrigin(),
    tagCode: tag.code,
    scanSecret: readableTagSecret(tag),
  });

  return url || null;
}

function getMessage(error?: string, success?: string) {
  if (success) {
    const messages: Record<string, string> = {
      "section-created": "Guide section created successfully.",
      "section-updated": "Guide section updated successfully.",
      "section-deleted": "Guide section deleted successfully.",
      "item-created": "Guide item created successfully.",
      "item-updated": "Guide item updated successfully.",
      "item-deleted": "Guide item deleted successfully.",
      "image-uploaded": "Gallery image(s) uploaded successfully.",
      "image-deleted": "Gallery image deleted successfully.",
      seeded: "Default hotel guide content added successfully.",
      "pool-seeded": "Pool guide content added or updated successfully.",
    };

    return {
      type: "success" as const,
      text: messages[success] ?? "Action completed successfully.",
    };
  }

  if (error) {
    const messages: Record<string, string> = {
      "hotel-required": "Hotel is required.",
      "title-required": "Title is required.",
      "section-required": "Section is required.",
      "section-not-found": "Guide section was not found.",
      "item-required": "Guide item is required.",
      "item-not-found": "Guide item was not found.",
      "item-type-required": "Guide item type is required.",
      "image-required": "Image is required.",
      "image-not-found": "Gallery image was not found.",
      "image-upload-failed": "Image upload failed. Please try again.",
    };

    return {
      type: "error" as const,
      text: messages[error] ?? "Something went wrong.",
    };
  }

  return null;
}

export default async function HotelGuideModulePage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    success?: string;
    hotelId?: string;
  }>;
}) {
  const params = await searchParams;
  const error = params?.error;
  const success = params?.success;

  const user = await requireDashboardPermission(
    DashboardModule.HOTEL_GUIDE,
    "canView",
  );

  const hotels =
    user.role === Role.SUPER_ADMIN
      ? await db.hotel.findMany({
          select: {
            id: true,
            name: true,
          },
          orderBy: {
            name: "asc",
          },
        })
      : await db.hotel.findMany({
          where: {
            id: user.hotelId!,
          },
          select: {
            id: true,
            name: true,
          },
        });

  const requestedHotelId = params?.hotelId;
  const selectedHotelId =
    user.role === Role.SUPER_ADMIN
      ? hotels.some((hotel) => hotel.id === requestedHotelId)
        ? requestedHotelId!
        : (hotels[0]?.id ?? "")
      : user.hotelId!;

  const sections = selectedHotelId
    ? await db.hotelGuideSection.findMany({
        where: {
          hotelId: selectedHotelId,
        },
        include: {
          hotel: {
            select: {
              name: true,
            },
          },
          galleryImages: {
            orderBy: [
              {
                sortOrder: "asc",
              },
              {
                createdAt: "desc",
              },
            ],
          },
          items: {
            include: {
              galleryImages: {
                orderBy: [
                  {
                    sortOrder: "asc",
                  },
                  {
                    createdAt: "desc",
                  },
                ],
              },
            },
            orderBy: [
              {
                sortOrder: "asc",
              },
              {
                title: "asc",
              },
            ],
          },
        },
        orderBy: [
          {
            sortOrder: "asc",
          },
          {
            title: "asc",
          },
        ],
      })
    : [];

  return (
    <div>
      <PageHeader
        title="Hotel Guide Module"
        description="Control the guide sections, brochure images, and information shown in the Guest Portal."
      />

      <HotelGuideClient
        hotels={hotels}
        sections={sections.map((section) => ({
          id: section.id,
          hotelId: section.hotelId,
          hotelName: section.hotel.name,
          title: section.title,
          subtitle: section.subtitle ?? "",
          description: section.description ?? "",
          imageUrl: section.imageUrl ?? "",
          iconKey: section.iconKey,
          panoramaEnabled: section.panoramaEnabled,
          panoramaImageUrl: section.panoramaImageUrl ?? "",
          sortOrder: section.sortOrder,
          isActive: section.isActive,
          galleryImages: section.galleryImages.map((image) => ({
            id: image.id,
            title: image.title ?? "",
            caption: image.caption ?? "",
            imageUrl: image.imageUrl,
            sortOrder: image.sortOrder,
            isActive: image.isActive,
          })),
          items: section.items.map((item) => ({
            id: item.id,
            sectionId: item.sectionId,
            hotelId: item.hotelId,
            title: item.title,
            subtitle: item.subtitle ?? "",
            content: item.content ?? "",
            itemType: item.itemType,
            imageUrl: item.imageUrl ?? "",
            iconKey: item.iconKey,
            panoramaEnabled: item.panoramaEnabled,
            panoramaImageUrl: item.panoramaImageUrl ?? "",
            hours: item.hours ?? "",
            location: item.location ?? "",
            contact: item.contact ?? "",
            mapUrl: item.mapUrl ?? "",
            buttonLabel: item.buttonLabel ?? "",
            buttonHref: item.buttonHref ?? "",
            sortOrder: item.sortOrder,
            isActive: item.isActive,
            galleryImages: item.galleryImages.map((image) => ({
              id: image.id,
              title: image.title ?? "",
              caption: image.caption ?? "",
              imageUrl: image.imageUrl,
              sortOrder: image.sortOrder,
              isActive: image.isActive,
            })),
          })),
        }))}
        message={getMessage(error, success)}
        defaultHotelId={selectedHotelId}
        canChangeHotel={user.role === Role.SUPER_ADMIN}
        guestPreviewUrl={await resolveGuestPreviewUrl(user, selectedHotelId)}
      />
    </div>
  );
}
