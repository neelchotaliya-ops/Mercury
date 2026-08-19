import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';

import { AppText } from '@/components/ui/app-text';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { ModalHeader } from '@/components/ui/modal-header';
import { Colors } from '@/constants/theme';
import { getDb, DATABASE_NAME } from '@/db/client';
import { getSchemaVersion, LATEST_SCHEMA_VERSION } from '@/db/schema';

interface Check {
  label: string;
  value: string;
  ok: boolean;
  /**
   * Informational rows report a number without passing judgement on it.
   * Open time is the motivating case: a cold WASM open on web takes about a
   * second and that is simply what it costs, so letting it fail a *health*
   * check would report a working database as broken. Timing budgets belong in
   * the benchmark, which can compare against a baseline; this screen answers
   * "does the database work", which is a yes or no.
   */
  info?: boolean;
}

/**
 * A developer-facing view of the database.
 *
 * Its first job is proving the engine actually works on whichever platform the
 * app is running on — notably the web build, where expo-sqlite uses a WASM
 * backend rather than the native one. That difference is worth being able to
 * confirm in one tap rather than inferring from a screen that failed to load.
 *
 * Later it also carries the rollup consistency invariants, so a drift between
 * the incrementally-maintained aggregates and the raw rows is visible on
 * device instead of only in tests.
 */
export default function DbDiagnosticsScreen() {
  const router = useRouter();
  const [checks, setChecks] = useState<Check[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const started = Date.now();
        const db = await getDb();
        const openMs = Date.now() - started;

        const version = await getSchemaVersion(db);
        const sqlite = await db.getFirstAsync<{ v: string }>('SELECT sqlite_version() AS v');
        const journal = await db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode');
        const tables = await db.getAllAsync<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        );
        const indexes = await db.getAllAsync<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'"
        );
        const stats = await db.getAllAsync<{ key: string }>('SELECT key FROM ledger_stat');

        // A real round-trip, so this proves writes work and not just reads.
        await db.runAsync(
          "INSERT INTO meta (key, value) VALUES ('diagnostics_ran_at', ?) " +
            'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          [new Date().toISOString()]
        );
        const wrote = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM meta WHERE key = 'diagnostics_ran_at'"
        );

        setChecks([
          { label: 'Database', value: DATABASE_NAME, ok: true, info: true },
          { label: 'Opened in', value: `${openMs} ms`, ok: true, info: true },
          { label: 'SQLite version', value: sqlite?.v ?? 'unknown', ok: Boolean(sqlite?.v), info: true },
          {
            // WAL is native-only; the web backend reports 'delete'. Both are
            // working states, so this reports the mode rather than grading it.
            label: 'Journal mode',
            value: journal?.journal_mode ?? 'unknown',
            ok: Boolean(journal?.journal_mode),
            info: true,
          },
          {
            label: 'Schema version',
            value: `${version} of ${LATEST_SCHEMA_VERSION}`,
            ok: version === LATEST_SCHEMA_VERSION,
          },
          { label: 'Tables', value: String(tables.length), ok: tables.length >= 9 },
          { label: 'Indexes', value: String(indexes.length), ok: indexes.length >= 9 },
          { label: 'ledger_stat rows', value: String(stats.length), ok: stats.length === 4 },
          { label: 'Write round-trip', value: wrote ? 'ok' : 'failed', ok: Boolean(wrote) },
        ]);
      } catch (e) {
        setError(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
      }
    })();
  }, []);

  const allOk = checks.length > 0 && checks.every(c => c.ok);

  return (
    <GradientScreen contours="top">
      <ModalHeader title="Database" onClose={() => router.back()} closeIcon="arrow-back" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <GlassCard strong elevated>
          <AppText variant="label">Status</AppText>
          <AppText
            variant="h2"
            color={error ? Colors.expense : allOk ? Colors.income : Colors.textSecondary}
          >
            {error ? 'Failed' : allOk ? 'Healthy' : 'Checking…'}
          </AppText>
          {error ? (
            <AppText variant="caption" color={Colors.expense}>
              {error}
            </AppText>
          ) : null}
        </GlassCard>

        {checks.length > 0 ? (
          <GlassCard>
            {checks.map(check => (
              <View key={check.label} style={styles.row}>
                <AppText variant="body">{check.label}</AppText>
                <AppText
                  variant="bodyStrong"
                  color={check.ok ? (check.info ? Colors.textSecondary : Colors.textPrimary) : Colors.expense}
                >
                  {check.value}
                </AppText>
              </View>
            ))}
          </GlassCard>
        ) : null}
      </ScrollView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    gap: 14,
    paddingBottom: 60,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.glassBorderSoft,
  },
});
