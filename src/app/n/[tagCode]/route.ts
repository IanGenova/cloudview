import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import {
  createNfcAccessSession,
  getPublicAppUrl,
  isHttpsPublicAppUrl,
  verifyTagSecret,
} from '@/lib/nfc-security';
import { db } from '@/lib/db';
import {
  ACTIVE_ORDER_STATUSES,
  ACTIVE_SERVICE_REQUEST_STATUSES,
  getNfcGuestSessionCookieName,
  getReusableNfcGuestSessionForTag,
} from '@/lib/nfc-guest-session';

function publicUrl(path: string) {
  return new URL(path, getPublicAppUrl());
}

function shouldUseSecureCookie(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedProto = request.headers.get('x-forwarded-proto');

  return (
    process.env.NODE_ENV === 'production' ||
    isHttpsPublicAppUrl() ||
    requestUrl.protocol === 'https:' ||
    forwardedProto === 'https'
  );
}

function redirectHttpRequestToHttps(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedProto = request.headers.get('x-forwarded-proto');

  if (!isHttpsPublicAppUrl()) {
    return null;
  }

  if (requestUrl.protocol !== 'http:' || forwardedProto === 'https') {
    return null;
  }

  const publicBaseUrl = new URL(getPublicAppUrl());
  const httpsUrl = new URL(
    `${requestUrl.pathname}${requestUrl.search}`,
    publicBaseUrl.origin
  );

  return NextResponse.redirect(httpsUrl, 308);
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

  /**
   * Important fix:
   * If this NFC tag already has a guest session with pending orders or
   * active service requests, reuse that same session instead of creating
   * a new guest session.
   */
  const reusableGuestSession = await getReusableNfcGuestSessionForTag({
    tagId: tag.id,
    hotelId: tag.hotelId,
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

    await tx.nfcAccessSession.updateMany({
      where: {
        tagId: tag.id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    await tx.nfcAccessSession.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });

    /**
     * Close only old guest sessions that have no pending work.
     * Do not close sessions that still have pending orders or requests.
     */
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

    if (reusableGuestSession) {
      await tx.nfcGuestSession.update({
        where: {
          id: reusableGuestSession.id,
        },
        data: {
          endedAt: null,
          lastSeenAt: new Date(),
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
      },
    });
  });

  await createNfcAccessSession({
    id: tag.id,
    hotelId: tag.hotelId,
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