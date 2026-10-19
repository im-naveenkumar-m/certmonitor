import { useCallback, useEffect, useState } from "react";
import type React from "react";
import axios from "axios";
import api from "./services/api";
import "./Pages.css";

interface ManagedUser {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
}

interface UserManagementProps {
  currentUserId: number;
  onBack: () => void;
}


function describeError(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) {
    return fallback;
  }

  const response = error.response;
  const detail = response?.data?.detail;

  // FastAPI validation errors are usually an array of objects.
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item: { loc?: unknown[]; msg?: string }) => {
        const field = Array.isArray(item.loc)
          ? String(item.loc[item.loc.length - 1] ?? "")
          : "";

        const message = item.msg ?? "";

        if (field === "email") {
          return "Please enter a valid email address, such as name@example.com.";
        }

        if (field === "password" || field === "new_password") {
          if (message.toLowerCase().includes("at least")) {
            return "Password must contain at least 8 characters.";
          }
          return "Please check the password requirements.";
        }

        if (field === "username") {
          return message.toLowerCase().includes("at least")
            ? "Username must contain at least 3 characters."
            : `Username: ${message}`;
        }

        return message;
      })
      .filter(Boolean);

    return messages.length > 0
      ? [...new Set(messages)].join(" ")
      : fallback;
  }

  // String errors, such as duplicate username/email responses.
  if (typeof detail === "string") {
    if (detail.toLowerCase().includes("already exists")) {
      return "This username or email address is already registered.";
    }
    return detail;
  }

  if (response?.status === 401) {
    return "Your session has expired. Please sign in again.";
  }

  if (response?.status === 403) {
    return "You don't have permission to perform this action.";
  }

  if (response?.status === 409) {
    return "This username or email address is already registered.";
  }

  if (response && response.status >= 500) {
    return "A server error occurred. Please try again later.";
  }

  return fallback;
}


