console.log('[GrowHub] XHS Content Script Loaded (run_at: document_start)');

function signalActive() {
    if (document.body) {
        document.body.style.border = "5px solid #ff2442"; // XHS Red
        document.body.setAttribute('data-growhub-active', 'true');
        
        const div = document.createElement('div');
        div.style.cssText = "position:fixed;top:0;left:0;z-index:99999;background:#ff2442;color:white;padding:5px;font-size:12px;";
        div.innerText = "GrowHub Plugin Active (XHS)";
        document.body.appendChild(div);
    }
}
window.addEventListener('DOMContentLoaded', signalActive);

function logToBackground(message: string, level: 'info' | 'warn' | 'error' | 'success' = 'info') {
    console.log(`[GrowHub-Local] ${message}`);
    try {
        chrome.runtime.sendMessage({ 
            type: 'LOG', 
            message: `[XHS-Content] ${message}`, 
            level 
        }).catch(() => {});
    } catch (e) {}
}

// ==========================================
// 1. Audit / Interception Script
// ==========================================
function injectMainWorldSpy() {
    if (document.getElementById('growhub-xhs-spy')) return;
    
    const script = document.createElement('script');
    script.id = 'growhub-xhs-spy';
    script.textContent = `
    (function() {
        console.log("[GrowHub Main] Initializing XHS Spy...");

        // --- 1. SSR Extraction ---
        function tryExtractSSR() {
            try {
                if (window.__INITIAL_STATE__ && Object.keys(window.__INITIAL_STATE__).length > 0) {
                    console.log("[GrowHub Main] Found XHS SSR State");
                    window.dispatchEvent(new CustomEvent('GROWHUB_XHS_DATA', {
                        detail: { body: JSON.stringify(window.__INITIAL_STATE__), isSSR: true }
                    }));
                    return true;
                }
            } catch(e) {}
            return false;
        }

        tryExtractSSR();
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            if (tryExtractSSR() || attempts > 10) clearInterval(interval);
        }, 1000);

        // --- 2. Network Interception ---
        const origOpen = XMLHttpRequest.prototype.open;
        const origSend = XMLHttpRequest.prototype.send;
        
        function isTargetUrl(url) {
            return url && (
                url.includes('/api/sns/web/v1/search/notes') || 
                url.includes('/api/sns/web/v1/feed') ||
                url.includes('/api/sns/web/v2/comment/page')
            );
        }

        XMLHttpRequest.prototype.open = function(method, url) {
            this._url = url;
            return origOpen.apply(this, arguments);
        };
        
        XMLHttpRequest.prototype.send = function() {
            this.addEventListener('load', function() {
                if (this._url && isTargetUrl(this._url)) {
                    console.log("[GrowHub Main] XHR Intercepted:", this._url);
                    window.dispatchEvent(new CustomEvent('GROWHUB_XHS_DATA', {
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
                if (isTargetUrl(url)) {
                    const clone = response.clone();
                    clone.text().then(body => {
                        window.dispatchEvent(new CustomEvent('GROWHUB_XHS_DATA', {
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
// 2. Data Bridge
// ==========================================
window.addEventListener('GROWHUB_XHS_DATA', (e: any) => {
    const detail = e.detail;
    if (detail && detail.body) {
        const isSSR = !!detail.isSSR;
        logToBackground(`Forwarding XHS data (${detail.body.length} bytes)`, 'success');
        
        const toast = document.createElement('div');
        toast.innerText = `GrowHub: Captured XHS Data!`;
        toast.style.cssText = "position:fixed;top:80px;left:50%;transform:translateX(-50%);background:#ff2442;color:white;padding:10px 20px;border-radius:20px;z-index:99999;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.2);";
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);

        chrome.runtime.sendMessage({
            type: 'INTERCEPTED_DATA',
            platform: 'xhs', // Important: must match 'xhs' used in background/offscreen
            payload: { 
                url: detail.url || location.href, 
                body: detail.body,
                isSSR: isSSR
            }
        });
    }
});
