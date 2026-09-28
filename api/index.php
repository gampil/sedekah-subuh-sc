<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';


$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';


// =================================================
// GET REQUEST
// =================================================

if ($method === 'GET') {


    $action = (string)($_GET['action'] ?? 'bootstrap');


    if (!in_array(
        $action,
        [
            'bootstrap',
            'publicDonations',
            'donationStatus',
            'health'
        ],
        true
    )) {

        fail_json(
            'Aksi tidak tersedia.',
            404
        );

    }



    $data = [
        'action' => $action
    ];



    foreach (
        [
            'id',
            'page',
            'limit',
            'programId'
        ]
        as $key
    ) {

        if (isset($_GET[$key])) {

            $data[$key] =
                substr(
                    (string)$_GET[$key],
                    0,
                    100
                );

        }

    }



    gas_request(
        'GET',
        $data
    );


}




// =================================================
// POST REQUEST
// =================================================


if ($method !== 'POST') {


    fail_json(
        'Metode tidak diizinkan.',
        405
    );

}




$length =
    (int)(
        $_SERVER['CONTENT_LENGTH'] ?? 0
    );



if ($length > 6500000) {


    fail_json(
        'Ukuran permintaan terlalu besar.',
        413
    );

}




$raw =
    file_get_contents(
        'php://input'
    );




$body =
    json_decode(
        $raw ?: '{}',
        true
    );




if (!is_array($body)) {


    fail_json(
        'Format permintaan tidak valid.'
    );

}





$action =
    (string)(
        $body['action'] ?? ''
    );




$public = [

    'createDonation',

    'donationStatus',

    'submitTransferProof',

    'aamiin'

];



$admin =
    str_starts_with(
        $action,
        'admin'
    );




if (
    !in_array(
        $action,
        $public,
        true
    )
    &&
    !$admin
) {


    fail_json(
        'Aksi tidak tersedia.',
        404
    );

}




gas_request(

    'POST',

    [

        'action' =>
            $action,


        'payload' =>
            is_array(
                $body['payload'] ?? null
            )
            ?
            $body['payload']
            :
            [],



        'adminToken' =>
            (string)(
                $body['adminToken'] ?? ''
            )

    ]

);
