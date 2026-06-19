import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import {
  createNfcAccessSession,
  getPublicAppUrl,
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

function shouldUseSecureCookie(_request: Request) {
  /**
   * HTTP LAN mode:
   * Cookies must NOT be secure, otherwise they will not save on phones/devices
   * accessing http://192.168.0.130:3000.
   */
  return false;
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
  { params }: { params: Promise<{ tagCode: string }> }
) {
  const httpsRedirect = redirectHttpRequestToHttps(request);

  if (httpsRedirect) {
    return httpsRedirect;
  }

  const { tagCode } = await params;
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
    },
  });

  if (!tag || tag.deletedAt) {
    return NextResponse.redirect(
      publicUrl('/nfc-access-denied?reason=tag-not-found')
    );
  }

  if (
    !tag.scanSecret ||
    !inputSecret ||
    !verifyTagSecret(inputSecret, tag.scanSecret)
  ) {
    return NextResponse.redirect(
      publicUrl('/nfc-access-denied?reason=bad-secret')
    );
  }

  const policy = getNfcSessionPolicy({
    tagType: tag.tagType,
    roomId: tag.roomId,
    locationId: tag.locationId,
  });

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
      return NextResponse.redirect(
        publicUrl(
          `/n/${tag.code}/verify?k=${encodeURIComponent(
            inputSecret
          )}&error=no_active_stay`
        )
      );
    }

    const authorizedDevice = await getAuthorizedGuestStayDeviceFromRequest({
      request,
      guestStayId: activeGuestStay.id,
    });

    if (!authorizedDevice) {
      return NextResponse.redirect(
        publicUrl(`/n/${tag.code}/verify?k=${encodeURIComponent(inputSecret)}`)
      );
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
     * For private ROOM tags, revoke existing access sessions because the room
     * panel is controlled and anti-sharing is stricter.
     *
     * For public POOL/LOBBY/RESTAURANT/etc. tags, DO NOT revoke sessions.
     * Otherwise, every new tap would kick out previous guests.
     */
    if (policy.requireStrictBrowserSession) {
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
     * Private room tags:
     * Close old no-pending sessions so the room panel stays clean.
     *
     * Public location tags:
     * Do not close other active sessions on every tap.
     * Multiple devices must remain active independently.
     */
    if (policy.requireStrictBrowserSession) {
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

  await createNfcAccessSession({
    id: tag.id,
    hotelId: tag.hotelId,
    code: tag.code,
  });

  const redirectUrl =
    tag.status === 'ACTIVE'
      ? publicUrl(`/t/${tag.code}?nfcSession=1`)
      : publicUrl(`/t/${tag.code}?nfcSession=1&tagStatus=inactive`);

  const response = NextResponse.redirect(redirectUrl);

  response.cookies.set(getNfcGuestSessionCookieName(tag.code), guestSessionKey, {
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookie(request),
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}