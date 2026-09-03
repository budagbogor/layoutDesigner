// ---------------------------------------------------------------------------
// Next.js API Proxy Route for AI Providers (Server-to-Server)
//
// Resolves browser CORS restrictions when contacting third-party AI APIs.
// Completely isolates API keys from client inspection when configured via server.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const bodyPayload = await req.json();
    const { endpoint, baseUrl, apiKey, method, body } = bodyPayload;

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 400 }
      );
    }

    const cleanBaseUrl = (baseUrl || 'https://ai.sumopod.com/v1').replace(/\/+$/, '');
    const cleanEndpoint = endpoint
      ? endpoint.startsWith('/')
        ? endpoint
        : `/${endpoint}`
      : '/models';
    const targetUrl = `${cleanBaseUrl}${cleanEndpoint}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const fetchOptions: RequestInit = {
      method: method || 'GET',
      headers,
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const upstreamRes = await fetch(targetUrl, fetchOptions);
    const contentType = upstreamRes.headers.get('content-type') || '';

    let data: any;
    if (contentType.includes('application/json')) {
      data = await upstreamRes.json();
    } else {
      const text = await upstreamRes.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = { rawText: text };
      }
    }

    return NextResponse.json(data, { status: upstreamRes.status });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to connect to AI provider upstream' },
      { status: 500 }
    );
  }
}
