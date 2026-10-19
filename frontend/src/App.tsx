import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import api from "./services/api";
import Workspace from "./Workspace";
import "./App.css";
import "./Pages.css";
import certMonitorLogo from "./assets/favicon.svg";

export interface CurrentUser {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("access_token"));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const form = new URLSearchParams();
      form.set("username", username.trim());
      form.set("password", password);
      const response = await api.post("/login", form, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      const accessToken = response.data.access_token as string;
      localStorage.setItem("access_token", accessToken);
      setToken(accessToken);
      setPassword("");
    } catch {
      setError("Sign-in failed. Check your username and password.");
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = useCallback(() => {
    localStorage.removeItem("access_token");
    setToken(null);
  }, []);

  if (!token) {
    return (
      <div className="cm-login-page"
        data-theme={ localStorage.getItem("certmonitor-theme") === "dark"
            ? "dark"
            : "light"
        }
      >
        <form className="cm-login-card" onSubmit={handleLogin}>
          <div className="cm-brand-mark"><img src={certMonitorLogo} alt="CertMonitor logo" /></div>
          <p className="cm-eyebrow">CERTIFICATE OPERATIONS</p>
          <h1>Welcome back</h1>
          <p className="cm-muted">Sign in to your CertMonitor workspace.</p>
          <label htmlFor="cm-username">Username</label>
          <input id="cm-username" autoComplete="username" value={username}
            onChange={(event) => setUsername(event.target.value)} required />
          <label htmlFor="cm-password">Password</label>
          <input id="cm-password" type="password" autoComplete="current-password"
            value={password} onChange={(event) => setPassword(event.target.value)} required />
          {error && <div className="cm-alert cm-alert-error" role="alert">{error}</div>}
          <button className="cm-button cm-button-primary cm-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <p className="cm-login-foot">Secure SSL/TLS certificate monitoring</p>
        </form>
      </div>
    );
  }

  return <Workspace onLogout={handleLogout} />;
}
