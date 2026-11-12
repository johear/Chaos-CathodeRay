// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 00 · APP IDENTITY — one place for the product name, version & file formats.
// Chaos CathodeRay 0.1.0-beta (formerly WebMapper v2.2). Old formats keep loading.
// ============================================================================
const APP_NAME = 'Chaos CathodeRay';
const APP_NAME_UPPER = 'CHAOS CATHODERAY';
const APP_VERSION = '0.1.0-beta';
const APP_VERSION_SHORT = 'β 0.1.0';
const APP_SLUG = 'chaos-cathoderay';
// Licence & attribution (see LICENSE, NOTICE.md, TRADEMARK.md). APP_SOURCE_URL is provisional
// until the public repository exists — change it here and in NOTICE.md / TRADEMARK.md / README.md.
const APP_AUTHOR = "Jonathan O'Hear";
const APP_COPYRIGHT = "Copyright © 2026 Jonathan O'Hear";
const APP_LICENSE = 'AGPL-3.0-or-later';
const APP_SOURCE_URL = 'https://github.com/johear/Chaos-CathodeRay';
const APP_ATTRIBUTION = `Based on Chaos CathodeRay (${APP_SOURCE_URL})`;
// Plugins & shaders made by users are theirs (NOTICE.md, Permission 2): no licence is assumed.
const APP_PLUGIN_DEFAULT_LICENSE = 'unspecified';
const APP_SHOW_FORMAT = 'chaoscathode-show';
const APP_SHOW_FORMATS_ACCEPTED = ['chaoscathode-show', 'webmapper-show'];
const APP_PLUGIN_FORMAT = 'chaoscathode-plugin';
const APP_PLUGIN_FORMATS_ACCEPTED = ['chaoscathode-plugin', 'webmapper-plugin'];
const APP_SHOW_EXT = '.chaos.json';
const APP_PACK_EXT = '.chaospack.json';
const APP_OSC_PREFIX = '/chaos';
// Beta problem reports: "✉ Send" opens the tester's mail app addressed here.
const APP_FEEDBACK_EMAIL = 'jonathan@ohear.com';
// "✉ Send" posts the report here (server/chaos-report.php, uploaded into the Chaos/Cathode folder); email is the fallback.
const APP_REPORT_ENDPOINT = 'https://www.jonathan.ohear.com/Chaos/CathodeRay/chaos-report.php';
const APP_REPORT_SUBJECT = 'Chaos CathodeRay Report';

// OSC: '/chaos/…' is the documented namespace; the legacy '/webmapper/…' keeps working.
function normalizeOscAddress(address) {
  const a = String(address || '');
  return a.startsWith('/chaos/') ? '/webmapper/' + a.slice(7) : a;
}
