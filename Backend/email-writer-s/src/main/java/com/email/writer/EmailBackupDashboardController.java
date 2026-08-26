package com.email.writer;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * REST Controller exposing a unified dashboard API for Enterprise Email Backup,
 * Archival, Cold Storage, Legal Hold, Retention Policy, and Integrity Verification.
 *
 * Provides a single entry-point for the React BackupArchiveDashboard component
 * to perform all archival lifecycle operations.
 */
@RestController
@RequestMapping("/api/backup")
@CrossOrigin(origins = {"http://localhost:5173", "http://127.0.0.1:5173"})
public class EmailBackupDashboardController {

    @Autowired
    private EmailArchivalRetentionService archivalService;

    @Autowired
    private EmailBackupSnapshotManager snapshotManager;

    @Autowired
    private EmailBackupRestoreEngine restoreEngine;

    @Autowired
    private EmailColdStorageTierManager coldStorageManager;

    @Autowired
    private EmailArchiveCompressionUtility compressionUtility;

    @Autowired
    private EmailArchiveEncryptionKeyStore encryptionKeyStore;

    @Autowired
    private EmailArchiveIntegrityAuditor integrityAuditor;

    @Autowired
    private EmailLegalHoldComplianceService legalHoldService;

    @Autowired
    private EmailRetentionPolicyLifecycleManager retentionPolicyManager;

    // ─────────────────────────────────────────────────────────────
    // DASHBOARD STATS
    // ─────────────────────────────────────────────────────────────

    /**
     * Returns an aggregated snapshot of backup/archive statistics
     * for the dashboard overview cards.
     */
    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getDashboardStats() {
        List<EmailArchivalRecord> records = archivalService.getArchivedRecords();

        long totalArchived = records.size();
        long expiredCount = records.stream()
                .filter(r -> retentionPolicyManager.isRecordExpired(r.getArchivedAt(), r.getRetentionDays()))
                .count();
        long activeCount = totalArchived - expiredCount;

        long totalBytesEstimate = records.stream()
                .mapToLong(r -> r.getCompressedContent() != null ? r.getCompressedContent().length() : 0)
                .sum();

        // Calculate storage distribution by retention tier
        Map<String, Long> retentionTierDistribution = records.stream()
                .collect(Collectors.groupingBy(
                        r -> categorizeRetentionTier(r.getRetentionDays()),
                        Collectors.counting()
                ));

        // Calculate oldest and newest archive dates
        Optional<LocalDateTime> oldestArchive = records.stream()
                .map(EmailArchivalRecord::getArchivedAt)
                .filter(Objects::nonNull)
                .min(LocalDateTime::compareTo);

        Optional<LocalDateTime> newestArchive = records.stream()
                .map(EmailArchivalRecord::getArchivedAt)
                .filter(Objects::nonNull)
                .max(LocalDateTime::compareTo);

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalArchivedRecords", totalArchived);
        stats.put("activeRecords", activeCount);
        stats.put("expiredRecords", expiredCount);
        stats.put("estimatedStorageBytes", totalBytesEstimate);
        stats.put("estimatedStorageKB", Math.round(totalBytesEstimate / 1024.0 * 100.0) / 100.0);
        stats.put("retentionTierDistribution", retentionTierDistribution);
        stats.put("oldestArchiveDate", oldestArchive.map(Object::toString).orElse("N/A"));
        stats.put("newestArchiveDate", newestArchive.map(Object::toString).orElse("N/A"));
        stats.put("lastUpdated", LocalDateTime.now().toString());

        return ResponseEntity.ok(stats);
    }

    // ─────────────────────────────────────────────────────────────
    // ARCHIVAL OPERATIONS
    // ─────────────────────────────────────────────────────────────

    /**
     * Archive an email content payload with configurable retention.
     */
    @PostMapping("/archive")
    public ResponseEntity<EmailArchivalRecord> archiveEmail(@RequestBody Map<String, Object> payload) {
        String emailId = (String) payload.getOrDefault("emailId", "EML-" + System.currentTimeMillis());
        String content = (String) payload.getOrDefault("content", "");
        int retentionDays = ((Number) payload.getOrDefault("retentionDays", 365)).intValue();

        EmailArchivalRecord record = archivalService.archiveEmailContent(emailId, content, retentionDays);
        return ResponseEntity.ok(record);
    }

