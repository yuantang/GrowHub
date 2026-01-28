import { create } from 'zustand';

// Task item from backend
export interface PluginTask {
  task_id: string;
  platform: string;
  task_type: string;
  url: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  created_at: string | null;
}

interface PluginState {
  serverUrl: string;
  apiToken: string;
  isConnected: boolean;
  taskCount: number;
  lastSync: number | null;
  
  activeTask: string | null;
  logs: string[];
  
  // Task Queue Management
  taskQueue: PluginTask[];
  
  // Account Management
  savedAccounts: Record<string, any[]>; // platform -> accounts
  
  setConfig: (url: string, token: string) => Promise<void>;
  clearConfig: () => Promise<void>;
  setConnected: (connected: boolean) => void;
  incrementTaskCount: () => void;
  setLastSync: (time: number) => void;
  setActiveTask: (taskName: string | null) => void;
  addLog: (message: string) => void;
  saveAccount: (platform: string, accountName: string, cookies: any[]) => Promise<void>;
  deleteAccount: (platform: string, accountId: string) => Promise<void>;
  setTaskQueue: (tasks: PluginTask[]) => void;
}

export const usePluginStore = create<PluginState>((set) => ({
  serverUrl: '',
  apiToken: '',
  isConnected: false,
  taskCount: 0,
  lastSync: null,
  activeTask: null,
  logs: [],
  savedAccounts: {},
  taskQueue: [],

  setConfig: async (url, token) => {
    await chrome.storage.local.set({ serverUrl: url, apiToken: token });
    set({ serverUrl: url, apiToken: token });
    // Notify background to reconnect
    chrome.runtime.sendMessage({ type: 'CONFIG_UPDATED' });
  },

  clearConfig: async () => {
    await chrome.storage.local.remove(['serverUrl', 'apiToken']);
    set({ serverUrl: '', apiToken: '', isConnected: false });
    chrome.runtime.sendMessage({ type: 'CONFIG_CLEARED' });
  },

  setConnected: (connected) => set({ isConnected: connected }),
  incrementTaskCount: () => set((state) => ({ taskCount: state.taskCount + 1 })),
  setLastSync: (time) => set({ lastSync: time }),
  setActiveTask: (taskName) => {
    chrome.storage.local.set({ activeTask: taskName });
    set({ activeTask: taskName });
  },
  addLog: (message) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    set((state) => {
      const newLogs = [logEntry, ...state.logs].slice(0, 50); // Keep last 50
      chrome.storage.local.set({ logs: newLogs });
      return { logs: newLogs };
    });
  },

  saveAccount: async (platform, accountName, cookies) => {
    set((state) => {
      const platformAccounts = state.savedAccounts[platform] || [];
      // Generate a simple ID or use accountName
      const id = Date.now().toString();
      const newAccount = { id, name: accountName, cookies, savedAt: Date.now() };
      const newSaved = {
        ...state.savedAccounts,
        [platform]: [newAccount, ...platformAccounts]
      };
      chrome.storage.local.set({ savedAccounts: newSaved });
      return { savedAccounts: newSaved };
    });
  },

  deleteAccount: async (platform, accountId) => {
    set((state) => {
      const platformAccounts = state.savedAccounts[platform] || [];
      const newSaved = {
        ...state.savedAccounts,
        [platform]: platformAccounts.filter(acc => acc.id !== accountId)
      };
      chrome.storage.local.set({ savedAccounts: newSaved });
      return { savedAccounts: newSaved };
    });
  },
  
  setTaskQueue: (tasks) => {
    chrome.storage.local.set({ taskQueue: tasks });
    set({ taskQueue: tasks });
  },
}));

// Initialize state from storage
chrome.storage?.local?.get(['serverUrl', 'apiToken', 'taskCount', 'lastSync', 'isConnected', 'activeTask', 'logs', 'savedAccounts', 'taskQueue']).then((data) => {
  usePluginStore.setState({
    serverUrl: data.serverUrl || '',
    apiToken: data.apiToken || '',
    taskCount: data.taskCount || 0,
    lastSync: data.lastSync || null,
    isConnected: data.isConnected || false,
    activeTask: data.activeTask || null,
    logs: data.logs || [],
    savedAccounts: data.savedAccounts || {},
    taskQueue: data.taskQueue || [],
  });
});

// Listen for storage changes
chrome.storage?.onChanged?.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  
  if (changes.isConnected) {
    usePluginStore.setState({ isConnected: changes.isConnected.newValue });
  }
  if (changes.taskCount) {
    usePluginStore.setState({ taskCount: changes.taskCount.newValue });
  }
  if (changes.lastSync) {
    usePluginStore.setState({ lastSync: changes.lastSync.newValue });
  }
  if (changes.activeTask) {
    usePluginStore.setState({ activeTask: changes.activeTask.newValue });
  }
  if (changes.logs) {
    usePluginStore.setState({ logs: changes.logs.newValue });
  }
  if (changes.savedAccounts) {
    usePluginStore.setState({ savedAccounts: changes.savedAccounts.newValue });
  }
  if (changes.taskQueue) {
    usePluginStore.setState({ taskQueue: changes.taskQueue.newValue });
  }
});
