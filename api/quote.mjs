import { createHash } from 'node:crypto';

const ENDPOINT = 'https://api.resend.com/emails';
const RECIPIENT = 'ethanmunoz786@gmail.com';
const SENDER_DOMAIN = 'sddrivewaydetailing.com';
const MAX_BYTES = 24576;
const DELIVERY_ERROR = 'We couldn’t confirm delivery. Please send your request by text below.';
const ALLOWED_FIELDS = new Set(['Name', 'Phone', 'City or ZIP code', 'Preferred day/time', 'Quote details', 'Lead source']);
const VEHICLE_FIELD = /^Vehicle ([1-9]|10) — (Vehicle|Size|Package|Condition|Add-on [1-4])$/;

function json(body, status = 200, extraHeaders = {}) {
  return Response.json(body, {
    status,
    headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders}
  });
}

export function GET() {
  return json({success: false, message: 'Use the quote form to send a request.'}, 405, {Allow: 'POST'});
}

export async function POST(request) {
  // Only the site's own form may use this fixed-recipient endpoint.
  const origin = request.headers.get('origin');
  if(origin !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    return json({success: false, message: 'Please send your request from our website.'}, 403);
  }
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) {
    return json({success: false, message: 'Please use the quote form.'}, 415);
  }
  if(Number(request.headers.get('content-length')) > MAX_BYTES) {
    return json({success: false, message: 'Please shorten your notes and try again.'}, 413);
  }

  let input;
  try {
    const text = await request.text();
    if(new TextEncoder().encode(text).length > MAX_BYTES) {
      return json({success: false, message: 'Please shorten your notes and try again.'}, 413);
    }
    input = JSON.parse(text);
  } catch {
    return json({success: false, message: 'Please check your quote details and try again.'}, 400);
  }
  if(!input || Array.isArray(input) || typeof input !== 'object' || input._honey) {
    return json({success: false, message: 'Please check your quote details and try again.'}, 400);
  }

  const fields = {};
  for(const [key, value] of Object.entries(input)) {
    if(!ALLOWED_FIELDS.has(key) && !VEHICLE_FIELD.test(key)) continue;
    if(typeof value !== 'string' || value.length > (key === 'Quote details' ? 12000 : 500)) {
      return json({success: false, message: 'Please shorten your details and try again.'}, 400);
    }
    fields[key] = value.trim();
  }
  const phoneDigits = (fields.Phone || '').replace(/\D/g, '');
  if(!fields.Name || !fields['City or ZIP code'] || !fields['Quote details'] ||
     phoneDigits.length < 10 || phoneDigits.length > 15 ||
     !['Sedan', 'SUV', 'Truck'].includes(fields['Vehicle 1 — Size'])) {
    return json({success: false, message: 'Please check your name, phone, location, and vehicle size.'}, 400);
  }

  const apiKey = process.env.RESEND_API_KEY;
  if(!apiKey || (process.env.RESEND_EMAIL_DOMAIN || '').trim() !== SENDER_DOMAIN) {
    console.error('quote_delivery_failed', {reason: 'configuration_missing'});
    return json({success: false, message: DELIVERY_ERROR}, 503);
  }

  // Fixed sender and recipient prevent visitors from turning this into a mail relay.
  const text = Object.keys(fields).sort().map(key => `${key}: ${fields[key]}`).join('\n\n');
  const body = JSON.stringify({
    from: `SD Driveway Detailing <quotes@${SENDER_DOMAIN}>`,
    to: [RECIPIENT],
    subject: 'New Quote Request - SD Driveway Detailing',
    text
  });
  // An identical retry reuses the provider's receipt rather than sending twice.
  const idempotencyKey = 'sdd-quote-' + createHash('sha256').update(body).digest('hex');
  try {
    const upstream = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Idempotency-Key': idempotencyKey
      },
      body,
      signal: AbortSignal.timeout(15000),
      redirect: 'error'
    });
    let result;
    try { result = await upstream.json(); }
    catch {
      console.error('quote_delivery_failed', {reason: 'invalid_response', status: upstream.status});
      return json({success: false, message: DELIVERY_ERROR}, 502);
    }
    if(!upstream.ok || typeof result?.id !== 'string' || !result.id.trim()) {
      const code = /^[a-z_]{1,60}$/.test(result?.name || '') ? result.name : 'unknown';
      console.error('quote_delivery_failed', {reason: 'service_rejected', status: upstream.status, code});
      return json({success: false, message: DELIVERY_ERROR}, 502);
    }
    return json({success: true});
  } catch(error) {
    // Log connection diagnostics only; customer details never enter runtime logs.
    console.error('quote_delivery_failed', {reason: error.name, code: error.cause?.code || error.code || 'unknown'});
    return json({success: false, message: DELIVERY_ERROR}, error.name === 'TimeoutError' ? 504 : 502);
  }
}
