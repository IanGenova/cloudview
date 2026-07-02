type GuestStayPasscodeSmsInput = {
  phone: string;
  hotelName: string;
  guestName: string;
  roomNumber: string;
  passcode: string;
};

type SmsSendResult = {
  sent: boolean;
  recipient: string;
  provider: string;
  providerMessageId?: string;
  rawStatus?: string;
  warning?: string;
};

function cleanSmsText(value: string, maxLength: number) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function getFirstName(value: string) {
  const firstName = cleanSmsText(value, 40).split(' ')[0];

  return firstName || 'Guest';
}

function normalizePhilippineMobileNumber(value: string) {
  const digits = value.replace(/\D/g, '');

  if (digits.startsWith('09') && digits.length === 11) {
    return {
      ok: true as const,
      number: `63${digits.slice(1)}`,
    };
  }

  if (digits.startsWith('639') && digits.length === 12) {
    return {
      ok: true as const,
      number: digits,
    };
  }

  if (digits.startsWith('9') && digits.length === 10) {
    return {
      ok: true as const,
      number: `63${digits}`,
    };
  }

  return {
    ok: false as const,
    number: value,
    error: 'Please use a valid Philippine mobile number, for example 09171234567.',
  };
}

function getSemaphoreStatus(payload: unknown) {
  const firstItem = Array.isArray(payload) ? payload[0] : payload;

  if (!firstItem || typeof firstItem !== 'object') {
    return {
      providerMessageId: undefined,
      rawStatus: undefined,
    };
  }

  const record = firstItem as Record<string, unknown>;

  return {
    providerMessageId:
      record.message_id === undefined ? undefined : String(record.message_id),
    rawStatus: record.status === undefined ? undefined : String(record.status),
  };
}

export function buildGuestStayPasscodeSmsMessage({
  hotelName,
  guestName,
  roomNumber,
  passcode,
}: Omit<GuestStayPasscodeSmsInput, 'phone'>) {
  const hotelLabel = cleanSmsText(hotelName, 32) || 'CloudView';
  const guestLabel = getFirstName(guestName);
  const roomLabel = cleanSmsText(roomNumber, 24) || 'your room';

  return `${hotelLabel}: Welcome ${guestLabel}. Room ${roomLabel} passcode: ${passcode}. Scan the room NFC tag, then enter this code for hotel guide and services.`;
}

export async function sendGuestStayPasscodeSms({
  phone,
  hotelName,
  guestName,
  roomNumber,
  passcode,
}: GuestStayPasscodeSmsInput): Promise<SmsSendResult> {
  const normalized = normalizePhilippineMobileNumber(phone);

  if (!normalized.ok) {
    return {
      sent: false,
      recipient: normalized.number,
      provider: 'none',
      warning: normalized.error,
    };
  }

  const provider = (process.env.SMS_PROVIDER || 'semaphore').toLowerCase();

  if (process.env.SMS_ENABLED !== 'true') {
    return {
      sent: false,
      recipient: normalized.number,
      provider,
      warning:
        'SMS is disabled. Set SMS_ENABLED=true and configure your SMS provider API key.',
    };
  }

  if (provider !== 'semaphore') {
    return {
      sent: false,
      recipient: normalized.number,
      provider,
      warning: `Unsupported SMS provider "${provider}". Use SMS_PROVIDER=semaphore for Phase A.`,
    };
  }

  const apiKey = process.env.SEMAPHORE_API_KEY;

  if (!apiKey) {
    return {
      sent: false,
      recipient: normalized.number,
      provider,
      warning: 'SEMAPHORE_API_KEY is missing.',
    };
  }

  const message = buildGuestStayPasscodeSmsMessage({
    hotelName,
    guestName,
    roomNumber,
    passcode,
  });

  const body = new URLSearchParams({
    apikey: apiKey,
    number: normalized.number,
    message,
  });

  const senderName =
    process.env.SEMAPHORE_SENDER_NAME || process.env.SMS_SENDER_NAME;

  if (senderName) {
    body.set('sendername', senderName);
  }

  const endpoint =
    process.env.SEMAPHORE_API_URL ||
    'https://api.semaphore.co/api/v4/messages';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      cache: 'no-store',
    });

    const responseText = await response.text();

    let payload: unknown = null;

    try {
      payload = responseText ? JSON.parse(responseText) : null;
    } catch {
      payload = null;
    }

    const { providerMessageId, rawStatus } = getSemaphoreStatus(payload);

    if (!response.ok) {
      return {
        sent: false,
        recipient: normalized.number,
        provider,
        providerMessageId,
        rawStatus,
        warning:
          rawStatus ||
          `SMS provider returned HTTP ${response.status}. Please check Semaphore setup.`,
      };
    }

    const status = rawStatus?.toLowerCase();

    if (status === 'failed' || status === 'refunded') {
      return {
        sent: false,
        recipient: normalized.number,
        provider,
        providerMessageId,
        rawStatus,
        warning: `SMS provider status: ${rawStatus}.`,
      };
    }

    return {
      sent: true,
      recipient: normalized.number,
      provider,
      providerMessageId,
      rawStatus,
    };
  } catch (error) {
    return {
      sent: false,
      recipient: normalized.number,
      provider,
      warning:
        error instanceof Error
          ? error.message
          : 'Unable to connect to SMS provider.',
    };
  }
}
