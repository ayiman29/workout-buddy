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
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ user?: AuthUser; error?: string }>;
  signup: (name: string, email: string, password: string, role?: string, adminKey?: string) => Promise<{ user?: AuthUser; error?: string }>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => ({}),
  signup: async () => ({ error: undefined }),
  logout: async () => {},
});

const STORAGE_KEY = "auth_user";
const TOKEN_STORAGE_KEY = "auth_token";
let currentAuthToken: string | null = null;
let fetchPatched = false;

function setCurrentAuthToken(token: string | null) {
  currentAuthToken = token;
}

function patchFetchIfNeeded() {
  if (fetchPatched || typeof globalThis.fetch !== "function") {
    return;
  }

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input: any, init?: RequestInit) => {
    const requestUrl = typeof input === "string" ? input : input?.url;
    const shouldAttachToken =
      typeof requestUrl === "string" &&
      requestUrl.startsWith(API_BASE_URL) &&
      !!currentAuthToken;

    if (!shouldAttachToken) {
      return originalFetch(input, init);
    }

    const headers = new Headers(init?.headers || input?.headers || undefined);
    if (!headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${currentAuthToken}`);
    }

    return originalFetch(input, {
      ...init,
      headers,
    });
  };

  fetchPatched = true;
}

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

async function readStoredToken() {
  if (Platform.OS === "web") {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  }

  return SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
}

async function writeStoredToken(value: string) {
  if (Platform.OS === "web") {
    localStorage.setItem(TOKEN_STORAGE_KEY, value);
    return;
  }

  await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, value);
}

async function clearStoredToken() {
  if (Platform.OS === "web") {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([readStoredUser(), readStoredToken()]).then(([storedUser, storedToken]) => {
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch {}
      }

      if (storedToken) {
        setToken(storedToken);
        setCurrentAuthToken(storedToken);
        patchFetchIfNeeded();
      }

      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    setCurrentAuthToken(token);
    patchFetchIfNeeded();
  }, [token]);

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
      if (data?.token) {
        await writeStoredToken(String(data.token));
        setToken(String(data.token));
      }
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
    await clearStoredToken();
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, isAuthenticated: !!user && !!token, login, signup, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
