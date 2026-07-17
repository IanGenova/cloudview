import { randomBytes, randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import {
  getNfcAccessCookieName,
  getPublicAppUrl,
  hashValue,
  NFC_ACCESS_COOKIE,
  verifyTagSecret,
} from '@/lib/nfc-security';
import { db } from '@/lib/db';
import {
  ACTIVE_ORDER_STATUSES,
  ACTIVE_SERVICE_REQUEST_STATUSES,
  getNfcGuestSessionCookieName,
  getReusableNfcGuestSessionForTag,
  getNfcGuestSessionPendingCounts,
} from '@/lib/nfc-guest-session';
import { getNfcSessionPolicy } from '@/lib/nfc-session-policy';
import {
  getActiveGuestStayForRoom,
  getAuthorizedGuestStayDeviceFromRequest,
} from '@/lib/guest-stay-device-auth';

function publicUrl(path: string) {
  return new URL(path, getPublicAppUrl());
}

function safeDecodePathSegment(value: string) {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

function normalizeHotelSlug(value: string | null | undefined) {
  return safeDecodePathSegment(String(value || '')).toLowerCase();
}

function shouldUseSecureCookie(request: Request) {
  const forwardedProto = request.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim()
    .toLowerCase();

  if (process.env.NODE_ENV === 'production') {
    return true;
  }

  if (forwardedProto === 'https') {
    return true;
  }

  return new URL(request.url).protocol === 'https:';
}

function redirectHttpRequestToHttps(_request: Request) {
  /**
   * HTTP LAN mode:
   * Never redirect NFC scans to HTTPS.
   */
  return null;
}

function getRequestCookie(request: Request, cookieName: string) {
  const cookieHeader = request.headers.get('cookie');

  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';').map((item) => item.trim());

  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const name = cookie.slice(0, separatorIndex);
    const value = cookie.slice(separatorIndex + 1);

    if (name === cookieName) {
      return decodeURIComponent(value);
    }
  }

  return null;
}


function getAccessTtlMinutes() {
  return Number(process.env.NFC_ACCESS_TTL_MINUTES || 60);
}

function getIdleTimeoutMinutes() {
  return Number(process.env.NFC_IDLE_TIMEOUT_MINUTES || 15);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function minDate(a: Date, b: Date) {
  return a.getTime() <= b.getTime() ? a : b;
}

function getRequestFingerprintFromRequest(request: Request) {
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const forwardedFor = request.headers.get('x-forwarded-for') || '';
  const realIp = request.headers.get('x-real-ip') || '';
  const ip = forwardedFor.split(',')[0]?.trim() || realIp || 'local';

  return {
    userAgentHash: hashValue(userAgent),
    ipHash: hashValue(ip),
  };
}

/**
 * Important first-scan fix:
 * In route handlers, cookies set through next/headers cookies().set() are not
 * always attached to a manually-created NextResponse.redirect().
 *
 * This helper creates the NFC access session record and returns the exact
 * Set-Cookie payload, so /n/[tagCode] can attach cv_nfc_access cookies directly
 * to the redirect response that opens /t/[tagCode].
 */
async function createNfcAccessSessionForRedirectResponse({
  request,
  tag,
}: {
  request: Request;
  tag: {
    id: string;
    hotelId: string;
    code: string;
  };
}) {
  const fingerprint = getRequestFingerprintFromRequest(request);
  const now = new Date();

  const absoluteExpiresAt = addMinutes(now, getAccessTtlMinutes());
  const idleExpiresAt = minDate(
    addMinutes(now, getIdleTimeoutMinutes()),
    absoluteExpiresAt
  );

  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = hashValue(rawToken);

  await db.nfcAccessSession.create({
    data: {
      tagId: tag.id,
      hotelId: tag.hotelId,
      tokenHash,
      userAgentHash: fingerprint.userAgentHash,
      ipHash: fingerprint.ipHash,
      expiresAt: absoluteExpiresAt,
      idleExpiresAt,
      lastSeenAt: now,
    },
  });

  return {
    rawToken,
    tagCookieName: getNfcAccessCookieName(tag.code),
    legacyCookieName: NFC_ACCESS_COOKIE,
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: shouldUseSecureCookie(request),
      path: '/',
      maxAge: getAccessTtlMinutes() * 60,
    },
  };
}

