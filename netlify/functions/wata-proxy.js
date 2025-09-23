// Netlify Function: Proxy to create payment in Wata
// Restores the expected endpoint "/.netlify/functions/wata-proxy" used by the frontend
// Backward-compatible: supports multiple env var names and auth header styles

const fetch = globalThis.fetch || require('node-fetch');

// Simple retry with exponential backoff for 429/5xx
async function httpRequestWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);

    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      if (attempt === maxRetries) return res;
      const retryAfter = res.headers.get('Retry-After');
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, attempt) * 1000;
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    return res;
  }
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    // Try multiple env var names to match previous configuration
    let apiUrl = (
      process.env.WATA_CREATE_PAYMENT_URL ||
      process.env.WATA_PAYMENT_URL ||
      process.env.WATA_API_URL ||
      process.env.WATA_PAYMENT_CREATE_URL ||
      process.env.WATA_URL ||
      (process.env.WATA_BASE_URL ? `${process.env.WATA_BASE_URL.replace(/\/$/, '')}/api/payments` : undefined) ||
      (process.env.WATA_API_BASE ? `${process.env.WATA_API_BASE.replace(/\/$/, '')}/payments` : undefined)
    );

    const apiKey = (
      process.env.WATA_API_KEY ||
      process.env.WATA_KEY ||
      process.env.WATA_TOKEN ||
      process.env.WATA_SECRET ||
      process.env.WATA
    );

    // Allow overriding header name and scheme, but we'll also try common fallbacks automatically
    const configuredAuthHeader = process.env.WATA_AUTH_HEADER; // e.g. 'X-Api-Key' or 'Authorization'
    const configuredAuthScheme = process.env.WATA_AUTH_SCHEME; // e.g. 'Bearer' or ''

    if (!apiKey) {
      const presentEnv = {
        WATA_CREATE_PAYMENT_URL: !!process.env.WATA_CREATE_PAYMENT_URL,
        WATA_PAYMENT_URL: !!process.env.WATA_PAYMENT_URL,
        WATA_API_URL: !!process.env.WATA_API_URL,
        WATA_PAYMENT_CREATE_URL: !!process.env.WATA_PAYMENT_CREATE_URL,
        WATA_URL: !!process.env.WATA_URL,
        WATA_BASE_URL: !!process.env.WATA_BASE_URL,
        WATA_API_BASE: !!process.env.WATA_API_BASE,
        WATA_API_KEY: !!process.env.WATA_API_KEY,
        WATA_KEY: !!process.env.WATA_KEY,
        WATA_TOKEN: !!process.env.WATA_TOKEN,
        WATA_SECRET: !!process.env.WATA_SECRET,
        WATA: !!process.env.WATA
      };
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Wata API is not configured',
          message: 'Отсутствует API ключ. Установите WATA_API_KEY (или WATA_KEY/WATA_TOKEN/WATA_SECRET/WATA)',
          detected: presentEnv
        })
      };
    }

    // Если URL не задан, пробуем стандартные эндпоинты из документации
    const defaultCandidates = [
      'https://api.wata.pro/api/h2h/links',
      'https://wata.pro/api/payments',
      'https://wata.pro/api/payment',
      'https://wata.pro/api/payment/create',
      'https://wata.pro/api/payments/create',
      'https://wata.pro/api/transactions',
      'https://wata.pro/api/transactions/create'
    ];
    const candidateUrls = apiUrl ? [apiUrl] : defaultCandidates;

    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (_) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }

    const { amount, currency = 'RUB', description, orderId, customerEmail, successUrl, failUrl, type, expirationDateTime } = payload;
    if (!amount || !orderId || !description) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields: amount, orderId, description' })
      };
    }

    // Build request body for Wata H2H links per docs
    const wataBody = {
      type: type || 'ManyTime',
      amount,
      currency,
      description,
      orderId,
      successRedirectUrl: successUrl,
      failRedirectUrl: failUrl,
      expirationDateTime
    };

    // Build primary headers based on configured values (if any)
    function buildHeaders(headerName, scheme) {
      const h = { 'Content-Type': 'application/json' };
      if (!headerName || headerName.toLowerCase() === 'authorization') {
        if (scheme) h['Authorization'] = `${scheme} ${apiKey}`; else h['Authorization'] = `Bearer ${apiKey}`;
      } else {
        h[headerName] = apiKey;
      }
      return h;
    }

    const candidateHeaders = [];
    // 1) Configured header/scheme if provided
    candidateHeaders.push(buildHeaders(configuredAuthHeader, configuredAuthScheme));
    // 2) Authorization: Bearer <key>
    candidateHeaders.push(buildHeaders('Authorization', 'Bearer'));
    // 3) X-Api-Key: <key>
    const hX = { 'Content-Type': 'application/json', 'X-Api-Key': apiKey };
    candidateHeaders.push(hX);

    // Try with candidates until one succeeds (not 401/403)
    let resp;
    let lastError;
    // Перебираем URL и заголовки до успешного ответа (не 401/403/404)
    outer:
    for (let u = 0; u < candidateUrls.length; u++) {
      const url = candidateUrls[u];
      for (let i = 0; i < candidateHeaders.length; i++) {
        resp = await httpRequestWithRetry(url, {
          method: 'POST',
          headers: candidateHeaders[i],
          body: JSON.stringify(wataBody)
        });
        if (resp.status !== 401 && resp.status !== 403 && resp.status !== 404) {
          apiUrl = url; // запомним какой URL сработал
          break outer;
        }
        lastError = { status: resp.status, url };
      }
    }

    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }

    if (!resp || !resp.ok) {
      return {
        statusCode: resp ? resp.status : 500,
        headers,
        body: JSON.stringify({ error: 'Failed to create payment', status: resp ? resp.status : 500, data, tried: candidateUrls, lastError })
      };
    }

    // Try to normalize response
    // Common fields we try to extract
    const paymentId = data.paymentId || data.id || data.transactionId || data.payment_id;
    const paymentUrl = data.paymentUrl || data.url || data.redirectUrl || data.checkout_url;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        paymentId,
        paymentUrl,
        raw: data
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', message: error.message })
    };
  }
};

