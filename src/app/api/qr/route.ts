import QRCode from 'qrcode';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url') || '';
  if (!url.startsWith('http')) return new Response('Invalid URL', { status: 400 });
  const buffer = await QRCode.toBuffer(url, { type: 'png', width: 512, margin: 2 });
  return new Response(new Uint8Array(buffer), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
}
