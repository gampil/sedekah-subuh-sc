<?php
declare(strict_types=1);

$secret = '3d2ca40957db4470b61c1ebf37a8ad06dcc6e72d89784e88aaee9f557185bfbd';

return [
    'gas_url' => 'https://script.google.com/macros/s/AKfycbynltXbH9W1qiwxWcBY7NGiQsghU62oCGRLr8raAt4Q6WeR-WQvuZykrgK0sa03Uto1/exec?action=bootstrap&proxySecret=' . $secret,

    'proxy_secret' => $secret,

    'webhook_token' => 'sk_568b12d9f70ca67809b103bf30fda5b8',
    'email_api_secret' => '4e49dc2c70cf3eb2cd5369fd9e9374ee10a55d7de12c5d4acb959e648bb28af9',
    'site_url' => 'https://sedekahsubuhharamain.com',
    'firebaseDatabaseUrl'=> 'https://sedekah-003-default-rtdb.firebaseio.com',
    'admin_emails' => ['admin@sedekahsubuhharamain.com',
                        'gampilmedia@gmail.com',
                        'sedekahsubuhb@gmail.com'
                        ],
    'smtp' => [
        'host' => 'mail.sedekahsubuhharamain.com',
        'port' => 465,
        'encryption' => 'ssl',
        'username' => 'notifikasi@sedekahsubuhharamain.com',
        'password' => '@Adminsedekah2026!',
        'from_email' => 'notifikasi@sedekahsubuhharamain.com',
        'from_name' => 'Sedekah Subuh Haramain',
    ],
];