import { useEffect, useState } from "react";

import api, {
  getCertificateByDomain,
  getScanHistoryByDomain,
} from "./services/api";

import "./App.css";

interface User {
  username: string;
  role: string;
}

interface Domain {
  id: number;
  domain_name: string;
  port: number;
  enabled: boolean;
  scan_interval: number;
}

interface Certificate {
  id: number;
  domain_id: number;
  serial_number: string;
  fingerprint_sha256: string;
  issuer: string;
  subject: string;
  valid_from: string;
  valid_until: string;
  days_remaining: number;
}

interface ScanHistory {
  id: number;
  domain_id: number;
  certificate_id: number | null;
  scanned_at: string;
  success: boolean;
  certificate_changed: boolean;
  days_remaining: number | null;
  error_message: string | null;
}

function getExpiryStatus(days: number) {
  if (days < 0) {
    return {
      label: "Expired",
      className: "status-expired",
      icon: "🔴",
    };
  }

  if (days <= 7) {
    return {
      label: "Critical",
      className: "status-critical",
      icon: "🔴",
    };
  }

  if (days <= 30) {
    return {
      label: "Expiring Soon",
      className: "status-warning",
      icon: "🟠",
    };
  }

  if (days <= 60) {
    return {
      label: "Attention",
      className: "status-attention",
      icon: "🟡",
    };
  }

  return {
    label: "Healthy",
    className: "status-healthy",
    icon: "🟢",
  };
}

