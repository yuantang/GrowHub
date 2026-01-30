// GrowHub Browser Plugin - Background Service Worker

console.log('[GrowHub] Service Worker started (V2 - Strict Intercept)');

// ==========================================
// 1. Offscreen Document Management
// ==========================================

const OFFSCREEN_PATH = 'offscreen.html';
let isRestartArmed = false; // "Armed" flag for restart protection

async function ensureOffscreen() {
  try {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (hasDoc) return;

    const { serverUrl, apiToken } = await chrome.storage.local.get(['serverUrl', 'apiToken']);
    if (!serverUrl || !apiToken) {
      console.log('[GrowHub] Offscreen delayed: No configuration found.');
      return;
    }

    const params = new URLSearchParams({
      url: serverUrl,
      token: apiToken.substring(0, 4) + '...' // Log sanitized token
    });
    const urlWithParams = `${OFFSCREEN_PATH}?${params.toString()}`;

    console.log('[GrowHub] Creating offscreen document with params...', urlWithParams);
    addLog(`Creating offscreen doc... (URL params injected)`);

    await chrome.offscreen.createDocument({
      url: `${OFFSCREEN_PATH}?${new URLSearchParams({ url: serverUrl, token: apiToken }).toString()}`,
      reasons: [chrome.offscreen.Reason.IFRAME_SCRIPTING],
      justification: 'Maintaining active WebSocket and task runner connection'
    });
    console.log('[GrowHub] Offscreen document created successfully.');
    addLog('Offscreen document created (Ready)');
  } catch (e: any) {
    if (!e.message?.includes('single offscreen document')) {
      console.error('[GrowHub] Failed to create offscreen:', e);
      addLog(`Error creating offscreen: ${e.message}`);
    }
  }
}

// Force close and recreate - only called by user manual reset
async function restartOffscreen(manual = false) {
  if (!manual) {
    console.warn('[GrowHub] Automatic restart blocked to prevent reset storm');
    return;
  }

  console.log('[GrowHub] Manual restart of offscreen service requested.');
  addLog('Restarting background service (Manual)...');
  
  try {
    if (await chrome.offscreen.hasDocument()) {
      await chrome.offscreen.closeDocument();
      console.log('[GrowHub] Old offscreen closed.');
    }
  } catch (e) {
    console.warn('[GrowHub] Error closing offscreen:', e);
  }
  
  // Brief pause to allow cleanup
  setTimeout(() => ensureOffscreen(), 500);
}

// ==========================================
// 2. Lifecycle Listeners
// ==========================================

chrome.runtime.onInstalled.addListener(() => {
  console.log('[GrowHub] Extension Installed/Updated');
  ensureOffscreen();
  
  // @ts-ignore
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err: any) => console.error(err));
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[GrowHub] Browser Startup');
  ensureOffscreen();
});

// Use Alarms as a backup keep-alive trigger (every 1 min)
// This complements the Offscreen->SW heartbeat
chrome.alarms.create('ensure-service', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'ensure-service') {
    ensureOffscreen();
  }
});

// ==========================================
// 2. Lifecycle & Cookie Listeners
// ==========================================

chrome.cookies.onChanged.addListener((changeInfo) => {
  const { cookie, removed } = changeInfo;
  
  // Platform mapping for sync
  const platformMap: Record<string, string> = {
    'xiaohongshu.com': 'xhs',
    'douyin.com': 'dy',
    'bilibili.com': 'bili',
    'weibo.com': 'wb',
    'weibo.cn': 'wb',
    'kuaishou.com': 'ks'
  };
  
  const matchedDomain = Object.keys(platformMap).find(d => cookie.domain.includes(d));
  
  if (matchedDomain) {
    const platform = platformMap[matchedDomain];
    console.log(`[GrowHub] Cookie changed for ${platform}: ${cookie.name} (removed: ${removed})`);
    chrome.storage.local.set({ lastCookieChange: Date.now() });
    
    // Debounced sync for all cookies of the platform
    if (cookieSyncTimeout) clearTimeout(cookieSyncTimeout);
    cookieSyncTimeout = setTimeout(syncCookies, 2000);

    // Immediate sync intent via offscreen for specific platforms if needed
    // chrome.runtime.sendMessage({ type: 'SYNC_COOKIES_TO_BACKEND', platform }).catch(() => {});
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'offscreen-keep-alive') {
    console.log('[GrowHub] Offscreen connected via persistent Port');
    port.onDisconnect.addListener(() => {
      console.warn('[GrowHub] Offscreen port disconnected, checking status...');
      ensureOffscreen();
    });
  }
});

