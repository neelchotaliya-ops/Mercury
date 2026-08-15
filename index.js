// Custom entry point so the home screen widget task can be registered
// alongside expo-router. Router entry must come first — it sets up the app
// registration that everything else hangs off.
import 'expo-router/entry';

import { registerWidgets } from '@/utils/widget-bridge';

// No-ops on iOS, web, and any Android build without the widget module linked.
registerWidgets();
