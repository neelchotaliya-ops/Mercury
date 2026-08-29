import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { ModalHeader } from '@/components/ui/modal-header';
import { AccountPicker } from '@/components/finance/account-picker';
import { CategoryPicker } from '@/components/finance/category-picker';
import { useFinance } from '@/context/finance-context';
import { formatCurrency, getCurrencySymbol } from '@/utils/currency';
import { haptics } from '@/utils/haptics';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import {
  BankFormat,
  ParsedBankTransaction,
  detectBankFormat,
  parseBankRow,
} from '@/utils/bank-statement';
import { detectDuplicates, applyBankImport } from '@/db/bank-import';

/** Helper to parse a CSV text string into headers and row objects. */
function parseCsvText(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };

  // Parse simple or quote-wrapped CSV line
  const parseLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim().replace(/^"|"$/g, ''));
    return values;
  };

  // Find header row (sometimes banks put preamble rows like account number on top)
  let headerIndex = 0;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const cols = parseLine(lines[i]);
    const lower = cols.map(c => c.toLowerCase());
    if (lower.some(c => c.includes('date') || c.includes('narration') || c.includes('particulars') || c.includes('description') || c.includes('amount'))) {
      headerIndex = i;
      break;
    }
  }

  const headers = parseLine(lines[headerIndex]);
  const rows: Record<string, string>[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.length < 2) continue;
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx] ?? '';
    });
    rows.push(rowObj);
  }

  return { headers, rows };
}

type Step = 'pick' | 'map' | 'review' | 'importing' | 'complete';

