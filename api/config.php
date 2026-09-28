<?php
declare(strict_types=1);


$local = __DIR__ . '/config.local.php';
if (is_file($local)) return require $local;
return [
    'gas_url' => getenv('SEDEKAH_GAS_URL') ?: 'PASTE_GAS_WEB_APP_URL',
    'proxy_secret' => getenv('SEDEKAH_PROXY_SHARED_SECRET') ?: 'PASTE_PROXY_SHARED_SECRET',
    'webhook_token' => getenv('SEDEKAH_WEBHOOK_TOKEN') ?: 'PASTE_CASHI_WEBHOOK_TOKEN',
];
