type RealtimePayload = Record<string, unknown>;

type PublishResult = {
  ok: boolean;
  skipped?: boolean;
  status?: number;
  durationMs?: number;
  error?: unknown;
};

function removeTrailingSlash(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function normalizeCentrifugoApiPublishUrl(rawUrl: string) {
  const cleanedUrl = removeTrailingSlash(rawUrl);

  if (!cleanedUrl) {
    return null;
  }

  if (cleanedUrl.endsWith('/api/publish')) {
    return cleanedUrl;
  }

  if (cleanedUrl.endsWith('/api')) {
    return `${cleanedUrl}/publish`;
  }

  if (cleanedUrl.endsWith('/publish')) {
    const withoutPublish = cleanedUrl.replace(/\/publish$/, '');

    if (withoutPublish.endsWith('/api')) {
      return cleanedUrl;
    }

    return `${withoutPublish}/api/publish`;
  }

  return `${cleanedUrl}/api/publish`;
}

function convertWebsocketUrlToHttpApiUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);

    if (url.protocol === 'wss:') {
      url.protocol = 'https:';
    }

    if (url.protocol === 'ws:') {
      url.protocol = 'http:';
    }

    url.pathname = '/api';
    url.search = '';
    url.hash = '';

    return normalizeCentrifugoApiPublishUrl(url.toString());
  } catch {
    return null;
  }
}

function getCentrifugoApiPublishUrl() {
  const explicitApiUrl =
    process.env.CENTRIFUGO_HTTP_API_URL ||
    process.env.CENTRIFUGO_API_URL ||
    process.env.NEXT_PUBLIC_CENTRIFUGO_HTTP_API_URL;

  if (explicitApiUrl) {
    const publishUrl = normalizeCentrifugoApiPublishUrl(explicitApiUrl);

    if (publishUrl) {
      return publishUrl;
    }
  }

  const websocketUrl = process.env.NEXT_PUBLIC_CENTRIFUGO_WS_URL;

  if (websocketUrl) {
    const publishUrl = convertWebsocketUrlToHttpApiUrl(websocketUrl);

    if (publishUrl) {
      return publishUrl;
    }
  }

  const host =
    process.env.NEXT_PUBLIC_CENTRIFUGO_HOST ||
    process.env.NEXT_PUBLIC_LAN_IP ||
    'localhost';

  const port = process.env.NEXT_PUBLIC_CENTRIFUGO_PORT || '8000';

  const shouldUseHttps =
    process.env.NEXT_PUBLIC_FORCE_HTTPS === 'true' ||
    process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://');

  const protocol = shouldUseHttps ? 'https' : 'http';

  return `${protocol}://${host}:${port}/api/publish`;
}

function getCentrifugoApiKey() {
  const apiKey =
    process.env.CENTRIFUGO_HTTP_API_KEY || process.env.CENTRIFUGO_API_KEY;

  if (!apiKey?.trim()) {
    return null;
  }

  return apiKey.trim();
}

export async function publishToCentrifugo({
  channel,
  data,
  debugLabel = 'centrifugo-publish',
}: {
  channel: string;
  data: RealtimePayload;
  debugLabel?: string;
}): Promise<PublishResult> {
  const publishUrl = getCentrifugoApiPublishUrl();
  const apiKey = getCentrifugoApiKey();

  if (!publishUrl || !apiKey) {
    console.warn(
      `Centrifugo publish skipped for ${debugLabel}. Missing API URL or API key.`
    );

    return {
      ok: false,
      skipped: true,
    };
  }

  const startedAt = Date.now();

  try {
    if (process.env.NODE_ENV !== 'production') {
      console.info('Publishing Centrifugo event:', {
        debugLabel,
        channel,
        event: data.event,
      });
    }

    const response = await fetch(publishUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'X-Centrifugo-Error-Mode': 'transport',
      },
      body: JSON.stringify({
        channel,
        data,
      }),
      cache: 'no-store',
    });

    const durationMs = Date.now() - startedAt;
    const responseText = await response.text().catch(() => '');

    if (!response.ok) {
      console.warn('Centrifugo publish failed:', {
        debugLabel,
        channel,
        status: response.status,
        body: responseText,
        durationMs,
      });

      return {
        ok: false,
        status: response.status,
        durationMs,
      };
    }

    if (process.env.NODE_ENV !== 'production') {
      console.info('Centrifugo event published:', {
        debugLabel,
        channel,
        durationMs,
      });
    }

    return {
      ok: true,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;

    console.warn('Centrifugo publish request failed:', {
      debugLabel,
      channel,
      durationMs,
      error,
    });

    return {
      ok: false,
      durationMs,
      error,
    };
  }
}

export async function publishManyToCentrifugo(
  publications: Array<{
    channel: string;
    data: RealtimePayload;
    debugLabel?: string;
  }>
) {
  return Promise.allSettled(
    publications.map((publication) => publishToCentrifugo(publication))
  );
}