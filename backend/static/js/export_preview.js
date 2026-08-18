/**
 * Shared export preview — pagoda-style document preview before download.
 */
(function (global) {
    'use strict';

    let backdrop = null;
    let resolveFn = null;
    let blobUrls = [];

    const ICON_EYE = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;

    const ICON_INFO = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

    const ICON_DOWNLOAD = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

    const ICON_TELEGRAM = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.944 0A12 12 0 1 0 24 12 12 12 0 0 0 11.944 0zm5.992 8.194-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.94z"/></svg>`;

    const ICON_CLOSE = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

    function formatClass(label) {
        const t = String(label || '').toLowerCase();
        if (t.includes('pdf')) return 'exp-preview-format-pdf';
        if (t.includes('word') || t.includes('docx')) return 'exp-preview-format-word';
        if (t.includes('png') || t.includes('image') || t.includes('jpg')) return 'exp-preview-format-image';
        return 'exp-preview-format-default';
    }

    function ensureModal() {
        if (backdrop) return;

        backdrop = document.createElement('div');
        backdrop.id = 'exp-preview-backdrop';
        backdrop.className = 'exp-preview-backdrop';
        backdrop.hidden = true;
        backdrop.innerHTML = `
            <div class="exp-preview-modal" role="dialog" aria-modal="true" aria-labelledby="exp-preview-title">
                <header class="exp-preview-head">
                    <div class="exp-preview-head-inner">
                        <div class="exp-preview-brand">
                            <img src="/static/logo.jpg" alt="" class="exp-preview-seal">
                            <div class="exp-preview-head-text">
                                <p class="exp-preview-org">មន្ទីរធម្មការ និងសាសនា · សាលាពុទ្ធិកអនុវិទ្យាល័យសង្ឃ</p>
                                <p class="exp-preview-pagoda">វត្តនិរោធរង្សី</p>
                                <h2 class="exp-preview-title" id="exp-preview-title"></h2>
                                <p class="exp-preview-sub" id="exp-preview-sub"></p>
                            </div>
                        </div>
                        <div class="exp-preview-head-actions">
                            <span class="exp-preview-format" id="exp-preview-format" hidden></span>
                            <button type="button" class="exp-preview-x" id="exp-preview-x" aria-label="បិទ">${ICON_CLOSE}</button>
                        </div>
                    </div>
                </header>
                <div class="exp-preview-strip">
                    <span class="exp-preview-strip-label">${ICON_EYE} មើលមុន</span>
                    <span class="exp-preview-strip-hint" id="exp-preview-strip-hint">របាយការណ៍ផ្លូវការ</span>
                </div>
                <div class="exp-preview-body" id="exp-preview-body"></div>
                <footer class="exp-preview-foot">
                    <span class="exp-preview-foot-hint" id="exp-preview-foot-hint">${ICON_INFO}<span class="exp-preview-foot-hint-text">ពិនិត្យរបាយការណ៍មុនទាញយក</span></span>
                    <div class="exp-preview-foot-actions">
                        <button type="button" class="exp-preview-btn" id="exp-preview-close">បិទ</button>
                        <button type="button" class="exp-preview-btn exp-preview-btn-tg exp-preview-tg" id="exp-preview-tg" hidden>${ICON_TELEGRAM}<span>ផ្ញើ Telegram</span></button>
                        <button type="button" class="exp-preview-btn exp-preview-btn-primary exp-preview-dl" id="exp-preview-dl">${ICON_DOWNLOAD}<span>ទាញយក</span></button>
                    </div>
                </footer>
            </div>`;
        document.body.appendChild(backdrop);

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) finish('close');
        });
        backdrop.querySelector('#exp-preview-x').addEventListener('click', () => finish('close'));
        backdrop.querySelector('#exp-preview-close').addEventListener('click', () => finish('close'));
        backdrop.querySelector('#exp-preview-dl').addEventListener('click', onDownloadClick);
        backdrop.querySelector('#exp-preview-tg').addEventListener('click', onTelegramClick);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && backdrop && !backdrop.hidden) finish('close');
        });
    }

    function cleanup() {
        blobUrls.forEach((u) => URL.revokeObjectURL(u));
        blobUrls = [];
        const body = backdrop.querySelector('#exp-preview-body');
        body.innerHTML = '';
    }

    function finish(action) {
        if (!backdrop) return;
        backdrop.hidden = true;
        document.body.style.overflow = '';
        cleanup();
        if (resolveFn) {
            const fn = resolveFn;
            resolveFn = null;
            fn({ action });
        }
    }

    async function onDownloadClick() {
        const btn = backdrop.querySelector('#exp-preview-dl');
        const label = btn.querySelector('span');
        const handler = btn._handler;
        if (!handler) return;

        const orig = label ? label.textContent : btn.textContent;
        btn.disabled = true;
        if (label) label.textContent = 'កំពុងទាញយក…';
        else btn.textContent = 'កំពុងទាញយក…';

        try {
            await handler();
            finish('download');
        } catch (err) {
            alert(err.message || 'មិនអាចទាញយកបាន');
        } finally {
            btn.disabled = false;
            if (label) label.textContent = orig;
            else btn.textContent = orig;
        }
    }

    async function onTelegramClick() {
        const btn = backdrop.querySelector('#exp-preview-tg');
        const handler = btn._handler;
        if (!handler) return;

        const label = btn.querySelector('span');
        const orig = label ? label.textContent : btn.textContent;
        btn.disabled = true;
        if (label) label.textContent = 'កំពុងផ្ញើ…';
        else btn.textContent = 'កំពុងផ្ញើ…';

        try {
            await handler();
            finish('telegram');
        } catch (err) {
            alert(err.message || 'មិនអាចផ្ញើ Telegram');
        } finally {
            btn.disabled = false;
            if (label) label.textContent = orig;
            else btn.textContent = orig;
        }
    }

    function wrapPaper(el) {
        const paper = document.createElement('div');
        paper.className = 'exp-preview-paper';
        paper.appendChild(el);
        return paper;
    }

    function fitIframe(iframe) {
        const resize = () => {
            try {
                const doc = iframe.contentDocument;
                if (!doc) return;
                const h = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, 500);
                iframe.style.height = h + 'px';
            } catch (_) { /* cross-origin */ }
        };
        iframe.addEventListener('load', () => {
            resize();
            setTimeout(resize, 200);
        });
    }

    function renderPreview(preview, body) {
        if (!preview || !preview.type) {
            body.innerHTML = '<p class="exp-preview-note">មិនមានរូបមើល — ចុច «ទាញយក» ដើម្បីបន្ត</p>';
            return;
        }

        switch (preview.type) {
            case 'html': {
                const iframe = document.createElement('iframe');
                iframe.title = 'មើលមុន';
                iframe.srcdoc = preview.html || '';
                fitIframe(iframe);
                body.appendChild(wrapPaper(iframe));
                break;
            }
            case 'url': {
                const iframe = document.createElement('iframe');
                iframe.title = 'មើលមុន';
                iframe.src = preview.url || '';
                if (preview.url && preview.url.startsWith('blob:')) {
                    blobUrls.push(preview.url);
                }
                fitIframe(iframe);
                body.appendChild(wrapPaper(iframe));
                break;
            }
            case 'canvas': {
                const img = document.createElement('img');
                img.className = 'exp-preview-img';
                img.alt = 'មើលមុន';
                img.src = preview.canvas.toDataURL('image/png');
                body.appendChild(wrapPaper(img));
                break;
            }
            case 'element': {
                const inner = document.createElement('div');
                if (preview.note) {
                    const note = document.createElement('p');
                    note.className = 'exp-preview-note';
                    note.textContent = preview.note;
                    inner.appendChild(note);
                }
                const wrap = document.createElement('div');
                wrap.className = 'exp-preview-clone';
                const clone = preview.element.cloneNode(true);
                clone.removeAttribute('id');
                clone.style.display = 'block';
                clone.style.visibility = 'visible';
                clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
                wrap.appendChild(clone);
                inner.appendChild(wrap);
                body.appendChild(wrapPaper(inner));
                break;
            }
            case 'info': {
                const note = document.createElement('p');
                note.className = 'exp-preview-note';
                note.textContent = preview.message ||
                    'ឯកសារនេះមិនអាចមើលមុនបាន — សូមពិនិត្យហើយចុច «ទាញយក»';
                body.appendChild(note);
                break;
            }
            default:
                body.innerHTML = '<p class="exp-preview-note">មិនមានរូបមើល</p>';
        }
    }

    function open(opts) {
        ensureModal();
        cleanup();

        const titleEl = backdrop.querySelector('#exp-preview-title');
        const subEl = backdrop.querySelector('#exp-preview-sub');
        const fmtEl = backdrop.querySelector('#exp-preview-format');
        const body = backdrop.querySelector('#exp-preview-body');
        const dlBtn = backdrop.querySelector('#exp-preview-dl');
        const tgBtn = backdrop.querySelector('#exp-preview-tg');
        const hintTextEl = backdrop.querySelector('.exp-preview-foot-hint-text');
        const stripHintEl = backdrop.querySelector('#exp-preview-strip-hint');

        titleEl.textContent = opts.title || 'មើលមុន';
        subEl.textContent = opts.subtitle || '';
        subEl.hidden = !opts.subtitle;

        if (opts.formatLabel) {
            fmtEl.textContent = opts.formatLabel;
            fmtEl.className = 'exp-preview-format ' + formatClass(opts.formatLabel);
            fmtEl.hidden = false;
        } else {
            fmtEl.hidden = true;
        }

        const hint = opts.hint || 'ពិនិត្យរបាយការណ៍មុនទាញយក';
        if (hintTextEl) hintTextEl.textContent = hint;
        if (stripHintEl) {
            stripHintEl.textContent = opts.formatLabel
                ? `${opts.formatLabel} · ${opts.subtitle || 'របាយការណ៍ផ្លូវការ'}`
                : (opts.subtitle || 'របាយការណ៍ផ្លូវការ');
        }

        renderPreview(opts.preview, body);
        dlBtn._handler = opts.onDownload || null;
        dlBtn.hidden = !opts.onDownload;
        tgBtn._handler = opts.onTelegram || null;
        tgBtn.hidden = !opts.onTelegram;

        backdrop.hidden = false;
        document.body.style.overflow = 'hidden';

        return new Promise((resolve) => {
            resolveFn = resolve;
        });
    }

    function close() {
        finish('close');
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        blobUrls.push(url);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
    }

    function downloadUrl(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        if (filename) a.download = filename;
        a.click();
    }

    global.ExportPreview = { open, close, downloadBlob, downloadUrl };
})(window);