// ==========================================
// 3. Message Handling
// ==========================================

// ==========================================
// 3. Message Handling
// ==========================================

// Track pending captures: { [platform]: { resolve, reject, timer } }
const pendingCaptures: Record<string, any> = {};

async function handleNavigateAndCapture(message: any, sendResponse: (response: any) => void) {
  try {
    const { url, platform, waitPattern } = message;
    console.log(`[GrowHub Background] NAVIGATE_START | Plat=${platform} | URL=${url}`);
    
    // 1. Find or Open Tab
    const matchPattern = platform === 'dy' ? '*://*.douyin.com/*' : '*://*.xiaohongshu.com/*';
    const tabs = await chrome.tabs.query({ url: matchPattern });
    let tabId = tabs.find(t => t.active)?.id || tabs[0]?.id;
    
    if (tabId) {
        await chrome.tabs.update(tabId, { url, active: true });
    } else {
        const newTab = await chrome.tabs.create({ url, active: true });
        tabId = newTab.id;
    }

    // 2. Setup Capture Promise (Race condition handled by offscreen timeout usually, but we add local timeout too)
    // We return "PENDING" immediately so Offscreen knows we started.
    // The actual data will be sent via WebSocket from Offscreen when we notify it later? 
    // ACTUALLY: The Offscreen is waiting on `runtime.sendMessage`. 
    // We can keep this connection open if it's short, OR we return "OK" and let Offscreen poll/wait.
    // BUT: `sendResponse` is for the Offscreen script. We can keep it pending!
    
    // Store the sendResponse to call it when data arrives
    if (pendingCaptures[platform]) {
        clearTimeout(pendingCaptures[platform].timer);
        // Maybe reject old one?
    }

    pendingCaptures[platform] = {
        sendResponse,
        timer: setTimeout(() => {
            if (pendingCaptures[platform]) {
                try {
                   pendingCaptures[platform].sendResponse({ success: false, error: 'Capture timeout (Background)' });
                } catch (e) {}
                delete pendingCaptures[platform];
                addLog(`Timeout: Capture for ${platform} abandoned`, 'warn');
            }
        }, 60000)
    };
    
    // Note: We MUST NOT return a value here because handleNavigateAndCapture 
    // is called by onMessage which returns true.
  } catch (e: any) {
    console.error('[GrowHub] handleNavigateAndCapture error:', e);
    sendResponse({ success: false, error: e.message });
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // HEARTBEAT: Silent unless debugging
  if (message.type === 'KEEP_ALIVE') {
    addLog('[HEARTBEAT] SW Alive');
    return;
  }
  
  // NAVIGATE & CAPTURE
  if (message.type === 'NAVIGATE_AND_CAPTURE') {
    handleNavigateAndCapture(message, sendResponse);
    return true; // KEEP CHANNEL OPEN for async response
  }

  // DATA INTERCEPTED (From Content Script)
  if (message.type === 'INTERCEPTED_DATA') {
     const { platform, payload } = message;
     addLog(`Intercepted Data Recv: ${platform} (${payload?.body?.length || 0} bytes)`);
     
     // Save for local inspection
     chrome.storage.local.set({ 
       lastCapture: {
         platform,
         url: payload.url,
         dataLength: payload.body?.length || 0,
         isSSR: !!payload.isSSR,
         timestamp: Date.now(),
         // Keep a preview of the body (first 1000 chars) or full if reasonable
         bodyPreview: payload.body?.substring(0, 1000)
       }
     });

     if (pendingCaptures[platform]) {
         const { sendResponse, timer } = pendingCaptures[platform];
         clearTimeout(timer);
         
         const isSSR = payload.isSSR;
         addLog(`Resolving capture for ${platform} (SSR=${!!isSSR})`, 'success');
         
         sendResponse({ success: true, data: payload });
         delete pendingCaptures[platform];
     } else {
         addLog(`No pending capture for ${platform}, caching data...`, 'info');
     }
     return; // No response needed to content script
  }


  // Handle centralized logging from any source (Offscreen or Content Scripts)
  if (message.type === 'LOG' && message.message) {
    const level = message.level || 'info';
    const msg = message.source ? `[${message.source}] ${message.message}` : message.message;
    addLog(msg, level as any);
    return;
  }

  // Log other incoming messages
  addLog(`[MSG] Incoming: ${message.type}`);

  switch (message.type) {
    case 'OFFSCREEN_ALIVE':
      addLog('✅ Background service active (Script loaded)');
      // Visual feedback via badge
      chrome.action.setBadgeText({ text: 'ON' });
      chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
      setTimeout(() => chrome.action.setBadgeText({ text: '' }), 1000);
      break;

    case 'LOG':
      if (message.message) {
        addLog(`[Offscreen] ${message.message}`);
      }
      break;

    case 'WS_CONNECTED':
      addLog('🟢 WebSocket Connected');
      chrome.storage.local.set({ isConnected: true });
      chrome.action.setBadgeText({ text: '' });
      break;

    case 'WS_DISCONNECTED':
      addLog(`🔴 WebSocket Disconnected: ${message.code}`);
      chrome.storage.local.set({ isConnected: false });
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
      break;

    case 'WS_ERROR':
      // addLog(`❌ WebSocket Error: ${message.error}`); // Too noisy
      break;

    case 'CONFIG_UPDATED':
      // Just ensure offscreen exists, don't force a disconnect/reconnect here.
      // The offscreen script handles storage.onChanged itself.
      ensureOffscreen();
      break;
      
    case 'ARM_RESTART':
      console.log('[GrowHub] Service restart ARMED');
      isRestartArmed = true;
      break;

    case 'RESET_OFFSCREEN':
      if (!isRestartArmed) {
        console.warn('[GrowHub] BLOCKED RESET_OFFSCREEN (not armed by user)');
        return;
      }
      isRestartArmed = false;
      restartOffscreen(true); // Manual Trigger
      break;
      
    case 'MANUAL_SYNC_COOKIES':
      syncCookies();
      break;
      
    case 'GET_STATUS':
      // Return real connection status from storage
      chrome.storage.local.get(['isConnected']).then(data => {
        sendResponse({ connected: !!data.isConnected });
      });
      return true; // Async response
      
    case 'SHOW_NOTIFICATION':
      chrome.notifications.create(message.id || Date.now().toString(), {
        type: 'basic',
        iconUrl: '/icons/icon128.png',
        title: message.title || 'GrowHub 通知',
        message: message.message || '',
        priority: 2
      });
      break;

    case 'UPDATE_PLATFORM_PROFILE':
      // Receive passive update from content script
      if (message.platform && message.data) {
        chrome.storage.local.get('platformProfiles').then(({ platformProfiles = {} }) => {
          const newState = { ...platformProfiles, [message.platform]: message.data };
          chrome.storage.local.set({ platformProfiles: newState });
          console.log(`[GrowHub] Updated profile from content script for ${message.platform}`);
        });
      }
      break;

    case 'LOGIN_EXPIRED':
      // Handle login expiration notification from offscreen
      addLog(`⚠️ Login expired for platform: ${message.platform}`, 'warn');
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' }); // Orange warning
      // Store the expiration status for popup to display
      chrome.storage.local.set({ 
        [`${message.platform}_login_expired`]: true,
        lastLoginWarning: { platform: message.platform, time: Date.now() }
      });
      break;
  }
});

