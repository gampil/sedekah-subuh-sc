<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail_json('Metode tidak diizinkan.', 405);
$length = (int)($_SERVER['CONTENT_LENGTH'] ?? 0); if ($length > 1000000) fail_json('Payload terlalu besar.', 413);
$raw = file_get_contents('php://input'); $payload = json_decode($raw ?: '{}', true);
if (!is_array($payload)) { parse_str($raw ?: '', $payload); if (!is_array($payload)) $payload = []; }
$config = app_config();
$providedToken = (string)($_GET['token'] ?? '');
$providedSignature = (string)($_SERVER['HTTP_X_CASHI_SIGNATURE'] ?? '');
$expectedSignature = hash_hmac('sha256', $raw ?: '', (string)$config['webhook_token']);
$signatureValid = hash_equals($expectedSignature, preg_replace('/^sha256=/i', '', $providedSignature));
$tokenValid = $providedToken !== '' && hash_equals((string)$config['webhook_token'], $providedToken);
if (!$signatureValid && !$tokenValid) fail_json('Webhook tidak terverifikasi.', 401);
gas_request('POST', ['action'=>'paymentWebhook','payload'=>$payload,'webhookToken'=>$config['webhook_token']]);
