<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
/**
 * Chaos CathodeRay — beta problem-report receiver.
 *
 * Upload into the Chaos CathodeRay folder on the web server; the app's APP_REPORT_ENDPOINT
 * (src/00-app-identity.js) must be this script's exact URL.
 *
 * What it does with each POSTed report:
 *   1. saves it as a text file in  <vhost>/chaos-reports/<id>--<random>.txt  (above the web root;
 *      falls back to a locked-down folder next to this script if that is not writable);
 *   2. emails it to REPORT_TO with the subject "Chaos CathodeRay Report <id>"
 *      (id = yymmdd-hhmm of the report, "-2", "-3"… when two arrive in the same minute).
 *
 * The app sends: POST, Content-Type text/plain, body = JSON
 *   { "app": "chaos-cathoderay", "version": "0.1.0-beta", "id": "251112-1415", "report": "…", "website": "" }
 * and expects:  { "ok": true, "id": "251112-1415", "emailed": true }
 */
declare(strict_types=1);
// Works on PHP 7.1+. Never print PHP warnings into the JSON answer.
ini_set('display_errors', '0');

const REPORT_TO       = 'talk.to.chaos.productions@gmail.com';
const REPORT_FROM     = 'Chaos CathodeRay Reports <noreply@ohear.com>';
const SUBJECT_PREFIX  = 'Chaos CathodeRay Report';
const MAX_BYTES       = 65536;   // a report is ~2 kB; refuse anything silly
const MAX_PER_HOUR    = 20;      // per sender IP
const MAX_GLOBAL_HOUR = 200;     // all senders together: caps mail volume even with rotating IPs
const MAX_STORED      = 5000;    // report files kept on disk; beyond this new reports are refused

header('Access-Control-Allow-Origin: *');            // the app runs from file:// (origin "null")
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Max-Age: 86400');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function respond(int $code, array $payload): void {
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') { http_response_code(204); exit; }
if ($method !== 'POST')    { respond(405, ['ok' => false, 'error' => 'POST only']); }

$raw = file_get_contents('php://input', false, null, 0, MAX_BYTES + 1);
if ($raw === false || $raw === '')  { respond(400, ['ok' => false, 'error' => 'empty']); }
if (strlen($raw) > MAX_BYTES)       { respond(413, ['ok' => false, 'error' => 'too large']); }

$data = json_decode($raw, true);
if (!is_array($data) || ($data['app'] ?? '') !== 'chaos-cathoderay') {
    respond(400, ['ok' => false, 'error' => 'not a Chaos CathodeRay report']);
}
// Honeypot: bots fill every field; the app always leaves this one empty.
if (!empty($data['website'])) { respond(200, ['ok' => true, 'id' => '0', 'emailed' => false]); }

$report = trim((string)($data['report'] ?? ''));
if ($report === '') { respond(400, ['ok' => false, 'error' => 'empty report']); }
$report  = str_replace(["\r\n", "\r"], "\n", $report);
$version = preg_replace('/[^0-9A-Za-z.\-]/', '', (string)($data['version'] ?? '?')) ?: '?';
$id      = (string)($data['id'] ?? '');
if (!preg_match('/\A\d{6}-\d{4}\z/', $id)) { $id = date('ymd-Hi'); }

// ---- Storage: outside the web root if possible --------------------------------------
// (the folder above DOCUMENT_ROOT, e.g. /var/www/vhosts/ohear.com/chaos-reports — works wherever
// this script sits inside the site, including a subfolder like /chaos-cathoderay/)
$docRoot = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), '/');
$store = ($docRoot !== '' ? dirname($docRoot) : dirname(__DIR__)) . '/chaos-reports';
if (!is_dir($store)) { @mkdir($store, 0750, true); }
if (!is_dir($store) || !is_writable($store)) {
    $store = __DIR__ . '/chaos-reports';
    if (!is_dir($store)) { @mkdir($store, 0750, true); }
    // Fallback inside the web root: blocked on Apache by .htaccess; on nginx the file names
    // carry a random part (below) so reports can't be guessed and fetched.
    if (is_dir($store) && !file_exists($store . '/.htaccess')) {
        @file_put_contents($store . '/.htaccess', "Require all denied\nDeny from all\n");
    }
    if (is_dir($store) && !file_exists($store . '/index.html')) { @file_put_contents($store . '/index.html', ''); }
}
$canStore = is_dir($store) && is_writable($store);
if ($canStore && count(glob($store . '/*.txt') ?: []) >= MAX_STORED) {
    respond(507, ['ok' => false, 'error' => 'report storage is full — please email the report instead']);
}

