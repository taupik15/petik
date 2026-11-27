(() => {
  'use strict';

  const API_PRIMARY = 'https://petik-universal-api-masx.onrender.com';
  const COBALT_APIS = ['https://rue-cobalt.xenon.zone', 'https://cobaltapi.cjs.nz'];
  const PIPED_APIS = ['https://api.piped.private.coffee'];
  const STORAGE = { api: 'petik.api', history: 'petik.history', prefs: 'petik.prefs' };
  const LABELS = {
    youtube: 'YouTube', instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok',
    twitter: 'X', reddit: 'Reddit', vimeo: 'Vimeo', pinterest: 'Pinterest',
    soundcloud: 'SoundCloud', telegram: 'Telegram', threads: 'Threads', snapchat: 'Snapchat', other: 'Tautan'
  };
  const SERVICE_MAP = {
    youtube: 'youtube', instagram: 'instagram', facebook: 'facebook', tiktok: 'tiktok',
    twitter: 'twitter', reddit: 'reddit', vimeo: 'vimeo', pinterest: 'pinterest',
    soundcloud: 'soundcloud', telegram: 'telegram', threads: 'threads', snapchat: 'snapchat'
  };
  const DEFAULT_QUALITY = [
    { id: 'max', label: 'Terbaik yang tersedia' }, { id: '1080', label: 'Maksimal 1080p' },
    { id: '720', label: 'Maksimal 720p' }, { id: '480', label: 'Maksimal 480p' },
    { id: '360', label: 'Maksimal 360p' }
  ];
  const $ = (id) => document.getElementById(id);
  const ui = {
    form: $('download-form'), url: $('source-url'), detected: $('detected-platform'), paste: $('paste-button'),
    videoTab: $('video-tab'), audioTab: $('audio-tab'), ambil: $('ambil-button'), status: $('status-area'),
    result: $('result-card'), preview: $('media-preview'), thumb: $('media-thumb'), thumbPlaceholder: $('thumbnail-placeholder'),
    platform: $('result-platform'), duration: $('result-duration'), title: $('result-title'), author: $('result-author'),
    modeSummary: $('mode-summary'), formatSummary: $('format-summary'), note: $('availability-note'),
    saveOpen: $('save-open'), saveLabel: $('save-label'), saveDialog: $('save-dialog'), saveDialogTitle: $('save-dialog-title'),
    qualityLabel: $('quality-label'), qualitySelect: $('quality-select'), qualityHelp: $('quality-help'), confirmSave: $('confirm-save'),
    manager: $('download-manager'), managerTitle: $('manager-title'), managerStatus: $('manager-status'),
    progress: $('progress-fill'), cancelDownload: $('cancel-download'), retryDownload: $('retry-download'), settingsDialog: $('settings-dialog'),
    customApi: $('custom-api'), settingsSave: $('settings-save'), apiHealth: $('api-health'),
    historyDialog: $('history-dialog'), historyList: $('history-list'), clearHistory: $('clear-history')
  };

  function safeStorageGet(key, fallback = '') { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
  function safeStorageSet(key, value) { try { localStorage.setItem(key, value); } catch { /* storage may be disabled */ } }
  function readHistory() {
    try { const value = JSON.parse(safeStorageGet(STORAGE.history, '[]')); return Array.isArray(value) ? value.slice(0, 12) : []; }
    catch { return []; }
  }
  function readPreferences() {
    try {
      const value = JSON.parse(safeStorageGet(STORAGE.prefs, '{}'));
      return { mode: value?.mode === 'audio' ? 'audio' : 'video', quality: String(value?.quality || 'max') };
    } catch { return { mode: 'video', quality: 'max' }; }
  }
  const initialPreferences = readPreferences();
  const state = {
    mode: initialPreferences.mode, busy: false, media: null, candidates: [], apiIndex: -1,
    downloadController: null, inspectController: null, selectedQuality: initialPreferences.quality, history: readHistory(), currentTask: 0, lastApiUsed: ''
  };
  function savePreferences() { safeStorageSet(STORAGE.prefs, JSON.stringify({ mode: state.mode, quality: state.selectedQuality })); }
  function saveHistory(item) {
    state.history = [item, ...state.history.filter((entry) => entry.url !== item.url)].slice(0, 12);
    safeStorageSet(STORAGE.history, JSON.stringify(state.history));
    renderHistory();
  }
  function normaliseUrl(value) {
    let text = String(value || '').trim().replace(/^['"]+|['"]+$/g, '');
    if (!text) return '';
    if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
    try { const url = new URL(text); if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return ''; return url.toString(); }
    catch { return ''; }
  }
  function apiBase(value) {
    const url = normaliseUrl(value);
    if (!url) return '';
    try { const parsed = new URL(url); return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`; }
    catch { return ''; }
  }
  function platformOf(value) {
    try {
      const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
      const domain = (name) => host === name || host.endsWith(`.${name}`);
      if (host === 'youtu.be' || domain('youtube.com') || domain('youtube-nocookie.com')) return 'youtube';
      if (host === 'instagr.am' || domain('instagram.com')) return 'instagram';
      if (['fb.watch', 'fb.com', 'fb.me'].includes(host) || domain('facebook.com')) return 'facebook';
      if (domain('tiktok.com')) return 'tiktok';
      if (host === 'x.com' || domain('twitter.com')) return 'twitter';
      if (host === 'redd.it' || domain('reddit.com')) return 'reddit';
      if (domain('vimeo.com')) return 'vimeo';
      if (host === 'pin.it' || domain('pinterest.com')) return 'pinterest';
      if (domain('soundcloud.com')) return 'soundcloud';
      if (host === 't.me' || domain('telegram.me')) return 'telegram';
      if (domain('threads.net') || domain('threads.com')) return 'threads';
      if (domain('snapchat.com')) return 'snapchat';
      return 'other';
    } catch { return 'other'; }
  }
  function candidates() {
    const entries = [apiBase(safeStorageGet(STORAGE.api)), apiBase(API_PRIMARY), ...COBALT_APIS.map(apiBase)].filter(Boolean);
    return [...new Set(entries)];
  }
  function setStatus(message, kind = '') {
    ui.status.hidden = !message;
    ui.status.className = `status-area${kind ? ` ${kind}` : ''}`;
    ui.status.textContent = message || '';
  }
  function setBusy(value, label) {
    state.busy = value;
    ui.ambil.disabled = value;
    ui.ambil.innerHTML = value ? '<span class="spin">◌</span><span>Memeriksa...</span>' : '<span class="button-icon">↓</span><span>Ambil</span>';
    if (label) setStatus(label);
  }
  function renderPlatforms() {
    const names = Object.values(LABELS).filter((name) => name !== 'Tautan');
    $('platform-list').innerHTML = names.map((name) => `<span class="platform-chip">${escapeHtml(name)}</span>`).join('');
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  function updateDetection() {
    const url = normaliseUrl(ui.url.value);
    const platform = url ? platformOf(url) : 'other';
    ui.detected.textContent = url && platform !== 'other' ? `Terdeteksi: ${LABELS[platform]}` : '';
  }
  function timeoutSignal(ms) { return AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined; }
  function requestSignal(ms, externalSignal = null) {
    const timed = timeoutSignal(ms);
    if (externalSignal && timed && AbortSignal.any) return AbortSignal.any([externalSignal, timed]);
    return externalSignal || timed;
  }
  async function parseJson(response) { try { return await response.json(); } catch { return null; } }
  async function postJson(url, data, timeout = 45000, externalSignal = null) {
    const timed = timeoutSignal(timeout);
    const signal = externalSignal && timed && AbortSignal.any
      ? AbortSignal.any([externalSignal, timed])
      : (externalSignal || timed);
    const response = await fetch(url, {
      method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(data), signal
    });
    return { response, data: await parseJson(response) };
  }
  async function noembed(url, externalSignal = null) {
    try {
      const response = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`, { signal: requestSignal(9000, externalSignal) });
      if (!response.ok) return {};
      const data = await response.json();
      return data.error ? {} : { title: data.title || '', author: data.author_name || '', thumbnail: data.thumbnail_url || '' };
    } catch { return {}; }
  }
  function isInspectSuccess(data) { return Boolean(data && data.success === true && data.status === 'ready'); }
  async function inspectCandidate(base, url, platform, index, externalSignal = null) {
    let response;
    try {
      response = await fetch(`${base}/api/inspect`, {
        method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }), signal: requestSignal(60000, externalSignal)
      });
    } catch (error) {
      if (externalSignal?.aborted) throw error;
      return null;
    }
    const data = await parseJson(response);
    if (response.ok && isInspectSuccess(data)) {
      return { kind: 'native', base, index, platform: data.service || platform, data };
    }
    // Cobalt-compatible APIs do not implement /api/inspect; identify them by their root descriptor.
    if (response.status !== 404 && response.status !== 405) return null;
    try {
      const rootResponse = await fetch(`${base}/`, { headers: { 'Accept': 'application/json' }, signal: requestSignal(9000, externalSignal) });
      if (!rootResponse.ok) return null;
      const root = await parseJson(rootResponse);
      const services = root?.cobalt?.services;
      if (Array.isArray(services) && !services.some((service) => String(service).toLowerCase() === (SERVICE_MAP[platform] || platform))) return null;
      if (!root?.cobalt && !Array.isArray(services)) return null;
      // Ask the legacy extractor for a playable result so the older Cobalt fallback
      // can still supply an inline preview, not only a disabled placeholder card.
      try {
        const legacy = await postJson(`${base}/`, {
          url, videoQuality: 'max', downloadMode: 'auto', filenameStyle: 'pretty', alwaysProxy: false
        }, 90000, externalSignal);
        const payload = legacy.data || {};
        const picker = Array.isArray(payload.picker) ? payload.picker : [];
        const videoItem = picker.find((item) => /video/i.test(String(item.type || '')) && item.url);
        const audioItem = picker.find((item) => /audio/i.test(String(item.type || '')) && item.url);
        const directUrl = ['tunnel', 'redirect'].includes(payload.status) && payload.url ? payload.url : '';
        const audioOnly = platform === 'soundcloud' || /\.(?:mp3|m4a|aac|wav|flac|ogg|opus)(?:$|[?#])/i.test(String(payload.filename || directUrl));
        const rawPreviewUrl = videoItem?.url || (!audioOnly ? directUrl : '');
        const previewUrl = rawPreviewUrl ? new URL(rawPreviewUrl, base).toString() : '';
        const audioAvailable = Boolean(audioItem || audioOnly || payload.audio);
        const videoAvailable = Boolean(videoItem || previewUrl || (payload.status === 'local-processing' && payload.output?.filename));
        if (!legacy.response.ok || !['tunnel', 'redirect', 'picker', 'local-processing'].includes(payload.status) || (!videoAvailable && !audioAvailable)) return null;
        return {
          kind: 'legacy', base, index, platform,
          data: {
            title: payload.title || '', author: payload.author || '', thumbnail: videoItem?.thumb || payload.thumb || '',
            previewUrl, videoOptions: videoAvailable ? DEFAULT_QUALITY : [],
            audioOptions: (audioAvailable || videoAvailable) ? [{ id: 'best', label: 'MP3 · kualitas terbaik' }] : []
          }
        };
      } catch (error) {
        if (externalSignal?.aborted) throw error;
      }
      return { kind: 'legacy', base, index, platform, data: { title: '', author: '', thumbnail: '', videoOptions: [], audioOptions: [] } };
    } catch (error) {
      if (externalSignal?.aborted) throw error;
      return null;
    }
  }
  function youtubeId(url) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.endsWith('youtu.be')) return parsed.pathname.split('/').filter(Boolean)[0] || null;
      const id = parsed.searchParams.get('v');
      if (id) return id;
      return parsed.pathname.match(/\/(?:shorts|embed|live|v)\/([\w-]{6,})/)?.[1] || null;
    } catch { return null; }
  }
  function pipedNormalize(data, mode) {
    const videos = (data.videoStreams || []).filter((item) => item.url && !item.videoOnly).map((item, i) => ({
      id: `piped-video-${i}`, kind: 'video', url: item.url, filename: `${data.title || 'petik'}.${String(item.mimeType || '').includes('webm') ? 'webm' : 'mp4'}`,
      label: item.quality || 'Video', quality: item.quality || 'Video'
    }));
    const audios = (data.audioStreams || []).filter((item) => item.url).map((item, i) => ({
      id: `piped-audio-${i}`, kind: 'audio', url: item.url, filename: `${data.title || 'petik'}.${String(item.mimeType || '').includes('webm') ? 'webm' : 'm4a'}`,
      label: item.quality || 'Audio', quality: item.quality || 'Audio'
    }));
    return { videos, audios, mode };
  }
  async function inspectPiped(url, externalSignal = null) {
    const id = youtubeId(url);
    if (!id) return null;
    for (const base of PIPED_APIS) {
      try {
        const response = await fetch(`${base}/streams/${encodeURIComponent(id)}`, { headers: { 'Accept': 'application/json' }, signal: requestSignal(12000, externalSignal) });
        if (!response.ok) continue;
        const data = await response.json();
        if (data.error) continue;
        const streams = pipedNormalize(data, 'video');
        if (!streams.videos.length && !streams.audios.length) continue;
        return { kind: 'piped', base, index: -1, platform: 'youtube', data, streams };
      } catch { /* move to the next community instance */ }
    }
    return null;
  }
  function formatDuration(seconds) {
    if (!Number.isFinite(Number(seconds)) || Number(seconds) <= 0) return '';
    const value = Math.floor(Number(seconds));
    const hours = Math.floor(value / 3600), minutes = Math.floor((value % 3600) / 60), secs = value % 60;
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${minutes}:${String(secs).padStart(2, '0')}`;
  }
  function currentModeOptions() {
    if (!state.media || state.media.downloadUnavailable || state.media.kind === 'unsupported') return [];
    if (state.media.kind === 'native' || state.media.kind === 'legacy') {
      return state.mode === 'audio' ? (state.media.data.audioOptions || []) : (state.media.data.videoOptions || []);
    }
    if (state.media.kind === 'piped') {
      return state.mode === 'audio'
        ? state.media.streams.audios.map((item) => ({ id: item.id, label: item.label, item }))
        : state.media.streams.videos.map((item) => ({ id: item.id, label: item.label, item }));
    }
    return [];
  }
  function renderMedia() {
    const media = state.media;
    if (!media) { ui.result.hidden = true; return; }
    const data = media.data || {};
    const options = currentModeOptions();
    ui.result.hidden = false;
    ui.platform.textContent = LABELS[media.platform] || 'Media';
    ui.duration.textContent = formatDuration(data.duration || 0);
    ui.title.textContent = data.title || 'Tautan siap diproses';
    ui.author.textContent = data.author ? `Oleh ${data.author}` : '';

    const previewUrl = data.previewUrl || media.previewUrl || media.items?.find((item) => item.kind === 'video')?.url || '';
    if (previewUrl) {
      if (ui.preview.getAttribute('src') !== previewUrl) {
        ui.preview.pause?.();
        ui.preview.src = previewUrl;
        ui.preview.load?.();
      }
      if (data.thumbnail) ui.preview.poster = data.thumbnail;
      ui.preview.hidden = false;
      ui.thumb.hidden = true;
      ui.thumbPlaceholder.hidden = true;
    } else {
      if (!ui.preview.hidden) {
        ui.preview.pause?.();
        ui.preview.removeAttribute('src');
        ui.preview.load?.();
      }
      ui.preview.hidden = true;
      const image = data.thumbnail;
      if (image) { ui.thumb.src = image; ui.thumb.hidden = false; ui.thumbPlaceholder.hidden = true; }
      else { ui.thumb.removeAttribute('src'); ui.thumb.hidden = true; ui.thumbPlaceholder.hidden = false; }
    }

    if (media.kind === 'unsupported' || media.downloadUnavailable) {
      ui.modeSummary.textContent = 'Unduhan tidak tersedia';
      ui.formatSummary.textContent = 'Preview saja';
      ui.note.textContent = media.error || 'Server unduhan belum mendukung media ini.';
    } else if (media.kind === 'native') {
      ui.modeSummary.textContent = state.mode === 'audio' ? `${options.length} pilihan audio tersedia` : `${options.length} pilihan kualitas video tersedia`;
      ui.formatSummary.textContent = state.mode === 'audio' ? 'MP3' : 'MP4 / video';
      ui.note.textContent = options.length
        ? 'Kualitas dipilih saat kamu menekan Simpan. Daftar mengikuti format yang tersedia dari sumber.'
        : `Format ${state.mode === 'audio' ? 'audio' : 'video'} tidak tersedia dari tautan ini. ${state.mode === 'audio' ? 'Coba mode Video.' : (data.audioOptions || []).length ? 'Audio tersedia; pindah ke mode Audio.' : 'Belum ada format yang bisa disimpan.'}`;
    } else if (media.kind === 'legacy') {
      ui.modeSummary.textContent = options.length ? `${options.length} pilihan ${state.mode === 'audio' ? 'audio' : 'video'} tersedia` : `Format ${state.mode === 'audio' ? 'audio' : 'video'} tidak tersedia`;
      ui.formatSummary.textContent = state.mode === 'audio' ? 'MP3 / audio' : 'Video';
      ui.note.textContent = options.length
        ? 'API cadangan kompatibel Cobalt akan memproses format saat kamu menekan Simpan.'
        : 'API cadangan mengenali tautan, tetapi tidak menyediakan media pada mode yang dipilih.';
    } else if (media.kind === 'piped') {
      ui.modeSummary.textContent = `${options.length} stream ${state.mode === 'audio' ? 'audio' : 'video'} tersedia`;
      ui.formatSummary.textContent = state.mode === 'audio' ? 'Audio' : 'Video';
      ui.note.textContent = options.length ? 'Stream berasal dari server Piped cadangan. Ketersediaan dan kualitas bergantung pada sumber.' : 'Tidak ada stream untuk mode yang dipilih.';
    }
    ui.saveLabel.textContent = state.mode === 'audio' ? 'Simpan Audio' : 'Simpan Video';
    const canSave = options.length > 0 && media.kind !== 'unsupported' && !media.downloadUnavailable;
    ui.saveOpen.hidden = !canSave;
    ui.saveOpen.disabled = !canSave;
    ui.videoTab.classList.toggle('active', state.mode === 'video');
    ui.audioTab.classList.toggle('active', state.mode === 'audio');
    ui.videoTab.setAttribute('aria-selected', String(state.mode === 'video'));
    ui.audioTab.setAttribute('aria-selected', String(state.mode === 'audio'));
    ui.preview.onerror = () => {
      ui.preview.pause?.();
      ui.preview.hidden = true;
      ui.preview.removeAttribute('src');
      if (data.thumbnail) { ui.thumb.src = data.thumbnail; ui.thumb.hidden = false; ui.thumbPlaceholder.hidden = true; }
      else { ui.thumb.hidden = true; ui.thumbPlaceholder.hidden = false; }
      ui.note.textContent = `${ui.note.textContent} Pratinjau video tidak dapat diputar di browser ini.`;
    };
  }
  function switchMode(mode) {
    if (!['video', 'audio'].includes(mode)) return;
    state.mode = mode;
    if (state.media?.platform === 'soundcloud' && mode === 'video') {
      state.mode = 'audio';
    }
    savePreferences();
    renderMedia();
  }
  function resetForNewRequest() {
    state.inspectController?.abort();
    state.downloadController?.abort();
    state.inspectController = null;
    state.downloadController = null;
    state.busy = false;
    state.media = null;
    state.candidates = [];
    state.apiIndex = -1;
    if (ui.saveDialog.open) ui.saveDialog.close();
    ui.result.hidden = true;
    ui.saveOpen.hidden = true;
    ui.saveOpen.disabled = true;
    setStatus('');
    ui.manager.hidden = true;
    ui.managerTitle.textContent = 'Menyiapkan unduhan';
    ui.managerStatus.textContent = 'Menunggu tautan baru...';
    ui.cancelDownload.hidden = true;
    ui.retryDownload.hidden = true;
    ui.progress.style.width = '0%';
    if (ui.preview) {
      ui.preview.pause?.();
      ui.preview.removeAttribute('src');
      ui.preview.removeAttribute('poster');
      ui.preview.hidden = true;
      ui.preview.load?.();
    }
    ui.thumb.removeAttribute('src');
    ui.thumb.hidden = true;
    ui.thumbPlaceholder.hidden = false;
    ui.ambil.disabled = false;
    ui.ambil.innerHTML = '<span class="button-icon">↓</span><span>Ambil</span>';
  }

  async function takeLink(rawUrl = ui.url.value) {
    const taskId = ++state.currentTask;
    resetForNewRequest();
    const url = normaliseUrl(rawUrl);
    if (!url) { setStatus('Masukkan tautan http atau https yang valid.', 'error'); return; }
    const platform = platformOf(url);
    if (platform === 'other') { setStatus('Platform pada tautan ini belum dikenali Petik.', 'error'); return; }

    const controller = new AbortController();
    state.inspectController = controller;
    setBusy(true, 'Memeriksa media dan layanan API...');
    const metaPromise = noembed(url, controller.signal);
    state.candidates = candidates();
    try {
      let found = null;
      for (let index = 0; index < state.candidates.length; index++) {
        if (taskId !== state.currentTask) return;
        const result = await inspectCandidate(state.candidates[index], url, platform, index, controller.signal);
        if (result) { found = result; break; }
      }
      if (!found && platform === 'youtube') found = await inspectPiped(url, controller.signal);
      if (taskId !== state.currentTask) return;

      if (!found) {
        const meta = await metaPromise;
        if (taskId !== state.currentTask) return;
        if (platform === 'youtube') {
          const id = youtubeId(url);
          state.media = {
            kind: 'unsupported', platform, url, index: -1,
            error: 'YouTube belum didukung oleh server unduhan yang tersedia. Preview tetap ditampilkan, tetapi tombol Simpan tidak tersedia.',
            data: {
              title: meta.title || 'Video YouTube', author: meta.author || '',
              thumbnail: meta.thumbnail || (id ? `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg` : ''),
              videoOptions: [], audioOptions: []
            }
          };
          renderMedia();
          setStatus(state.media.error, 'error');
          saveHistory({ url, title: state.media.data.title, service: LABELS[platform], at: Date.now() });
        } else {
          setStatus('Belum ada API yang berhasil memeriksa tautan ini. Pastikan postingan publik, lalu coba lagi.', 'error');
        }
        return;
      }

      if (found.kind === 'piped') {
        const bestPreview = [...(found.streams.videos || [])].sort((a, b) => {
          const qa = Number(String(a.quality).match(/\d+/)?.[0] || 0);
          const qb = Number(String(b.quality).match(/\d+/)?.[0] || 0);
          return qb - qa;
        })[0];
        found.data = {
          title: found.data.title || '', author: found.data.uploader || found.data.uploaderName || '',
          duration: found.data.duration || 0, thumbnail: found.data.thumbnailUrl || found.data.thumbnail || '',
          previewUrl: bestPreview?.url || ''
        };
      }
      if (found.data) {
        found.data.title = found.data.title || '';
        found.data.author = found.data.author || '';
        found.data.thumbnail = found.data.thumbnail || '';
        if (!found.data.thumbnail && platform === 'youtube') {
          const id = youtubeId(url);
          if (id) found.data.thumbnail = `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
        }
      }
      if (found.platform === 'soundcloud' || (found.data && !(found.data.videoOptions || []).length && (found.data.audioOptions || []).length)) {
        state.mode = 'audio';
      } else if (found.data && !(found.data.audioOptions || []).length && (found.data.videoOptions || []).length) {
        state.mode = 'video';
      }
      state.media = { ...found, url, originalPlatform: platform };
      state.apiIndex = found.index;
      state.lastApiUsed = found.base || 'Piped';
      renderMedia();
      const hasVideo = found.kind === 'piped' ? found.streams.videos.length > 0 : (found.data?.videoOptions || []).length > 0;
      const hasAudio = found.kind === 'piped' ? found.streams.audios.length > 0 : (found.data?.audioOptions || []).length > 0;
      if (!hasVideo && !hasAudio) {
        if (platform === 'youtube') {
          state.media.kind = 'unsupported';
          state.media.error = 'YouTube belum didukung oleh server unduhan yang tersedia. Preview tetap ditampilkan, tetapi tombol Simpan tidak tersedia.';
          renderMedia();
          setStatus(state.media.error, 'error');
        } else {
          setStatus('Tautan dikenali, tetapi API tidak menemukan format video maupun audio yang bisa disimpan.', 'error');
        }
      } else {
        setStatus('Media berhasil diperiksa. Pilih Video atau Audio, lalu tekan Simpan.', 'success');
      }
      saveHistory({ url, title: found.data?.title || LABELS[platform], service: LABELS[platform], at: Date.now() });
      metaPromise.then((meta) => {
        if (state.currentTask !== taskId || state.media?.url !== url || !state.media.data) return;
        if (!state.media.data.title && meta.title) state.media.data.title = meta.title;
        if (!state.media.data.author && meta.author) state.media.data.author = meta.author;
        if (!state.media.data.thumbnail && meta.thumbnail) state.media.data.thumbnail = meta.thumbnail;
        renderMedia();
        if (meta.title) saveHistory({ url, title: meta.title, service: LABELS[platform], at: Date.now() });
      });
    } catch (error) {
      if (taskId !== state.currentTask) return;
      if (error?.name === 'AbortError') setStatus('Pemeriksaan API melewati batas waktu. Coba lagi atau gunakan API lain di Pengaturan.', 'error');
      else setStatus(error?.message || 'Koneksi ke API gagal. Coba tautan lagi.', 'error');
    } finally {
      if (taskId === state.currentTask) {
        setBusy(false);
        state.inspectController = null;
      }
    }
  }
  function qualityOptions() {
    if (!state.media || state.media.downloadUnavailable || state.media.kind === 'unsupported') return [];
    if (state.media.kind === 'native') {
      const key = state.mode === 'audio' ? 'audioOptions' : 'videoOptions';
      return state.media.data[key] || [];
    }
    if (state.media.kind === 'piped') {
      const streams = state.mode === 'audio' ? state.media.streams.audios : state.media.streams.videos;
      return streams.map((item) => ({ id: item.id, label: item.label, item }));
    }
    if (state.media.kind === 'legacy') return currentModeOptions();
    return [];
  }
  function openSaveDialog() {
    if (!state.media) return;
    const options = qualityOptions();
    if (!options.length) { setStatus(`Tidak ada ${state.mode === 'audio' ? 'audio' : 'video'} yang tersedia dari tautan ini.`, 'error'); return; }
    ui.qualitySelect.innerHTML = options.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`).join('');
    if (options.some((item) => String(item.id) === state.selectedQuality)) ui.qualitySelect.value = state.selectedQuality;
    else ui.qualitySelect.value = String(options[0].id);
    ui.saveDialogTitle.textContent = state.mode === 'audio' ? 'Simpan audio' : 'Simpan video';
    ui.qualityLabel.textContent = state.mode === 'audio' ? 'Kualitas audio' : 'Kualitas video';
    ui.qualityHelp.textContent = state.media.kind === 'native'
      ? 'Pilihan ini berasal dari format yang tersedia pada sumber media.'
      : state.media.kind === 'piped'
        ? 'Pilih stream yang tersedia. Jika browser tidak dapat mengambil berkas, tautan akan dibuka langsung.'
        : 'Ini adalah batas kualitas maksimum, bukan jaminan resolusi. API akan memilih format terbaik yang tersedia.';
    ui.confirmSave.disabled = false;
    ui.saveDialog.showModal();
  }
  async function getTunnelFromBase(base, url, mode, quality, allowLegacy = true, signal = null) {
    let result;
    try {
      result = await postJson(`${base}/api/download`, { url, mode, quality }, 180000, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      return null;
    }
    if (result.response.ok && result.data?.status === 'tunnel' && result.data.url) return result.data;
    // Only try the legacy Cobalt route when the native route is genuinely absent.
    if (!allowLegacy || ![404, 405].includes(result.response.status)) return null;
    try {
      const legacy = await postJson(`${base}/`, { url, videoQuality: quality, downloadMode: mode === 'audio' ? 'audio' : 'auto', filenameStyle: 'pretty' }, 180000, signal);
      if (legacy.response.ok && legacy.data?.url && ['tunnel', 'redirect'].includes(legacy.data.status)) return legacy.data;
    } catch (error) {
      if (signal?.aborted) throw error;
    }
    return null;
  }
  async function downloadStream(url, filename, signal) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Server mengembalikan HTTP ${response.status}.`);
    const total = Number(response.headers.get('content-length') || 0);
    let blob;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks = []; let loaded = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); loaded += value.byteLength;
        if (total > 0) ui.progress.style.width = `${Math.min(100, Math.round(loaded / total * 100))}%`;
      }
      blob = new Blob(chunks, { type: response.headers.get('content-type') || 'application/octet-stream' });
    } else { blob = await response.blob(); }
    const safeName = filename || 'petik-media';
    const file = new File([blob], safeName, { type: blob.type || 'application/octet-stream' });
    if (/iPad|iPhone|iPod/i.test(navigator.userAgent) && typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: safeName });
        return 'shared';
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        // Safari can lose transient share activation while the server prepares a large file.
        // Fall back to a normal browser download instead of marking a completed file as failed.
      }
    }
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = safeName;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
    return 'saved';
  }
  function showManager(show, title = 'Menyiapkan unduhan', status = '') {
    ui.manager.hidden = !show;
    ui.cancelDownload.hidden = !show;
    if (show) ui.retryDownload.hidden = true;
    if (title) ui.managerTitle.textContent = title;
    if (status) ui.managerStatus.textContent = status;
    if (show) ui.progress.style.width = '4%';
  }
  async function downloadSelected() {
    const media = state.media;
    if (!media || state.busy || !qualityOptions().length) return;
    const taskId = state.currentTask;
    const selectedId = ui.qualitySelect.value;
    state.selectedQuality = selectedId;
    savePreferences();
    const option = qualityOptions().find((item) => String(item.id) === selectedId) || qualityOptions()[0];
    ui.saveDialog.close();
    state.busy = true;
    const controller = new AbortController(); state.downloadController = controller;
    ui.saveOpen.disabled = true;
    showManager(true, state.mode === 'audio' ? 'Mengunduh audio' : 'Mengunduh video', 'Meminta media dari server...');
    try {
      if (media.kind === 'piped') {
        const stream = option.item;
        ui.managerStatus.textContent = 'Mengirim stream dari server cadangan...';
        try {
          const outcome = await downloadStream(stream.url, stream.filename, controller.signal);
          ui.progress.style.width = '100%';
          ui.managerStatus.textContent = outcome === 'shared' ? 'Berkas dibagikan. Pilih Simpan ke File atau aplikasi tujuan.' : 'Unduhan selesai.';
        } catch (error) {
          if (error?.name === 'AbortError') throw error;
          if (error instanceof TypeError) {
            const opened = window.open(stream.url, '_blank', 'noopener,noreferrer');
            if (!opened) throw new Error('Browser memblokir tautan unduhan langsung. Izinkan pop-up lalu coba lagi.');
            ui.managerStatus.textContent = 'Tautan unduhan dibuka di tab baru. Pada iPhone, gunakan Bagikan untuk menyimpan berkas.';
          } else throw error;
        }
      } else {
        let downloaded = false;
        let start = media.index >= 0 ? media.index : 0;
        for (let index = start; index < state.candidates.length; index++) {
          if (controller.signal.aborted) throw new DOMException('Dibatalkan', 'AbortError');
          const base = state.candidates[index];
          ui.managerStatus.textContent = `Memproses melalui API ${index + 1} dari ${state.candidates.length}...`;
          const result = await getTunnelFromBase(base, media.url, state.mode, selectedId, true, controller.signal);
          if (!result?.url) continue;
          const targetUrl = new URL(result.url, base).toString();
          try {
            ui.managerStatus.textContent = 'Mengirim berkas ke perangkat...';
            const outcome = await downloadStream(targetUrl, result.filename || `${state.mode === 'audio' ? 'petik-audio.mp3' : 'petik-video.mp4'}`, controller.signal);
            ui.progress.style.width = '100%';
            downloaded = true;
            ui.managerStatus.textContent = outcome === 'shared' ? 'Berkas dibagikan. Pilih Simpan ke File atau aplikasi tujuan.' : 'Unduhan selesai.';
            break;
          } catch (error) {
            if (error?.name === 'AbortError') throw error;
            if (error instanceof TypeError) {
              // The provider may return a direct URL without browser CORS permission.
              window.open(targetUrl, '_blank', 'noopener,noreferrer');
              downloaded = true;
              ui.managerStatus.textContent = 'Tautan unduhan dibuka di tab baru. Pada iPhone, gunakan Bagikan untuk menyimpan berkas.';
              break;
            }
            // HTTP errors (for example an expired tunnel) should try the next API.
          }
        }
        if (!downloaded && media.platform === 'youtube') {
          const piped = await inspectPiped(media.url);
          if (piped) {
            const streams = state.mode === 'audio' ? piped.streams.audios : piped.streams.videos;
            const upper = Number(selectedId);
            const ranked = [...streams].sort((a, b) => {
              const qa = Number(String(a.quality).match(/\d+/)?.[0] || 0);
              const qb = Number(String(b.quality).match(/\d+/)?.[0] || 0);
              return qb - qa;
            });
            const chosen = Number.isFinite(upper) && upper > 0
              ? ranked.filter((item) => Number(String(item.quality).match(/\d+/)?.[0] || 0) <= upper).at(0)
              : ranked[0];
            if (chosen?.url) {
              ui.managerStatus.textContent = 'Mencoba stream YouTube cadangan...';
              try {
                await downloadStream(chosen.url, chosen.filename, controller.signal);
                downloaded = true;
              } catch (error) {
                if (error?.name === 'AbortError') throw error;
                if (error instanceof TypeError) { window.open(chosen.url, '_blank', 'noopener,noreferrer'); downloaded = true; }
              }
            }
          }
        }
        if (!downloaded) throw new Error('Semua API gagal memproses media. Coba ulang atau gunakan API lain di Pengaturan.');
      }
      setStatus('Permintaan unduhan selesai. Periksa folder Unduhan atau aplikasi File.', 'success');
    } catch (error) {
      if (taskId !== state.currentTask) return;
      if (media.platform === 'youtube' && error?.name !== 'AbortError') {
        media.downloadUnavailable = true;
        media.error = 'YouTube belum didukung oleh server unduhan yang tersedia. Preview tetap ditampilkan, tetapi media ini tidak dapat disimpan melalui API saat ini.';
        renderMedia();
        ui.manager.hidden = true;
        setStatus(media.error, 'error');
      } else {
        if (error?.name === 'AbortError') setStatus('Permintaan unduhan dibatalkan.', 'error');
        else setStatus(error?.message || 'Unduhan gagal. Coba lagi.', 'error');
        ui.managerStatus.textContent = error?.message || (error?.name === 'AbortError' ? 'Permintaan dibatalkan.' : 'Unduhan gagal.');
        ui.retryDownload.hidden = false;
      }
    } finally {
      if (taskId === state.currentTask) {
        state.busy = false; state.downloadController = null;
        ui.saveOpen.disabled = !qualityOptions().length;
        ui.cancelDownload.hidden = true;
        if (ui.manager.hidden) ui.retryDownload.hidden = true;
      }
    }
  }
  function renderHistory() {
    if (!state.history.length) {
      ui.historyList.innerHTML = '<li class="dialog-help">Belum ada tautan di riwayat perangkat ini.</li>';
    } else {
      ui.historyList.innerHTML = state.history.map((item, index) => `<li><button class="history-item" type="button" data-history-index="${index}"><strong>${escapeHtml(item.title || item.service || 'Media')}</strong><span>${escapeHtml(item.service || '')} · ${escapeHtml(item.url)}</span></button></li>`).join('');
    }
  }
  function showDialog(dialog) { if (!dialog.open) dialog.showModal(); }

  ui.form.addEventListener('submit', (event) => { event.preventDefault(); takeLink(); });
  ui.url.addEventListener('input', updateDetection);
  ui.paste.addEventListener('click', async () => {
    try { const text = await navigator.clipboard.readText(); if (text) { ui.url.value = text.trim(); updateDetection(); } }
    catch { ui.url.focus(); setStatus('Clipboard tidak dapat dibaca. Tempel tautan langsung pada kolom.', 'error'); }
  });
  ui.videoTab.addEventListener('click', () => switchMode('video'));
  ui.audioTab.addEventListener('click', () => switchMode('audio'));
  ui.saveOpen.addEventListener('click', openSaveDialog);
  ui.confirmSave.addEventListener('click', downloadSelected);
  ui.cancelDownload.addEventListener('click', () => state.downloadController?.abort());
  ui.retryDownload.addEventListener('click', () => { ui.retryDownload.hidden = true; openSaveDialog(); });
  async function refreshApiHealth() {
    ui.apiHealth.textContent = 'Memeriksa API Petik...';
    try {
      const response = await fetch(`${API_PRIMARY}/health`, { headers: { 'Accept': 'application/json' }, signal: timeoutSignal(15000) });
      const data = await parseJson(response);
      ui.apiHealth.textContent = response.ok && data?.status === 'healthy'
        ? `API Petik aktif · versi ${data.version || 'tidak diketahui'} · yt-dlp + FFmpeg + ${data.javascriptRuntime || 'runtime JS belum terdeteksi'}`
        : `API Petik merespons tetapi statusnya tidak sehat (HTTP ${response.status}).`;
    } catch {
      ui.apiHealth.textContent = 'API Petik belum merespons. Render Free mungkin sedang bangun atau koneksi sedang gagal.';
    }
    if (state.lastApiUsed) ui.apiHealth.textContent += `
API terakhir berhasil: ${state.lastApiUsed}`;
  }
  $('settings-open').addEventListener('click', () => {
    ui.customApi.value = safeStorageGet(STORAGE.api);
    showDialog(ui.settingsDialog);
    refreshApiHealth();
  });
  ui.settingsSave.addEventListener('click', () => {
    const value = ui.customApi.value.trim();
    if (value && !apiBase(value)) { ui.apiHealth.textContent = 'Alamat API harus berupa URL http atau https yang valid.'; return; }
    if (value) safeStorageSet(STORAGE.api, apiBase(value)); else { try { localStorage.removeItem(STORAGE.api); } catch { /* no-op */ } }
    ui.apiHealth.textContent = value ? 'API khusus disimpan. Akan dicoba sebelum API Petik.' : 'API khusus dikosongkan. API Petik akan dicoba pertama.';
    ui.settingsDialog.close();
  });
  $('history-open').addEventListener('click', () => { renderHistory(); showDialog(ui.historyDialog); });
  ui.historyList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-history-index]'); if (!button) return;
    const item = state.history[Number(button.dataset.historyIndex)]; if (!item) return;
    ui.url.value = item.url; updateDetection(); ui.historyDialog.close(); takeLink(item.url);
  });
  ui.clearHistory.addEventListener('click', () => { state.history = []; try { localStorage.removeItem(STORAGE.history); } catch { /* no-op */ } renderHistory(); });
  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => $(button.dataset.close)?.close()));
  ui.settingsDialog.addEventListener('close', () => { ui.apiHealth.textContent = 'Urutan: API pilihan → API Petik → Cobalt.'; });

  renderPlatforms(); renderHistory(); updateDetection();
  ui.cancelDownload.hidden = true;
  ui.retryDownload.hidden = true;
  // Surface the current backend URL in settings without probing it on every page load.
  ui.apiHealth.textContent = `API Petik utama: ${API_PRIMARY}`;
})();
