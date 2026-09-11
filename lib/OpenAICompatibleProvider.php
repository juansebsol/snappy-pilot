<?php
declare(strict_types=1);

namespace SnappyPilot;

final class OpenAICompatibleProvider implements Provider
{
    public function __construct(private Settings $settings, private ?\Closure $transport = null) {}

    public function complete(array $messages, int $maxTokens = 0, int $budget = 0): string
    {
        $s = $this->settings;
        $payload = ['model' => $s->model, 'messages' => $messages, 'stream' => false,
            'max_tokens' => $maxTokens > 0 ? min($maxTokens, $s->tokens) : min($s->tokens, 512)];
        if ($s->temperature !== null) { $payload['temperature'] = $s->temperature; }
        $headers = ['Content-Type: application/json', 'Accept: application/json', 'Authorization: Bearer ' . $s->key];
        if (strtolower((string) parse_url($s->endpoint, PHP_URL_HOST)) === 'openrouter.ai') {
            $headers[] = 'X-OpenRouter-Title: SnappyPilot';
            $payload['reasoning'] = ['exclude' => true];
        }
        try {
            [$status, $body] = $this->transport
                ? ($this->transport)($s->endpoint . '/chat/completions', $headers, $payload, $s->timeout)
                : $this->request($s->endpoint . '/chat/completions', $headers, $payload);
        } catch (PilotError $error) { throw $error; }
        catch (\Throwable) { throw new PilotError('Could not reach the AI provider. Try again shortly.'); }
        if ($status === 401 || $status === 403) { throw new PilotError('The AI provider rejected access. Ask your administrator to check the API key and model permissions.'); }
        if ($status === 402) { throw new PilotError('The AI provider account needs credits. Contact your administrator.'); }
        if ($status === 429) { throw new PilotError('The AI provider is busy or rate limited. Wait a moment and try again.'); }
        if ($status < 200 || $status >= 300) {
            throw new PilotError(self::providerMessage($body)
                ?: 'The AI provider could not complete this request. Check the model ID and try again.');
        }
        if (!is_string($body) || strlen($body) > 262144) { throw new PilotError('The AI provider returned an oversized response.'); }
        try { $result = json_decode($body, true, 32, JSON_THROW_ON_ERROR); }
        catch (\Throwable) { throw new PilotError('The AI provider returned an unreadable response. Try again.'); }
        if (!is_array($result) || isset($result['error'])) {
            throw new PilotError(self::providerMessage($body)
                ?: 'The AI provider could not complete this request. Check the model ID and try again.');
        }
        $choice = $result['choices'][0] ?? null;
        if (!is_array($choice) || !is_array($choice['message'] ?? null)) {
            throw new PilotError('The AI provider returned no text. Try another instruction or model.');
        }
        $content = $choice['message']['content'] ?? null;
        if (is_array($content)) {
            $parts = [];
            foreach ($content as $part) {
                if (is_string($part)) { $parts[] = $part; }
                else if (is_array($part) && is_string($part['text'] ?? null)) { $parts[] = $part['text']; }
            }
            $content = implode("\n", $parts);
        }
        if (!is_string($content) || trim($content) === '') {
            throw new PilotError(($choice['finish_reason'] ?? '') === 'length'
                ? 'The response reached the output limit before any text was produced. Increase Maximum output tokens in SnappyPilot settings, or pick a faster non-reasoning model.'
                : 'The AI provider returned no text. Try another instruction or model.');
        }
        return Input::finalize($content, $budget);
    }

    private static function providerMessage(mixed $body): string
    {
        if (!is_string($body) || $body === '') { return ''; }
        try { $error = json_decode($body, true, 16, JSON_THROW_ON_ERROR); }
        catch (\Throwable) { return ''; }
        $message = $error['error']['message'] ?? (is_string($error['error'] ?? null) ? $error['error'] : '');
        if (!is_string($message) || $message === '' || strlen($message) > 280) { return ''; }
        if (preg_match('/sk-|bearer\s|api[_-]?key|authorization/i', $message)) { return ''; }
        return 'The AI provider rejected the request: ' . trim($message);
    }

    private function request(string $url, array $headers, array $payload): array
    {
        if (!extension_loaded('curl')) { throw new PilotError('SnappyPilot needs the PHP cURL extension. Contact your administrator.'); }
        $handle = curl_init($url);
        $body = '';
        curl_setopt_array($handle, [
            CURLOPT_POST => true, CURLOPT_HTTPHEADER => $headers,
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_THROW_ON_ERROR),
            CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_CONNECTTIMEOUT => min(10, $this->settings->timeout), CURLOPT_TIMEOUT => $this->settings->timeout,
            CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$body): int {
                if (strlen($body) + strlen($chunk) > 262144) { return 0; }
                $body .= $chunk;
                return strlen($chunk);
            }
        ]);
        try {
            $ok = curl_exec($handle);
            $error = curl_errno($handle);
            $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        } finally { curl_close($handle); }
        if ($ok === false) {
            throw new PilotError($error === CURLE_OPERATION_TIMEDOUT
                ? 'The AI request timed out. Try again with less text.'
                : 'Could not reach the AI provider securely. Try again or contact your administrator.');
        }
        return [$status, $body];
    }
}
