import { useCallback, useEffect, useMemo, useState } from "react";
import type React from "react";
import axios from "axios";
import api, { getCertificateByDomain, getScanHistoryByDomain } from "./services/api";
import UserManagement from "./UserManagement";
import type { CurrentUser } from "./App";
import "./Pages.css";
import certMonitorLogo from "./assets/favicon.svg";

type PageKey = "dashboard" | "domains" | "history" | "users" | "profile";
interface Domain {
  id: number; domain_name: string; port: number; enabled: boolean; scan_interval: number;
}
interface Certificate {
  id: number; domain_id: number; serial_number?: string; fingerprint_sha256?: string;
  issuer?: string; subject?: string; valid_from?: string; valid_until?: string;
  days_remaining: number;
}
interface ScanRecord {
  id: number; domain_id: number; certificate_id: number | null; scanned_at: string;
  success: boolean; certificate_changed: boolean; days_remaining: number | null;
  error_message: string | null;
}
type CertResult = { domain: Domain; certificate: Certificate | null; error?: string };

const nav: { key: PageKey; label: string; icon: string; admin?: boolean }[] = [
  { key: "dashboard", label: "Dashboard", icon: "▦" },
  { key: "domains", label: "Domains", icon: "◎" },
  { key: "history", label: "Scan history", icon: "◷" },
  { key: "users", label: "User management", icon: "♙", admin: true },
  { key: "profile", label: "User profile", icon: "◉" },
];

function expiry(days: number) {
  if (days < 0) return { label: "Expired", cls: "expired" };
  if (days <= 7) return { label: "Critical", cls: "critical" };
  if (days <= 30) return { label: "Expiring soon", cls: "warning" };
  if (days <= 60) return { label: "Attention", cls: "attention" };
  return { label: "Healthy", cls: "healthy" };
}
function dateTime(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}
function apiError(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}
function Icon({ children }: { children: string }) {
  return <span className="cm-nav-icon" aria-hidden="true">{children}</span>;
}

