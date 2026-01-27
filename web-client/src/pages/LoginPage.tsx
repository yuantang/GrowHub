import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Rocket, Loader2, AlertCircle } from "lucide-react";
import { cn } from "../utils/cn";

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login, isLoading, error } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // 使用 URLSearchParams 以确保发送 application/x-www-form-urlencoded 格式
    // 这通常是 OAuth2 密码模式后端的期望格式
    const formData = new URLSearchParams();
    formData.append("username", username);
    formData.append("password", password);

    try {
      // @ts-ignore - api.login signature says FormData but URLSearchParams is compatible for axios data
      await login(formData as unknown as FormData);
      navigate("/");
    } catch (err) {
      // 错误处理已在 context 中完成
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 bg-card p-8 rounded-xl border border-border shadow-lg">
        <div className="flex flex-col items-center justify-center text-center">
          <Rocket className="w-12 h-12 text-primary mb-4" />
          <h2 className="text-3xl font-bold tracking-tight">欢迎回来</h2>
          <p className="text-muted-foreground mt-2">登录 GrowHub 账号以继续</p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="flex items-center p-3 text-sm text-red-500 bg-red-500/10 rounded-md border border-red-500/20">
              <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium mb-1"
              >
                用户名
              </label>
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="请输入用户名"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-1"
              >
                密码
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="请输入密码"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className={cn(
              "w-full flex items-center justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors",
              isLoading && "opacity-70 cursor-not-allowed",
            )}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            登录
          </button>

          <div className="text-center text-sm">
            <span className="text-muted-foreground">还没有账号？ </span>
            <Link
              to="/register"
              className="font-medium text-primary hover:text-primary/80"
            >
              立即注册
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