/**
 * Public tags should allow unlimited devices.
 *
 * But for the SAME browser/device, we can safely reuse its own existing
 * session cookie so the guest does not lose their own pending orders/requests.
 *
 * This does NOT reuse another guest's session.
 */
async function getBrowserOwnedPublicGuestSession({
  request,
  tag,
}: {
  request: Request;
  tag: {
    id: string;
    code: string;
    hotelId: string;
  };
}) {
  const cookieName = getNfcGuestSessionCookieName(tag.code);
  const sessionKey = getRequestCookie(request, cookieName);

  if (!sessionKey) {
    return null;
  }

  const session = await db.nfcGuestSession.findUnique({
    where: {
      sessionKey,
    },
    select: {
      id: true,
      sessionKey: true,
      hotelId: true,
      tagId: true,
      endedAt: true,
    },
  });

  if (!session) {
    return null;
  }

  if (session.hotelId !== tag.hotelId || session.tagId !== tag.id) {
    return null;
  }

  if (session.endedAt) {
    const pendingCounts = await getNfcGuestSessionPendingCounts(session.id);

    if (pendingCounts.totalPending <= 0) {
      return null;
    }

    return db.nfcGuestSession.update({
      where: {
        id: session.id,
      },
      data: {
        endedAt: null,
        lastSeenAt: new Date(),
      },
      select: {
        id: true,
        sessionKey: true,
        hotelId: true,
        tagId: true,
        endedAt: true,
      },
    });
  }

  return db.nfcGuestSession.update({
    where: {
      id: session.id,
    },
    data: {
      lastSeenAt: new Date(),
    },
    select: {
      id: true,
      sessionKey: true,
      hotelId: true,
      tagId: true,
      endedAt: true,
    },
  });
}

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      tagCode: string;
      expectedHotelSlug?: string | null;
    }>;
  }
) {
  const httpsRedirect = redirectHttpRequestToHttps(request);

  if (httpsRedirect) {
    return httpsRedirect;
  }

  const { tagCode: rawTagCode, expectedHotelSlug } = await params;
  const tagCode = safeDecodePathSegment(rawTagCode);
  const normalizedExpectedHotelSlug = normalizeHotelSlug(expectedHotelSlug);
  const url = new URL(request.url);
  const inputSecret = url.searchParams.get('k') || '';

  const tag = await db.nfcTag.findUnique({
    where: {
      code: tagCode,
    },
    select: {
      id: true,
      code: true,
      hotelId: true,
      roomId: true,
      locationId: true,
      tagType: true,
      status: true,
      scanSecret: true,
      deletedAt: true,
      hotel: {
        select: {
          slug: true,
          isActive: true,
          settings: {
            select: {
              nfcRoomPasscodeEnabled: true,
            },
          },
        },
      },
    },
  });

  if (!tag || tag.deletedAt) {
    console.warn('[NFC launch] Tag lookup failed.', {
      requestedTagCode: tagCode,
      expectedHotelSlug: normalizedExpectedHotelSlug || null,
      tagExists: Boolean(tag),
      deletedAt: tag?.deletedAt ?? null,
    });

    return NextResponse.redirect(
      publicUrl('/nfc-access-denied?reason=tag-not-found')
    );
  }

  const storedHotelSlug = normalizeHotelSlug(tag.hotel.slug);

  if (
    normalizedExpectedHotelSlug &&
    storedHotelSlug !== normalizedExpectedHotelSlug
  ) {
    console.warn('[NFC launch] Hotel slug does not match the NFC tag.', {
      requestedTagCode: tagCode,
      expectedHotelSlug: normalizedExpectedHotelSlug,
      storedHotelSlug,
    });

    return NextResponse.redirect(
      publicUrl('/nfc-access-denied?reason=tag-not-found')
    );
  }

  if (!tag.hotel.isActive) {
    console.warn('[NFC launch] Hotel guest access is inactive.', {
      requestedTagCode: tagCode,
      hotelSlug: storedHotelSlug,
    });

    return NextResponse.redirect(
      publicUrl('/nfc-access-denied?reason=inactive-hotel')
    );
  }

  if (
    !tag.scanSecret ||
    !inputSecret ||
    !verifyTagSecret(inputSecret, tag.scanSecret)
  ) {
    console.warn('[NFC launch] Scan secret validation failed.', {
      requestedTagCode: tagCode,
      hotelSlug: storedHotelSlug,
      hasStoredSecret: Boolean(tag.scanSecret),
      hasInputSecret: Boolean(inputSecret),
    });

    return NextResponse.redirect(
      publicUrl('/nfc-access-denied?reason=bad-secret')
    );
  }

  const nfcRoomPasscodeEnabled =
    tag.hotel.settings?.nfcRoomPasscodeEnabled ?? true;

  const policy = getNfcSessionPolicy({
    tagType: tag.tagType,
    roomId: tag.roomId,
    locationId: tag.locationId,
  });

  const requireStrictBrowserSession =
    policy.requireStrictBrowserSession && nfcRoomPasscodeEnabled;

  const activeGuestStay =
    policy.mode === 'PRIVATE_ROOM' && tag.roomId
      ? await getActiveGuestStayForRoom({
          hotelId: tag.hotelId,
          roomId: tag.roomId,
        })
      : null;

  /**
   * Private ROOM tags now require:
   * 1. ACTIVE NFC tag
   * 2. Active GuestStay for the room
   * 3. Authorized device cookie from passcode verification
   */
  if (policy.mode === 'PRIVATE_ROOM') {
    if (tag.status !== 'ACTIVE') {
      return NextResponse.redirect(
        publicUrl('/nfc-access-denied?reason=inactive-tag')
      );
    }

    if (!tag.roomId) {
      return NextResponse.redirect(
        publicUrl('/nfc-access-denied?reason=room-required')
      );
    }

    if (!activeGuestStay) {
      if (nfcRoomPasscodeEnabled) {
        return NextResponse.redirect(
          publicUrl(
            `/n/${tag.code}/verify?k=${encodeURIComponent(
              inputSecret
            )}&error=no_active_stay`
          )
        );
      }

      return NextResponse.redirect(
        publicUrl('/nfc-access-denied?reason=no-active-stay')
      );
    }

    if (nfcRoomPasscodeEnabled) {
      const authorizedDevice =
        await getAuthorizedGuestStayDeviceFromRequest({
          request,
          guestStayId: activeGuestStay.id,
        });

      if (!authorizedDevice) {
        return NextResponse.redirect(
          publicUrl(`/n/${tag.code}/verify?k=${encodeURIComponent(inputSecret)}`)
        );
      }
    }
  }

  /**
   * PRIVATE ROOM:
   * - May reuse a pending room session, but only for the same GuestStay.
   *
   * PUBLIC LOCATION:
   * - Does not reuse another guest's pending session.
   * - May reuse only the same browser's own cookie session.
   */
  const reusableGuestSession = policy.reusePendingSession
    ? await getReusableNfcGuestSessionForTag({
        tagId: tag.id,
        hotelId: tag.hotelId,
        tagType: tag.tagType,
        roomId: tag.roomId,
        locationId: tag.locationId,
        guestStayId: activeGuestStay?.id ?? null,
      })
    : await getBrowserOwnedPublicGuestSession({
        request,
        tag,
      });

  const guestSessionKey = reusableGuestSession?.sessionKey ?? randomUUID();

  await db.$transaction(async (tx) => {
    await tx.nfcTag.update({
      where: {
        id: tag.id,
      },
      data: {
        lastScannedAt: new Date(),
      },
    });

    /**
     * Important:
     * For private ROOM tags with the security code enabled, revoke existing
     * access sessions because the room panel is controlled and anti-sharing
     * is stricter. When the hotel disables the code, scans do not revoke
     * another guest device solely because it did not complete passcode auth.
     *
     * For public POOL/LOBBY/RESTAURANT/etc. tags, DO NOT revoke sessions.
     * Otherwise, every new tap would kick out previous guests.
     */
    if (requireStrictBrowserSession) {
      await tx.nfcAccessSession.updateMany({
        where: {
          tagId: tag.id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    await tx.nfcAccessSession.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });

    /**
     * Private room tags with security enabled:
     * Close old no-pending sessions so the room panel stays clean.
     *
     * Public location tags:
     * Do not close other active sessions on every tap.
     * Multiple devices must remain active independently.
     */
    if (requireStrictBrowserSession) {
      await tx.nfcGuestSession.updateMany({
        where: {
          tagId: tag.id,
          hotelId: tag.hotelId,
          endedAt: null,
          ...(reusableGuestSession
            ? {
                id: {
                  not: reusableGuestSession.id,
                },
              }
            : {}),
          orders: {
            none: {
              status: {
                in: [...ACTIVE_ORDER_STATUSES],
              },
            },
          },
          serviceRequests: {
            none: {
              status: {
                in: [...ACTIVE_SERVICE_REQUEST_STATUSES],
              },
            },
          },
        },
        data: {
          endedAt: new Date(),
        },
      });
    } else {
      /**
       * Public cleanup only:
       * Close old public sessions with no pending work after 24 hours.
       * This prevents database clutter without interrupting current guests.
       */
      await tx.nfcGuestSession.updateMany({
        where: {
          tagId: tag.id,
          hotelId: tag.hotelId,
          endedAt: null,
          lastSeenAt: {
            lt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
          orders: {
            none: {
              status: {
                in: [...ACTIVE_ORDER_STATUSES],
              },
            },
          },
          serviceRequests: {
            none: {
              status: {
                in: [...ACTIVE_SERVICE_REQUEST_STATUSES],
              },
            },
          },
        },
        data: {
          endedAt: new Date(),
        },
      });
    }

    if (reusableGuestSession) {
      await tx.nfcGuestSession.update({
        where: {
          id: reusableGuestSession.id,
        },
        data: {
          endedAt: null,
          lastSeenAt: new Date(),
          guestMemberId: activeGuestStay?.guestMemberId ?? undefined,
          guestStayId: activeGuestStay?.id ?? undefined,
        },
      });

      return;
    }

    await tx.nfcGuestSession.create({
      data: {
        sessionKey: guestSessionKey,
        hotelId: tag.hotelId,
        tagId: tag.id,
        roomId: tag.roomId,
        locationId: tag.locationId,
        guestMemberId: activeGuestStay?.guestMemberId ?? null,
        guestStayId: activeGuestStay?.id ?? null,
      },
    });
  });

  const accessCookie = await createNfcAccessSessionForRedirectResponse({
    request,
    tag: {
      id: tag.id,
      hotelId: tag.hotelId,
      code: tag.code,
    },
  });

  const redirectUrl =
    tag.status === 'ACTIVE'
      ? publicUrl(`/t/${tag.code}?nfcSession=1`)
      : publicUrl(`/t/${tag.code}?nfcSession=1&tagStatus=inactive`);

  const response = NextResponse.redirect(redirectUrl);

  /**
   * Attach the NFC access proof directly to THIS redirect response.
   * Without this, the first /t/[tagCode] request can arrive without
   * cv_nfc_access_<tagCode>, causing the first passcode attempt to show
   * "Tap NFC Again".
   */
  response.cookies.set(
    accessCookie.tagCookieName,
    accessCookie.rawToken,
    accessCookie.cookieOptions
  );

  response.cookies.set(
    accessCookie.legacyCookieName,
    accessCookie.rawToken,
    accessCookie.cookieOptions
  );

  response.cookies.set(getNfcGuestSessionCookieName(tag.code), guestSessionKey, {
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookie(request),
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}