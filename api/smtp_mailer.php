<?php
declare(strict_types=1);

/** SMTP client ringkas untuk akun email cPanel, tanpa dependensi Composer. */
final class HostingSmtpMailer
{
    private $socket = null;

    public function __construct(private readonly array $config) {}

    public function send(array $recipients, string $subject, string $html, string $text): void
    {
        $recipients = array_values(array_unique(array_filter(array_map(
            static fn($email): string => strtolower(trim((string)$email)), $recipients
        ), static fn(string $email): bool => filter_var($email, FILTER_VALIDATE_EMAIL) !== false)));
        if ($recipients === []) throw new RuntimeException('Penerima email tidak tersedia.');

        $host = (string)($this->config['host'] ?? '');
        $port = (int)($this->config['port'] ?? 465);
        $username = (string)($this->config['username'] ?? '');
        $password = (string)($this->config['password'] ?? '');
        $fromEmail = (string)($this->config['from_email'] ?? $username);
        $fromName = (string)($this->config['from_name'] ?? 'Sedekah Subuh Haramain');
        if ($host === '' || !filter_var($username, FILTER_VALIDATE_EMAIL) || $password === '' || !filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
            throw new RuntimeException('Konfigurasi SMTP belum lengkap.');
        }

        $context = stream_context_create(['ssl' => [
            'verify_peer' => true, 'verify_peer_name' => true,
            'peer_name' => $host, 'SNI_enabled' => true,
        ]]);
        $encryption = (string)($this->config['encryption'] ?? 'ssl');
        $transport = ($encryption === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
        $errorNumber = 0; $errorMessage = '';
        $this->socket = @stream_socket_client($transport, $errorNumber, $errorMessage, 20, STREAM_CLIENT_CONNECT, $context);
        if (!is_resource($this->socket)) throw new RuntimeException('Tidak dapat terhubung ke server SMTP.');
        stream_set_timeout($this->socket, 20);

        try {
            $this->expect([220]);
            $this->command('EHLO ' . ($_SERVER['SERVER_NAME'] ?? 'localhost'), [250]);
            if ($encryption === 'tls') {
                $this->command('STARTTLS', [220]);
                if (!stream_socket_enable_crypto($this->socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) throw new RuntimeException('TLS SMTP gagal diaktifkan.');
                $this->command('EHLO ' . ($_SERVER['SERVER_NAME'] ?? 'localhost'), [250]);
            }
            $this->command('AUTH LOGIN', [334]);
            $this->command(base64_encode($username), [334]);
            $this->command(base64_encode($password), [235]);
            $this->command('MAIL FROM:<' . $fromEmail . '>', [250]);
            foreach ($recipients as $recipient) $this->command('RCPT TO:<' . $recipient . '>', [250, 251]);
            $this->command('DATA', [354]);

            $boundary = 'b_' . bin2hex(random_bytes(12));
            $headers = [
                'Date: ' . date(DATE_RFC2822),
                'From: ' . self::encodedHeader($fromName) . ' <' . $fromEmail . '>',
                'To: ' . implode(', ', array_map(static fn(string $email): string => '<' . $email . '>', $recipients)),
                'Subject: ' . self::encodedHeader($subject),
                'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . preg_replace('/^mail\./', '', $host) . '>',
                'MIME-Version: 1.0',
                'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
                'X-Mailer: SedekahSubuhHaramain/SMTP-1.0',
            ];
            $message = implode("\r\n", $headers) . "\r\n\r\n";
            $message .= '--' . $boundary . "\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text), 76, "\r\n");
            $message .= '--' . $boundary . "\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html), 76, "\r\n");
            $message .= '--' . $boundary . "--\r\n";
            $message = preg_replace('/(?m)^\./', '..', $message) ?? $message;
            fwrite($this->socket, $message . "\r\n.\r\n");
            $this->expect([250]);
            $this->command('QUIT', [221]);
        } finally {
            if (is_resource($this->socket)) fclose($this->socket);
            $this->socket = null;
        }
    }

    private function command(string $command, array $codes): void
    {
        if (!is_resource($this->socket)) throw new RuntimeException('Koneksi SMTP tidak aktif.');
        fwrite($this->socket, $command . "\r\n");
        $this->expect($codes);
    }

    private function expect(array $codes): string
    {
        if (!is_resource($this->socket)) throw new RuntimeException('Koneksi SMTP tidak aktif.');
        $response = '';
        do {
            $line = fgets($this->socket, 2048);
            if ($line === false) throw new RuntimeException('Server SMTP tidak memberikan respons.');
            $response .= $line;
        } while (isset($line[3]) && $line[3] === '-');
        $code = (int)substr($response, 0, 3);
        if (!in_array($code, $codes, true)) {
            error_log('SMTP response code: ' . $code);
            throw new RuntimeException('Server SMTP menolak permintaan (kode ' . $code . ').');
        }
        return $response;
    }

    private static function encodedHeader(string $value): string
    {
        return '=?UTF-8?B?' . base64_encode(str_replace(["\r", "\n"], '', $value)) . '?=';
    }
}
