<?php
declare(strict_types=1);

function app_config(): array {
    static $config;
    if ($config === null) $config = require __DIR__ . '/config.php';
    foreach (['gas_url','proxy_secret','webhook_token'] as $key) {
        if (empty($config[$key]) || str_starts_with((string)$config[$key], 'PASTE_')) fail_json('Server API belum dikonfigurasi.', 503);
    }
    if (!filter_var($config['gas_url'], FILTER_VALIDATE_URL) || !str_starts_with($config['gas_url'], 'https://script.google.com/')) fail_json('Konfigurasi API tidak valid.', 503);
    return $config;
}
function fail_json(string $message, int $status = 400): never {
    http_response_code($status); header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store');
    echo json_encode(['ok'=>false,'error'=>['message'=>$message]], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit;
}
function client_key(string $secret): string {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown'; $agent = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 300);
    return hash_hmac('sha256', $ip . '|' . $agent, $secret);
}
function gas_request(string $method, array $data): never {
    $config = app_config(); $data['proxySecret'] = $config['proxy_secret']; $data['clientKey'] = client_key($config['proxy_secret']);
    $url = $config['gas_url']; $ch = curl_init();
    if ($method === 'GET') $url .= (str_contains($url, '?') ? '&' : '?') . http_build_query($data, '', '&', PHP_QUERY_RFC3986);
    else { curl_setopt($ch, CURLOPT_POST, true); curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)); curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: text/plain;charset=UTF-8']); }
    curl_setopt_array($ch, [CURLOPT_URL=>$url,CURLOPT_RETURNTRANSFER=>true,CURLOPT_FOLLOWLOCATION=>true,CURLOPT_MAXREDIRS=>3,CURLOPT_CONNECTTIMEOUT=>10,CURLOPT_TIMEOUT=>60,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_REDIR_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_USERAGENT=>'SedekahSubuhHaramainProxy/3.1']);
    $body = curl_exec($ch); $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $error = curl_error($ch); curl_close($ch);
    if ($body === false || $status < 200 || $status >= 400) {
        error_log('GAS proxy error: HTTP '.$status.' '.$error);
        fail_json($status === 404 ? 'Deployment Apps Script tidak ditemukan. Perbarui URL Web App pada konfigurasi server.' : 'Layanan sedang tidak tersedia.', 502);
    }
    json_decode($body, true); if (json_last_error() !== JSON_ERROR_NONE) fail_json('Respons layanan tidak valid.', 502);
    http_response_code(200); header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store'); header('X-Content-Type-Options: nosniff'); echo $body; exit;
}