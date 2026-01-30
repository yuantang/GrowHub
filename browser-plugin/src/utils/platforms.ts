/**
 * Platform specific utilities for GrowHub Browser Plugin
 */

export interface UserProfile {
  userId: string;
  nickname: string;
  avatar: string;
  isLoggedIn: boolean;
}

export const PLATFORM_DOMAINS: Record<string, string[]> = {
  xhs: [".xiaohongshu.com", "xiaohongshu.com"],
  dy: [".douyin.com", "douyin.com"],
  ks: [".kuaishou.com", "kuaishou.com"],
  bili: [".bilibili.com", "bilibili.com"],
  wb: [".weibo.com", "weibo.com", ".weibo.cn", "weibo.cn"],
};

/**
 * Fetch current user profile for a platform
 */
export async function fetchPlatformProfile(platform: string): Promise<UserProfile> {
  try {
    switch (platform) {
      case 'xhs':
        return await fetchXhsProfile();
      case 'dy':
        return await fetchDouyinProfile();
      case 'bili':
        return await fetchBiliProfile();
      case 'wb':
        return await fetchWeiboProfile();
      case 'ks':
        return await fetchKuaishouProfile();
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  } catch (e) {
    console.warn(`[GrowHub] Failed to fetch profile for ${platform}:`, e);
    return { userId: '', nickname: '', avatar: '', isLoggedIn: false };
  }
}

async function fetchXhsProfile(): Promise<UserProfile> {
  const res = await fetch('https://edith.xiaohongshu.com/api/sns/web/v1/user/selfinfo', {
    credentials: 'include'
  });
  const data = await res.json();
  if (data.success && data.data) {
    return {
      userId: data.data.user_id || data.data.id,
      nickname: data.data.nickname,
      avatar: data.data.avatar || data.data.imageb || data.data.images,
      isLoggedIn: true
    };
  }
  return { userId: '', nickname: '', avatar: '', isLoggedIn: false };
}

async function fetchDouyinProfile(): Promise<UserProfile> {
  try {
    // 0. Priority: Check if we have passively collected data from content script
    const { platformProfiles = {} } = await chrome.storage.local.get('platformProfiles');
    if (platformProfiles['dy'] && platformProfiles['dy'].isLoggedIn) {
      console.log('[GrowHub] Using passive profile data for Douyin');
      return platformProfiles['dy'];
    }

    // 1. Try a more permissive "get_info" endpoint first (Passport context)
    const passportRes = await fetch('https://www.douyin.com/passport/web/get_info/', {
      credentials: 'include'
    });
    const passportData = await passportRes.json();
    if (passportData.data && passportData.data.is_login) {
      return {
        userId: passportData.data.user_id_str || passportData.data.user_id?.toString() || '',
        nickname: passportData.data.screen_name || passportData.data.name || '抖音用户',
        avatar: passportData.data.avatar_url || '',
        isLoggedIn: true
      };
    }

    // 2. Fallback to the original self-profile endpoint
    const res = await fetch('https://www.douyin.com/aweme/v1/web/user/profile/self/', {
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'Referer': 'https://www.douyin.com/',
        'User-Agent': navigator.userAgent
      }
    });
    
    const data = await res.json();
    if (data.user_base_info || data.user) {
      const user = data.user_base_info || data.user;
      return {
        userId: user.uid || user.short_id,
        nickname: user.nickname,
        avatar: user.avatar_thumb?.url_list?.[0] || user.avatar_larger?.url_list?.[0] || '',
        isLoggedIn: true
      };
    }

    // 3. Last resort: Cookie-based detection
    const cookies = await chrome.cookies.getAll({ domain: 'douyin.com' });
    const hasAuthCookie = cookies.some(c => ['sid_guard', 'uid_tt', 'passport_auth_status'].includes(c.name));
    
    if (hasAuthCookie) {
      const uidCookie = cookies.find(c => ['uid', 'uid_tt', 'n_sdk_extlog'].includes(c.name));
      return {
        userId: uidCookie?.value || 'unknown',
        nickname: '已登录 (点击刷新重试)',
        avatar: '',
        isLoggedIn: true
      };
    }
  } catch (e) {
    console.warn('[GrowHub] Douyin profile fetch error:', e);
  }
  return { userId: '', nickname: '', avatar: '', isLoggedIn: false };
}

async function fetchBiliProfile(): Promise<UserProfile> {
  const res = await fetch('https://api.bilibili.com/x/web-interface/nav', {
    credentials: 'include'
  });
  const data = await res.json();
  if (data.code === 0 && data.data && data.data.isLogin) {
    return {
      userId: data.data.mid.toString(),
      nickname: data.data.uname,
      avatar: data.data.face,
      isLoggedIn: true
    };
  }
  return { userId: '', nickname: '', avatar: '', isLoggedIn: false };
}

async function fetchWeiboProfile(): Promise<UserProfile> {
  const res = await fetch('https://weibo.com/ajax/context/config', {
    credentials: 'include'
  });
  const data = await res.json();
  if (data.login && data.user) {
    return {
      userId: data.user.idstr || data.user.id.toString(),
      nickname: data.user.screen_name,
      avatar: data.user.avatar_large || data.user.profile_image_url,
      isLoggedIn: true
    };
  }
  return { userId: '', nickname: '', avatar: '', isLoggedIn: false };
}

async function fetchKuaishouProfile(): Promise<UserProfile> {
  // Kuaishou is tricky as it uses GraphQL. 
  // We'll try a simpler check first, if it fails we just return logged out.
  try {
    const res = await fetch('https://www.kuaishou.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operationName: 'getCurrentUser',
        query: 'query getCurrentUser {  currentUser {    id    eid    name    avatar    __typename  }}',
        variables: {}
      }),
      credentials: 'include'
    });
    const data = await res.json();
    if (data.data?.currentUser) {
      return {
        userId: data.data.currentUser.id,
        nickname: data.data.currentUser.name,
        avatar: data.data.currentUser.avatar,
        isLoggedIn: true
      };
    }
  } catch (e) {}
  return { userId: '', nickname: '', avatar: '', isLoggedIn: false };
}
