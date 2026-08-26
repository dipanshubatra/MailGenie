import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, CircularProgress, Card, CardContent, Grid,
  Paper, Button, TextField, Chip, Divider, IconButton, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, Snackbar,
  Alert, Tab, Tabs, LinearProgress, Badge, FormControl, InputLabel,
  Select, MenuItem, Switch, FormControlLabel
} from '@mui/material';

/**
 * BackupArchiveDashboard
 *
 * Enterprise-grade frontend component for managing email archival,
 * backup snapshots, cold storage migration, integrity verification,
 * legal holds, and retention policy evaluation.
 *
 * Connects to the EmailBackupDashboardController REST API on the Spring Boot backend.
 */
const BackupArchiveDashboard = ({ backendUrl = 'http://localhost:8080' }) => {
  // ── State ─────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(0);

  // Dashboard stats
  const [stats, setStats] = useState(null);

  // Archives list
  const [archives, setArchives] = useState([]);
  const [archivesLoading, setArchivesLoading] = useState(false);

  // Archive dialog
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiveForm, setArchiveForm] = useState({ emailId: '', content: '', retentionDays: 365 });

  // Content viewer dialog
  const [contentViewerOpen, setContentViewerOpen] = useState(false);
  const [viewingContent, setViewingContent] = useState(null);
  const [contentLoading, setContentLoading] = useState(false);

  // Snapshot state
  const [snapshots, setSnapshots] = useState([]);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restoreSnapshotId, setRestoreSnapshotId] = useState('');

  // Cold storage state
  const [coldStorageTiers, setColdStorageTiers] = useState([]);
  const [coldStorageLoading, setColdStorageLoading] = useState(false);

  // Integrity state
  const [integrityResult, setIntegrityResult] = useState(null);
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [verifyArchiveId, setVerifyArchiveId] = useState('');

  // Legal hold state
  const [legalHoldEmailId, setLegalHoldEmailId] = useState('');
  const [legalHoldResult, setLegalHoldResult] = useState(null);

  // Retention policy state
  const [retentionPolicy, setRetentionPolicy] = useState(null);
  const [retentionPresets, setRetentionPresets] = useState([]);
  const [retentionLoading, setRetentionLoading] = useState(false);

  // Encryption key state
  const [encryptionDialogOpen, setEncryptionDialogOpen] = useState(false);
  const [encryptionForm, setEncryptionForm] = useState({ archiveId: '', encryptionKey: '' });
  const [encryptionResult, setEncryptionResult] = useState(null);

  // Filter state
  const [filterExpired, setFilterExpired] = useState(false);

  // Toast
  const [toast, setToast] = useState({ open: false, message: '', severity: 'info' });

  // ── API Helpers ───────────────────────────────────────────────

  const api = useCallback(async (method, path, body = null) => {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${backendUrl}${path}`, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }, [backendUrl]);

  const showToast = (message, severity = 'info') => {
    setToast({ open: true, message, severity });
  };

  // ── Data Loading ──────────────────────────────────────────────

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, tiersData] = await Promise.all([
        api('GET', '/api/backup/stats'),
        api('GET', '/api/backup/cold-storage/tiers'),
      ]);
      setStats(statsData);
      setColdStorageTiers(tiersData);
    } catch (err) {
      console.error('Dashboard load error:', err);
      setError('Failed to load backup dashboard data. Ensure the backend is running.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  const loadArchives = useCallback(async () => {
    setArchivesLoading(true);
    try {
      const params = filterExpired ? '?expiredOnly=true' : '';
      const data = await api('GET', `/api/backup/archives${params}`);
      setArchives(data);
    } catch (err) {
      console.error('Load archives error:', err);
      showToast('Failed to load archived records', 'error');
    } finally {
      setArchivesLoading(false);
    }
  }, [api, filterExpired]);

  const loadRetentionPolicy = useCallback(async () => {
    setRetentionLoading(true);
    try {
      const [policyData, presetsData] = await Promise.all([
        api('GET', '/api/backup/retention/policy'),
        api('GET', '/api/backup/retention/presets'),
      ]);
      setRetentionPolicy(policyData);
      setRetentionPresets(presetsData);
    } catch (err) {
      console.error('Load retention policy error:', err);
      showToast('Failed to load retention policy data', 'error');
    } finally {
      setRetentionLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (activeTab === 1) loadArchives();
    if (activeTab === 4) loadRetentionPolicy();
  }, [activeTab, loadArchives, loadRetentionPolicy]);

  // ── Archive Operations ────────────────────────────────────────

  const handleArchiveEmail = async () => {
    try {
      await api('POST', '/api/backup/archive', archiveForm);
      showToast('Email archived successfully!', 'success');
      setArchiveDialogOpen(false);
      setArchiveForm({ emailId: '', content: '', retentionDays: 365 });
      loadDashboard();
      if (activeTab === 1) loadArchives();
    } catch (err) {
      showToast('Failed to archive email: ' + err.message, 'error');
    }
  };

  const handleViewContent = async (archiveId) => {
    setContentLoading(true);
    setViewingContent(null);
    setContentViewerOpen(true);
    try {
      const data = await api('GET', `/api/backup/archives/${archiveId}/content`);
      setViewingContent(data);
    } catch (err) {
      showToast('Failed to retrieve archived content', 'error');
    } finally {
      setContentLoading(false);
    }
  };

  // ── Snapshot Operations ───────────────────────────────────────

  const handleCreateSnapshot = async () => {
    setSnapshotLoading(true);
    try {
      const snapshot = await api('POST', '/api/backup/snapshots');
      setSnapshots(prev => [snapshot, ...prev]);
      showToast(`Snapshot created: ${snapshot.snapshotId}`, 'success');
    } catch (err) {
      showToast('Failed to create snapshot', 'error');
    } finally {
      setSnapshotLoading(false);
    }
  };

  const handleRestoreSnapshot = async () => {
    if (!restoreSnapshotId.trim()) return;
    try {
      const result = await api('POST', `/api/backup/restore/${restoreSnapshotId}`);
      showToast(`Restore completed: ${result.status}`, 'success');
      setRestoreDialogOpen(false);
      setRestoreSnapshotId('');
    } catch (err) {
      showToast('Failed to restore from snapshot', 'error');
    }
  };

  // ── Cold Storage Operations ───────────────────────────────────

  const handleMigrateToColdStorage = async (archiveId) => {
    setColdStorageLoading(true);
    try {
      const result = await api('POST', `/api/backup/cold-storage/migrate/${archiveId}`);
      showToast(`Migrated to ${result.storageClass}`, 'success');
    } catch (err) {
      showToast('Failed to migrate to cold storage', 'error');
    } finally {
      setColdStorageLoading(false);
    }
  };

  // ── Integrity Operations ──────────────────────────────────────

  const handleVerifyIntegrity = async () => {
    if (!verifyArchiveId.trim()) return;
    setIntegrityLoading(true);
    try {
      const result = await api('POST', '/api/backup/integrity/verify', { archiveId: verifyArchiveId });
      setIntegrityResult(result);
      showToast(result.integrityValid ? 'Integrity verified ✓' : 'Integrity check failed', result.integrityValid ? 'success' : 'warning');
    } catch (err) {
      showToast('Integrity verification failed', 'error');
    } finally {
      setIntegrityLoading(false);
    }
  };

  const handleBatchAudit = async () => {
    setIntegrityLoading(true);
    setIntegrityResult(null);
    try {
      const result = await api('POST', '/api/backup/integrity/batch-audit');
      setIntegrityResult(result);
      showToast(`Batch audit complete: ${result.passed}/${result.totalAudited} passed`, 'success');
    } catch (err) {
      showToast('Batch audit failed', 'error');
    } finally {
      setIntegrityLoading(false);
    }
  };

  // ── Legal Hold Operations ─────────────────────────────────────

  const handleApplyLegalHold = async () => {
    if (!legalHoldEmailId.trim()) return;
    try {
      const result = await api('POST', '/api/backup/legal-hold/apply', { emailId: legalHoldEmailId });
      setLegalHoldResult(result);
      showToast('Legal hold applied', 'success');
    } catch (err) {
      showToast('Failed to apply legal hold', 'error');
    }
  };

  const handleReleaseLegalHold = async () => {
    if (!legalHoldEmailId.trim()) return;
    try {
      const result = await api('POST', '/api/backup/legal-hold/release', { emailId: legalHoldEmailId });
      setLegalHoldResult(result);
      showToast('Legal hold released', 'info');
    } catch (err) {
      showToast('Failed to release legal hold', 'error');
    }
  };

  const handleCheckLegalHold = async () => {
    if (!legalHoldEmailId.trim()) return;
    try {
      const result = await api('GET', `/api/backup/legal-hold/status/${legalHoldEmailId}`);
      setLegalHoldResult(result);
    } catch (err) {
      showToast('Failed to check legal hold status', 'error');
    }
  };

  // ── Encryption Operations ─────────────────────────────────────

  const handleStoreEncryptionKey = async () => {
    if (!encryptionForm.archiveId.trim() || !encryptionForm.encryptionKey.trim()) return;
    try {
      const result = await api('POST', '/api/backup/encryption/keys', encryptionForm);
      setEncryptionResult(result);
      setEncryptionDialogOpen(false);
      showToast('Encryption key stored successfully', 'success');
      setEncryptionForm({ archiveId: '', encryptionKey: '' });
    } catch (err) {
      showToast('Failed to store encryption key', 'error');
    }
  };

  // ── Styling Constants ─────────────────────────────────────────

  const glassCard = {
    background: 'rgba(255, 255, 255, 0.05)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '16px',
    color: '#e0e0e0',
    padding: '24px',
  };

  const statCardStyle = {
    ...glassCard,
    textAlign: 'center',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    cursor: 'default',
  };

  const sectionStyle = {
    ...glassCard,
    marginTop: '24px',
  };

  const chipStyle = (color) => ({
    borderRadius: '12px',
    fontWeight: 700,
    fontSize: '0.75rem',
  });

  // ── Loading / Error States ────────────────────────────────────

  if (loading) {
    return (
      <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" mt={10}>
        <CircularProgress sx={{ color: '#818cf8' }} />
        <Typography variant="body1" sx={{ color: '#94a3b8', mt: 2 }}>
          Loading Backup Dashboard...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" mt={10}>
        <Typography variant="h5" color="error" sx={{ fontWeight: 700 }}>
          ⚠️ {error}
        </Typography>
        <Button variant="contained" sx={{ mt: 3, bgcolor: '#6366f1' }} onClick={loadDashboard}>
          Retry Connection
        </Button>
      </Box>
    );
  }

  // ── Tab Panels ────────────────────────────────────────────────

  const tabLabels = [
    { label: '📊 Overview', index: 0 },
    { label: '🗄️ Archives', index: 1 },
    { label: '📸 Snapshots', index: 2 },
    { label: '🧊 Cold Storage', index: 3 },
    { label: '📋 Retention', index: 4 },
    { label: '🔐 Integrity & Security', index: 5 },
  ];

  return (
    <Box sx={{ minHeight: '100vh' }}>
      {/* ── Header ────────────────────────────────────────── */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h3" sx={{
          fontWeight: 800, mb: 1,
          background: 'linear-gradient(135deg, #818cf8 0%, #c084fc 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          🛡️ Backup & Archive Dashboard
        </Typography>
        <Typography variant="body1" sx={{ color: '#94a3b8' }}>
          Enterprise email archival lifecycle management — backup, cold storage, legal holds, and retention policies.
        </Typography>
      </Box>

      {/* ── Stats Cards ───────────────────────────────────── */}
      {stats && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={statCardStyle}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ color: '#94a3b8', mb: 1 }}>Total Archived</Typography>
                <Typography variant="h3" sx={{ fontWeight: 800, color: '#818cf8' }}>
                  {stats.totalArchivedRecords}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={statCardStyle}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ color: '#94a3b8', mb: 1 }}>Active Records</Typography>
                <Typography variant="h3" sx={{ fontWeight: 800, color: '#34d399' }}>
                  {stats.activeRecords}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={statCardStyle}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ color: '#94a3b8', mb: 1 }}>Expired Records</Typography>
                <Typography variant="h3" sx={{ fontWeight: 800, color: '#f87171' }}>
                  {stats.expiredRecords}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={statCardStyle}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ color: '#94a3b8', mb: 1 }}>Storage Used</Typography>
                <Typography variant="h3" sx={{ fontWeight: 800, color: '#fbbf24' }}>
                  {stats.estimatedStorageKB} <span style={{ fontSize: '0.9rem' }}>KB</span>
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* ── Tabs ──────────────────────────────────────────── */}
      <Paper sx={{ ...glassCard, p: 0, mb: 0 }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            '& .MuiTab-root': { color: '#94a3b8', fontWeight: 600, textTransform: 'none', minHeight: 52 },
            '& .Mui-selected': { color: '#818cf8 !important' },
          }}
        >
          {tabLabels.map(t => <Tab key={t.index} label={t.label} />)}
        </Tabs>
      </Paper>

      {/* ── Tab 0: Overview ──────────────────────────────── */}
      {activeTab === 0 && stats && (
        <Box sx={{ mt: 3 }}>
          <Grid container spacing={3}>
            {/* Retention Distribution */}
            <Grid item xs={12} md={6}>
              <Card sx={sectionStyle}>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: '#c084fc' }}>
                    📊 Retention Tier Distribution
                  </Typography>
                  <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2 }} />
                  {Object.entries(stats.retentionTierDistribution || {}).map(([tier, count]) => (
                    <Box key={tier} sx={{ mb: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="body2" sx={{ color: '#e0e0e0', fontWeight: 600 }}>{tier}</Typography>
                        <Typography variant="body2" sx={{ color: '#818cf8', fontWeight: 700 }}>{count}</Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={stats.totalArchivedRecords > 0 ? (count / stats.totalArchivedRecords) * 100 : 0}
                        sx={{
                          height: 8, borderRadius: 4,
                          bgcolor: 'rgba(99, 102, 241, 0.1)',
                          '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg, #818cf8, #c084fc)', borderRadius: 4 },
                        }}
                      />
                    </Box>
                  ))}
                  {Object.keys(stats.retentionTierDistribution || {}).length === 0 && (
                    <Typography variant="body2" sx={{ color: '#64748b', fontStyle: 'italic' }}>
                      No archived records yet.
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Archive Timeline */}
            <Grid item xs={12} md={6}>
              <Card sx={sectionStyle}>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: '#34d399' }}>
                    🕐 Archive Timeline
                  </Typography>
                  <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2 }} />

                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ color: '#94a3b8', fontWeight: 600, mb: 0.5 }}>Oldest Archive</Typography>
                    <Typography variant="body1" sx={{ color: '#e0e0e0' }}>
                      {stats.oldestArchiveDate === 'N/A' ? '—' : new Date(stats.oldestArchiveDate).toLocaleString()}
                    </Typography>
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ color: '#94a3b8', fontWeight: 600, mb: 0.5 }}>Newest Archive</Typography>
                    <Typography variant="body1" sx={{ color: '#e0e0e0' }}>
                      {stats.newestArchiveDate === 'N/A' ? '—' : new Date(stats.newestArchiveDate).toLocaleString()}
                    </Typography>
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ color: '#94a3b8', fontWeight: 600, mb: 0.5 }}>Last Dashboard Update</Typography>
                    <Typography variant="body1" sx={{ color: '#e0e0e0' }}>
                      {new Date(stats.lastUpdated).toLocaleString()}
                    </Typography>
                  </Box>

                  <Box sx={{
                    mt: 3, p: 2, borderRadius: 2,
                    bgcolor: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.2)',
                  }}>
                    <Typography variant="body2" sx={{ color: '#818cf8', fontWeight: 700 }}>
                      💡 Tip: Use the Archives tab to create new archives, or the Snapshots tab to create point-in-time backups.
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Quick Actions */}
            <Grid item xs={12}>
              <Card sx={sectionStyle}>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: '#fbbf24' }}>
                    ⚡ Quick Actions
                  </Typography>
                  <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2 }} />
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={4}>
                      <Button
                        fullWidth variant="contained" onClick={() => setArchiveDialogOpen(true)}
                        sx={{ py: 1.5, borderRadius: 2, bgcolor: '#6366f1', fontWeight: 700, textTransform: 'none' }}
                      >
                        🗄️ New Archive
                      </Button>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Button
                        fullWidth variant="contained" onClick={handleCreateSnapshot} disabled={snapshotLoading}
                        sx={{ py: 1.5, borderRadius: 2, bgcolor: '#8b5cf6', fontWeight: 700, textTransform: 'none' }}
                      >
                        {snapshotLoading ? <CircularProgress size={20} color="inherit" /> : '📸 Create Snapshot'}
                      </Button>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Button
                        fullWidth variant="contained" onClick={handleBatchAudit} disabled={integrityLoading}
                        sx={{ py: 1.5, borderRadius: 2, bgcolor: '#06b6d4', fontWeight: 700, textTransform: 'none' }}
                      >
                        {integrityLoading ? <CircularProgress size={20} color="inherit" /> : '🔍 Run Integrity Audit'}
                      </Button>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* ── Tab 1: Archives ──────────────────────────────── */}
      {activeTab === 1 && (
        <Box sx={{ mt: 3 }}>
          <Paper sx={sectionStyle}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#c084fc' }}>🗄️ Archived Records</Typography>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                <FormControlLabel
                  control={<Switch checked={filterExpired} onChange={(e) => setFilterExpired(e.target.checked)} color="warning" />}
                  label={<Typography variant="body2" sx={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.85rem' }}>Expired Only</Typography>}
                />
                <Button variant="contained" onClick={() => setArchiveDialogOpen(true)} sx={{ bgcolor: '#6366f1', fontWeight: 700, textTransform: 'none' }}>
                  ➕ New Archive
                </Button>
              </Box>
            </Box>
            <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2 }} />

            {archivesLoading ? (
              <Box display="flex" justifyContent="center" py={4}><CircularProgress sx={{ color: '#818cf8' }} /></Box>
            ) : archives.length === 0 ? (
              <Typography variant="body2" sx={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', py: 4 }}>
                No archived records found. Create your first archive above.
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ color: '#94a3b8', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Archive ID</TableCell>
                      <TableCell sx={{ color: '#94a3b8', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Email ID</TableCell>
                      <TableCell sx={{ color: '#94a3b8', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Retention</TableCell>
                      <TableCell sx={{ color: '#94a3b8', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Archived At</TableCell>
                      <TableCell sx={{ color: '#94a3b8', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Status</TableCell>
                      <TableCell sx={{ color: '#94a3b8', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {archives.map((archive) => {
                      const expired = retentionPolicyManager_local(archive);
                      return (
                        <TableRow key={archive.archiveId} sx={{ '&:hover': { bgcolor: 'rgba(99, 102, 241, 0.05)' } }}>
                          <TableCell sx={{ color: '#e0e0e0', fontSize: '0.8rem', fontFamily: 'monospace', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            {archive.archiveId?.substring(0, 12)}…
                          </TableCell>
                          <TableCell sx={{ color: '#e0e0e0', fontSize: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            {archive.originalEmailId}
                          </TableCell>
                          <TableCell sx={{ color: '#e0e0e0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <Chip label={`${archive.retentionDays}d`} size="small" sx={{ bgcolor: 'rgba(99,102,241,0.15)', color: '#818cf8', fontWeight: 700 }} />
                          </TableCell>
                          <TableCell sx={{ color: '#94a3b8', fontSize: '0.82rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            {archive.archivedAt ? new Date(archive.archivedAt).toLocaleDateString() : '—'}
                          </TableCell>
                          <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <Chip
                              label={expired ? 'Expired' : 'Active'}
                              size="small"
                              sx={expired
                                ? { bgcolor: 'rgba(248,113,113,0.15)', color: '#f87171', fontWeight: 700 }
                                : { bgcolor: 'rgba(52,211,153,0.15)', color: '#34d399', fontWeight: 700 }
                              }
                            />
                          </TableCell>
                          <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                              <Tooltip title="View Decompressed Content">
                                <IconButton size="small" onClick={() => handleViewContent(archive.archiveId)} sx={{ color: '#818cf8' }}>👁️</IconButton>
                              </Tooltip>
                              <Tooltip title="Migrate to Cold Storage">
                                <IconButton size="small" onClick={() => handleMigrateToColdStorage(archive.archiveId)} sx={{ color: '#06b6d4' }} disabled={coldStorageLoading}>🧊</IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Box>
      )}

      {/* ── Tab 2: Snapshots ─────────────────────────────── */}
      {activeTab === 2 && (
        <Box sx={{ mt: 3 }}>
          <Paper sx={sectionStyle}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#8b5cf6' }}>📸 Backup Snapshots</Typography>
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Button
                  variant="contained" onClick={handleCreateSnapshot} disabled={snapshotLoading}
                  sx={{ bgcolor: '#8b5cf6', fontWeight: 700, textTransform: 'none' }}
                >
                  {snapshotLoading ? <CircularProgress size={20} color="inherit" /> : '📸 Create Snapshot'}
                </Button>
                <Button
                  variant="outlined" onClick={() => setRestoreDialogOpen(true)}
                  sx={{ borderColor: '#818cf8', color: '#818cf8', fontWeight: 700, textTransform: 'none' }}
                >
                  🔄 Restore
                </Button>
              </Box>
            </Box>
            <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2 }} />

            {snapshots.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <Typography variant="body1" sx={{ color: '#64748b', fontStyle: 'italic', mb: 2 }}>
                  No snapshots created yet in this session.
                </Typography>
                <Typography variant="body2" sx={{ color: '#475569' }}>
                  Create a snapshot to capture a point-in-time backup of all your archived records.
                </Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ color: '#94a3b8', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Snapshot ID</TableCell>
                      <TableCell sx={{ color: '#94a3b8', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Records Archived</TableCell>
                      <TableCell sx={{ color: '#94a3b8', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Timestamp</TableCell>
                      <TableCell sx={{ color: '#94a3b8', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {snapshots.map((snap, idx) => (
                      <TableRow key={idx} sx={{ '&:hover': { bgcolor: 'rgba(139, 92, 246, 0.05)' } }}>
                        <TableCell sx={{ color: '#e0e0e0', fontFamily: 'monospace', fontSize: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          {snap.snapshotId}
                        </TableCell>
                        <TableCell sx={{ color: '#e0e0e0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          {snap.totalRecordsArchived}
                        </TableCell>
                        <TableCell sx={{ color: '#94a3b8', fontSize: '0.82rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          {new Date(snap.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <Chip label={snap.status} size="small" sx={{ bgcolor: 'rgba(52,211,153,0.15)', color: '#34d399', fontWeight: 700 }} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Box>
      )}

      {/* ── Tab 3: Cold Storage ──────────────────────────── */}
      {activeTab === 3 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#06b6d4', mb: 2 }}>🧊 Cold Storage Tiers</Typography>
          <Grid container spacing={3}>
            {coldStorageTiers.map((tier) => (
              <Grid item xs={12} sm={6} md={3} key={tier.tier}>
                <Card sx={{ ...glassCard, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <CardContent>
                    <Typography variant="h2" sx={{ mb: 1 }}>{tier.icon}</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#06b6d4', mb: 1 }}>{tier.tier}</Typography>
                    <Typography variant="body2" sx={{ color: '#94a3b8', mb: 2 }}>{tier.description}</Typography>
                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2 }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>Retention Range</Typography>
                      <Typography variant="caption" sx={{ color: '#e0e0e0', fontWeight: 600 }}>{tier.retentionRange}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>Cost</Typography>
                      <Typography variant="caption" sx={{ color: '#fbbf24', fontWeight: 600 }}>{tier.costPerGB}</Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* ── Tab 4: Retention Policy ──────────────────────── */}
      {activeTab === 4 && (
        <Box sx={{ mt: 3 }}>
          <Grid container spacing={3}>
            {/* Policy Summary */}
            <Grid item xs={12} md={6}>
              <Card sx={sectionStyle}>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#fbbf24', mb: 2 }}>📋 Retention Policy Evaluation</Typography>
                  <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2 }} />
                  {retentionLoading ? (
                    <Box display="flex" justifyContent="center" py={4}><CircularProgress sx={{ color: '#818cf8' }} size={30} /></Box>
                  ) : retentionPolicy ? (
                    <>
                      <Box sx={{ display: 'flex', gap: 3, mb: 3, flexWrap: 'wrap' }}>
                        <Box sx={{ textAlign: 'center', flex: 1, minWidth: 80 }}>
                          <Typography variant="h4" sx={{ fontWeight: 800, color: '#34d399' }}>{retentionPolicy.activeCount}</Typography>
                          <Typography variant="caption" sx={{ color: '#94a3b8' }}>Active</Typography>
                        </Box>
                        <Box sx={{ textAlign: 'center', flex: 1, minWidth: 80 }}>
                          <Typography variant="h4" sx={{ fontWeight: 800, color: '#fbbf24' }}>{retentionPolicy.nearExpiryCount}</Typography>
                          <Typography variant="caption" sx={{ color: '#94a3b8' }}>Near Expiry</Typography>
                        </Box>
                        <Box sx={{ textAlign: 'center', flex: 1, minWidth: 80 }}>
                          <Typography variant="h4" sx={{ fontWeight: 800, color: '#f87171' }}>{retentionPolicy.expiredCount}</Typography>
                          <Typography variant="caption" sx={{ color: '#94a3b8' }}>Expired</Typography>
                        </Box>
                      </Box>
                      <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                        <Typography variant="body2" sx={{ color: '#fbbf24', fontWeight: 600 }}>
                          Default retention: {retentionPolicy.defaultRetentionDays} days · Near-expiry threshold: {retentionPolicy.nearExpiryThresholdDays} days
                        </Typography>
                      </Box>
                    </>
                  ) : (
                    <Typography variant="body2" sx={{ color: '#64748b', fontStyle: 'italic' }}>No retention data available.</Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Policy Presets */}
            <Grid item xs={12} md={6}>
              <Card sx={sectionStyle}>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#818cf8', mb: 2 }}>🏷️ Retention Presets</Typography>
                  <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2 }} />
                  {retentionPresets.map((preset, idx) => (
                    <Box key={idx} sx={{ mb: 2, p: 2, borderRadius: 2, bgcolor: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#e0e0e0' }}>{preset.name}</Typography>
                        <Chip label={`${preset.retentionDays}d`} size="small" sx={{ bgcolor: 'rgba(99,102,241,0.2)', color: '#818cf8', fontWeight: 700 }} />
                      </Box>
                      <Typography variant="body2" sx={{ color: '#94a3b8', fontSize: '0.82rem' }}>{preset.description}</Typography>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>Use case: {preset.useCase}</Typography>
                    </Box>
                  ))}
                </CardContent>
              </Card>
            </Grid>

            {/* Retention Detail Table */}
            {retentionPolicy && retentionPolicy.evaluations && retentionPolicy.evaluations.length > 0 && (
              <Grid item xs={12}>
                <Card sx={sectionStyle}>
                  <CardContent>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#c084fc', mb: 2 }}>📝 Record-Level Retention Status</Typography>
                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2 }} />
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ color: '#94a3b8', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Archive ID</TableCell>
                            <TableCell sx={{ color: '#94a3b8', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Email ID</TableCell>
                            <TableCell sx={{ color: '#94a3b8', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Retention</TableCell>
                            <TableCell sx={{ color: '#94a3b8', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Days Left</TableCell>
                            <TableCell sx={{ color: '#94a3b8', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Status</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {retentionPolicy.evaluations.map((ev) => (
                            <TableRow key={ev.archiveId} sx={{ '&:hover': { bgcolor: 'rgba(99,102,241,0.05)' } }}>
                              <TableCell sx={{ color: '#e0e0e0', fontFamily: 'monospace', fontSize: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                {ev.archiveId?.substring(0, 12)}…
                              </TableCell>
                              <TableCell sx={{ color: '#e0e0e0', fontSize: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                {ev.originalEmailId}
                              </TableCell>
                              <TableCell sx={{ color: '#e0e0e0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                {ev.retentionDays}d
                              </TableCell>
                              <TableCell sx={{ color: '#e0e0e0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                {ev.status === 'EXPIRED' ? '—' : ev.daysUntilExpiry}
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <Chip
                                  label={ev.status}
                                  size="small"
                                  sx={
                                    ev.status === 'ACTIVE' ? { bgcolor: 'rgba(52,211,153,0.15)', color: '#34d399', fontWeight: 700 } :
                                    ev.status === 'NEAR_EXPIRY' ? { bgcolor: 'rgba(251,191,36,0.15)', color: '#fbbf24', fontWeight: 700 } :
                                    { bgcolor: 'rgba(248,113,113,0.15)', color: '#f87171', fontWeight: 700 }
                                  }
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              </Grid>
            )}
          </Grid>
        </Box>
      )}

      {/* ── Tab 5: Integrity & Security ──────────────────── */}
      {activeTab === 5 && (
        <Box sx={{ mt: 3 }}>
          <Grid container spacing={3}>
            {/* Integrity Verification */}
            <Grid item xs={12} md={6}>
              <Card sx={sectionStyle}>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#06b6d4', mb: 2 }}>🔍 Integrity Verification</Typography>
                  <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2 }} />
                  <Box sx={{ display: 'flex', gap: 1.5, mb: 3 }}>
                    <TextField
                      fullWidth size="small" placeholder="Archive ID to verify"
                      value={verifyArchiveId} onChange={(e) => setVerifyArchiveId(e.target.value)}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, color: '#e0e0e0' } }}
                    />
                    <Button
                      variant="contained" onClick={handleVerifyIntegrity} disabled={integrityLoading}
                      sx={{ bgcolor: '#06b6d4', fontWeight: 700, textTransform: 'none', whiteSpace: 'nowrap', borderRadius: 2 }}
                    >
                      {integrityLoading ? <CircularProgress size={20} color="inherit" /> : 'Verify'}
                    </Button>
                  </Box>
                  <Button
                    fullWidth variant="outlined" onClick={handleBatchAudit} disabled={integrityLoading}
                    sx={{ borderColor: '#06b6d4', color: '#06b6d4', fontWeight: 700, textTransform: 'none', borderRadius: 2, mb: 2 }}
                  >
                    {integrityLoading ? <CircularProgress size={20} color="inherit" /> : '🔍 Run Full Batch Audit'}
                  </Button>

                  {integrityResult && (
                    <Box sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)' }}>
                      {integrityResult.totalAudited !== undefined ? (
                        <>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#06b6d4', mb: 1 }}>Batch Audit Results</Typography>
                          <Box sx={{ display: 'flex', gap: 3, mb: 1, flexWrap: 'wrap' }}>
                            <Typography variant="body2" sx={{ color: '#e0e0e0' }}>Total: <strong>{integrityResult.totalAudited}</strong></Typography>
                            <Typography variant="body2" sx={{ color: '#34d399' }}>Passed: <strong>{integrityResult.passed}</strong></Typography>
                            <Typography variant="body2" sx={{ color: '#f87171' }}>Failed: <strong>{integrityResult.failed}</strong></Typography>
                            <Typography variant="body2" sx={{ color: '#fbbf24' }}>Pass Rate: <strong>{integrityResult.passRate}</strong></Typography>
                          </Box>
                        </>
                      ) : (
                        <>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#06b6d4', mb: 1 }}>Verification Result</Typography>
                          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                            <Typography variant="body2" sx={{ color: '#e0e0e0' }}>Status: <strong>{integrityResult.integrityValid ? '✅ Valid' : '❌ Failed'}</strong></Typography>
                            <Typography variant="body2" sx={{ color: '#94a3b8' }}>Content Length: {integrityResult.decompressedLength}</Typography>
                          </Box>
                        </>
                      )}
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Legal Hold */}
            <Grid item xs={12} md={6}>
              <Card sx={sectionStyle}>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#f87171', mb: 2 }}>⚖️ Legal Hold Management</Typography>
                  <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2 }} />
                  <TextField
                    fullWidth size="small" placeholder="Email ID for legal hold operations"
                    value={legalHoldEmailId} onChange={(e) => setLegalHoldEmailId(e.target.value)}
                    sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2, color: '#e0e0e0' } }}
                  />
                  <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
                    <Button
                      variant="contained" onClick={handleApplyLegalHold}
                      sx={{ bgcolor: '#f87171', fontWeight: 700, textTransform: 'none', borderRadius: 2, flex: 1 }}
                    >
                      🔒 Apply Hold
                    </Button>
                    <Button
                      variant="contained" onClick={handleReleaseLegalHold}
                      sx={{ bgcolor: '#34d399', fontWeight: 700, textTransform: 'none', borderRadius: 2, flex: 1 }}
                    >
                      🔓 Release Hold
                    </Button>
                    <Button
                      variant="outlined" onClick={handleCheckLegalHold}
                      sx={{ borderColor: '#818cf8', color: '#818cf8', fontWeight: 700, textTransform: 'none', borderRadius: 2, flex: 1 }}
                    >
                      🔍 Check
                    </Button>
                  </Box>

                  {legalHoldResult && (
                    <Box sx={{ mt: 1, p: 2, borderRadius: 2, bgcolor: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#f87171', mb: 0.5 }}>Legal Hold Status</Typography>
                      <Typography variant="body2" sx={{ color: '#e0e0e0' }}>
                        Email: <strong>{legalHoldResult.emailId}</strong>
                      </Typography>
                      {legalHoldResult.underLegalHold !== undefined && (
                        <Typography variant="body2" sx={{ color: legalHoldResult.underLegalHold ? '#f87171' : '#34d399', fontWeight: 700 }}>
                          {legalHoldResult.underLegalHold ? '⚠️ Under Legal Hold' : '✅ Not Under Legal Hold'}
                        </Typography>
                      )}
                      {legalHoldResult.legalHoldStatus && (
                        <Typography variant="body2" sx={{ color: '#fbbf24', fontWeight: 600 }}>
                          {legalHoldResult.legalHoldStatus}
                        </Typography>
                      )}
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Encryption Key Management */}
            <Grid item xs={12}>
              <Card sx={sectionStyle}>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#c084fc', mb: 2 }}>🔐 Encryption Key Management</Typography>
                  <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2 }} />
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={4}>
                      <TextField
                        fullWidth size="small" placeholder="Archive ID"
                        value={encryptionForm.archiveId}
                        onChange={(e) => setEncryptionForm(prev => ({ ...prev, archiveId: e.target.value }))}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, color: '#e0e0e0' } }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField
                        fullWidth size="small" placeholder="Encryption Key (AES-256-GCM)"
                        type="password"
                        value={encryptionForm.encryptionKey}
                        onChange={(e) => setEncryptionForm(prev => ({ ...prev, encryptionKey: e.target.value }))}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, color: '#e0e0e0' } }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Button
                        fullWidth variant="contained" onClick={handleStoreEncryptionKey}
                        sx={{ bgcolor: '#c084fc', fontWeight: 700, textTransform: 'none', borderRadius: 2, py: 1.2 }}
                      >
                        🔐 Store Key
                      </Button>
                    </Grid>
                  </Grid>

                  {encryptionResult && (
                    <Box sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: 'rgba(192,132,252,0.08)', border: '1px solid rgba(192,132,252,0.2)' }}>
                      <Typography variant="body2" sx={{ color: '#c084fc', fontWeight: 600 }}>
                        ✅ Key stored for archive <strong>{encryptionResult.archiveId}</strong> · Algorithm: {encryptionResult.algorithm}
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* DIALOGS */}
      {/* ══════════════════════════════════════════════════════════ */}

      {/* New Archive Dialog */}
      <Dialog open={archiveDialogOpen} onClose={() => setArchiveDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>🗄️ Create New Archive</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth margin="dense" label="Email ID"
            value={archiveForm.emailId}
            onChange={(e) => setArchiveForm(prev => ({ ...prev, emailId: e.target.value }))}
            placeholder="e.g. EML-001 or leave blank for auto-generated"
          />
          <TextField
            fullWidth margin="dense" label="Email Content" multiline rows={5}
            value={archiveForm.content}
            onChange={(e) => setArchiveForm(prev => ({ ...prev, content: e.target.value }))}
            placeholder="Paste the email content to archive..."
          />
          <FormControl fullWidth margin="dense">
            <InputLabel>Retention Period</InputLabel>
            <Select
              value={archiveForm.retentionDays}
              label="Retention Period"
              onChange={(e) => setArchiveForm(prev => ({ ...prev, retentionDays: e.target.value }))}
            >
              <MenuItem value={30}>30 Days (Short-Term)</MenuItem>
              <MenuItem value={90}>90 Days (Standard)</MenuItem>
              <MenuItem value={365}>1 Year (Extended)</MenuItem>
              <MenuItem value={2555}>7 Years (Compliance)</MenuItem>
              <MenuItem value={99999}>Permanent</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setArchiveDialogOpen(false)} sx={{ color: '#94a3b8' }}>Cancel</Button>
          <Button
            variant="contained" onClick={handleArchiveEmail}
            disabled={!archiveForm.content.trim()}
            sx={{ bgcolor: '#6366f1', fontWeight: 700 }}
          >
            Archive
          </Button>
        </DialogActions>
      </Dialog>

      {/* Content Viewer Dialog */}
      <Dialog open={contentViewerOpen} onClose={() => setContentViewerOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>👁️ Archived Content Viewer</DialogTitle>
        <DialogContent>
          {contentLoading ? (
            <Box display="flex" justifyContent="center" py={6}><CircularProgress sx={{ color: '#818cf8' }} /></Box>
          ) : viewingContent ? (
            <Box>
              <Box sx={{ mb: 2, p: 2, borderRadius: 2, bgcolor: '#f1f5f9' }}>
                <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>Archive ID: <strong>{viewingContent.archiveId}</strong></Typography>
                <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>Email ID: <strong>{viewingContent.originalEmailId}</strong></Typography>
                <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>Checksum: <strong>{viewingContent.checksum}</strong></Typography>
                <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>Archived At: <strong>{viewingContent.archivedAt}</strong></Typography>
              </Box>
              <Paper sx={{ p: 3, bgcolor: '#0f172a', color: '#e2e8f0', borderRadius: 2, fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
                {viewingContent.decompressedContent}
              </Paper>
            </Box>
          ) : (
            <Typography variant="body2" sx={{ color: '#64748b', fontStyle: 'italic' }}>No content loaded.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setContentViewerOpen(false)} sx={{ color: '#94a3b8' }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Restore Dialog */}
      <Dialog open={restoreDialogOpen} onClose={() => setRestoreDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>🔄 Restore from Snapshot</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#94a3b8', mb: 2 }}>
            Enter the Snapshot ID to restore data from a previous backup point.
          </Typography>
          <TextField
            fullWidth margin="dense" label="Snapshot ID"
            value={restoreSnapshotId}
            onChange={(e) => setRestoreSnapshotId(e.target.value)}
            placeholder="e.g. SNAP-a1b2c3d4"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestoreDialogOpen(false)} sx={{ color: '#94a3b8' }}>Cancel</Button>
          <Button
            variant="contained" onClick={handleRestoreSnapshot}
            disabled={!restoreSnapshotId.trim()}
            sx={{ bgcolor: '#8b5cf6', fontWeight: 700 }}
          >
            Restore
          </Button>
        </DialogActions>
      </Dialog>

      {/* Encryption Dialog */}
      <Dialog open={encryptionDialogOpen} onClose={() => setEncryptionDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>🔐 Store Encryption Key</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth margin="dense" label="Archive ID"
            value={encryptionForm.archiveId}
            onChange={(e) => setEncryptionForm(prev => ({ ...prev, archiveId: e.target.value }))}
          />
          <TextField
            fullWidth margin="dense" label="Encryption Key" type="password"
            value={encryptionForm.encryptionKey}
            onChange={(e) => setEncryptionForm(prev => ({ ...prev, encryptionKey: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEncryptionDialogOpen(false)} sx={{ color: '#94a3b8' }}>Cancel</Button>
          <Button variant="contained" onClick={handleStoreEncryptionKey} sx={{ bgcolor: '#c084fc', fontWeight: 700 }}>
            Store Key
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Toast ────────────────────────────────────────── */}
      <Snackbar
        open={toast.open} autoHideDuration={4000}
        onClose={() => setToast(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setToast(prev => ({ ...prev, open: false }))}
          severity={toast.severity} variant="filled"
          sx={{ borderRadius: 3, fontWeight: 600 }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

// ── Local Helpers ─────────────────────────────────────────────
function retentionPolicyManager_local(record) {
  if (!record || !record.archivedAt) return false;
  const archivedDate = new Date(record.archivedAt);
  const now = new Date();
  const expirationDate = new Date(archivedDate.getTime() + record.retentionDays * 24 * 60 * 60 * 1000);
  return now > expirationDate;
}

export default BackupArchiveDashboard;