// ==========================================
// 4. Utility: Cookie Sync (Unchanged logic)
// ==========================================
// ... (Keeping Cookie Sync logic exactly as is, but compacting for this file)

// TARGET_DOMAINS removed, replaced by platformConfigs in syncCookies
let cookieSyncTimeout: ReturnType<typeof setTimeout> | null = null;


// Atomic Log Queue to prevent storage race conditions
let logQueue: any[] = [];
let isProcessingQueue = false;

async function addLog(message: string, level: 'info' | 'warn' | 'error' | 'success' = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  logQueue.push({ message, level, timestamp });
  processLogQueue();
}

async function processLogQueue() {
  if (isProcessingQueue || logQueue.length === 0) return;
  isProcessingQueue = true;
  
  try {
    const toProcess = [...logQueue];
    logQueue = [];
    
    const { logs = [] } = await chrome.storage.local.get('logs');
    // Ensure all logs are objects (compatibility)
    const normalizedLogs = logs.map((l: any) => typeof l === 'string' ? { message: l, level: 'info', timestamp: '' } : l);
    const newLogs = [...toProcess.reverse(), ...normalizedLogs].slice(0, 100);
    await chrome.storage.local.set({ logs: newLogs });
  } catch (err) {
    console.error('[GrowHub] Log queue error:', err);
  } finally {
    isProcessingQueue = false;
    if (logQueue.length > 0) processLogQueue();
  }
}

