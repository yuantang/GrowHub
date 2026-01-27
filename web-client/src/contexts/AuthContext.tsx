import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  type User,
  login as apiLogin,
  register as apiRegister,
  fetchCurrentUser,
} from "../api";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (data: FormData) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("token"),
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Initial check
  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const currentUser = await fetchCurrentUser();
          setUser(currentUser);
        } catch (err) {
          console.error("Failed to fetch user", err);
          localStorage.removeItem("token");
          setToken(null);
          setUser(null);
        }
      }
      setIsLoading(false);
    };
    initAuth();
  }, [token]);

  const login = async (data: FormData) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiLogin(data);
      localStorage.setItem("token", response.access_token);
      setToken(response.access_token);
      // Fetch full user details immediately
      const currentUser = await fetchCurrentUser();
      setUser(currentUser);
    } catch (err: any) {
      if (err.response?.status === 403) {
        setError("账号待审核中，请联系管理员开通");
      } else {
        setError(err.response?.data?.detail || "登录失败，请检查用户名或密码");
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: any) => {
    setIsLoading(true);
    setError(null);
    try {
      await apiRegister(data);
      // Auto login after register? Or redirect to login?
      // For now, let's just complete successfully and let UI redirect to login
    } catch (err: any) {
      setError(err.response?.data?.detail || "注册失败，请稍后重试");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        error,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
