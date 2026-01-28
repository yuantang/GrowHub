// GrowHub Browser Plugin - Background Service Worker

console.log('[GrowHub] Service Worker started');

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

// 2. Port Management & Persistent Connection
// ==========================================

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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // HEARTBEAT: Silent unless debugging
  if (message.type === 'KEEP_ALIVE') {
    addLog('[HEARTBEAT] SW Alive');
    return;
  }

  // Handle centralized logging from Offscreen
  if (message.type === 'LOG' && message.message) {
    addLog(`[Offscreen] ${message.message}`);
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
  }
});

// ==========================================
// 4. Utility: Cookie Sync (Unchanged logic)
// ==========================================
// ... (Keeping Cookie Sync logic exactly as is, but compacting for this file)

// TARGET_DOMAINS removed, replaced by platformConfigs in syncCookies
let cookieSyncTimeout: ReturnType<typeof setTimeout> | null = null;

chrome.cookies.onChanged.addListener((changeInfo) => {
  const { cookie } = changeInfo;
  // Check if it's one of our target domains
  const isTarget = ['.xiaohongshu.com', '.douyin.com', '.kuaishou.com', '.bilibili.com'].some(d => cookie.domain.includes(d.replace('.', '')));
  if (!isTarget) return;

  if (cookieSyncTimeout) clearTimeout(cookieSyncTimeout);
  cookieSyncTimeout = setTimeout(syncCookies, 2000);
});

// Atomic Log Queue to prevent storage race conditions
let logQueue: string[] = [];
let isProcessingQueue = false;

async function addLog(message: string) {
  const timestamp = new Date().toLocaleTimeString();
  logQueue.push(`[${timestamp}] ${message}`);
  processLogQueue();
}

async function processLogQueue() {
  if (isProcessingQueue || logQueue.length === 0) return;
  isProcessingQueue = true;
  
  try {
    const toProcess = [...logQueue];
    logQueue = [];
    
    const { logs = [] } = await chrome.storage.local.get('logs');
    const newLogs = [...toProcess.reverse(), ...logs].slice(0, 100);
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
    const res = await fetch(`${serverUrl}/api/plugin/sync-cookies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiToken}` },
      body: JSON.stringify({ cookies: allCookies })
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
