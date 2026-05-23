export async function POST(request: Request) {
  const payload = await request.json();
  return Response.json({
    ok: true,
    provider: 'Cloud View Mock POS',
    receivedOrderCode: payload.orderCode,
    ticketNumber: `MOCK-${payload.orderCode}`,
    syncedAt: new Date().toISOString()
  });
}