async function syncCookies() {
  const { serverUrl, apiToken } = await chrome.storage.local.get(['serverUrl', 'apiToken']);
  if (!serverUrl || !apiToken) return;
  
  addLog('Starting manual cookie sync...');
  
  const allCookies: Record<string, any[]> = {};
  addLog(`Scanning cookies for platforms...`);

  const platformConfigs = [
    { id: 'xhs', domains: ['.xiaohongshu.com', 'xiaohongshu.com'], urls: ['https://www.xiaohongshu.com'] },
    { id: 'dy', domains: ['.douyin.com', 'douyin.com'], urls: ['https://www.douyin.com'] },
    { id: 'ks', domains: ['.kuaishou.com', 'kuaishou.com'], urls: ['https://www.kuaishou.com'] },
    { id: 'bili', domains: ['.bilibili.com', 'bilibili.com'], urls: ['https://www.bilibili.com'] }
  ];

  for (const config of platformConfigs) {
    try {
      const cookieMap = new Map(); // Unique by name + domain + path
      
      // 1. Get by domains
      for (const domain of config.domains) {
        const cookies = await chrome.cookies.getAll({ domain });
        cookies.forEach(c => cookieMap.set(`${c.name}|${c.domain}|${c.path}`, c));
      }
      
      // 2. Get by URLs
      for (const url of config.urls) {
        const cookies = await chrome.cookies.getAll({ url });
        cookies.forEach(c => cookieMap.set(`${c.name}|${c.domain}|${c.path}`, c));
      }
      
      const uniqueCookies = Array.from(cookieMap.values());
      if (uniqueCookies.length > 0) {
        addLog(`Found ${uniqueCookies.length} unique cookies for ${config.id}`);
        allCookies[config.id] = uniqueCookies;
      } else {
        console.log(`[GrowHub] No cookies found for ${config.id}`);
      }
    } catch (e: any) {
      addLog(`Error scanning ${config.id}: ${e.message}`);
    }
  }
  
  if (Object.keys(allCookies).length === 0) {
    addLog('Sync finished: No relevant cookies found');
    return;
  }
  
  try {
    const fingerprint = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform
    };

    const res = await fetch(`${serverUrl}/api/plugin/sync-cookies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiToken}` },
      body: JSON.stringify({ cookies: allCookies, fingerprint })
    });
    if (res.ok) { 
      addLog('✅ Cookies synced successfully!');
      chrome.action.setBadgeText({ text: '✓' });
      setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);
    } else {
      addLog(`❌ Cookie sync failed: ${res.status}`);
    }
  } catch (e: any) {
    addLog(`❌ Cookie sync error: ${e.message}`);
  }
}

// Initial ensure
ensureOffscreen();

export {};