export default function UserManagement({ currentUserId, onBack }: UserManagementProps) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetUser, setResetUser] = useState<ManagedUser | null>(null);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/users");
      setUsers(response.data as ManagedUser[]);
    } catch (err) {
      setError(describeError(err, "Unable to load users."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => { void loadUsers(); }, 0);
    return () => window.clearTimeout(task);
  }, [loadUsers]);

  function openCreateForm() {
    setUsername(""); setEmail(""); setPassword(""); setIsSuperuser(false);
    setError(""); setNotice(""); setCreateOpen(true);
  }

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      await api.post("/users", { username: username.trim(), email: email.trim(), password, is_superuser: isSuperuser });
      setCreateOpen(false); setNotice(`User ${username.trim()} created successfully.`);
      await loadUsers();
    } catch (err) {
      setError(describeError(err, "Unable to create user. Check the supplied details."));
    } finally { setSaving(false); }
  }

  function openEditUser(user: ManagedUser) {
    setEditingUser(user);
    setEditUsername(user.username);
    setEditEmail(user.email);
    setError("");
    setNotice("");
  }

  async function saveUserDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingUser) return;

    const usernameValue = editUsername.trim();
    const emailValue = editEmail.trim();

    if (usernameValue.length < 3) {
      setError("Username must contain at least 3 characters.");
      return;
    }

    if (!emailValue) {
      setError("Email address is required.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      await api.patch(`/users/${editingUser.id}`, {
        username: usernameValue,
        email: emailValue,
      });

      setNotice(`User "${usernameValue}" updated successfully.`);
      setEditingUser(null);
      await loadUsers();
    } catch (err) {
      setError(
        describeError(
          err,
          "Unable to update user. Check the username and email address.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: ManagedUser) {
    setError(""); setNotice("");
    try {
      await api.patch(`/users/${user.id}`, { is_active: !user.is_active });
      setNotice(`${user.username} ${user.is_active ? "deactivated" : "activated"}.`);
      await loadUsers();
    } catch (err) { setError(describeError(err, "Unable to update user status.")); }
  }

  async function toggleRole(user: ManagedUser) {
    if (user.id === currentUserId && user.is_superuser) {
      setError("You cannot remove administrator access from your own account here."); return;
    }
    setError(""); setNotice("");
    try {
      await api.patch(`/users/${user.id}`, { is_superuser: !user.is_superuser });
      setNotice(`${user.username}'s role was updated.`);
      await loadUsers();
    } catch (err) { setError(describeError(err, "Unable to update user role.")); }
  }

  async function resetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetUser) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await api.post(`/users/${resetUser.id}/reset-password`, { new_password: newPassword });
      setNotice(`Password reset for ${resetUser.username}.`); setResetUser(null); setNewPassword("");
    } catch (err) { setError(describeError(err, "Unable to reset password.")); }
    finally { setSaving(false); }
  }

  return <section>
    <div className="cm-page-heading"><div><p className="cm-eyebrow">ACCESS CONTROL</p><h1>User management</h1><p className="cm-page-description">Create accounts and manage access to CertMonitor.</p></div>
      <div className="cm-heading-action cm-user-heading-actions"><button className="cm-button cm-button-secondary" onClick={onBack}>Back to dashboard</button><button className="cm-button cm-button-primary" onClick={openCreateForm}>Create User</button></div>
    </div>
    {error && <div className="cm-alert cm-alert-error" role="alert">{error}<button onClick={() => setError("")}>Dismiss</button></div>}
    {notice && <div className="cm-alert cm-alert-success" role="status">{notice}<button onClick={() => setNotice("")}>Dismiss</button></div>}

    {createOpen && <form className="cm-panel cm-domain-form" onSubmit={createUser}>
      <div className="cm-panel-heading"><div><h3>Create user</h3><p>Enter the account details and choose the access level.</p></div><button type="button" className="cm-button cm-button-secondary" onClick={() => setCreateOpen(false)}>Close</button></div>
      <div className="cm-form-grid cm-user-form-grid">
        <label className="cm-field">Username<input autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
        <label className="cm-field">Email address<input type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label className="cm-field">Temporary password<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>
        <label className="cm-check"><input type="checkbox" checked={isSuperuser} onChange={(event) => setIsSuperuser(event.target.checked)} /> Administrator access</label>
      </div>
      <div className="cm-form-actions"><button type="button" className="cm-button cm-button-ghost" onClick={() => setCreateOpen(false)}>Cancel</button><button className="cm-button cm-button-primary" disabled={saving}>{saving ? "Creating…" : "Create user"}</button></div>
    </form>}

    {resetUser && <form className="cm-panel cm-domain-form" onSubmit={resetPassword}>
      <div className="cm-panel-heading"><div><h3>Reset password for {resetUser.username}</h3><p>Set a new password for this account.</p></div><button type="button" className="cm-button cm-button-secondary" onClick={() => { setResetUser(null); setNewPassword(""); }}>Cancel</button></div>
      <div className="cm-form-grid cm-password-grid"><label className="cm-field">New password<input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label></div>
      <div className="cm-form-actions"><button className="cm-button cm-button-primary" disabled={saving}>{saving ? "Saving…" : "Reset password"}</button></div>
    </form>}
    {editingUser && (
      <form
        className="cm-panel cm-domain-form"
        onSubmit={saveUserDetails}
      >
        <div className="cm-panel-heading">
          <div>
            <h3>Edit user</h3>
            <p>
              Update the username and email address for {editingUser.username}.
            </p>
          </div>

          <button
            type="button"
            className="cm-button cm-button-secondary"
            onClick={() => setEditingUser(null)}
          >
            Close
          </button>
        </div>

        <div className="cm-form-grid cm-user-form-grid">
          <label className="cm-field">
            Username
            <input
              value={editUsername}
              onChange={(event) => setEditUsername(event.target.value)}
              minLength={3}
              maxLength={100}
              autoComplete="off"
              required
            />
          </label>

          <label className="cm-field">
            Email address
            <input
              type="email"
              value={editEmail}
              onChange={(event) => setEditEmail(event.target.value)}
              maxLength={255}
              autoComplete="off"
              required
            />
          </label>
        </div>

        <div className="cm-form-actions">
          <button
            type="button"
            className="cm-button cm-button-ghost"
            onClick={() => setEditingUser(null)}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="cm-button cm-button-primary"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    )}
    <div className="cm-panel cm-table-panel"><div className="cm-table-scroll"><table className="cm-table"><thead><tr><th>USERNAME</th><th>EMAIL</th><th>ROLE</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>
      {users.map((managedUser) => <tr key={managedUser.id}>
        <td><strong>{managedUser.username}</strong>{managedUser.id === currentUserId && <span className="cm-current-user-label">You</span>}</td>
        <td>{managedUser.email || "—"}</td>
        <td><span className={`cm-pill ${managedUser.is_superuser ? "attention" : "unknown"}`}>{managedUser.is_superuser ? "Administrator" : "Member"}</span></td>
        <td><span className={`cm-pill ${managedUser.is_active ? "healthy" : "critical"}`}>{managedUser.is_active ? "Active" : "Inactive"}</span></td>
        <td><div className="cm-row-actions"><button className="cm-button cm-button-secondary cm-button-small" onClick={() => { setResetUser(managedUser); setNewPassword(""); setError(""); }}>Reset password</button>
        <button
          type="button"
          className="cm-button cm-button-secondary cm-button-small"
          onClick={() => openEditUser(managedUser)}
        >
          Edit
        </button>
          <button className="cm-button cm-button-secondary cm-button-small" disabled={managedUser.id === currentUserId} onClick={() => void toggleRole(managedUser)}>{managedUser.is_superuser ? "Make member" : "Make admin"}</button>
          <button className="cm-button cm-button-danger cm-button-small" disabled={managedUser.id === currentUserId} onClick={() => void toggleActive(managedUser)}>{managedUser.is_active ? "Deactivate" : "Activate"}</button></div></td>
      </tr>)}
    </tbody></table>
    {loading && <div className="cm-loading">Loading users…</div>}
    {!loading && users.length === 0 && <div className="cm-empty"><strong>No users found</strong><p>Create a user to get started.</p></div>}
    </div></div>
  </section>;
}