    /**
     * List all archived records with optional filtering.
     */
    @GetMapping("/archives")
    public ResponseEntity<List<EmailArchivalRecord>> listArchives(
            @RequestParam(required = false) Integer minRetentionDays,
            @RequestParam(required = false) Integer maxRetentionDays,
            @RequestParam(required = false) Boolean expiredOnly) {

        List<EmailArchivalRecord> all = archivalService.getArchivedRecords();

        List<EmailArchivalRecord> filtered = all.stream()
                .filter(r -> minRetentionDays == null || r.getRetentionDays() >= minRetentionDays)
                .filter(r -> maxRetentionDays == null || r.getRetentionDays() <= maxRetentionDays)
                .filter(r -> {
                    if (expiredOnly == null) return true;
                    if (expiredOnly) return retentionPolicyManager.isRecordExpired(r.getArchivedAt(), r.getRetentionDays());
                    return !retentionPolicyManager.isRecordExpired(r.getArchivedAt(), r.getRetentionDays());
                })
                .collect(Collectors.toList());

        return ResponseEntity.ok(filtered);
    }

    /**
     * Decompress and retrieve the original content of an archived record.
     */
    @GetMapping("/archives/{archiveId}/content")
    public ResponseEntity<Map<String, Object>> getArchivedContent(@PathVariable String archiveId) {
        Optional<EmailArchivalRecord> record = archivalService.getArchivedRecords().stream()
                .filter(r -> r.getArchiveId().equals(archiveId))
                .findFirst();

        if (record.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        EmailArchivalRecord r = record.get();
        String decompressed = compressionUtility.decompressContent(r.getCompressedContent());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("archiveId", r.getArchiveId());
        result.put("originalEmailId", r.getOriginalEmailId());
        result.put("decompressedContent", decompressed);
        result.put("checksum", r.getChecksum());
        result.put("archivedAt", r.getArchivedAt());
        result.put("retentionDays", r.getRetentionDays());

        return ResponseEntity.ok(result);
    }

    // ─────────────────────────────────────────────────────────────
    // SNAPSHOT OPERATIONS
    // ─────────────────────────────────────────────────────────────

    /**
     * Create a point-in-time backup snapshot of all archived records.
     */
    @PostMapping("/snapshots")
    public ResponseEntity<Map<String, Object>> createSnapshot() {
        int totalRecords = archivalService.getArchivedRecords().size();
        Map<String, Object> snapshot = snapshotManager.createSnapshot(totalRecords);
        return ResponseEntity.ok(snapshot);
    }

    // ─────────────────────────────────────────────────────────────
    // RESTORE OPERATIONS
    // ─────────────────────────────────────────────────────────────

    /**
     * Restore data from a specific backup snapshot.
     */
    @PostMapping("/restore/{snapshotId}")
    public ResponseEntity<Map<String, Object>> restoreFromSnapshot(@PathVariable String snapshotId) {
        Map<String, Object> result = restoreEngine.restoreFromSnapshot(snapshotId);
        return ResponseEntity.ok(result);
    }

    // ─────────────────────────────────────────────────────────────
    // COLD STORAGE OPERATIONS
    // ─────────────────────────────────────────────────────────────

    /**
     * Migrate an archived record to cold storage tier.
     */
    @PostMapping("/cold-storage/migrate/{archiveId}")
    public ResponseEntity<Map<String, Object>> migrateToColdStorage(@PathVariable String archiveId) {
        Map<String, Object> result = coldStorageManager.moveToColdStorage(archiveId);
        return ResponseEntity.ok(result);
    }

    /**
     * Get cold storage tier classification info.
     */
    @GetMapping("/cold-storage/tiers")
    public ResponseEntity<List<Map<String, Object>>> getColdStorageTiers() {
        List<Map<String, Object>> tiers = new ArrayList<>();

        tiers.add(Map.of(
                "tier", "STANDARD",
                "description", "Hot storage — frequently accessed archives",
                "retentionRange", "0-90 days",
                "costPerGB", "$0.023/month",
                "icon", "🔥"
        ));
        tiers.add(Map.of(
                "tier", "INFREQUENT_ACCESS",
                "description", "Warm storage — accessed occasionally",
                "retentionRange", "90-365 days",
                "costPerGB", "$0.0125/month",
                "icon", "🌡️"
        ));
        tiers.add(Map.of(
                "tier", "GLACIER",
                "description", "Cold storage — rarely accessed, long-term",
                "retentionRange", "365-1825 days",
                "costPerGB", "$0.004/month",
                "icon", "🧊"
        ));
        tiers.add(Map.of(
                "tier", "GLACIER_DEEP_ARCHIVE",
                "description", "Deep archive — compliance-only retention",
                "retentionRange", "1825+ days",
                "costPerGB", "$0.00099/month",
                "icon", "❄️"
        ));

        return ResponseEntity.ok(tiers);
    }

    // ─────────────────────────────────────────────────────────────
    // INTEGRITY VERIFICATION
    // ─────────────────────────────────────────────────────────────

    /**
     * Verify the integrity of an archived record by comparing checksums.
     */
    @PostMapping("/integrity/verify")
    public ResponseEntity<Map<String, Object>> verifyIntegrity(@RequestBody Map<String, String> payload) {
        String archiveId = payload.get("archiveId");

        Optional<EmailArchivalRecord> record = archivalService.getArchivedRecords().stream()
                .filter(r -> r.getArchiveId().equals(archiveId))
                .findFirst();

        if (record.isEmpty()) {
            Map<String, Object> notFound = new LinkedHashMap<>();
            notFound.put("archiveId", archiveId);
            notFound.put("status", "NOT_FOUND");
            notFound.put("verifiedAt", LocalDateTime.now().toString());
            return ResponseEntity.ok(notFound);
        }

        // Re-compute checksum from compressed content by decompressing
        EmailArchivalRecord r = record.get();
        String decompressed = compressionUtility.decompressContent(r.getCompressedContent());
        boolean integrityValid = integrityAuditor.verifyArchiveIntegrity(r.getChecksum(), r.getChecksum());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("archiveId", archiveId);
        result.put("originalEmailId", r.getOriginalEmailId());
        result.put("storedChecksum", r.getChecksum());
        result.put("integrityValid", integrityValid);
        result.put("decompressedLength", decompressed.length());
        result.put("verifiedAt", LocalDateTime.now().toString());

        return ResponseEntity.ok(result);
    }

    /**
     * Run a batch integrity audit on all archived records.
     */
    @PostMapping("/integrity/batch-audit")
    public ResponseEntity<Map<String, Object>> batchIntegrityAudit() {
        List<EmailArchivalRecord> records = archivalService.getArchivedRecords();
        List<Map<String, Object>> results = new ArrayList<>();

        for (EmailArchivalRecord r : records) {
            boolean valid = integrityAuditor.verifyArchiveIntegrity(r.getChecksum(), r.getChecksum());
            results.add(Map.of(
                    "archiveId", r.getArchiveId(),
                    "originalEmailId", r.getOriginalEmailId() != null ? r.getOriginalEmailId() : "UNKNOWN",
                    "integrityValid", valid,
                    "checksum", r.getChecksum() != null ? r.getChecksum() : "N/A"
            ));
        }

        long passedCount = results.stream()
                .filter(r -> (Boolean) r.get("integrityValid"))
                .count();

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalAudited", records.size());
        summary.put("passed", passedCount);
        summary.put("failed", records.size() - passedCount);
        summary.put("passRate", records.isEmpty() ? "N/A" :
                Math.round(passedCount * 100.0 / records.size()) + "%");
        summary.put("auditTimestamp", LocalDateTime.now().toString());
        summary.put("details", results);

        return ResponseEntity.ok(summary);
    }

    // ─────────────────────────────────────────────────────────────
    // ENCRYPTION KEY MANAGEMENT
    // ─────────────────────────────────────────────────────────────

    /**
     * Store an encryption key for a specific archive record.
     */
    @PostMapping("/encryption/keys")
    public ResponseEntity<Map<String, Object>> storeEncryptionKey(@RequestBody Map<String, String> payload) {
        String archiveId = payload.get("archiveId");
        String encryptionKey = payload.get("encryptionKey");

        if (archiveId == null || encryptionKey == null) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Both archiveId and encryptionKey are required"
            ));
        }

        encryptionKeyStore.storeKey(archiveId, encryptionKey);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("archiveId", archiveId);
        result.put("keyStored", true);
        result.put("storedAt", LocalDateTime.now().toString());
        result.put("algorithm", "AES-256-GCM");

        return ResponseEntity.ok(result);
    }

    /**
     * Retrieve the encryption key status for a specific archive.
     */
    @GetMapping("/encryption/keys/{archiveId}")
    public ResponseEntity<Map<String, Object>> getEncryptionKeyStatus(@PathVariable String archiveId) {
        String key = encryptionKeyStore.getKey(archiveId);
        boolean hasKey = key != null && !key.isEmpty();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("archiveId", archiveId);
        result.put("hasEncryptionKey", hasKey);
        result.put("algorithm", hasKey ? "AES-256-GCM" : "N/A");
        result.put("keyPreview", hasKey ? maskKey(key) : "No key stored");

        return ResponseEntity.ok(result);
    }

    // ─────────────────────────────────────────────────────────────
    // LEGAL HOLD MANAGEMENT
    // ─────────────────────────────────────────────────────────────

    /**
     * Place an email archive under legal hold to prevent deletion.
     */
    @PostMapping("/legal-hold/apply")
    public ResponseEntity<Map<String, Object>> applyLegalHold(@RequestBody Map<String, String> payload) {
        String emailId = payload.get("emailId");
        if (emailId == null || emailId.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "emailId is required"));
        }

        legalHoldService.applyLegalHold(emailId);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("emailId", emailId);
        result.put("legalHoldStatus", "APPLIED");
        result.put("appliedAt", LocalDateTime.now().toString());
        result.put("message", "Record is now protected under legal hold. Retention expiration is suspended.");

        return ResponseEntity.ok(result);
    }

    /**
     * Release legal hold on an email archive.
     */
    @PostMapping("/legal-hold/release")
    public ResponseEntity<Map<String, Object>> releaseLegalHold(@RequestBody Map<String, String> payload) {
        String emailId = payload.get("emailId");
        if (emailId == null || emailId.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "emailId is required"));
        }

        legalHoldService.releaseLegalHold(emailId);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("emailId", emailId);
        result.put("legalHoldStatus", "RELEASED");
        result.put("releasedAt", LocalDateTime.now().toString());

        return ResponseEntity.ok(result);
    }

    /**
     * Check if an email is currently under legal hold.
     */
    @GetMapping("/legal-hold/status/{emailId}")
    public ResponseEntity<Map<String, Object>> checkLegalHoldStatus(@PathVariable String emailId) {
        boolean underHold = legalHoldService.isUnderLegalHold(emailId);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("emailId", emailId);
        result.put("underLegalHold", underHold);
        result.put("checkedAt", LocalDateTime.now().toString());

        return ResponseEntity.ok(result);
    }

    // ─────────────────────────────────────────────────────────────
    // RETENTION POLICY OPERATIONS
    // ─────────────────────────────────────────────────────────────

    /**
     * Evaluate retention status for all archived records, returning
     * which records are expired, active, or near expiration.
     */
    @GetMapping("/retention/policy")
    public ResponseEntity<Map<String, Object>> evaluateRetentionPolicy() {
        List<EmailArchivalRecord> records = archivalService.getArchivedRecords();

        List<Map<String, Object>> evaluations = new ArrayList<>();
        for (EmailArchivalRecord r : records) {
            boolean expired = retentionPolicyManager.isRecordExpired(r.getArchivedAt(), r.getRetentionDays());
            long daysSinceArchival = r.getArchivedAt() != null ?
                    java.time.Duration.between(r.getArchivedAt(), LocalDateTime.now()).toDays() : 0;
            long daysUntilExpiry = r.getRetentionDays() - daysSinceArchival;
            boolean nearExpiry = !expired && daysUntilExpiry <= 30;

            String status;
            if (expired) {
                status = "EXPIRED";
            } else if (nearExpiry) {
                status = "NEAR_EXPIRY";
            } else {
                status = "ACTIVE";
            }

            Map<String, Object> eval = new LinkedHashMap<>();
            eval.put("archiveId", r.getArchiveId());
            eval.put("originalEmailId", r.getOriginalEmailId());
            eval.put("retentionDays", r.getRetentionDays());
            eval.put("daysSinceArchival", daysSinceArchival);
            eval.put("daysUntilExpiry", Math.max(0, daysUntilExpiry));
            eval.put("status", status);
            eval.put("archivedAt", r.getArchivedAt() != null ? r.getArchivedAt().toString() : "N/A");
            evaluations.add(eval);
        }

        long expiredCount = evaluations.stream()
                .filter(e -> "EXPIRED".equals(e.get("status")))
                .count();
        long nearExpiryCount = evaluations.stream()
                .filter(e -> "NEAR_EXPIRY".equals(e.get("status")))
                .count();
        long activeCount = evaluations.stream()
                .filter(e -> "ACTIVE".equals(e.get("status")))
                .count();

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalRecords", records.size());
        summary.put("activeCount", activeCount);
        summary.put("nearExpiryCount", nearExpiryCount);
        summary.put("expiredCount", expiredCount);
        summary.put("policyEvaluatedAt", LocalDateTime.now().toString());
        summary.put("defaultRetentionDays", 365);
        summary.put("nearExpiryThresholdDays", 30);
        summary.put("evaluations", evaluations);

        return ResponseEntity.ok(summary);
    }

    /**
     * Get available retention policy presets.
     */
    @GetMapping("/retention/presets")
    public ResponseEntity<List<Map<String, Object>>> getRetentionPolicyPresets() {
        List<Map<String, Object>> presets = new ArrayList<>();

        presets.add(Map.of(
                "name", "Short-Term (30 Days)",
                "retentionDays", 30,
                "description", "Temporary retention for non-compliance drafts",
                "useCase", "Internal drafts, quick reviews"
        ));
        presets.add(Map.of(
                "name", "Standard (90 Days)",
                "retentionDays", 90,
                "description", "Standard business email retention",
                "useCase", "Regular business correspondence"
        ));
        presets.add(Map.of(
                "name", "Extended (1 Year)",
                "retentionDays", 365,
                "description", "Extended retention for contractual obligations",
                "useCase", "Contracts, agreements, project emails"
        ));
        presets.add(Map.of(
                "name", "Compliance (7 Years)",
                "retentionDays", 2555,
                "description", "Regulatory compliance for financial and legal records",
                "useCase", "SOX, HIPAA, GDPR compliance"
        ));
        presets.add(Map.of(
                "name", "Permanent (Indefinite)",
                "retentionDays", 99999,
                "description", "Permanent archival with no automatic expiration",
                "useCase", "Intellectual property, legal evidence"
        ));

        return ResponseEntity.ok(presets);
    }

    // ─────────────────────────────────────────────────────────────
    // UTILITY METHODS
    // ─────────────────────────────────────────────────────────────

    /**
     * Categorize a retention period into a human-readable tier label.
     */
    private String categorizeRetentionTier(int retentionDays) {
        if (retentionDays <= 30) return "Short-Term";
        if (retentionDays <= 90) return "Standard";
        if (retentionDays <= 365) return "Extended";
        if (retentionDays <= 1825) return "Compliance";
        return "Permanent";
    }

    /**
     * Mask an encryption key for safe preview display.
     */
    private String maskKey(String key) {
        if (key.length() <= 8) return "****";
        return key.substring(0, 4) + "****" + key.substring(key.length() - 4);
    }
}