export default function Workspace({ onLogout }: { onLogout: () => void }) {
  const [page, setPage] = useState<PageKey>("dashboard");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    localStorage.getItem("certmonitor-theme") === "dark" ? "dark" : "light",
  );
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [certs, setCerts] = useState<CertResult[]>([]);
  const [history, setHistory] = useState<(ScanRecord & { domain_name: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [historyFilter, setHistoryFilter] = useState("all");
  const [domainFormOpen, setDomainFormOpen] = useState(false);
  const [editing, setEditing] = useState<Domain | null>(null);
  const [domainName, setDomainName] = useState("");
  const [port, setPort] = useState(443);
  const [interval, setInterval] = useState(60);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanningId, setScanningId] = useState<number | null>(null);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [meResponse, domainResponse] = await Promise.all([api.get("/me"), api.get("/domains")]);
      const loadedUser = meResponse.data as CurrentUser;
      const loadedDomains = domainResponse.data as Domain[];
      setUser(loadedUser);
      setDomains(loadedDomains);
      const results = await Promise.all(loadedDomains.map(async (domain): Promise<CertResult> => {
        try {
          const certificate = await getCertificateByDomain(domain.id) as Certificate;
          return { domain, certificate };
        } catch {
          return { domain, certificate: null, error: "Certificate not available" };
        }
      }));
      setCerts(results);
    } catch (err) {
      setError(apiError(err, "Unable to load CertMonitor. Your session may have expired."));
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        localStorage.removeItem("access_token");
        onLogout();
      }
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const all = await Promise.all(domains.map(async (domain) => {
        try {
          const records = await getScanHistoryByDomain(domain.id) as ScanRecord[];
          return records.map((record) => ({ ...record, domain_name: domain.domain_name }));
        } catch {
          return [];
        }
      }));
      setHistory(all.flat().sort((a, b) => new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime()));
    } finally {
      setHistoryLoading(false);
    }
  }, [domains]);

  useEffect(() => {
    const task = window.setTimeout(() => { void loadWorkspace(); }, 0);
    return () => window.clearTimeout(task);
  }, [loadWorkspace]);

  useEffect(() => {
    if (page !== "history" || domains.length === 0) return;
    void loadHistory();
    const refreshInterval = window.setInterval(() => {
      void loadHistory();
    }, 60_000);
    return () => window.clearInterval(refreshInterval);
  }, [page, domains.length, loadHistory]);

  useEffect(() => {
    localStorage.setItem("certmonitor-theme", theme);
  }, [theme]);

  const counts = useMemo(() => {
    const base = { healthy: 0, attention: 0, warning: 0, critical: 0, expired: 0, unknown: 0 };
    for (const item of certs) {
      if (!item.certificate) { base.unknown++; continue; }
      const status = expiry(item.certificate.days_remaining).cls as keyof typeof base;
      if (status in base) base[status]++;
    }
    return base;
  }, [certs]);

  const filteredDomains = domains.filter((domain) =>
    domain.domain_name.toLowerCase().includes(search.toLowerCase()));
  const filteredHistory = history.filter((item) => {
    const matchesSearch = item.domain_name.toLowerCase().includes(search.toLowerCase());
    if (historyFilter === "success") return matchesSearch && item.success;
    if (historyFilter === "failed") return matchesSearch && !item.success;
    if (historyFilter === "changed") return matchesSearch && item.certificate_changed;
    return matchesSearch;
  });

  function openCreate() {
    setEditing(null); setDomainName(""); setPort(443); setInterval(60); setEnabled(true);
    setError(""); setDomainFormOpen(true);
  }
  function openEdit(domain: Domain) {
    setEditing(domain); setDomainName(domain.domain_name); setPort(domain.port);
    setInterval(domain.scan_interval); setEnabled(domain.enabled); setError(""); setDomainFormOpen(true);
  }
  async function saveDomain(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(""); setNotice("");
    try {
      const payload = { domain_name: domainName.trim(), port, scan_interval: interval, enabled };
      if (editing) await api.put(`/domains/${editing.id}`, payload);
      else await api.post("/domains", payload);
      setDomainFormOpen(false);
      setNotice(editing ? "Domain updated." : "Domain added.");
      await loadWorkspace();
    } catch (err) {
      setError(apiError(err, "Unable to save domain. Check your permissions and input."));
    } finally { setSaving(false); }
  }
  async function deleteDomain(domain: Domain) {
    if (!window.confirm(`Delete ${domain.domain_name}? This action cannot be undone.`)) return;
    setError(""); setNotice("");
    try {
      await api.delete(`/domains/${domain.id}`);
      setNotice(`${domain.domain_name} deleted.`);
      await loadWorkspace();
    } catch (err) { setError(apiError(err, "Unable to delete domain.")); }
  }
  async function scanDomain(domain: Domain) {
    setScanningId(domain.id); setError(""); setNotice("");
    try {
      await api.post(`/domains/${domain.id}/scan`);
      setNotice(`Scan requested for ${domain.domain_name}.`);
      await loadWorkspace();
      if (page === "history") await loadHistory();
    } catch (err) { setError(apiError(err, `Scan failed for ${domain.domain_name}.`)); }
    finally { setScanningId(null); }
  }

  const title = nav.find((item) => item.key === page)?.label ?? "Dashboard";
  const visibleNav = nav.filter((item) => !item.admin || user?.is_superuser);

  return (
    <div className="cm-shell" data-theme={theme}>
      <aside className="cm-sidebar">
        <div className="cm-brand">
          <div className="cm-brand-mark"><img src={certMonitorLogo} alt="CertMonitor logo" /></div>
          <div><strong>CertMonitor</strong><span>SSL operations</span></div>
        </div>
        <p className="cm-nav-caption">WORKSPACE</p>
        <nav className="cm-nav" aria-label="Main navigation">
          {visibleNav.map((item) => (
            <button key={item.key} className={`cm-nav-item ${page === item.key ? "active" : ""}`}
              onClick={() => { setPage(item.key); setError(""); setNotice(""); }}>
              <Icon>{item.icon}</Icon><span>{item.label}</span>
              {item.key === "users" && <span className="cm-nav-admin">ADMIN</span>}
            </button>
          ))}
        </nav>
      </aside>

      <section className="cm-main">
        <header className="cm-topbar">
          <div className="cm-breadcrumb"><span>Workspace</span><b>/</b><strong>{title}</strong></div>
          <div className="cm-top-actions">
            <button className="cm-button cm-button-secondary cm-theme-toggle" onClick={() => setTheme((current) => current === "light" ? "dark" : "light")} aria-pressed={theme === "dark"}>
              {theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            </button>
            <button className="cm-button cm-button-secondary" title="Refresh data" onClick={() => void loadWorkspace()}>Refresh</button>
            <div className="cm-account-menu-wrap">
              <button
                className="cm-user-menu"
                type="button"
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                onClick={() => setAccountMenuOpen((open) => !open)}
              >
                <span className="cm-avatar">{(user?.username?.[0] ?? "U").toUpperCase()}</span>
                <span className="cm-user-label"><strong>{user?.username ?? "Loading user"}</strong><small>{user?.is_superuser ? "Administrator" : "Member"}</small></span>
                <span className="cm-chevron">⌄</span>
              </button>
              {accountMenuOpen && (
                <div className="cm-account-dropdown" role="menu" aria-label="Account menu">
                  <button type="button" role="menuitem" onClick={() => { setPage("profile"); setAccountMenuOpen(false); setError(""); setNotice(""); }}>Profile</button>
                  <button type="button" role="menuitem" onClick={() => { setAccountMenuOpen(false); onLogout(); }}>Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="cm-content">
          {error && <div className="cm-alert cm-alert-error" role="alert">{error}<button onClick={() => setError("")}>×</button></div>}
          {notice && <div className="cm-alert cm-alert-success" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}
          {loading && <div className="cm-loading"><span className="cm-spinner" /> Loading workspace…</div>}

          {!loading && page === "dashboard" && <Dashboard domains={domains} certs={certs} counts={counts}
            onNavigate={setPage} onScan={scanDomain} scanningId={scanningId} onDomainClick={setSelectedDomain} />}
          {!loading && page === "domains" && <section>
            <PageHeading eyebrow="INVENTORY" title="Domains" description="Manage monitored endpoints and their scanning schedules."
              action={user?.is_superuser ? <button className="cm-button cm-button-primary" onClick={openCreate}>＋ Add domain</button> : undefined} />
            {domainFormOpen && user?.is_superuser && <form className="cm-panel cm-domain-form" onSubmit={saveDomain}>
              <div className="cm-panel-heading"><div><h3>{editing ? "Edit domain" : "Add a domain"}</h3><p>Configure the endpoint and scan interval.</p></div>
                <button type="button" className="cm-icon-button" onClick={() => setDomainFormOpen(false)} aria-label="Close form">×</button></div>
              <div className="cm-form-grid">
                <label className="cm-field cm-field-wide">Domain or hostname<input value={domainName} onChange={(e) => setDomainName(e.target.value)} placeholder="example.com" required /></label>
                <label className="cm-field">Port<input type="number" min="1" max="65535" value={port} onChange={(e) => setPort(Number(e.target.value))} required /></label>
                <label className="cm-field">Scan interval (minutes)<input type="number" min="1" value={interval} onChange={(e) => setInterval(Number(e.target.value))} required /></label>
                <label className="cm-check"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Monitoring enabled</label>
              </div>
              <div className="cm-form-actions"><button type="button" className="cm-button cm-button-ghost" onClick={() => setDomainFormOpen(false)}>Cancel</button>
                <button className="cm-button cm-button-primary" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add domain"}</button></div>
            </form>}
            <div className="cm-toolbar"><div className="cm-search">⌕<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search domains…" /></div>
              <span className="cm-results-count">{filteredDomains.length} domains</span></div>
            <div className="cm-panel cm-table-panel"><div className="cm-table-scroll"><table className="cm-table"><thead><tr><th>DOMAIN</th><th>CERTIFICATE STATUS</th><th>EXPIRES IN</th><th>SCAN INTERVAL</th><th>MONITORING</th><th>ACTIONS</th></tr></thead>
              <tbody>{filteredDomains.map((domain) => {
                const certificate = certs.find((item) => item.domain.id === domain.id)?.certificate;
                const status = certificate ? expiry(certificate.days_remaining) : { label: "Unknown", cls: "unknown" };
                return <tr key={domain.id}><td><div className="cm-domain-cell"><div><button type="button" className="cm-domain-name-button" onClick={() => setSelectedDomain(domain)}>{domain.domain_name}</button><small>Port {domain.port}</small></div></div></td>
                  <td><StatusPill label={status.label} status={status.cls} /></td><td>{certificate ? `${certificate.days_remaining} days` : "—"}</td>
                  <td>{domain.scan_interval} min</td><td><span className={`cm-enabled ${domain.enabled ? "yes" : "no"}`}><i />{domain.enabled ? "Enabled" : "Disabled"}</span></td>
                  <td><div className="cm-row-actions"><button className="cm-button cm-button-secondary cm-button-small" disabled={!domain.enabled || scanningId === domain.id} onClick={() => void scanDomain(domain)}>{scanningId === domain.id ? "Scanning…" : "Scan"}</button>
                    {user?.is_superuser && <><button className="cm-button cm-button-secondary cm-button-small" onClick={() => openEdit(domain)}>Edit</button><button className="cm-button cm-button-danger cm-button-small" onClick={() => void deleteDomain(domain)}>Delete</button></>}</div></td></tr>;
              })}</tbody></table>
              {filteredDomains.length === 0 && <EmptyState title="No domains found" detail={search ? "Try a different search term." : "Add a domain to begin monitoring."} />}
            </div></div>
          </section>}
          {!loading && page === "history" && <section>
            <PageHeading eyebrow="OBSERVABILITY" title="Scan history" description="Review scan outcomes, certificate changes and failures." action={<button className="cm-button cm-button-secondary" onClick={() => void loadHistory()}>↻ Refresh history</button>} />
            <div className="cm-history-metrics"><MiniMetric label="Total scans" value={history.length} /><MiniMetric label="Successful" value={history.filter((x) => x.success).length} tone="green" /><MiniMetric label="Failed" value={history.filter((x) => !x.success).length} tone="red" /><MiniMetric label="Certificate changes" value={history.filter((x) => x.certificate_changed).length} tone="blue" /></div>
            <div className="cm-toolbar"><div className="cm-search">⌕<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by domain…" /></div>
              <select className="cm-select" value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)}><option value="all">All results</option><option value="success">Successful</option><option value="failed">Failed</option><option value="changed">Certificate changed</option></select></div>
            <div className="cm-panel cm-table-panel"><div className="cm-table-scroll"><table className="cm-table"><thead><tr><th>DOMAIN</th><th>SCANNED AT</th><th>RESULT</th><th>CERTIFICATE</th><th>EXPIRES IN</th><th>DETAILS</th></tr></thead><tbody>
              {filteredHistory.map((item) => <tr key={`${item.domain_id}-${item.id}`}><td><button type="button" className="cm-domain-name-button" onClick={() => { const domain = domains.find((entry) => entry.id === item.domain_id); if (domain) setSelectedDomain(domain); }}>{item.domain_name}</button></td><td>{dateTime(item.scanned_at)}</td><td><StatusPill label={item.success ? "Successful" : "Failed"} status={item.success ? "healthy" : "critical"} /></td><td>{item.certificate_changed ? <StatusPill label="Changed" status="attention" /> : "No change"}</td><td>{item.days_remaining == null ? "—" : `${item.days_remaining} days`}</td><td>{item.error_message ? <span className="cm-error-detail" title={item.error_message}>{item.error_message}</span> : "—"}</td></tr>)}
            </tbody></table>{historyLoading && <div className="cm-loading"><span className="cm-spinner" /> Loading scan history…</div>}
              {!historyLoading && filteredHistory.length === 0 && <EmptyState title="No scan history yet" detail="History will appear here after domains have been scanned." />}</div></div>
            <p className="cm-footnote">History is assembled from the existing per-domain history API. Domains whose history endpoint fails are omitted from this view.</p>
          </section>}
          {!loading && page === "profile" && user && <Profile user={user} onRefresh={() => void loadWorkspace()} />}
          {!loading && page === "users" && user?.is_superuser && <UserManagement currentUserId={Number(user.id)} onBack={() => setPage("dashboard")} />}
          {!loading && page === "users" && !user?.is_superuser && <EmptyState title="Administrator access required" detail="Your account does not have permission to manage users." />}
        </main>
      </section>
      {selectedDomain && <CertificateDetails
        domain={selectedDomain}
        certificate={certs.find((item) => item.domain.id === selectedDomain.id)?.certificate ?? null}
        error={certs.find((item) => item.domain.id === selectedDomain.id)?.error}
        onClose={() => setSelectedDomain(null)}
      />}
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="cm-page-heading"><div><p className="cm-eyebrow">{eyebrow}</p><h1>{title}</h1><p className="cm-page-description">{description}</p></div>{action && <div className="cm-heading-action">{action}</div>}</div>;
}
function StatusPill({ label, status }: { label: string; status: string }) {
  return <span className={`cm-pill ${status}`}><i />{label}</span>;
}
function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="cm-empty"><div className="cm-empty-icon">⌁</div><strong>{title}</strong><p>{detail}</p></div>;
}
function MiniMetric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: string }) {
  return <div className="cm-mini-metric"><span className={`cm-mini-dot ${tone}`} /><div><small>{label}</small><strong>{value}</strong></div></div>;
}
function Dashboard({ domains, certs, counts, onNavigate, onScan, scanningId, onDomainClick }: {
  domains: Domain[]; certs: CertResult[]; counts: Record<string, number>;
  onNavigate: (page: PageKey) => void; onScan: (domain: Domain) => void; scanningId: number | null;
  onDomainClick: (domain: Domain) => void;
}) {
  const latest = [...certs].sort((a, b) => (a.certificate?.days_remaining ?? 99999) - (b.certificate?.days_remaining ?? 99999)).slice(0, 5);
  const enabled = domains.filter((d) => d.enabled).length;
  return <section>
    <PageHeading eyebrow="OVERVIEW" title="Dashboard" description="A clear view of certificate health across your monitored domains."
      action={<button className="cm-button cm-button-primary" onClick={() => onNavigate("domains")}>＋ Manage domains</button>} />
    <div className="cm-metric-grid">
      <MetricCard label="Total domains" value={domains.length} sub={`${enabled} actively monitored`} icon="◎" tone="blue" />
      <MetricCard label="Healthy certificates" value={counts.healthy ?? 0} sub="More than 60 days remaining" icon="✓" tone="green" />
      <MetricCard label="Expiring soon" value={(counts.warning ?? 0) + (counts.attention ?? 0)} sub="Within the next 60 days" icon="◷" tone="amber" />
      <MetricCard label="Critical / expired" value={(counts.critical ?? 0) + (counts.expired ?? 0)} sub="Needs immediate attention" icon="!" tone="red" />
    </div>
    <div className="cm-dashboard-grid">
      <div className="cm-panel cm-health-panel"><div className="cm-panel-heading"><div><h3>Certificate health</h3><p>Current status by monitored endpoint</p></div><button className="cm-link-button" onClick={() => onNavigate("domains")}>View domains →</button></div>
        <div className="cm-health-list">{[
          ["Healthy", counts.healthy ?? 0, "healthy"], ["Attention", counts.attention ?? 0, "attention"], ["Expiring soon", counts.warning ?? 0, "warning"], ["Critical", counts.critical ?? 0, "critical"], ["Expired", counts.expired ?? 0, "expired"], ["Unknown", counts.unknown ?? 0, "unknown"],
        ].map(([label, value, tone]) => {
          const total = Math.max(certs.length, 1);
          return <div className="cm-health-row" key={String(label)}><span>{label}</span><div className="cm-progress"><i className={String(tone)} style={{ width: `${Number(value) / total * 100}%` }} /></div><strong>{value}</strong></div>;
        })}</div>
      </div>
      <div className="cm-panel cm-attention-panel"><div className="cm-panel-heading"><div><h3>Needs attention</h3><p>Certificates closest to expiry</p></div><span className="cm-soft-count">{(counts.critical ?? 0) + (counts.expired ?? 0) + (counts.warning ?? 0)}</span></div>
        {latest.filter((item) => !item.certificate || item.certificate.days_remaining <= 30).length === 0 ? <div className="cm-inline-empty"><span className="cm-success-mark">✓</span><strong>All clear</strong><p>No certificates in the 30-day risk window.</p></div> : latest.filter((item) => !item.certificate || item.certificate.days_remaining <= 30).map((item) => <div className="cm-attention-item" key={item.domain.id}><span className={`cm-attention-dot ${item.certificate ? expiry(item.certificate.days_remaining).cls : "unknown"}`} /><div><button type="button" className="cm-domain-name-button" onClick={() => onDomainClick(item.domain)}>{item.domain.domain_name}</button><small>{item.certificate ? `${item.certificate.days_remaining} days remaining` : "Certificate unavailable"}</small></div><button className="cm-button cm-button-secondary cm-button-small" onClick={() => onDomainClick(item.domain)}>Details</button></div>)}
      </div>
    </div>
    <div className="cm-panel cm-table-panel"><div className="cm-panel-heading"><div><h3>Monitored domains</h3><p>Latest certificate status at a glance</p></div><button className="cm-link-button" onClick={() => onNavigate("domains")}>View all →</button></div>
      <div className="cm-table-scroll"><table className="cm-table"><thead><tr><th>DOMAIN</th><th>STATUS</th><th>EXPIRES IN</th><th>PORT</th><th>ACTION</th></tr></thead><tbody>{latest.map((item) => {
        const status = item.certificate ? expiry(item.certificate.days_remaining) : { label: "Unknown", cls: "unknown" };
        return <tr key={item.domain.id}><td><div className="cm-domain-cell"><div><button type="button" className="cm-domain-name-button" onClick={() => onDomainClick(item.domain)}>{item.domain.domain_name}</button><small>SSL/TLS certificate</small></div></div></td><td><StatusPill label={status.label} status={status.cls} /></td><td>{item.certificate ? `${item.certificate.days_remaining} days` : "—"}</td><td>{item.domain.port}</td><td><button className="cm-button cm-button-secondary cm-button-small" disabled={!item.domain.enabled || scanningId === item.domain.id} onClick={() => onScan(item.domain)}>{scanningId === item.domain.id ? "Scanning…" : "Scan"}</button></td></tr>;
      })}</tbody></table>{domains.length === 0 && <EmptyState title="No monitored domains" detail="Add your first domain to start monitoring certificates." />}</div>
    </div>
  </section>;
}
function MetricCard({ label, value, sub, icon, tone }: { label: string; value: number; sub: string; icon: string; tone: string }) {
  return <div className="cm-metric-card"><span className={`cm-metric-icon ${tone}`}>{icon}</span><span className="cm-metric-label">{label}</span><strong>{value}</strong><small>{sub}</small></div>;
}
function Profile({ user, onRefresh }: { user: CurrentUser; onRefresh: () => void }) {
  const [passwordFormOpen, setPasswordFormOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  async function resetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    setPasswordMessage("");
    if (newPassword.length < 8) { setPasswordError("Use at least 8 characters for the new password."); return; }
    if (newPassword !== confirmPassword) { setPasswordError("The passwords do not match."); return; }
    setSavingPassword(true);
    try {
      await api.post(`/users/${user.id}/reset-password`, { new_password: newPassword });
      setPasswordMessage("Password reset successfully.");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordFormOpen(false);
    } catch (error) {
      setPasswordError(apiError(error, "Unable to reset password. Your account may not have permission to use this endpoint."));
    } finally { setSavingPassword(false); }
  }

return <section><PageHeading eyebrow="ACCOUNT" title="User profile" description="Review your CertMonitor account details and manage your password." action={<div className="cm-profile-actions"><button className="cm-button cm-button-secondary" onClick={() => setPasswordFormOpen((open) => !open)}>{passwordFormOpen ? "Cancel" : "Edit Password"}</button><button className="cm-button cm-button-secondary" onClick={onRefresh}>Refresh profile</button></div>} />
    {passwordMessage && <div className="cm-alert cm-alert-success" role="status">{passwordMessage}</div>}
    {passwordError && <div className="cm-alert cm-alert-error" role="alert">{passwordError}</div>}
    {passwordFormOpen && <form className="cm-panel cm-domain-form cm-password-form" onSubmit={resetPassword}>
      <div className="cm-panel-heading"><div><h3>Reset your password</h3><p>Choose a strong password that you do not use elsewhere.</p></div></div>
      <div className="cm-form-grid cm-password-grid">
        <label className="cm-field">New password<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required /></label>
        <label className="cm-field">Confirm new password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required /></label>
      </div>
      <div className="cm-form-actions"><button type="button" className="cm-button cm-button-ghost" onClick={() => setPasswordFormOpen(false)}>Cancel</button><button className="cm-button cm-button-primary" disabled={savingPassword}>{savingPassword ? "Saving…" : "Reset password"}</button></div>
    </form>}
    <div className="cm-profile-layout"><div className="cm-panel cm-profile-hero"><div className="cm-profile-avatar">{(user.username[0] ?? "U").toUpperCase()}</div><h2>{user.username}</h2><p>{user.email}</p><span className={`cm-pill ${user.is_active ? "healthy" : "critical"}`}><i />{user.is_active ? "Active account" : "Inactive account"}</span></div>
      <div className="cm-panel cm-profile-details"><div className="cm-panel-heading"><div><h3>Account information</h3><p>Your authenticated account details.</p></div></div><div className="cm-profile-field"><span>Username</span><strong>{user.username}</strong></div><div className="cm-profile-field"><span>Email address</span><strong>{user.email}</strong></div><div className="cm-profile-field"><span>Role</span><strong>{user.is_superuser ? "Administrator" : "Member"}</strong></div><div className="cm-profile-field"><span>Account status</span><strong>{user.is_active ? "Active" : "Inactive"}</strong></div>
        <div className="cm-profile-note"><strong>Password management</strong><p>Use Edit password to submit a password reset. The current backend endpoint may restrict this action to administrators; if you receive a permission error, a self-service password endpoint is needed in the backend.</p></div>
      </div></div>
  </section>;
}