export default function BankImportScreen() {
  const router = useRouter();
  const { state } = useFinance();

  const [step, setStep] = useState<Step>('pick');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [detectedFormat, setDetectedFormat] = useState<BankFormat | null>(null);

  // Mapping state
  const [dateCol, setDateCol] = useState('');
  const [descCol, setDescCol] = useState('');
  const [amountLayoutType, setAmountLayoutType] = useState<'split' | 'signed'>('split');
  const [debitCol, setDebitCol] = useState('');
  const [creditCol, setCreditCol] = useState('');
  const [amountCol, setAmountCol] = useState('');

  const [accountId, setAccountId] = useState<string | undefined>(state.accounts[0]?.id);
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);

  // Review & Dedup state
  const [parsedRows, setParsedRows] = useState<ParsedBankTransaction[]>([]);
  const [duplicates, setDuplicates] = useState<Map<string, boolean>>(new Map());
  const [excludedFingerprints, setExcludedFingerprints] = useState<Set<string>>(new Set());

  // Import progress
  const [importProgress, setImportProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const currency = state.settings.currency ?? 'INR';

  // Handle picking a document
  const handlePickDocument = async () => {
    try {
      setLoading(true);
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (picked.canceled || !picked.assets?.length) {
        setLoading(false);
        return;
      }

      const asset = picked.assets[0];
      setFileName(asset.name ?? 'statement.csv');

      // Read text content
      const file = new File(asset.uri);
      const content = await file.text();

      const { headers: parsedHeaders, rows: parsedDataRows } = parseCsvText(content);

      if (parsedHeaders.length === 0 || parsedDataRows.length === 0) {
        Alert.alert('Empty File', 'Could not find any data rows in this CSV.');
        setLoading(false);
        return;
      }

      setHeaders(parsedHeaders);
      setRawRows(parsedDataRows);

      // Auto-detect format
      const detected = detectBankFormat(parsedHeaders);
      setDetectedFormat(detected);

      if (detected) {
        setDateCol(detected.dateCol);
        setDescCol(detected.descriptionCol);
        if (detected.amountLayout.kind === 'split') {
          setAmountLayoutType('split');
          setDebitCol(detected.amountLayout.debitCol);
          setCreditCol(detected.amountLayout.creditCol);
        } else if (detected.amountLayout.kind === 'signed') {
          setAmountLayoutType('signed');
          setAmountCol(detected.amountLayout.amountCol);
        } else if (detected.amountLayout.kind === 'withIndicator') {
          setAmountLayoutType('signed');
          setAmountCol(detected.amountLayout.amountCol);
        }
      } else {
        // Defaults
        setDateCol(parsedHeaders[0] ?? '');
        setDescCol(parsedHeaders[1] ?? '');
        setDebitCol(parsedHeaders[2] ?? '');
        setCreditCol(parsedHeaders[3] ?? '');
      }

      haptics.success();
      setStep('map');
    } catch (e) {
      Alert.alert('File Error', 'Could not read the selected file. Please make sure it is a valid CSV.');
    } finally {
      setLoading(false);
    }
  };

  // Build the active BankFormat from user choices
  const activeFormat: BankFormat = useMemo(() => {
    if (amountLayoutType === 'split') {
      return {
        bankName: detectedFormat?.bankName ?? 'Custom Mapping',
        dateCol,
        descriptionCol: descCol,
        amountLayout: { kind: 'split', debitCol, creditCol },
      };
    }
    return {
      bankName: detectedFormat?.bankName ?? 'Custom Mapping',
      dateCol,
      descriptionCol: descCol,
      amountLayout: { kind: 'signed', amountCol, positiveIsCredit: true },
    };
  }, [detectedFormat, dateCol, descCol, amountLayoutType, debitCol, creditCol, amountCol]);

  // Proceed from mapping to review & dedup
  const handleProceedToReview = async () => {
    if (!dateCol || !descCol || !accountId) {
      Alert.alert('Incomplete Mapping', 'Please select Date, Description, and an Account.');
      return;
    }

    setLoading(true);
    try {
      // Parse all rows
      const parsed: ParsedBankTransaction[] = [];
      for (const row of rawRows) {
        const item = parseBankRow(row, activeFormat);
        if (item) parsed.push(item);
      }

      if (parsed.length === 0) {
        Alert.alert(
          'No Valid Rows',
          'Could not parse any transactions with the selected columns. Please check your column mappings.'
        );
        setLoading(false);
        return;
      }

      setParsedRows(parsed);

      // Check duplicates against SQLite
      const db = await getDb();
      const dedupResult = await detectDuplicates(db, parsed);
      setDuplicates(dedupResult.duplicates);

      // By default, exclude duplicates
      const excluded = new Set<string>();
      dedupResult.duplicates.forEach((isDup, fp) => {
        if (isDup) excluded.add(fp);
      });
      setExcludedFingerprints(excluded);

      haptics.selection();
      setStep('review');
    } catch (e) {
      Alert.alert('Error', 'Failed to parse transactions.');
    } finally {
      setLoading(false);
    }
  };

  // Toggle exclusion of a row in the review screen
  const toggleRowInclusion = (fp: string) => {
    haptics.press();
    setExcludedFingerprints(prev => {
      const next = new Set(prev);
      if (next.has(fp)) next.delete(fp);
      else next.add(fp);
      return next;
    });
  };

  // Start the import
  const handleStartImport = async () => {
    if (!accountId || parsedRows.length === 0) return;

    setStep('importing');
    setImportProgress({ current: 0, total: parsedRows.length });

    try {
      const db = await getDb();
      const result = await applyBankImport(db, parsedRows, {
        accountId,
        defaultCategoryId: categoryId,
        skipFingerprints: excludedFingerprints,
        onProgress: (current, total) => {
          setImportProgress({ current, total });
        },
      });

      if (result.errors > 0) {
        haptics.warning();
      } else {
        haptics.success();
      }
      setImportResult({ imported: result.imported, skipped: result.skipped, errors: result.errors });
      setStep('complete');
    } catch {
      Alert.alert('Import Failed', 'An error occurred during bulk import.');
      setStep('review');
    }
  };

  const selectedCount = parsedRows.length - excludedFingerprints.size;

  return (
    <GradientScreen edges={['top', 'bottom']} contours="top">
      <ModalHeader
        title={
          step === 'pick'
            ? 'Import Bank Statement'
            : step === 'map'
            ? 'Map CSV Columns'
            : step === 'review'
            ? 'Review & Import'
            : 'Importing Transactions'
        }
        onClose={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.content}>
        {/* STEP 1: PICK */}
        {step === 'pick' && (
          <GlassCard padding={22} style={styles.pickCard}>
            <View style={styles.iconCircle}>
              <Ionicons name="document-text-outline" size={38} color={Colors.primary} />
            </View>
            <AppText variant="h3" style={{ textAlign: 'center', marginTop: 12 }}>
              Import Bank Statement (CSV)
            </AppText>
            <AppText variant="body" color={Colors.textSecondary} style={{ textAlign: 'center', marginTop: 6, lineHeight: 22 }}>
              Download your statement in CSV format from your online banking portal (SBI, HDFC, ICICI, Axis, Kotak, etc.) and upload it here.
            </AppText>

            <View style={styles.featuresList}>
              <View style={styles.featureItem}>
                <Ionicons name="sparkles" size={16} color={Colors.primary} />
                <AppText variant="caption" color={Colors.textPrimary} style={{ marginLeft: 8 }}>
                  Auto-detects bank column layouts & date formats
                </AppText>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="shield-checkmark" size={16} color={Colors.primary} />
                <AppText variant="caption" color={Colors.textPrimary} style={{ marginLeft: 8 }}>
                  Smart duplicate detection prevents double entries
                </AppText>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="flash" size={16} color={Colors.primary} />
                <AppText variant="caption" color={Colors.textPrimary} style={{ marginLeft: 8 }}>
                  Instant batch import into your selected account
                </AppText>
              </View>
            </View>

            <AppButton
              title={loading ? 'Reading file...' : 'Choose CSV File'}
              size="lg"
              onPress={handlePickDocument}
              disabled={loading}
              style={{ width: '100%', marginTop: 20 }}
            />
          </GlassCard>
        )}

        {/* STEP 2: MAP */}
        {step === 'map' && (
          <>
            {detectedFormat && (
              <GlassCard padding={14} style={styles.detectedBanner}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.income} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <AppText variant="bodyStrong" color={Colors.income}>
                    {detectedFormat.bankName}
                  </AppText>
                  <AppText variant="caption" color={Colors.textSecondary}>
                    {rawRows.length} rows found in {fileName}
                  </AppText>
                </View>
              </GlassCard>
            )}

            <GlassCard padding={18} style={styles.card}>
              <AppText variant="h3">Destination</AppText>

              <View style={styles.field}>
                <AppText variant="label">Import Into Account</AppText>
                <AccountPicker
                  accounts={state.accounts}
                  selectedId={accountId}
                  onSelect={a => setAccountId(a.id)}
                />
              </View>

              <View style={styles.field}>
                <AppText variant="label">Default Category (Optional)</AppText>
                <CategoryPicker
                  categories={state.categories.filter(c => c.kind === 'expense')}
                  selectedId={categoryId}
                  onSelect={c => setCategoryId(c.id)}
                  onManage={() => router.push('/manage-categories')}
                />
              </View>
            </GlassCard>

            <GlassCard padding={18} style={styles.card}>
              <AppText variant="h3">Column Mapping</AppText>

              {/* Date Column */}
              <View style={styles.field}>
                <AppText variant="label">Date Column</AppText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceChips}>
                  {headers.map(h => (
                    <Pressable
                      key={h}
                      onPress={() => setDateCol(h)}
                      style={[styles.choiceChip, dateCol === h && styles.choiceChipActive]}
                    >
                      <AppText variant="caption" color={dateCol === h ? '#FFFFFF' : Colors.textPrimary}>
                        {h}
                      </AppText>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Description Column */}
              <View style={styles.field}>
                <AppText variant="label">Description / Narration Column</AppText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceChips}>
                  {headers.map(h => (
                    <Pressable
                      key={h}
                      onPress={() => setDescCol(h)}
                      style={[styles.choiceChip, descCol === h && styles.choiceChipActive]}
                    >
                      <AppText variant="caption" color={descCol === h ? '#FFFFFF' : Colors.textPrimary}>
                        {h}
                      </AppText>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Amount Layout Type */}
              <View style={styles.field}>
                <AppText variant="label">Amount Format</AppText>
                <View style={styles.buttonToggleRow}>
                  <Pressable
                    onPress={() => setAmountLayoutType('split')}
                    style={[styles.toggleBtn, amountLayoutType === 'split' && styles.toggleBtnActive]}
                  >
                    <AppText variant="captionStrong" color={amountLayoutType === 'split' ? '#FFFFFF' : Colors.textPrimary}>
                      Separate Debit & Credit
                    </AppText>
                  </Pressable>
                  <Pressable
                    onPress={() => setAmountLayoutType('signed')}
                    style={[styles.toggleBtn, amountLayoutType === 'signed' && styles.toggleBtnActive]}
                  >
                    <AppText variant="captionStrong" color={amountLayoutType === 'signed' ? '#FFFFFF' : Colors.textPrimary}>
                      Single Amount Column
                    </AppText>
                  </Pressable>
                </View>
              </View>

              {amountLayoutType === 'split' ? (
                <>
                  <View style={styles.field}>
                    <AppText variant="label">Debit (Expense) Column</AppText>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceChips}>
                      {headers.map(h => (
                        <Pressable
                          key={h}
                          onPress={() => setDebitCol(h)}
                          style={[styles.choiceChip, debitCol === h && styles.choiceChipActive]}
                        >
                          <AppText variant="caption" color={debitCol === h ? '#FFFFFF' : Colors.textPrimary}>
                            {h}
                          </AppText>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>

                  <View style={styles.field}>
                    <AppText variant="label">Credit (Income) Column</AppText>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceChips}>
                      {headers.map(h => (
                        <Pressable
                          key={h}
                          onPress={() => setCreditCol(h)}
                          style={[styles.choiceChip, creditCol === h && styles.choiceChipActive]}
                        >
                          <AppText variant="caption" color={creditCol === h ? '#FFFFFF' : Colors.textPrimary}>
                            {h}
                          </AppText>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                </>
              ) : (
                <View style={styles.field}>
                  <AppText variant="label">Amount Column</AppText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceChips}>
                    {headers.map(h => (
                      <Pressable
                        key={h}
                        onPress={() => setAmountCol(h)}
                        style={[styles.choiceChip, amountCol === h && styles.choiceChipActive]}
                      >
                        <AppText variant="caption" color={amountCol === h ? '#FFFFFF' : Colors.textPrimary}>
                          {h}
                        </AppText>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
            </GlassCard>

            <AppButton
              title={loading ? 'Analyzing...' : 'Preview Transactions'}
              size="lg"
              onPress={handleProceedToReview}
              disabled={loading || !dateCol || !descCol}
              style={{ marginTop: 4 }}
            />
          </>
        )}

        {/* STEP 3: REVIEW */}
        {step === 'review' && (
          <>
            <GlassCard padding={16} style={styles.reviewSummaryCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <AppText variant="caption" color={Colors.textSecondary}>Ready to import</AppText>
                  <AppText variant="h1" color={Colors.textPrimary}>
                    {selectedCount} of {parsedRows.length} transactions
                  </AppText>
                </View>
                {duplicates.size > 0 && (
                  <View style={styles.dupBadge}>
                    <Ionicons name="alert-circle" size={14} color={Colors.expense} />
                    <AppText variant="captionStrong" color={Colors.expense} style={{ marginLeft: 4 }}>
                      {duplicates.size} duplicates flagged
                    </AppText>
                  </View>
                )}
              </View>
            </GlassCard>

            <GlassCard padding={16} style={styles.card}>
              <AppText variant="h3">Transaction Preview</AppText>

              <View style={styles.previewList}>
                {parsedRows.map((row, idx) => {
                  const isExcluded = excludedFingerprints.has(row.fingerprint);
                  const isDup = duplicates.get(row.fingerprint);
                  const isExpense = row.direction === 'expense';

                  return (
                    <Pressable
                      key={idx}
                      onPress={() => toggleRowInclusion(row.fingerprint)}
                      style={[
                        styles.previewItem,
                        isExcluded && styles.previewItemExcluded,
                      ]}
                    >
                      <Ionicons
                        name={!isExcluded ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={!isExcluded ? Colors.primary : Colors.textMuted}
                      />

                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <AppText variant="bodyStrong" numberOfLines={1}>
                          {row.description}
                        </AppText>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <AppText variant="caption" color={Colors.textMuted}>
                            {row.date}
                          </AppText>
                          {isDup && (
                            <View style={styles.inlineDupTag}>
                              <AppText variant="captionStrong" color={Colors.expense} style={{ fontSize: 10 }}>
                                Duplicate
                              </AppText>
                            </View>
                          )}
                        </View>
                      </View>

                      <AppText
                        variant="bodyStrong"
                        color={isExpense ? Colors.expense : Colors.income}
                      >
                        {isExpense ? '-' : '+'}{formatCurrency(row.amount, currency)}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </GlassCard>

            <AppButton
              title={`Import ${selectedCount} Transactions`}
              size="lg"
              onPress={handleStartImport}
              disabled={selectedCount === 0}
              style={{ marginTop: 4 }}
            />
          </>
        )}

        {/* STEP 4: IMPORTING */}
        {step === 'importing' && (
          <GlassCard padding={24} style={styles.importingCard}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <AppText variant="h3" style={{ marginTop: 14 }}>
              Importing Transactions...
            </AppText>
            <AppText variant="body" color={Colors.textSecondary} style={{ marginTop: 4 }}>
              {importProgress.current} of {importProgress.total} written
            </AppText>
            <View style={styles.importProgressBar}>
              <View
                style={[
                  styles.importProgressFill,
                  {
                    width: `${
                      importProgress.total > 0
                        ? (importProgress.current / importProgress.total) * 100
                        : 0
                    }%`,
                  },
                ]}
              />
            </View>
          </GlassCard>
        )}

        {/* STEP 5: COMPLETE */}
        {step === 'complete' && (() => {
          const totalFailure = (importResult?.imported ?? 0) === 0 && (importResult?.errors ?? 0) > 0;
          const partialFailure = !totalFailure && (importResult?.errors ?? 0) > 0;
          return (
            <GlassCard padding={24} style={styles.completeCard}>
              <View style={[styles.successIcon, totalFailure && styles.errorIcon]}>
                <Ionicons name={totalFailure ? 'warning' : 'checkmark'} size={36} color="#FFFFFF" />
              </View>
              <AppText variant="h3" style={{ marginTop: 14 }}>
                {totalFailure ? 'Import Failed' : 'Import Complete!'}
              </AppText>
              <AppText variant="body" color={Colors.textSecondary} style={{ textAlign: 'center', marginTop: 6 }}>
                {totalFailure
                  ? "None of the rows could be imported. Nothing was added to your account."
                  : `Successfully imported ${importResult?.imported} transaction(s).`}
                {importResult?.skipped ? ` ${importResult.skipped} duplicate(s) were skipped.` : ''}
              </AppText>
              {partialFailure ? (
                <AppText variant="captionStrong" color={Colors.expense} style={{ textAlign: 'center', marginTop: 8 }}>
                  {importResult?.errors} row(s) could not be imported.
                </AppText>
              ) : null}
              <AppButton
                title="Done"
                size="lg"
                onPress={() => router.back()}
                style={{ width: '100%', marginTop: 24 }}
              />
            </GlassCard>
          );
        })()}
      </ScrollView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: Spacing.md,
  },
  card: {
    gap: Spacing.md,
  },
  pickCard: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuresList: {
    width: '100%',
    gap: 10,
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderColor: Colors.divider,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.incomeSoft,
    borderColor: 'rgba(46, 169, 124, 0.3)',
  },
  field: {
    gap: 8,
  },
  choiceChips: {
    gap: 8,
    paddingVertical: 4,
  },
  choiceChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorderSoft,
  },
  choiceChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  buttonToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorderSoft,
  },
  toggleBtnActive: {
    backgroundColor: Colors.ctaBg,
    borderColor: Colors.ctaBg,
  },
  reviewSummaryCard: {
    backgroundColor: Colors.primarySoft,
    borderColor: 'rgba(139, 92, 246, 0.25)',
  },
  dupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.expenseSoft,
  },
  previewList: {
    gap: 8,
  },
  previewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(25, 21, 39, 0.03)',
  },
  previewItemExcluded: {
    opacity: 0.38,
  },
  inlineDupTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.expenseSoft,
  },
  importingCard: {
    alignItems: 'center',
    paddingVertical: 36,
  },
  importProgressBar: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.track,
    marginTop: 18,
    overflow: 'hidden',
  },
  importProgressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  completeCard: {
    alignItems: 'center',
    paddingVertical: 36,
  },
  successIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.income,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorIcon: {
    backgroundColor: Colors.expense,
  },
});
