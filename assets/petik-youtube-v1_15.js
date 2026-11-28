/* Petik YouTube diagnostics UI patch v1.15.0.
 * Loaded before the main app. It only intercepts the app's own /api/inspect
 * response for an upstream YouTube 429 so the website does not continue
 * probing other extractors after the Petik API has already entered cooldown.
 */
(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  let lastYoutubeIssue = null;
  let lastYoutubeIssueMessage = '';
  let lastYoutubeRetryAfter = null;

  function youtubeUrl(value) {
    try {
      const host = new URL(String(value || '')).hostname.toLowerCase().replace(/^www\./, '');
      return host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com');
    } catch (_) {
      return false;
    }
  }

  function requestInfo(input, init) {
    const url = input instanceof Request ? input.url : String(input || '');
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    let body = init?.body;
    if (typeof body !== 'string' && input instanceof Request) body = '';
    let payload = null;
    if (typeof body === 'string') {
      try { payload = JSON.parse(body); } catch (_) { payload = null; }
    }
    let pathname = '';
    try { pathname = new URL(url, window.location.href).pathname; } catch (_) { pathname = ''; }
    return { pathname, method, payload, isYoutube: youtubeUrl(payload?.url) };
  }

  function makeEmptyInspectResponse() {
    return new Response(JSON.stringify({
      success: true,
      status: 'ready',
      service: 'youtube',
      title: 'Video YouTube',
      author: null,
      duration: null,
      thumbnail: null,
      previewUrl: null,
      directUrls: { video: null, audio: null },
      videoOptions: [],
      audioOptions: [],
      mediaItems: [],
      photoItems: [],
      mediaCounts: { total: 0, photos: 0, videos: 0 },
      galleryAvailable: false,
      galleryLimit: 0,
      mediaLimit: 0,
      defaultVideoQuality: 'max',
      defaultAudioQuality: 'best'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  window.fetch = async function petikYoutubeFetch(input, init) {
    const info = requestInfo(input, init);
    const isInspect = info.method === 'POST' && /\/api\/inspect\/?$/.test(info.pathname);
    const isDownload = info.method === 'POST' && /\/api\/download\/?$/.test(info.pathname);
    const trackedYoutubeRequest = info.isYoutube && (isInspect || isDownload);

    if (trackedYoutubeRequest && isInspect) {
      lastYoutubeIssue = null;
      lastYoutubeIssueMessage = '';
      lastYoutubeRetryAfter = null;
    }

    const response = await nativeFetch(input, init);
    if (!trackedYoutubeRequest) return response;

    let payload = null;
    try { payload = await response.clone().json(); } catch (_) { payload = null; }
    const error = payload?.error || {};
    const context = error.context || {};
    const code = String(error.code || '');
    const message = String(context.message || payload?.detail || '');
    const service = String(context.service || payload?.service || '').toLowerCase();
    const isYoutubeRateLimit = service === 'youtube'
      && (code === 'error.api.rate.limit' || response.status === 429)
      && /youtube|429|rate limit|membatasi/i.test(message);
    const isBotCheck = service === 'youtube'
      && code === 'error.api.youtube.restricted'
      && /anti.?bot|pemeriksaan anti-bot|sign in to confirm|not a bot/i.test(message);

    if (isYoutubeRateLimit) {
      lastYoutubeIssue = 'rate_limit';
      lastYoutubeIssueMessage = message;
      const retryAfterHeader = Number(response.headers.get('Retry-After'));
      lastYoutubeRetryAfter = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? Math.ceil(retryAfterHeader) : null;
      // Return a valid zero-format inspection result to stop app-level API/Piped
      // retries. The normal UI still keeps save disabled and may show noembed preview.
      if (isInspect) return makeEmptyInspectResponse();
      return response;
    }

    if (isBotCheck) {
      lastYoutubeIssue = 'bot_check';
      lastYoutubeIssueMessage = message;
    }
    return response;
  };

  function improvedMessage(text) {
    if (lastYoutubeIssue === 'rate_limit') {
      const waitText = lastYoutubeRetryAfter ? ` Tunggu sekitar ${lastYoutubeRetryAfter} detik sebelum mencoba lagi.` : ' Tunggu cooldown yang ditentukan server sebelum mencoba lagi.';
      return 'YouTube mengembalikan HTTP 429 ke server Petik. Petik menghentikan retry dan percobaan client cadangan.' + waitText + ' Jangan kirim ulang tautan berkali-kali selama cooldown.';
    }
    if (lastYoutubeIssue === 'bot_check') {
      return 'YouTube menolak sesi anonim server Petik melalui pemeriksaan anti-bot. Preview mungkin tetap tersedia, tetapi format unduhan belum diberikan. Ini bukan masalah kata sandi akunmu.';
    }
    return text;
  }

  function updateStatusText() {
    const genericMessages = [
      'YouTube belum didukung oleh server unduhan yang tersedia.',
      'YouTube belum didukung oleh server unduhan yang tersedia. Preview tetap ditampilkan, tetapi tombol Simpan tidak tersedia.',
      'Tautan dikenali, tetapi API tidak menemukan format video maupun audio yang bisa disimpan.',
      'YouTube belum didukung oleh server unduhan yang tersedia. Preview tetap ditampilkan, tetapi media ini tidak dapat disimpan melalui API saat ini.'
    ];
    const statusIds = ['status-area', 'availability-note', 'manager-status'];
    for (const id of statusIds) {
      const element = document.getElementById(id);
      if (!element) continue;
      const current = String(element.textContent || '').trim();
      if (genericMessages.some((text) => current.includes(text))) {
        const next = improvedMessage(current);
        if (next !== current) element.textContent = next;
      }
    }
  }

  const observer = new MutationObserver(updateStatusText);
  const startObserver = () => {
    if (document.documentElement) observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
    updateStatusText();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  else startObserver();

  window.PetikYouTubeDiagnostics = Object.freeze({
    version: '1.15.0',
    get lastIssue() { return lastYoutubeIssue; },
    get lastIssueMessage() { return lastYoutubeIssueMessage; },
    get retryAfterSeconds() { return lastYoutubeRetryAfter; }
  });
})();
