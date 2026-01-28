// GrowHub Browser Plugin - Offscreen Document
// This runs in a hidden HTML page to maintain WebSocket connection

console.log('[GrowHub Offscreen] Initialized');

// ==========================================
// 1. Keep-Alive Mechanism
// ==========================================
// Send a heartbeat to the Service Worker every 20 seconds.
// This serves two purposes:
// 1. Keeps the Service Worker alive (resetting its 30s idle timer)
// 2. Tells Chrome that this Offscreen document is "doing work" (messaging), preventing it from being killed.
setInterval(() => {
  chrome.runtime.sendMessage({ type: 'KEEP_ALIVE' }).catch(() => {});
}, 5000); // 5s heartbeat to satisfy aggressive Chrome Mac killing

// NEW: Persistent Port to Background
let port: chrome.runtime.Port | null = null;
function ensurePort() {
  if (port) return;
  try {
    port = chrome.runtime.connect({ name: 'offscreen-keep-alive' });
    port.onDisconnect.addListener(() => {
      port = null;
      setTimeout(ensurePort, 1000);
    });
  } catch (e) {
    console.warn('[GrowHub Offscreen] Port failed:', e);
  }
}
ensurePort();

// ==========================================
// 2. Logging & Status Reporting
// ==========================================

function reportStatus(type: 'OFFSCREEN_ALIVE' | 'WS_CONNECTED' | 'WS_DISCONNECTED' | 'WS_ERROR', data?: any) {
  try {
    chrome.runtime.sendMessage({ type, ...data }).catch(() => {});
  } catch (e) {
    console.error('[GrowHub Offscreen] Failed to report status:', e);
  }
}

function addLog(message: string) {
  // ATOMIC LOGGING: Delegate to Background to avoid storage race
  chrome.runtime.sendMessage({ type: 'LOG', message }).catch(() => {
    console.error('[GrowHub Offscreen] Failed to send log:', message);
  });
}

// Initial report & Auto-start
(async () => {
  // V4 Warm-up: Wait for message channel to stabilize
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const urlParams = new URLSearchParams(window.location.search);
  const hasUrl = !!urlParams.get('url');
  const hasToken = !!urlParams.get('token');
  
  console.log('[GrowHub Offscreen] Script starting (V4)...', { hasUrl, hasToken });
  addLog(`Script execution starting (V4). URL Params: url=${hasUrl}, token=${hasToken}`);
  reportStatus('OFFSCREEN_ALIVE');

  // Trigger connection after a brief delay
  setTimeout(() => {
    addLog('Auto-triggering connect() from IIFE');
    connect();
  }, 1000);
})();

// ==========================================
// 3. WebSocket Logic (Singleton)
// ==========================================

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 60000;
const BASE_RECONNECT_DELAY = 1000;

