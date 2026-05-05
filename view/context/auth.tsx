import React, { createContext, useContext, useState, useEffect } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { API_BASE_URL } from "@/constants/api";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type AuthContextType = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ user?: AuthUser; error?: string }>;
  signup: (name: string, email: string, password: string, role?: string, adminKey?: string) => Promise<{ user?: AuthUser; error?: string }>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => ({}),
  signup: async () => ({ error: undefined }),
  logout: async () => {},
});

const STORAGE_KEY = "auth_user";

async function readStoredUser() {
  if (Platform.OS === "web") {
    return localStorage.getItem(STORAGE_KEY);
  }

  return SecureStore.getItemAsync(STORAGE_KEY);
}

async function writeStoredUser(value: string) {
  if (Platform.OS === "web") {
    localStorage.setItem(STORAGE_KEY, value);
    return;
  }

  await SecureStore.setItemAsync(STORAGE_KEY, value);
}

async function clearStoredUser() {
  if (Platform.OS === "web") {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(STORAGE_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    readStoredUser().then((stored) => {
      if (stored) {
        try {
          setUser(JSON.parse(stored));
        } catch {}
      }
      setIsLoading(false);
    });
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/user/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const statusMessage = data?.message || res.statusText || "Login failed";
        return { error: `${statusMessage}` };
      }
      await writeStoredUser(JSON.stringify(data.user));
      setUser(data.user);
      return { user: data.user };
    } catch (error: any) {
      return { error: error?.message || "Could not connect to server" };
    }
  };

  const signup = async (name: string, email: string, password: string, role = "user", adminKey = "") => {
    try {
      const body: Record<string, string> = { name, email, password, role };
      if (role === "admin" && adminKey) body.adminKey = adminKey;
      const res = await fetch(`${API_BASE_URL}/user/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.message || "Signup failed" };
      await writeStoredUser(JSON.stringify(data.user));
      setUser(data.user);
      return { user: data.user };
    } catch {
      return { error: "Could not connect to server" };
    }
  };

  const logout = async () => {
    await clearStoredUser();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated: !!user, login, signup, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
