import { useEffect, useState } from "react";
import axios from "axios";
import api from "./services/api";

interface ManagedUser {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
}

interface UserManagementProps {
  onBack: () => void;
}

function getApiErrorMessage(
  err: unknown,
  fallback: string
): string {
  if (axios.isAxiosError(err)) {
    const detail: unknown = err.response?.data?.detail;

    if (typeof detail === "string") {
      return detail;
    }
  }

  return fallback;
}

export default function UserManagement({ onBack }: UserManagementProps) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSuperuser, setIsSuperuser] = useState(false);

  const [editingUser, setEditingUser] =
    useState<ManagedUser | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [editIsSuperuser, setEditIsSuperuser] = useState(false);

  const [resetUser, setResetUser] =
    useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const loadUsers = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get("/users");
      setUsers(response.data);
    } catch {
      setError("Unable to load users. Check your permissions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadUsers();
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  const createUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      await api.post("/users", {
        username,
        email,
        password,
        is_superuser: isSuperuser,
      });

      setUsername("");
      setEmail("");
      setPassword("");
      setIsSuperuser(false);
      setMessage("User created successfully.");
      await loadUsers();
    } catch (err: unknown) {
      setError(
        getApiErrorMessage(err, "Failed to create user.")
      );
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (managedUser: ManagedUser) => {
    setEditingUser(managedUser);
    setEditUsername(managedUser.username);
    setEditEmail(managedUser.email);
    setEditIsActive(managedUser.is_active);
    setEditIsSuperuser(managedUser.is_superuser);
    setError("");
    setMessage("");
  };

  const saveUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingUser) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await api.patch(`/users/${editingUser.id}`, {
        username: editUsername,
        email: editEmail,
        is_active: editIsActive,
        is_superuser: editIsSuperuser,
      });

      setEditingUser(null);
      setMessage("User updated successfully.");
      await loadUsers();
    } catch (err: unknown) {
      setError(
        getApiErrorMessage(err, "Failed to update user.")
      );
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (!resetUser) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await api.post(`/users/${resetUser.id}/reset-password`, {
        new_password: newPassword,
      });

      setResetUser(null);
      setNewPassword("");
      setMessage("Password reset successfully.");
    } catch (err: unknown) {
      setError(
        getApiErrorMessage(err, "Failed to reset password.")
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="user-management">
      <div className="page-heading">
        <button
          type="button"
          className="secondary-button"
          onClick={onBack}
        >
          Dashboard
        </button>
        <div>
          <h2>User Management</h2>
          <p>Manage CertMonitor accounts and permissions.</p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() => void loadUsers()}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <div className="stat-card">
        <h3>Create User</h3>

        <form onSubmit={createUser} className="user-form">
          <label htmlFor="new-username">Username</label>
          <input
            id="new-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            minLength={3}
            maxLength={100}
            required
          />

          <label htmlFor="new-email">Email</label>
          <input
            id="new-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label htmlFor="new-password">Temporary password</label>
          <input
            id="new-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            required
          />

          <label className="user-checkbox">
            <input
              type="checkbox"
              checked={isSuperuser}
              onChange={(event) => setIsSuperuser(event.target.checked)}
            />
            Grant superuser privileges
          </label>

          <button
            type="submit"
            className="primary-button"
            disabled={saving}
          >
            {saving ? "Saving..." : "Create User"}
          </button>
        </form>
      </div>

      <div className="stat-card">
        <h3>Existing Users</h3>

        {loading ? (
          <p>Loading users...</p>
        ) : users.length === 0 ? (
          <p>No users found.</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((managedUser) => (
                  <tr key={managedUser.id}>
                    <td>{managedUser.username}</td>
                    <td>{managedUser.email}</td>
                    <td>
                      {managedUser.is_superuser
                        ? "Superuser"
                        : "User"}
                    </td>
                    <td>
                      {managedUser.is_active ? "Active" : "Inactive"}
                    </td>
                    <td>
                      <div className="user-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => startEditing(managedUser)}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => {
                            setResetUser(managedUser);
                            setNewPassword("");
                            setError("");
                            setMessage("");
                          }}
                        >
                          Reset Password
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingUser && (
        <div className="stat-card">
          <h3>Edit {editingUser.username}</h3>

          <form onSubmit={saveUser} className="user-form">
            <label htmlFor="edit-username">Username</label>
            <input
              id="edit-username"
              value={editUsername}
              onChange={(event) => setEditUsername(event.target.value)}
              minLength={3}
              maxLength={100}
              required
            />

            <label htmlFor="edit-email">Email</label>
            <input
              id="edit-email"
              type="email"
              value={editEmail}
              onChange={(event) => setEditEmail(event.target.value)}
              required
            />

            <label className="user-checkbox">
              <input
                type="checkbox"
                checked={editIsActive}
                onChange={(event) => setEditIsActive(event.target.checked)}
              />
              Account active
            </label>

            <label className="user-checkbox">
              <input
                type="checkbox"
                checked={editIsSuperuser}
                onChange={(event) =>
                  setEditIsSuperuser(event.target.checked)
                }
              />
              Superuser privileges
            </label>

            <div className="user-actions">
              <button
                type="submit"
                className="primary-button"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={() => setEditingUser(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {resetUser && (
        <div className="stat-card">
          <h3>Reset Password: {resetUser.username}</h3>

          <form onSubmit={resetPassword} className="user-form">
            <label htmlFor="reset-password">New password</label>
            <input
              id="reset-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              required
            />

            <div className="user-actions">
              <button
                type="submit"
                className="primary-button"
                disabled={saving}
              >
                {saving ? "Saving..." : "Reset Password"}
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={() => setResetUser(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