// Sender address for rate limiting. Behind a local reverse proxy (nginx → Apache on the same
// host) REMOTE_ADDR is the proxy itself; only then trust the X-Forwarded-For address that
// proxy appended (the last one — earlier entries come from the client and can be forged).
function sender_ip(): string {
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '?');
    $xff = (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '');
    $isLocal = $ip === '127.0.0.1' || $ip === '::1' || strpos($ip, '10.') === 0 || strpos($ip, '192.168.') === 0
        || preg_match('/\A172\.(1[6-9]|2\d|3[01])\./', $ip);
    if ($isLocal && $xff !== '') {
        $hops = explode(',', $xff);
        $last = trim((string)end($hops));
        if (filter_var($last, FILTER_VALIDATE_IP)) { $ip = $last; }
    }
    return $ip;
}

// ---- Rate limits: per IP (hashed, never stored in clear) and for everyone together ----
// Kept even when the report folder isn't writable (then in the system temp folder), so mail
// can never be sent without a limit.
$rateDir  = $canStore ? $store : sys_get_temp_dir();
$rateFile = rtrim($rateDir, '/') . '/.chaos-report-rate.json';
$ipKey    = hash('sha256', sender_ip() . '|chaos-cathoderay');
$fh = @fopen($rateFile, 'c+');
if (!$fh) { respond(503, ['ok' => false, 'error' => 'reports are unavailable right now — please email instead']); }
flock($fh, LOCK_EX);
$rates = json_decode(stream_get_contents($fh) ?: '{}', true) ?: [];
$now   = time();
$total = 0;
foreach ($rates as $k => $list) {
    $kept = [];
    foreach ((array)$list as $t) { if ($now - (int)$t < 3600) { $kept[] = (int)$t; } }
    if ($kept) { $rates[$k] = $kept; $total += count($kept); } else { unset($rates[$k]); }
}
if (count($rates[$ipKey] ?? []) >= MAX_PER_HOUR || $total >= MAX_GLOBAL_HOUR) {
    flock($fh, LOCK_UN); fclose($fh);
    respond(429, ['ok' => false, 'error' => 'too many reports — try again later']);
}
$rates[$ipKey][] = $now;
ftruncate($fh, 0); rewind($fh);
fwrite($fh, json_encode($rates));
flock($fh, LOCK_UN); fclose($fh);

// ---- Unique id per minute: 251112-1415, 251112-1415-2, … ----------------------------
// File name = id + random part (unguessable even if the folder were reachable from the web).
$saved = false;
$fileName = '';
if ($canStore) {
    $base = $id;
    for ($n = 2; (glob("$store/$id--*.txt") ?: []) && $n < 500; $n++) { $id = "$base-$n"; }
    $fileName = $id . '--' . bin2hex(random_bytes(6)) . '.txt';
    $saved = @file_put_contents("$store/$fileName", $report . "\n", LOCK_EX) !== false;
}

// ---- Email ---------------------------------------------------------------------------
$subject = SUBJECT_PREFIX . ' ' . $id;           // id is validated: no header injection
$body    = $report
         . "\n\n--\nReport " . $id . " · app " . $version
         . " · received " . gmdate('Y-m-d H:i:s') . " UTC"
         . ($saved ? " · saved as chaos-reports/$fileName" : " · NOT saved on the server") . "\n";
$headers = implode("\r\n", [
    'From: ' . REPORT_FROM,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'X-Mailer: chaos-report.php',
]);
$emailed = @mail(REPORT_TO, $subject, $body, $headers);

if (!$saved && !$emailed) { respond(500, ['ok' => false, 'error' => 'could not store or email the report']); }
respond(200, ['ok' => true, 'id' => $id, 'emailed' => (bool)$emailed, 'saved' => $saved]);
