import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Rocket, Loader2, AlertCircle } from "lucide-react";
import { cn } from "../utils/cn";

const RegisterPage: React.FC = () => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { register, isLoading, error } = useAuth();
  const navigate = useNavigate();
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // 确保空字符串的 email 被当作 undefined/null 处理，防止 Pydantic 校验错误
      // 后端 Pydantic EmailStr 如果收到空字符串可能会报错
      const payload = {
        username,
        password,
        email: email.trim() === "" ? undefined : email,
      };

      await register(payload);
      setSuccess(true);
      setTimeout(() => {
        navigate("/login");
      }, 1500);
    } catch (err) {
      // Error handling is done in context
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 bg-card p-8 rounded-xl border border-border shadow-lg">
        <div className="flex flex-col items-center justify-center text-center">
          <Rocket className="w-12 h-12 text-primary mb-4" />
          <h2 className="text-3xl font-bold tracking-tight">创建账号</h2>
          <p className="text-muted-foreground mt-2">立即加入 GrowHub</p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="flex items-center p-3 text-sm text-red-500 bg-red-500/10 rounded-md border border-red-500/20">
              <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center p-3 text-sm text-green-500 bg-green-500/10 rounded-md border border-green-500/20">
              注册成功！请等待管理员审核。正在跳转...
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
                placeholder="请设置用户名"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1">
                邮箱（可选）
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="name@example.com"
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
                placeholder="请设置密码"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || success}
            className={cn(
              "w-full flex items-center justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors",
              (isLoading || success) && "opacity-70 cursor-not-allowed",
            )}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            立即注册
          </button>

          <div className="text-center text-sm">
            <span className="text-muted-foreground">已有账号？ </span>
            <Link
              to="/login"
              className="font-medium text-primary hover:text-primary/80"
            >
              直接登录
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RegisterPage;
