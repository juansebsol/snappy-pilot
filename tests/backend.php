<?php
declare(strict_types=1);
require __DIR__ . '/../lib/Service.php';
require __DIR__ . '/../lib/OpenAICompatibleProvider.php';
use SnappyPilot\{Settings, Input, Prompts, PilotError, OpenAICompatibleProvider};

$count = 0;
function check(bool $ok, string $label): void {
    global $count;
    if (!$ok) { throw new RuntimeException($label); }
    ++$count;
}
function rejected(Closure $fn, string $part): void {
    try { $fn(); } catch (PilotError $e) { check(str_contains($e->getMessage(), $part), $e->getMessage()); return; }
    throw new RuntimeException('Expected rejection: ' . $part);
}
$config = ['enabled' => true, 'endpoint' => 'https://openrouter.ai/api/v1/', 'api_key' => 'test-secret', 'model' => 'test/model'];
$settings = new Settings($config);
check($settings->endpoint === 'https://openrouter.ai/api/v1', 'Base URL normalization');
check($settings->temperature === null, 'Optional temperature omitted');
foreach ([['enabled', false, 'disabled'], ['api_key', '', 'API key'], ['model', '', 'model ID'],
    ['endpoint', 'http://localhost', 'HTTPS'], ['endpoint', 'https://user:pass@example.com', 'HTTPS'],
    ['endpoint', 'https://example.com?key=secret', 'HTTPS'], ['api_key', "a\r\nb", 'API key'],
    ['temperature', 3, 'temperature'], ['timeout', 1000, 'timeout'], ['max_tokens', 0, 'token']] as [$key, $value, $part]) {
    rejected(fn() => new Settings(array_replace($config, [$key => $value])), $part);
}
$input = Input::parse(json_encode(['action' => 'professional', 'text' => 'Can you send the file?']));
check($input['text'] === 'Can you send the file?', 'Request extraction');
foreach ([['action' => 'bogus'], ['action' => 'grammar'], ['action' => 'custom'], ['action' => 'ask', 'context' => 'Hello'],
    ['action' => 'translate', 'text' => 'Hello'], ['action' => 'improve', 'text' => ['wrong']],
    ['action' => 'shorter', 'text' => str_repeat('a', 16001)], ['action' => 'ask', 'context' => str_repeat('a', 24001)]] as $invalid) {
    rejected(fn() => Input::parse(json_encode($invalid)), '');
}
rejected(fn() => Input::parse(str_repeat('a', 64001)), 'large');
rejected(fn() => Input::parse('{'), 'invalid');
rejected(fn() => Input::parse('[]'), 'invalid');
$prompts = Prompts::build($input, $settings);
check(str_contains($prompts[0]['content'], 'professionally'), 'Action-specific prompt');
check(str_contains($prompts[0]['content'], 'untrusted'), 'Email instruction boundary');
check(!str_contains(json_encode($prompts), 'test-secret'), 'No secret in prompt');
check(str_contains($prompts[1]['content'], $input['text']), 'Draft in prompt');

// Reply length tracks the draft being edited, so short drafts get short replies.
$budget = Input::budget($input);
check($budget < Input::budget(['text' => str_repeat('a', 4000)]), 'Budget scales with draft');
check(Input::budget(['text' => '']) === 900, 'Default budget for empty drafts');
check(Input::tokens($budget, 8192) < 512, 'Token budget follows character budget');
check(Input::tokens($budget, 128) === 128, 'Never exceeds the configured token limit');
check(str_contains($prompts[0]['content'], (string) $budget), 'Budget stated in prompt');

// Assistant chatter and reasoning dumps must never reach the draft.
check(Input::finalize("Thinking Process:\n1. Analyze the request\n\n\"Mom, I am sorry.\"") === 'Mom, I am sorry.', 'Strip thinking dumps');
check(Input::finalize("Here's the corrected version:\n\nHi Claire,\nThanks.\n\nLet me know if you want changes.")
    === "Hi Claire,\nThanks.", 'Strip preamble and trailing offer');
check(Input::finalize('"Hi Claire, thanks."') === 'Hi Claire, thanks.', 'Unwrap fully quoted email');
foreach (['based on common usage errors. Or I can leave it as', 'Sure! Here is the revised text:', '   '] as $slop) {
    rejected(fn() => Input::finalize($slop), 'commentary');
}
check(mb_strlen(Input::finalize(str_repeat('Sentence here. ', 200), 240)) < 400, 'Runaway replies are clipped');

$provider = new OpenAICompatibleProvider($settings, function ($url, $headers, $payload, $timeout) {
    check($url === 'https://openrouter.ai/api/v1/chat/completions', 'Completion URL');
    check(in_array('Authorization: Bearer test-secret', $headers), 'Server authorization');
    check(in_array('X-OpenRouter-Title: SnappyPilot', $headers), 'OpenRouter attribution');
    check(!isset($payload['temperature']) && $payload['stream'] === false, 'Portable optional parameters');
    check($payload['max_tokens'] === 200, 'Requested token budget');
    check(($payload['reasoning']['exclude'] ?? null) === true, 'Hide reasoning traces');
    check($timeout === 45, 'Request timeout');
    return [200, json_encode(['choices' => [['message' => ['content' => '<script>alert(1)</script> plain text']]]])];
});
check($provider->complete($prompts, 200, $budget) === '<script>alert(1)</script> plain text', 'Provider text retained as data; frontend escapes it');
check((new OpenAICompatibleProvider($settings, fn() => [200, json_encode(['choices' => [['finish_reason' => 'length', 'message' => ['content' => 'partial']]]])]))->complete($prompts) === 'partial', 'Keep truncated email text');
foreach ([[401, '{}', 'access'], [402, '{}', 'credits'], [429, '{}', 'rate limited'], [500, 'secret diagnostic', 'could not'],
    [200, '{', 'unreadable'], [200, '{}', 'no text'], [200, '{"error":{"message":"secret"}}', 'rejected'],
    [200, '{"choices":[{"message":{"content":null}}]}', 'no text'],
    [200, '{"choices":["invalid"]}', 'no text'],
    [200, '{"choices":[{"finish_reason":"length","message":{"content":""}}]}', 'output limit'],
    [200, str_repeat('x', 262145), 'oversized']] as [$status, $body, $part]) {
    rejected(fn() => (new OpenAICompatibleProvider($settings, fn() => [$status, $body]))->complete($prompts), $part);
}
rejected(fn() => (new OpenAICompatibleProvider($settings, fn() => throw new RuntimeException('secret key and email')))->complete($prompts), 'Could not reach');
$other = new Settings(array_replace($config, ['endpoint' => 'https://example.org/v1', 'temperature' => '0.4']));
(new OpenAICompatibleProvider($other, function ($url, $headers, $payload) {
    check(!in_array('X-OpenRouter-Title: SnappyPilot', $headers), 'No OpenRouter-only headers on other providers');
    check($payload['temperature'] === 0.4, 'Configured temperature');
    return [200, '{"choices":[{"message":{"content":"ok"}}]}'];
}))->complete($prompts);
printf("Backend: %d checks passed.\n", $count);
