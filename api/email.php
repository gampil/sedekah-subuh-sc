<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/smtp_mailer.php';

function email_json(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function email_fail(string $message, int $status = 400): never { email_json(['ok'=>false,'error'=>['message'=>$message]], $status); }

function email_config(): array
{
    $config = app_config();
    $smtp = is_array($config['smtp'] ?? null) ? $config['smtp'] : [];
    if (strlen((string)($config['email_api_secret'] ?? '')) < 32) email_fail('EMAIL API belum dikonfigurasi.', 503);
    if (empty($smtp['host']) || empty($smtp['username']) || empty($smtp['password'])) email_fail('SMTP hosting belum dikonfigurasi.', 503);
    return $config;
}

function verified_email_request(string $raw, array $config): void
{
    $timestamp = (string)($_SERVER['HTTP_X_EMAIL_TIMESTAMP'] ?? '');
    $signature = strtolower((string)($_SERVER['HTTP_X_EMAIL_SIGNATURE'] ?? ''));
    if (!ctype_digit($timestamp) || abs(time() - (int)$timestamp) > 300) email_fail('Permintaan email kedaluwarsa.', 401);
    $expected = hash_hmac('sha256', $timestamp . '.' . $raw, (string)$config['email_api_secret']);
    if (!preg_match('/^[a-f0-9]{64}$/', $signature) || !hash_equals($expected, $signature)) email_fail('Permintaan email tidak terverifikasi.', 401);
}

function clean_email_text(mixed $value, int $max = 180): string
{
    $text = trim(preg_replace('/[\x00-\x1F\x7F]/u', ' ', (string)$value) ?? '');
    return function_exists('mb_substr') ? mb_substr($text, 0, $max) : substr($text, 0, $max);
}
function valid_email(string $email): bool { return filter_var(trim($email), FILTER_VALIDATE_EMAIL) !== false; }
function rupiah(mixed $amount): string { return 'Rp' . number_format(max(0, min(100000000, (int)$amount)), 0, ',', '.'); }

function admin_recipients(array $config): array
{
    $source = $config['admin_emails'] ?? [];
    if (is_string($source)) $source = preg_split('/[\s,;]+/', $source, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    if (!is_array($source)) return [];
    return array_values(array_unique(array_filter(array_map(
        static fn($email): string => strtolower(trim((string)$email)), $source
    ), 'valid_email')));
}

function donation_details(array $donation): array
{
    $id = clean_email_text($donation['id'] ?? '', 100);
    if (!preg_match('/^[A-Za-z0-9_-]+$/', $id)) email_fail('ID transaksi tidak valid.');
    return [
        'id'=>$id, 'status'=>clean_email_text($donation['status'] ?? '', 40),
        'program'=>clean_email_text($donation['programTitle'] ?? '-', 180) ?: '-',
        'amount'=>max(0, min(100000000, (int)($donation['amount'] ?? 0))),
        'method'=>($donation['paymentMethod'] ?? '') === 'manual_bank' ? 'Transfer rekening' : 'QRIS',
        'name'=>clean_email_text($donation['name'] ?? '', 100),
        'email'=>strtolower(clean_email_text($donation['email'] ?? '', 160)),
        'anonymous'=>!empty($donation['anonymous']),
    ];
}

function email_template(string $title, string $intro, array $d, string $closing, string $statusUrl = ''): array
{
    $escape = static fn(string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $rows = ['ID transaksi'=>$d['id'],'Program'=>$d['program'],'Nominal'=>rupiah($d['amount']),'Metode'=>$d['method']];
    $table = '';
    foreach ($rows as $label=>$value) $table .= '<tr><td style="padding:9px 0;color:#64748b;width:130px">'.$escape($label).'</td><td style="padding:9px 0;color:#0f172a;font-weight:600">'.$escape((string)$value).'</td></tr>';
    $button = $statusUrl !== '' ? '<p style="margin:26px 0"><a href="'.$escape($statusUrl).'" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:9px;font-weight:700">Lihat Status Sedekah</a></p>' : '';
    $html = '<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:620px;margin:0 auto;padding:28px 14px"><div style="background:#0f766e;color:#fff;padding:20px 26px;border-radius:14px 14px 0 0"><strong style="font-size:18px">Sedekah Subuh Haramain</strong></div><div style="background:#fff;padding:28px 26px;border-radius:0 0 14px 14px"><h1 style="font-size:23px;margin:0 0 14px">'.$escape($title).'</h1><p style="line-height:1.7;color:#334155">'.$escape($intro).'</p><table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;margin:20px 0">'.$table.'</table>'.$button.'<p style="line-height:1.7;color:#334155">'.$escape($closing).'</p><p style="margin:28px 0 0;color:#94a3b8;font-size:12px">Email otomatis—jangan mengirimkan kata sandi atau data rahasia melalui balasan.</p></div></div></body></html>';
    $plainRows = [];
    foreach ($rows as $label=>$value) $plainRows[] = $label.': '.$value;
    $text = $title."\n\n".$intro."\n\n".implode("\n", $plainRows).($statusUrl !== '' ? "\nStatus: ".$statusUrl : '')."\n\n".$closing;
    return [$html,$text];
}

function delivery_lock(string $key): array
{
    if (!preg_match('/^[A-Za-z0-9:_-]{5,180}$/', $key)) email_fail('Kunci idempotensi tidak valid.');
    $directory = __DIR__.'/.email-log';
    if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) email_fail('Penyimpanan log email tidak tersedia.', 503);
    $base = $directory.'/'.hash('sha256', $key);
    $handle = @fopen($base.'.lock', 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) email_fail('Kunci email tidak tersedia.', 503);
    return [$handle,$base.'.sent'];
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$raw = $method === 'POST' ? (file_get_contents('php://input') ?: '') : '';
$config = email_config();
verified_email_request($raw, $config);

if ($method === 'GET' && isset($_GET['health'])) {
    email_json(['ok'=>true,'provider'=>'hosting-smtp','smtp'=>[
        'host'=>(string)$config['smtp']['host'], 'port'=>(int)($config['smtp']['port'] ?? 465),
        'from'=>(string)($config['smtp']['from_email'] ?? $config['smtp']['username'])
    ]]);
}
if ($method !== 'POST') email_fail('Metode tidak diizinkan.', 405);
if (strlen($raw) > 100000) email_fail('Payload terlalu besar.', 413);
$body = json_decode($raw, true);
if (!is_array($body)) email_fail('Format JSON tidak valid.');
$event = (string)($body['event'] ?? '');
if (!in_array($event, ['testAdmin','adminDonationCreated','adminProofSubmitted','donorPaid'], true)) email_fail('Jenis notifikasi tidak diizinkan.');
$d = donation_details(is_array($body['donation'] ?? null) ? $body['donation'] : []);
[$lockHandle,$sentFile] = delivery_lock(clean_email_text($body['idempotencyKey'] ?? '', 180));

try {
    if (is_file($sentFile)) email_json(['ok'=>true,'sent'=>true,'duplicate'=>true]);
    $siteUrl = rtrim((string)($config['site_url'] ?? 'https://sedekahsubuhharamain.com'), '/');
    if ($event === 'donorPaid') {
        if ($d['status'] !== 'paid' || !valid_email($d['email'])) email_fail('Email donor atau status transaksi tidak valid.');
        $recipients = [$d['email']];
        $greeting = $d['anonymous'] || $d['name'] === '' ? 'Sahabat' : $d['name'];
        $subject = 'Sedekah Anda berhasil — Sedekah Subuh Haramain';
        [$html,$text] = email_template('Sedekah berhasil dikonfirmasi', "Assalamu'alaikum, ".$greeting.'. Alhamdulillah, sedekah Anda telah berhasil dikonfirmasi.', $d, 'Terima kasih telah bersedekah bersama Sedekah Subuh Haramain.', $siteUrl.'/status/?id='.rawurlencode($d['id']));
    } else {
        $recipients = admin_recipients($config);
        if ($recipients === []) email_fail('Penerima email admin belum dikonfigurasi.', 503);
        if ($event === 'adminDonationCreated') {
            $subject = 'Donasi baru: '.$d['id'];
            [$html,$text] = email_template('Donasi baru masuk', 'Ada transaksi sedekah baru yang perlu dipantau.', $d, 'Silakan periksa dashboard admin untuk rincian dan status pembayarannya.');
        } elseif ($event === 'adminProofSubmitted') {
            $subject = 'Bukti transfer masuk: '.$d['id'];
            [$html,$text] = email_template('Bukti transfer diterima', 'Donatur telah mengunggah bukti transfer.', $d, 'Silakan periksa bukti dan lakukan persetujuan melalui dashboard admin.');
        } else {
            $subject = 'Tes SMTP — Sedekah Subuh Haramain';
            [$html,$text] = email_template('SMTP hosting berhasil terhubung', 'Ini adalah email pengujian sistem notifikasi terbaru.', $d, 'Jika pesan ini diterima, jalur Apps Script ke SMTP hosting telah berfungsi.');
        }
    }
    (new HostingSmtpMailer($config['smtp']))->send($recipients, $subject, $html, $text);
    if (@file_put_contents($sentFile, json_encode(['sentAt'=>gmdate('c'),'event'=>$event])) === false) error_log('Email terkirim tetapi marker idempotensi gagal disimpan.');
    email_json(['ok'=>true,'sent'=>true,'duplicate'=>false]);
} catch (Throwable $error) {
    error_log('Email endpoint error: '.$error->getMessage());
    email_fail('Email belum dapat dikirim oleh server.', 502);
} finally {
    flock($lockHandle, LOCK_UN);
    fclose($lockHandle);
}
