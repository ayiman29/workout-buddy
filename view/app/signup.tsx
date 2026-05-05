import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/auth";

export default function Signup() {
  const router = useRouter();
  const { signup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [adminKey, setAdminKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSignup = async () => {
    setErrorMsg("");
    if (!name.trim() || !email.trim() || !password) {
      setErrorMsg("Please fill in all fields.");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }
    if (role === "admin" && !adminKey.trim()) {
      setErrorMsg("Please enter the admin key.");
      return;
    }
    setLoading(true);
    const { user, error } = await signup(name.trim(), email.trim(), password, role, adminKey.trim());
    setLoading(false);
    if (error) {
      setErrorMsg(error);
      return;
    }
    if (user?.role === "admin") {
      router.replace("/admin-dashboard");
    } else {
      router.replace("/");
    }
  };

  return (
    <LinearGradient colors={["#0f3d2e", "#000000"]} style={styles.gradient}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoCircle}>
            <Text style={{ fontSize: 36 }}>🏋️</Text>
          </View>

          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Start your accountability journey</Text>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Full Name"
              placeholderTextColor="#666"
              autoCapitalize="words"
              value={name}
              onChangeText={setName}
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#666"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#666"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm Password"
              placeholderTextColor="#666"
              secureTextEntry
              value={confirm}
              onChangeText={setConfirm}
            />

            <View style={styles.roleRow}>
              <Text style={styles.roleLabel}>Role</Text>
              <View style={styles.roleToggle}>
                <TouchableOpacity
                  style={[styles.roleOption, role === "user" && styles.roleOptionActive]}
                  onPress={() => setRole("user")}
                >
                  <Text style={[styles.roleOptionText, role === "user" && styles.roleOptionTextActive]}>
                    User
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.roleOption, role === "admin" && styles.roleOptionActive]}
                  onPress={() => setRole("admin")}
                >
                  <Text style={[styles.roleOptionText, role === "admin" && styles.roleOptionTextActive]}>
                    Admin
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {role === "admin" && (
              <TextInput
                style={styles.input}
                placeholder="Admin Key"
                placeholderTextColor="#666"
                secureTextEntry
                value={adminKey}
                onChangeText={setAdminKey}
              />
            )}

            {!!errorMsg && (
              <Text style={styles.errorText}>{errorMsg}</Text>
            )}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSignup}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Sign Up</Text>
              )}
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.line} />
              <Text style={styles.orText}>or</Text>
              <View style={styles.line} />
            </View>

            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.linkText}>Already have an account? Log in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
    paddingVertical: 60,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(57, 210, 180, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(57, 210, 180, 0.3)",
    marginBottom: 20,
  },
  title: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    color: "#888",
    fontSize: 15,
    marginBottom: 36,
  },
  form: {
    width: "100%",
    alignItems: "center",
  },
  input: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    color: "#fff",
    fontSize: 16,
    marginBottom: 14,
  },
  button: {
    width: "100%",
    backgroundColor: "#39d2b4",
    paddingVertical: 18,
    borderRadius: 50,
    alignItems: "center",
    marginTop: 6,
    marginBottom: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginBottom: 20,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: "#333",
  },
  orText: {
    color: "#777",
    marginHorizontal: 12,
  },
  linkText: {
    color: "#39d2b4",
    fontSize: 15,
  },
  errorText: {
    color: "#ff6b6b",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 12,
    width: "100%",
  },
  roleRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  roleLabel: {
    color: "#aaa",
    fontSize: 15,
  },
  roleToggle: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 10,
    overflow: "hidden",
  },
  roleOption: {
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  roleOptionActive: {
    backgroundColor: "#39d2b4",
  },
  roleOptionText: {
    color: "#888",
    fontSize: 14,
    fontWeight: "600",
  },
  roleOptionTextActive: {
    color: "#fff",
  },
});
