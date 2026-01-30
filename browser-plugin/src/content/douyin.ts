console.log('[GrowHub] Douyin Content Script Loaded (run_at: document_start)');

// VISUAL DEBUG: Add a red border to body when loaded
function signalActive() {
    if (document.body) {
        document.body.style.border = "5px solid red";
        document.body.setAttribute('data-growhub-active', 'true');
        
        // Add a floating status indicator
        const div = document.createElement('div');
        div.style.cssText = "position:fixed;top:0;left:0;z-index:99999;background:red;color:white;padding:5px;font-size:12px;";
        div.innerText = "GrowHub Plugin Active";
        document.body.appendChild(div);
    }
}
window.addEventListener('DOMContentLoaded', signalActive);

function logToBackground(message: string, level: 'info' | 'warn' | 'error' | 'success' = 'info') {
    // Also log to console for local confirmation
    console.log(`[GrowHub-Local] ${message}`);
    
    try {
        chrome.runtime.sendMessage({ 
            type: 'LOG', 
            message: `[DY-Content] ${message}`, 
            level 
        }).catch(err => {
            console.error("[GrowHub] SendMessage Error:", err);
        });
    } catch (e) {
        console.error("[GrowHub] Runtime Error:", e);
    }
}

// ==========================================
// 1. Main World Spy & Extractor Injection
// ==========================================
function injectMainWorldSpy() {
    if (document.getElementById('growhub-main-spy')) return;
    
    logToBackground('Injecting Main World Spy & Extractor');
    
    const script = document.createElement('script');
    script.id = 'growhub-main-spy';
    script.textContent = `
    (function() {
        console.log("[GrowHub Main] Initializing Robust Spy...");

        // --- 1. SSR Data Extraction (Expanded) ---
        function tryExtractSSR() {
            try {
                // Try multiple known global variables for Douyin data
                const candidates = [
                    { key: 'SIGI_STATE', source: 'window.SIGI_STATE' },
                    { key: 'RENDER_DATA', source: 'window.RENDER_DATA' },
                    { key: '_ROUTER_DATA', source: 'window._ROUTER_DATA' },
                    { key: '__INITIAL_STATE__', source: 'window.__INITIAL_STATE__' }
                ];

                for (const c of candidates) {
                    const data = window[c.key];
                    if (data && Object.keys(data).length > 0) {
                        console.log("[GrowHub Main] Found valid SSR data:", c.source);
                        window.dispatchEvent(new CustomEvent('GROWHUB_DATA_EXTRACTED', {
                            detail: { body: JSON.stringify(data), isSSR: true, source: c.source }
                        }));
                        return true;
                    }
                }
            } catch(e) {
                console.error("[GrowHub Main] SSR extraction error:", e);
            }
            return false;
        }

        // Try periodically
        tryExtractSSR();
        let attempts = 0;
        const ssrInterval = setInterval(() => {
            attempts++;
            if (tryExtractSSR() || attempts > 20) clearInterval(ssrInterval);
        }, 500);

        // --- 2. Network Interception (Broadened) ---
        const origOpen = XMLHttpRequest.prototype.open;
        const origSend = XMLHttpRequest.prototype.send;
        
        // Helper to check interest
        function isTargetUrl(url) {
            if (!url) return false;
            return url.includes('/general/search/single/') || 
                   url.includes('/web/search/item/') ||
                   url.includes('search_channel=') || // Catch generic search calls
                   url.includes('/aweme/v1/web/aweme/post/'); // Catch user posts if needed
        }

        XMLHttpRequest.prototype.open = function(method, url) {
            this._url = url;
            return origOpen.apply(this, arguments);
        };
        
        XMLHttpRequest.prototype.send = function() {
            this.addEventListener('load', function() {
                // [DEBUG] Log all Douyin API requests to help identify correct pattern
                if (this._url && this._url.includes('douyin.com')) {
                    console.log("[GrowHub Debug] XHR Load:", this._url);
                }

                if (this._url && isTargetUrl(this._url)) {
                    console.log("[GrowHub Main] XHR Intercepted:", this._url);
                    window.dispatchEvent(new CustomEvent('GROWHUB_DATA_EXTRACTED', {
                        detail: { url: this._url, body: this.responseText, type: 'xhr' }
                    }));
                }
            });
            return origSend.apply(this, arguments);
        };
        
        const origFetch = window.fetch;
        window.fetch = async function(...args) {
            const response = await origFetch.apply(this, args);
            try {
                const url = typeof args[0] === 'string' ? args[0] : args[0].url;
                
                // [DEBUG] Log all Fetch requests
                if (url && url.includes('douyin.com')) {
                     console.log("[GrowHub Debug] Fetch:", url);
                }

                if (isTargetUrl(url)) {
                    console.log("[GrowHub Main] Fetch Intercepted:", url);
                    const clone = response.clone();
                    clone.text().then(body => {
                        window.dispatchEvent(new CustomEvent('GROWHUB_DATA_EXTRACTED', {
                            detail: { url: url, body: body, type: 'fetch' }
                        }));
                    });
                }
            } catch(e) {}
            return response;
        };
    })();
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
}

injectMainWorldSpy();

// ==========================================
// 2. Data Bridge: Main World -> Content -> Background
// ==========================================
window.addEventListener('GROWHUB_DATA_EXTRACTED', (e: any) => {
    const detail = e.detail;
    if (detail && detail.body && detail.body !== '{}') {
        const isSSR = !!detail.isSSR;
        logToBackground(`Forwarding ${isSSR ? 'SSR' : 'API'} data to background (${detail.body.length} bytes)`, 'success');
        
        // VISUAL FEEDBACK: Show toast on page
        const toast = document.createElement('div');
        toast.innerText = `GrowHub: Captured ${isSSR?'SSR':'API'} Data!`;
        toast.style.cssText = "position:fixed;top:50px;left:50%;transform:translateX(-50%);background:#10b981;color:white;padding:10px 20px;border-radius:20px;z-index:99999;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.2);";
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);

        chrome.runtime.sendMessage({
            type: 'INTERCEPTED_DATA',
            platform: 'dy',
            payload: { 
                url: detail.url || location.href, 
                body: detail.body,
                isSSR: isSSR
            }
        });
    }
});

// ==========================================
// 3. Fallback: Aggressive Script Scan (In case of CSP)
// ==========================================
function aggressiveScriptScan() {
    try {
        logToBackground('Performing aggressive script tag scan...');
        const scripts = document.querySelectorAll('script');
        for (const script of Array.from(scripts)) {
           const content = script.textContent || '';
           if (content.length > 5000 && (content.includes('aweme_list') || content.includes('RENDER_DATA'))) {
               const match = content.match(/RENDER_DATA\s*=\s*({.*?});/);
               if (match && match[1] && match[1] !== '{}') {
                   logToBackground(`Extracted data from RENDER_DATA script match!`, 'success');
                   chrome.runtime.sendMessage({
                       type: 'INTERCEPTED_DATA',
                       platform: 'dy',
                       payload: { url: location.href, body: match[1], isSSR: true }
                   });
                   return true;
               }
           }
        }
    } catch (e: any) {
        logToBackground(`Script scan failed: ${e.message}`, 'error');
    }
    return false;
}

window.addEventListener('load', () => {
    setTimeout(aggressiveScriptScan, 2000);
    if (location.href.includes('douyin.com/search/')) {
        setTimeout(() => {
            logToBackground('Simulating scroll...');
            window.scrollBy({ top: 500, behavior: 'smooth' });
        }, 3000);
    }
});
