const { withGradleProperties } = require('@expo/config-plugins');

/**
 * Raises the Android AsyncStorage database cap.
 *
 * AsyncStorage on Android is backed by SQLite and ships a **6 MB** default
 * limit (`getDatabaseSize()` in the package's own `android/config.gradle`).
 * Mercury stores the entire ledger as one JSON blob under one key, and at
 * roughly 200-260 bytes per serialized transaction that ceiling arrives at
 * about 25-30k transactions. Past it every write throws, and until recently
 * the failure was swallowed, so the user simply lost data.
 *
 * 50 MB buys roughly 250k transactions of headroom. That is a stopgap, not the
 * fix — the real fix is moving the ledger into its own SQLite database with
 * indexes and pagination, which is in progress. This exists so users on the
 * current build stop losing data in the meantime.
 *
 * The project uses CNG (there is no checked-in `android/` directory), so this
 * has to be a config plugin rather than an edit to `gradle.properties`.
 * Requires a native rebuild (`npx expo prebuild --clean` / `expo run:android`).
 */
const PROPERTY = 'AsyncStorage_db_size_in_MB';
const SIZE_MB = '50';

module.exports = function withAsyncStorageSize(config) {
  return withGradleProperties(config, gradleConfig => {
    const properties = gradleConfig.modResults.filter(
      item => !(item.type === 'property' && item.key === PROPERTY)
    );

    properties.push({ type: 'property', key: PROPERTY, value: SIZE_MB });

    gradleConfig.modResults = properties;
    return gradleConfig;
  });
};
