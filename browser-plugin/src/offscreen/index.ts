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

function addLog(message: string, level: 'info' | 'warn' | 'error' | 'success' = 'info') {
  // ATOMIC LOGGING: Delegate to Background to avoid storage race
  chrome.runtime.sendMessage({ type: 'LOG', message, level }).catch(() => {
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

  // V5: Initial Profile Fetch
  fetchAndUpdateProfiles();

  // Trigger connection after a brief delay
  setTimeout(() => {
    addLog('Auto-triggering connect() from IIFE');
    connect();
  }, 1000);

  // V5: Periodic Profile Refresh (every 5 minutes)
  setInterval(fetchAndUpdateProfiles, 5 * 60 * 1000);
})();

async function fetchAndUpdateProfiles() {
  const { fetchPlatformProfile, PLATFORM_DOMAINS } = await import("../utils/platforms");
  const platforms = Object.keys(PLATFORM_DOMAINS);
  const profiles: Record<string, any> = {};

  addLog(`🔄 Pre-fetching profiles for ${platforms.length} platforms...`);
  
  for (const platform of platforms) {
    try {
      const profile = await fetchPlatformProfile(platform);
      if (profile.isLoggedIn) {
        profiles[platform] = profile;
      }
    } catch (e) {}
  }

  await chrome.storage.local.set({ platformProfiles: profiles });
  addLog(`✨ Profile cache updated (${Object.keys(profiles).length} accounts online)`);
}

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
        } else if (message.type === "BATCH_FETCH") {
          const tasks = message.tasks || [];
          addLog(`Received batch of ${tasks.length} tasks`, 'info');
          // Process sequentially to avoid heavy rate limits
          (async () => {
            for (const task of tasks) {
              try {
                await handleFetchTask(task);
                // Simple delay between batch items
                await new Promise(resolve => setTimeout(resolve, 1000));
              } catch (e: any) {
                addLog(`Batch task ${task.task_id} failed: ${e.message}`, 'error');
              }
            }
          })();
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

async function updateTaskStatus(taskId: string, status: string, message?: string) {
  try {
    const { taskQueue = [] } = await chrome.storage.local.get('taskQueue');
    const task = taskQueue.find((t: any) => t.task_id === taskId);
    const updated = taskQueue.map((t: any) => 
      t.task_id === taskId ? { ...t, status } : t
    );
    await chrome.storage.local.set({ taskQueue: updated });

    if (status === 'completed') {
      await addLog(`Task ${taskId} completed successfully!`, 'success');
      chrome.runtime.sendMessage({
        type: 'SHOW_NOTIFICATION',
        title: '任务完成 ✅',
        message: `${task?.task_type || '采集任务'} 已成功完成`
      });
    } else if (status === 'failed') {
      await addLog(`Task ${taskId} failed: ${message || 'Unknown error'}`, 'error');
      chrome.runtime.sendMessage({
        type: 'SHOW_NOTIFICATION',
        title: '任务失败 ❌',
        message: `${task?.task_type || '采集任务'} 执行失败: ${message || ''}`
      });
    }
  } catch (e) {
    console.error('[Offscreen] Failed to update task status:', e);
  }
}

async function handleFetchTask(task: any) {
  const taskName = `${task.platform.toUpperCase()} ${task.task_type || (task.request?.method + ' ' + task.request?.url.split('/').pop())}`;
  console.log('[GrowHub Offscreen] Executing task:', task.task_id, taskName);
  
  await updateTaskStatus(task.task_id, 'running');
  await chrome.storage.local.set({ activeTask: taskName });
  await addLog(`Starting task: ${taskName}`);
  
  const startTime = Date.now();
  const MAX_RETRIES = 3;
  const REQUEST_TIMEOUT = 60000; // 60 seconds
  
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
      
      // STRATEGY: Navigate & Capture (Passive Interception)
      // For Douyin Search, we drive the browser to the search page and wait for the network spy to catch the data.
      if (task.platform === 'dy' && (task.request.url.includes('/web/search/item/') || task.request.url.includes('/general/search/single/'))) {
         addLog(`🧭 Navigating to Search Page...`);
         
         try {
             // Extract keyword from URL or Body
             const urlObj = new URL(task.request.url);
             const keyword = urlObj.searchParams.get('keyword');
             
             if (!keyword) {
                 throw new Error('Could not extract keyword for navigation');
             }
             
             const targetUrl = `https://www.douyin.com/search/${encodeURIComponent(keyword)}`;
             
             const captureResult = await chrome.runtime.sendMessage({
                 type: 'NAVIGATE_AND_CAPTURE',
                 platform: 'dy',
                 url: targetUrl,
                 waitPattern: 'general/search/single'
             });
             
             if (captureResult && captureResult.success && captureResult.data) {
                  const body = captureResult.data.body;
                  await addLog(`✅ Intercepted search data!`);

                  const result = {
                    type: 'TASK_RESULT',
                    task_id: task.task_id,
                    success: true,
                    response: {
                      status: 200,
                      headers: {},
                      body: body
                    },
                    duration_ms: Date.now() - startTime,
                    login_expired: false,
                    source: 'intercept'
                  };
                  
                  ws?.send(JSON.stringify(result));
                  await updateTaskStatus(task.task_id, 'completed');
                  const { taskCount = 0 } = await chrome.storage.local.get('taskCount');
                  await chrome.storage.local.set({ taskCount: taskCount + 1, activeTask: null, lastSync: Date.now() });
                  return;
             } else {
                 throw new Error(captureResult?.error || 'Capture failed');
             }
         } catch (err: any) {
             addLog(`Navigation capture failed: ${err.message}.`, 'error');
             // Do not fallback to fetch, just fail
             const result = {
                type: 'TASK_RESULT',
                task_id: task.task_id,
                success: false,
                error: err.message,
                duration_ms: Date.now() - startTime
             };
             ws?.send(JSON.stringify(result));
             await updateTaskStatus(task.task_id, 'failed');
             return;
         }
      }

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
      await updateTaskStatus(task.task_id, 'completed');
      
      const { taskCount = 0 } = await chrome.storage.local.get('taskCount');
      await chrome.storage.local.set({ taskCount: taskCount + 1, activeTask: null, lastSync: Date.now() });
      
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
      await updateTaskStatus(task.task_id, 'failed');
      await chrome.storage.local.set({ activeTask: null });
      await addLog(`Task failed: ${taskName} - ${isTimeout ? 'Request timeout (60s)' : e.message}`);
      
      ws?.send(JSON.stringify({
        type: 'TASK_RESULT',
        task_id: task.task_id,
        success: false,
        error: isTimeout ? 'Request timeout after 60s' : (e.message || 'Unknown error'),
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
  } else if (message.type === 'SYNC_COOKIES_TO_BACKEND') {
    handleSyncCookies(message.platform).catch((e) => {
      console.error('[Offscreen] Cookie sync fail:', e);
    });
  }
});

/**
 * Sync cookies for a specific platform to the backend
 */
async function handleSyncCookies(platform: string) {
  const { PLATFORM_DOMAINS } = await import("../utils/platforms");
  const domains = PLATFORM_DOMAINS[platform] || [];
  if (domains.length === 0) return;

  const allFound: chrome.cookies.Cookie[] = [];
  for (const domain of domains) {
    try {
      const cookies = await chrome.cookies.getAll({ domain });
      allFound.push(...cookies);
    } catch (e) {
      console.warn(`[Offscreen] Failed to get cookies for ${domain}:`, e);
    }
  }

  if (allFound.length === 0) return;

  // Deduplication
  const unique = Array.from(
    new Map(allFound.map((c) => [`${c.name}|${c.domain}`, c])).values()
  );

  const { serverUrl, apiToken } = await chrome.storage.local.get(['serverUrl', 'apiToken']);
  if (!serverUrl || !apiToken) return;

  const endpoint = `${serverUrl.replace(/\/$/, '')}/api/plugin/sync-cookies`;
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`
      },
      body: JSON.stringify({
        cookies: {
          [platform]: unique
        }
      })
    });

    const result = await response.json();
    if (response.ok) {
      addLog(`✨ Synced ${platform} cookies to server (${unique.length} items)`);
    } else {
      console.error('[Offscreen] Cookie sync error:', result.message || response.statusText);
      addLog(`❌ Server error during cookie sync: ${result.message || response.statusText}`);
    }
  } catch (e: any) {
    console.error('[Offscreen] Network error syncing cookies:', e);
    addLog(`❌ Network error during cookie sync: ${e.message}`);
  }
}

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