function App() {
  const [token, setToken] = useState(
    localStorage.getItem("access_token")
  );

  const [user, setUser] = useState<User | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [certificateStats, setCertificateStats] = useState({
    healthy: 0,
    attention: 0,
    expiringSoon: 0,
    critical: 0,
    expired: 0,
    noCertificate: 0,
  });

  const [selectedCertificate, setSelectedCertificate] =
    useState<Certificate | null>(null);

  const [scanHistory, setScanHistory] =
    useState<ScanHistory[]>([]);

  const [selectedDomain, setSelectedDomain] =
    useState<Domain | null>(null);

  const [loginUsername, setLoginUsername] =
    useState("");

  const [loginPassword, setLoginPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [certificateLoading, setCertificateLoading] =
    useState(false);

  const [historyLoading, setHistoryLoading] =
    useState(false);

  const [error, setError] = useState("");

  // Domain form

  const [showDomainForm, setShowDomainForm] =
    useState(false);

  const [editingDomain, setEditingDomain] =
    useState<Domain | null>(null);

  const [domainName, setDomainName] =
    useState("");

  const [domainPort, setDomainPort] =
    useState(443);

  const [scanInterval, setScanInterval] =
    useState(60);

  const [domainEnabled, setDomainEnabled] =
    useState(true);

  const [savingDomain, setSavingDomain] =
    useState(false);

  // =========================
  // Dashboard loading
  // =========================

  useEffect(() => {
    if (token) {
      loadDashboard();
    }
  }, [token]);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError("");

      const [
        userResponse,
        domainsResponse,
      ] = await Promise.all([
        api.get("/me"),
        api.get("/domains"),
      ]);

      const loadedDomains: Domain[] =
        domainsResponse.data;

      setUser(userResponse.data);
      setDomains(loadedDomains);

      // Load certificate information for all enabled domains
      const certificateResults =
        await Promise.allSettled(
          loadedDomains
            .filter((domain) => domain.enabled)
            .map((domain) =>
              getCertificateByDomain(domain.id)
            )
        );

      const stats = {
        healthy: 0,
        attention: 0,
        expiringSoon: 0,
        critical: 0,
        expired: 0,
        noCertificate: 0,
      };

      certificateResults.forEach((result) => {
        if (result.status === "rejected") {
          stats.noCertificate++;
          return;
        }

        const certificate =
          result.value;

        const days =
          certificate.days_remaining;

        if (days < 0) {
          stats.expired++;
        } else if (days <= 7) {
          stats.critical++;
        } else if (days <= 30) {
          stats.expiringSoon++;
        } else if (days <= 60) {
          stats.attention++;
        } else {
          stats.healthy++;
        }
      });

      setCertificateStats(stats);

    } catch (err) {
      console.error(err);

      localStorage.removeItem(
        "access_token"
      );

      setToken(null);
      setUser(null);
      setDomains([]);
      setSelectedCertificate(null);
      setScanHistory([]);
      setSelectedDomain(null);

      setError(
        "Session expired. Please login again."
      );
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // Login
  // =========================

  const handleLogin = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    try {
      setLoading(true);
      setError("");

      const formData = new URLSearchParams();

      formData.append(
        "username",
        loginUsername
      );

      formData.append(
        "password",
        loginPassword
      );

      const response = await api.post(
        "/login",
        formData,
        {
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
          },
        }
      );

      const accessToken =
        response.data.access_token;

      localStorage.setItem(
        "access_token",
        accessToken
      );

      setToken(accessToken);
      setLoginPassword("");
    } catch (err) {
      console.error(err);

      setError(
        "Invalid username or password."
      );
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // Logout
  // =========================

  const handleLogout = () => {
    localStorage.removeItem(
      "access_token"
    );

    setToken(null);
    setUser(null);
    setDomains([]);

    setSelectedCertificate(null);
    setScanHistory([]);
    setSelectedDomain(null);
  };

  // =========================
  // Certificate + History
  // =========================

  const handleCertificateDetails = async (
    domainId: number
  ) => {
    try {
      setCertificateLoading(true);
      setHistoryLoading(true);
      setError("");

      const domain = domains.find(
        (item) => item.id === domainId
      );

      setSelectedDomain(
        domain ?? null
      );

      const [
        certificate,
        history,
      ] = await Promise.all([
        getCertificateByDomain(
          domainId
        ),
        getScanHistoryByDomain(
          domainId
        ),
      ]);

      setSelectedCertificate(
        certificate
      );

      setScanHistory(history);
    } catch (err) {
      console.error(err);

      setSelectedCertificate(null);
      setScanHistory([]);

      setError(
        "Certificate or scan history could not be loaded."
      );
    } finally {
      setCertificateLoading(false);
      setHistoryLoading(false);
    }
  };

  // =========================
  // Scan
  // =========================

  const handleScan = async (
    domainId: number
  ) => {
    try {
      setError("");

      await api.post(
        `/domains/${domainId}/scan`
      );

      await loadDashboard();

      await handleCertificateDetails(
        domainId
      );
    } catch (err) {
      console.error(err);

      setError(
        "Certificate scan failed."
      );
    }
  };

  // =========================
  // Domain Management
  // =========================

  const openAddDomainForm = () => {
    setEditingDomain(null);

    setDomainName("");
    setDomainPort(443);
    setScanInterval(60);
    setDomainEnabled(true);

    setError("");
    setShowDomainForm(true);
  };

  const openEditDomainForm = (
    domain: Domain
  ) => {
    setEditingDomain(domain);

    setDomainName(
      domain.domain_name
    );

    setDomainPort(
      domain.port
    );

    setScanInterval(
      domain.scan_interval
    );

    setDomainEnabled(
      domain.enabled
    );

    setError("");
    setShowDomainForm(true);
  };

  const closeDomainForm = () => {
    setShowDomainForm(false);
    setEditingDomain(null);

    setDomainName("");
    setDomainPort(443);
    setScanInterval(60);
    setDomainEnabled(true);
  };

  const handleSaveDomain = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    if (!domainName.trim()) {
      setError(
        "Domain name is required."
      );
      return;
    }

    if (
      domainPort < 1 ||
      domainPort > 65535
    ) {
      setError(
        "Port must be between 1 and 65535."
      );
      return;
    }

    if (scanInterval < 1) {
      setError(
        "Scan interval must be at least 1 minute."
      );
      return;
    }

    try {
      setSavingDomain(true);
      setError("");

      const payload = {
        domain_name:
          domainName.trim(),

        port: Number(
          domainPort
        ),

        enabled:
          domainEnabled,

        scan_interval:
          Number(
            scanInterval
          ),
      };

      if (editingDomain) {
        await api.put(
          `/domains/${editingDomain.id}`,
          payload
        );
      } else {
        await api.post(
          "/domains",
          payload
        );
      }

      closeDomainForm();

      await loadDashboard();
    } catch (err) {
      console.error(err);

      setError(
        editingDomain
          ? "Failed to update domain."
          : "Failed to add domain."
      );
    } finally {
      setSavingDomain(false);
    }
  };

  const handleDeleteDomain = async (
    domain: Domain
  ) => {
    const confirmed =
      window.confirm(
        `Are you sure you want to delete ${domain.domain_name}?`
      );

    if (!confirmed) {
      return;
    }

    try {
      setError("");

      await api.delete(
        `/domains/${domain.id}`
      );

      if (
        selectedDomain?.id ===
        domain.id
      ) {
        setSelectedDomain(null);
        setSelectedCertificate(null);
        setScanHistory([]);
      }

      await loadDashboard();
    } catch (err) {
      console.error(err);

      setError(
        "Failed to delete domain."
      );
    }
  };

  // =========================
  // Login screen
  // =========================

  if (!token) {
    return (
      <div className="login-page">

        <div className="login-card">

          <div className="login-logo">
            🔐
          </div>

          <h1>
            CertMonitor
          </h1>

          <p className="login-subtitle">
            SSL Certificate Monitoring
          </p>

          <form
            onSubmit={handleLogin}
          >

            <label>
              Username
            </label>

            <input
              type="text"
              value={
                loginUsername
              }
              onChange={(event) =>
                setLoginUsername(
                  event.target.value
                )
              }
              placeholder="Enter username"
              required
            />

            <label>
              Password
            </label>

            <input
              type="password"
              value={
                loginPassword
              }
              onChange={(event) =>
                setLoginPassword(
                  event.target.value
                )
              }
              placeholder="Enter password"
              required
            />

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="primary-button login-button"
              disabled={loading}
            >
              {loading
                ? "Signing in..."
                : "Sign In"}
            </button>

          </form>

        </div>

      </div>
    );
  }

  // =========================
  // Statistics
  // =========================

  const totalDomains =
    domains.length;

  const enabledDomains =
    domains.filter(
      (domain) =>
        domain.enabled
    ).length;

  const disabledDomains =
    domains.filter(
      (domain) =>
        !domain.enabled
    ).length;

  // =========================
  // Dashboard
  // =========================

  return (
    <div className="app">

      <header className="topbar">

        <div>
          <h1>
            CertMonitor
          </h1>

          <span>
            SSL Certificate Monitoring
          </span>
        </div>

        <div className="user-section">

          <span>
            {user?.username} (
            {user?.role})
          </span>

          <button
            className="logout-button"
            onClick={
              handleLogout
            }
          >
            Logout
          </button>

        </div>

      </header>

      <main className="dashboard">

        {/* Heading */}

        <div className="page-heading">

          <div>

            <h2>
              Dashboard
            </h2>

            <p>
              Monitor your SSL
              certificates and
              domains.
            </p>

          </div>

        </div>

        {/* Error */}

        {error && (
          <div className="error-message dashboard-error">
            {error}
          </div>
        )}

        {/* Statistics */}

        <div className="stats-grid">

          <div className="stat-card">

            <span>
              Total Domains
            </span>

            <strong>
              {totalDomains}
            </strong>

          </div>

          <div className="stat-card">

            <span>
              Enabled
            </span>

            <strong>
              {enabledDomains}
            </strong>

          </div>

          <div className="stat-card">

            <span>
              Disabled
            </span>

            <strong>
              {disabledDomains}
            </strong>

          </div>

        </div>
        <div className="certificate-stats-grid">

          <div className="certificate-stat-card healthy-card">
            <span>Healthy</span>
            <strong>
              {certificateStats.healthy}
            </strong>
          </div>

          <div className="certificate-stat-card attention-card">
            <span>Attention</span>
            <strong>
              {certificateStats.attention}
            </strong>
          </div>

          <div className="certificate-stat-card warning-card">
            <span>Expiring Soon</span>
            <strong>
              {certificateStats.expiringSoon}
            </strong>
          </div>

          <div className="certificate-stat-card critical-card">
            <span>Critical</span>
            <strong>
              {certificateStats.critical}
            </strong>
          </div>

          <div className="certificate-stat-card expired-card">
            <span>Expired</span>
            <strong>
              {certificateStats.expired}
            </strong>
          </div>

          <div className="certificate-stat-card no-certificate-card">
            <span>No Certificate</span>
            <strong>
              {certificateStats.noCertificate}
            </strong>
          </div>

        </div>
        
        {/* Domain form */}

        {showDomainForm && (

          <section className="content-card domain-form-card">

            <div className="card-header">

              <div>

                <h3>
                  {editingDomain
                    ? "Edit Domain"
                    : "Add Domain"}
                </h3>

                <p>
                  Configure SSL
                  certificate
                  monitoring.
                </p>

              </div>

            </div>

            <form
              className="domain-form"
              onSubmit={
                handleSaveDomain
              }
            >

              <div className="form-grid">

                <div className="form-group">

                  <label>
                    Domain Name
                  </label>

                  <input
                    type="text"
                    value={
                      domainName
                    }
                    onChange={
                      (event) =>
                        setDomainName(
                          event.target.value
                        )
                    }
                    placeholder="example.com"
                    required
                  />

                </div>

                <div className="form-group">

                  <label>
                    Port
                  </label>

                  <input
                    type="number"
                    min="1"
                    max="65535"
                    value={
                      domainPort
                    }
                    onChange={
                      (event) =>
                        setDomainPort(
                          Number(
                            event.target.value
                          )
                        )
                    }
                    required
                  />

                </div>

                <div className="form-group">

                  <label>
                    Scan Interval
                  </label>

                  <input
                    type="number"
                    min="1"
                    value={
                      scanInterval
                    }
                    onChange={
                      (event) =>
                        setScanInterval(
                          Number(
                            event.target.value
                          )
                        )
                    }
                    required
                  />

                  <small>
                    Minutes
                  </small>

                </div>

                <div className="form-group checkbox-group">

                  <label>

                    <input
                      type="checkbox"
                      checked={
                        domainEnabled
                      }
                      onChange={
                        (event) =>
                          setDomainEnabled(
                            event.target
                              .checked
                          )
                      }
                    />

                    Enabled

                  </label>

                </div>

              </div>

              <div className="form-actions">

                <button
                  type="button"
                  className="secondary-button"
                  onClick={
                    closeDomainForm
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={
                    savingDomain
                  }
                >
                  {savingDomain
                    ? "Saving..."
                    : editingDomain
                      ? "Update Domain"
                      : "Add Domain"}
                </button>

              </div>

            </form>

          </section>
        )}

        {/* Domains */}

        <section className="content-card">

          <div className="card-header">

            <div>

              <h3>
                Domains
              </h3>

              <p>
                Manage monitored
                domains and
                certificates.
              </p>

            </div>

            <button
              className="primary-button"
              onClick={
                openAddDomainForm
              }
            >
              + Add Domain
            </button>

          </div>

          {loading ? (

            <div className="empty-state">
              Loading...
            </div>

          ) : domains.length === 0 ? (

            <div className="empty-state">
              No domains found.
            </div>

          ) : (

            <div className="table-wrapper">

              <table>

                <thead>

                  <tr>
                    <th>
                      Domain
                    </th>

                    <th>
                      Port
                    </th>

                    <th>
                      Status
                    </th>

                    <th>
                      Scan Interval
                    </th>

                    <th>
                      Certificate
                    </th>

                    <th>
                      Actions
                    </th>
                  </tr>

                </thead>

                <tbody>

                  {domains.map(
                    (domain) => (

                      <tr
                        key={
                          domain.id
                        }
                      >

                        <td>

                          <button
                            className="domain-link"
                            onClick={() =>
                              handleCertificateDetails(
                                domain.id
                              )
                            }
                          >
                            {
                              domain.domain_name
                            }
                          </button>

                        </td>

                        <td>
                          {
                            domain.port
                          }
                        </td>

                        <td>

                          <span
                            className={
                              domain.enabled
                                ? "status-chip status-healthy"
                                : "status-chip status-disabled"
                            }
                          >
                            {domain.enabled
                              ? "Enabled"
                              : "Disabled"}
                          </span>

                        </td>

                        <td>
                          {
                            domain.scan_interval
                          }{" "}
                          min
                        </td>

                        <td>

                          <button
                            className="secondary-button"
                            onClick={() =>
                              handleCertificateDetails(
                                domain.id
                              )
                            }
                          >
                            View Certificate
                          </button>

                        </td>

                        <td>

                          <div className="domain-actions">

                            <button
                              className="secondary-button"
                              onClick={() =>
                                openEditDomainForm(
                                  domain
                                )
                              }
                            >
                              Edit
                            </button>

                            <button
                              className="delete-button"
                              onClick={() =>
                                handleDeleteDomain(
                                  domain
                                )
                              }
                            >
                              Delete
                            </button>

                            <button
                              className="primary-button"
                              onClick={() =>
                                handleScan(
                                  domain.id
                                )
                              }
                              disabled={
                                !domain.enabled
                              }
                            >
                              Scan
                            </button>

                          </div>

                        </td>

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>

          )}

        </section>

        {/* Certificate loading */}

        {certificateLoading && (

          <section className="content-card certificate-card">

            <div className="empty-state">
              Loading certificate details...
            </div>

          </section>

        )}

        {/* Certificate Details */}

        {selectedCertificate &&
          !certificateLoading && (

            <section className="content-card certificate-card">

              <div className="certificate-header">

                <div>

                  <h3>
                    Certificate Details
                  </h3>

                  <p>
                    {selectedDomain
                      ? `${selectedDomain.domain_name}:${selectedDomain.port}`
                      : `Domain ID ${selectedCertificate.domain_id}`}
                  </p>

                </div>

                <div
                  className={`certificate-status ${
                    getExpiryStatus(
                      selectedCertificate.days_remaining
                    ).className
                  }`}
                >

                  {
                    getExpiryStatus(
                      selectedCertificate.days_remaining
                    ).icon
                  }{" "}

                  {
                    getExpiryStatus(
                      selectedCertificate.days_remaining
                    ).label
                  }

                </div>

              </div>

              <div className="certificate-days">

                <strong>
                  {
                    selectedCertificate.days_remaining
                  }
                </strong>

                <span>
                  days remaining
                </span>

              </div>

              <div className="certificate-grid">

                <div className="certificate-item">

                  <span>
                    Serial Number
                  </span>

                  <strong>
                    {
                      selectedCertificate.serial_number
                    }
                  </strong>

                </div>

                <div className="certificate-item">

                  <span>
                    Issuer
                  </span>

                  <strong>
                    {
                      selectedCertificate.issuer
                    }
                  </strong>

                </div>

                <div className="certificate-item">

                  <span>
                    Subject
                  </span>

                  <strong>
                    {
                      selectedCertificate.subject
                    }
                  </strong>

                </div>

                <div className="certificate-item">

                  <span>
                    Valid From
                  </span>

                  <strong>
                    {new Date(
                      selectedCertificate.valid_from
                    ).toLocaleString()}
                  </strong>

                </div>

                <div className="certificate-item">

                  <span>
                    Valid Until
                  </span>

                  <strong>
                    {new Date(
                      selectedCertificate.valid_until
                    ).toLocaleString()}
                  </strong>

                </div>

                <div className="certificate-item">

                  <span>
                    SHA-256 Fingerprint
                  </span>

                  <strong className="fingerprint">
                    {
                      selectedCertificate.fingerprint_sha256
                    }
                  </strong>

                </div>

              </div>

            </section>

          )}

        {/* Scan History */}

        {selectedDomain &&
          selectedCertificate &&
          !certificateLoading && (

            <section className="content-card scan-history-card">

              <div className="card-header">

                <div>

                  <h3>
                    Scan History
                  </h3>

                  <p>
                    Recent scans for{" "}
                    <strong>
                      {
                        selectedDomain.domain_name
                      }
                    </strong>
                  </p>

                </div>

              </div>

              {historyLoading ? (

                <div className="empty-state">
                  Loading scan history...
                </div>

              ) : scanHistory.length === 0 ? (

                <div className="empty-state">
                  No scan history found.
                </div>

              ) : (

                <div className="table-wrapper">

                  <table>

                    <thead>

                      <tr>

                        <th>
                          Scan Time
                        </th>

                        <th>
                          Result
                        </th>

                        <th>
                          Days Remaining
                        </th>

                        <th>
                          Certificate
                        </th>

                        <th>
                          Details
                        </th>

                      </tr>

                    </thead>

                    <tbody>

                      {scanHistory.map(
                        (scan) => (

                          <tr
                            key={
                              scan.id
                            }
                          >

                            <td>
                              {new Date(
                                scan.scanned_at
                              ).toLocaleString()}
                            </td>

                            <td>

                              {scan.success ? (

                                <span className="status-chip status-healthy">
                                  ✅ Success
                                </span>

                              ) : (

                                <span className="status-chip status-critical">
                                  ❌ Failed
                                </span>

                              )}

                            </td>

                            <td>

                              {scan.days_remaining !==
                              null
                                ? `${scan.days_remaining} days`
                                : "—"}

                            </td>

                            <td>

                              {scan.certificate_changed ? (

                                <span className="status-chip status-warning">
                                  🔄 Changed
                                </span>

                              ) : scan.success ? (

                                <span className="status-chip status-healthy">
                                  No Change
                                </span>

                              ) : (

                                "—"

                              )}

                            </td>

                            <td>

                              {scan.error_message ? (

                                <span
                                  className="scan-error"
                                  title={
                                    scan.error_message
                                  }
                                >
                                  {scan.error_message}
                                </span>

                              ) : (

                                "—"

                              )}

                            </td>

                          </tr>

                        )
                      )}

                    </tbody>

                  </table>

                </div>

              )}

            </section>

          )}

      </main>

    </div>
  );
}

export default App;