async function connect() {
  addLog('connect() triggered');
  // 1. Strictly check existing connection status
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    addLog(`WebSocket state: ${ws.readyState === WebSocket.OPEN ? 'OPEN' : 'CONNECTING'}, skipping.`);
    return;
  }

  // 2. Clean up if it was a dead reference
  if (ws) {
    ws.onclose = null; // Prevent recursion
    ws.close();
    ws = null;
  }

  // 3. Get Config (Prioritize URL params from Background, fallback to storage)
  const urlParams = new URLSearchParams(window.location.search);
  let serverUrl = urlParams.get('url');
  let apiToken = urlParams.get('token');

  if (!serverUrl || !apiToken) {
    console.log('[GrowHub Offscreen] No URL params, checking storage...');
    const storage = await chrome.storage.local.get(['serverUrl', 'apiToken']);
    serverUrl = storage.serverUrl;
    apiToken = storage.apiToken;
  }
  
  if (!serverUrl || !apiToken) {
    console.log('[GrowHub Offscreen] No config found, waiting...');
    addLog('Waiting for configuration (Server URL & Token)...');
    reportStatus('WS_ERROR', { error: 'Missing configuration' });
    return;
  }
  
  const normalizedUrl = serverUrl.replace(/\/+$/, '');
  const wsUrl = normalizedUrl.replace('http', 'ws') + '/ws/plugin?token=' + apiToken;
  
  addLog(`Initiating WebSocket: ${normalizedUrl}`);
  
  try {
    const connectionTimeout = setTimeout(() => {
      if (ws && ws.readyState === WebSocket.CONNECTING) {
        addLog('🔴 WebSocket Connection Timeout (Handshake hanging)');
        ws.close();
      }
    }, 10000);

    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      clearTimeout(connectionTimeout);
      console.log('[GrowHub Offscreen] WebSocket connected');
      addLog('🟢 WebSocket Connected');
      reportStatus('WS_CONNECTED', { url: normalizedUrl });
      reconnectAttempts = 0;
      updateConnectionStatus(true);
      // Clean up timer if it exists
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };
    
    ws.onclose = (e) => {
      console.log('[GrowHub Offscreen] WebSocket closed:', e.code, e.reason);
      addLog(`🔴 WebSocket Closed: ${e.code} ${e.reason || ''}`);
      reportStatus('WS_DISCONNECTED', { code: e.code, reason: e.reason });
      updateConnectionStatus(false);
      scheduleReconnect();
    };
    
    ws.onerror = (e) => {
      console.error('[GrowHub Offscreen] WebSocket error:', e);
      // Don't log generic "WebSocket error" to UI to avoid spam, onclose handles it
    };
    
    ws.onmessage = async (e) => {
      try {
        const message = JSON.parse(e.data);
        if (message.type === 'PING') {
          ws?.send(JSON.stringify({ type: 'PONG' }));
        } else if (message.type === 'FETCH_TASK') {
          await handleFetchTask(message);
        } else if (message.type === 'TASK_QUEUE') {
          // Store task queue for Popup to display
          await chrome.storage.local.set({ taskQueue: message.tasks || [] });
          addLog(`Received ${message.count || 0} pending tasks from server`);
        } else if (message.type === 'TASK_ASSIGNED') {
          // A new task has been assigned - update queue
          addLog(`New task assigned: ${message.task?.task_type || 'unknown'}`);
        }
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    };
    
  } catch (e: any) {
    console.error('[GrowHub Offscreen] Connection setup error:', e);
    reportStatus('WS_ERROR', { error: e.message });
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  
  const delay = Math.min(
    BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
    MAX_RECONNECT_DELAY
  );
  
  console.log(`[GrowHub Offscreen] Reconnecting in ${delay / 1000}s...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectAttempts++;
    connect();
  }, delay);
}

function updateConnectionStatus(connected: boolean) {
  chrome.storage.local.set({ isConnected: connected });
  // Badge updates are handled by Background listener
}


// ==========================================
// 4. Task Handling
// ==========================================

async function handleFetchTask(task: any) {
  const taskName = `${task.platform.toUpperCase()} ${task.request.method} ${task.request.url.split('/').pop()}`;
  console.log('[GrowHub Offscreen] Executing task:', task.task_id, taskName);
  
  await chrome.storage.local.set({ activeTask: taskName });
  await addLog(`Starting task: ${taskName}`);
  
  const startTime = Date.now();
  const MAX_RETRIES = 3;
  const REQUEST_TIMEOUT = 30000; // 30 seconds
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    
    try {
      const fetchOptions: RequestInit = {
        method: task.request.method,
        headers: task.request.headers,
        credentials: 'include',
        signal: controller.signal,
      };
      
      if (task.request.body && task.request.method !== 'GET') {
        fetchOptions.body = task.request.body;
      }
      
      const response = await fetch(task.request.url, fetchOptions);
      clearTimeout(timeoutId);
      
      const body = await response.text();
      
      // Login expiration detection
      const loginExpired = response.status === 401 || response.status === 403 ||
        body.includes('请登录') || body.includes('login required') ||
        body.includes('need_login') || body.includes('"success":false');
      
      if (loginExpired) {
        await addLog(`⚠️ Login expired for ${task.platform}`);
        await chrome.storage.local.set({ 
          [`${task.platform}_login_expired`]: true,
          activeTask: null 
        });
        // Notify background to show badge warning
        chrome.runtime.sendMessage({ 
          type: 'LOGIN_EXPIRED', 
          platform: task.platform 
        }).catch(() => {});
      }
      
      // Success - send result
      const result = {
        type: 'TASK_RESULT',
        task_id: task.task_id,
        success: !loginExpired,
        response: {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: body
        },
        duration_ms: Date.now() - startTime,
        login_expired: loginExpired,
      };
      
      ws?.send(JSON.stringify(result));
      
      const { taskCount = 0 } = await chrome.storage.local.get('taskCount');
      await chrome.storage.local.set({ taskCount: taskCount + 1, activeTask: null });
      
      await addLog(`Task completed: ${taskName} (${response.status})${loginExpired ? ' ⚠️ Login Expired' : ''}`);
      return; // Success, exit function
      
    } catch (e: any) {
      clearTimeout(timeoutId);
      
      const isTimeout = e.name === 'AbortError';
      const isRetryable = isTimeout || e.message.includes('network') || e.message.includes('fetch');
      
      if (attempt < MAX_RETRIES && isRetryable) {
        const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff: 1s, 2s, 4s
        await addLog(`Task failed (attempt ${attempt}/${MAX_RETRIES}): ${isTimeout ? 'Timeout' : e.message}. Retrying in ${delay/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Final failure
      console.error('[GrowHub Offscreen] Task failed:', e);
      await chrome.storage.local.set({ activeTask: null });
      await addLog(`Task failed: ${taskName} - ${isTimeout ? 'Request timeout (30s)' : e.message}`);
      
      ws?.send(JSON.stringify({
        type: 'TASK_RESULT',
        task_id: task.task_id,
        success: false,
        error: isTimeout ? 'Request timeout after 30s' : (e.message || 'Unknown error'),
        duration_ms: Date.now() - startTime,
        retries: attempt - 1,
      }));
      return;
    }
  }
}

// ==========================================
// 5. Lifecycle Listeners
// ==========================================

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'OFFSCREEN_RECONNECT') {
    reconnectAttempts = 0;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    connect();
  } else if (message.type === 'OFFSCREEN_DISCONNECT') {
    if (ws) ws.close();
    ws = null;
    chrome.storage.local.set({ isConnected: false });
  }
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.serverUrl || changes.apiToken) {
    console.log('[GrowHub Offscreen] Config changed, reconnecting...');
    reconnectAttempts = 0;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    connect();
  }
});

// End of Script
addLog('Offscreen script file reached EOF');