function CertificateDetails({ domain, certificate, error, onClose }: { domain: Domain; certificate: Certificate | null; error?: string; onClose: () => void }) {
  return <div className="cm-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="cm-modal cm-certificate-modal" role="dialog" aria-modal="true" aria-labelledby="cm-certificate-title">
      <div className="cm-panel-heading"><div><p className="cm-eyebrow">CERTIFICATE DETAILS</p><h2 id="cm-certificate-title">{domain.domain_name}</h2><p>Port {domain.port} · SSL/TLS certificate information</p></div><button className="cm-button cm-button-secondary" onClick={onClose}>Close</button></div>
      {!certificate ? <div className="cm-modal-empty">{error ?? "No certificate details are available for this domain yet."}</div> : <div className="cm-certificate-grid">
        <div className="cm-certificate-summary"><span className="cm-muted-label">Current status</span><StatusPill label={expiry(certificate.days_remaining).label} status={expiry(certificate.days_remaining).cls} /><span className="cm-muted-label">Days remaining</span><strong className="cm-days-remaining">{certificate.days_remaining}</strong></div>
        <div className="cm-certificate-field"><span>Subject</span><strong>{certificate.subject || "—"}</strong></div>
        <div className="cm-certificate-field"><span>Issuer</span><strong>{certificate.issuer || "—"}</strong></div>
        <div className="cm-certificate-field"><span>Valid from</span><strong>{dateTime(certificate.valid_from)}</strong></div>
        <div className="cm-certificate-field"><span>Valid until</span><strong>{dateTime(certificate.valid_until)}</strong></div>
        <div className="cm-certificate-field"><span>Serial number</span><strong className="cm-break-word">{certificate.serial_number || "—"}</strong></div>
        <div className="cm-certificate-field"><span>SHA-256 fingerprint</span><strong className="cm-break-word">{certificate.fingerprint_sha256 || "—"}</strong></div>
      </div>}
    </section>
  </div>;
}