<?php
declare(strict_types=1);

require_once __DIR__ . '/lib/Service.php';
require_once __DIR__ . '/lib/OpenAICompatibleProvider.php';

use RainLoop\Plugins\Property;
use RainLoop\Enumerations\PluginPropertyType as Type;
use SnappyPilot\{Input, Settings, Prompts, PilotError, OpenAICompatibleProvider};

class SnappyPilotPlugin extends \RainLoop\Plugins\AbstractPlugin
{
    const NAME = 'SnappyPilot', AUTHOR = 'SnappyPilot contributors', VERSION = '1.0.6',
        RELEASE = '2026-09-10', REQUIRED = '2.38.2', CATEGORY = 'General', LICENSE = 'MIT',
        DESCRIPTION = 'An OpenRouter-powered compose assistant. Preview every result before applying it.';

    public function Init(): void
    {
        $this->addJs('js/commands.js');
        $this->addJs('js/editor.js');
        $this->addJs('js/ui.js');
        $this->addJs('js/SnappyPilot.js');
        $this->addCss('css/snappy-pilot.css');
        $this->addJsonHook('SnappyPilotGenerate', 'Generate');
        $this->addHook('filter.action-params', 'ProtectRequestLogs');
    }

    public function ProtectRequestLogs(string $method, array &$params): void
    {
        if ($method === 'DoPluginSnappyPilotGenerate'
            || ($method === 'DoAdminPluginSettingsUpdate' && ($params['id'] ?? '') === 'snappy-pilot')) {
            // ServiceJson logs POST after this hook, and the result after our callback.
            // Limit this request's logger before either body can be written.
            $this->Manager()->Actions()->Logger()->SetLevel(LOG_ERR);
        }
    }

    public function FilterAppDataPluginSection(bool $admin, bool $auth, array &$config): void
    {
        $config = (!$admin && $auth) ? [
            'enabled' => (bool) $this->Config()->Get('plugin', 'enabled', false),
            'language' => (string) $this->Config()->Get('plugin', 'language', 'English')
        ] : [];
    }

    protected function configMapping(): array
    {
        $fields = [
            ['enabled', 'Enable SnappyPilot', Type::BOOL, false],
            ['endpoint', 'API base URL', Type::STRING, 'https://openrouter.ai/api/v1'],
            ['api_key', 'API key', Type::PASSWORD, ''],
            ['model', 'Model ID (provider/model)', Type::STRING, ''],
            ['max_tokens', 'Maximum output tokens (64–8192)', Type::INT, 4096],
            ['temperature', 'Temperature (0–2; blank omits parameter)', Type::STRING, ''],
            ['language', 'Default language', Type::STRING, 'English'],
            ['system_prompt', 'Additional writing preferences', Type::STRING_TEXT, ''],
            ['timeout', 'Request timeout in seconds (5–90)', Type::INT, 45]
        ];
        return array_map(static function (array $field): Property {
            [$name, $label, $type, $default] = $field;
            $property = Property::NewInstance($name)->SetLabel($label)->SetType($type)->SetDefaultValue($default);
            if ($name === 'api_key') { $property->SetEncrypted(); }
            return $property;
        }, $fields);
    }

    public function Generate(): mixed
    {
        try {
            if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { throw new PilotError('Use an authenticated POST request.'); }
            if (!$this->Manager()->Actions()->getAccountFromToken(false)) { throw new PilotError('Sign in to SnappyMail before using SnappyPilot.'); }
            $values = [];
            foreach ($this->ConfigMap(true) as $field) {
                $values[$field->Name()] = $field->Name() === 'api_key'
                    ? $this->Config()->getDecrypted('plugin', 'api_key', '')
                    : $this->Config()->Get('plugin', $field->Name(), $field->DefaultValue());
            }
            $settings = new Settings($values);
            // FPM php.ini max_execution_time is 30s; the plugin timeout can be 45–90s.
            @set_time_limit($settings->timeout + 15);
            $input = Input::parse($this->jsonParam('Payload', ''));
            $budget = Input::budget($input);
            $result = (new OpenAICompatibleProvider($settings))->complete(
                Prompts::build($input, $settings, $budget),
                Input::tokens($budget, $settings->tokens),
                $budget
            );
            return $this->jsonResponse(__FUNCTION__, ['ok' => true, 'text' => $result]);
        } catch (PilotError $error) {
            return $this->jsonResponse(__FUNCTION__, ['ok' => false, 'error' => $error->getMessage()]);
        } catch (\Throwable) {
            // Never return or log underlying exceptions: they may contain credentials or mail.
            return $this->jsonResponse(__FUNCTION__, ['ok' => false, 'error' => 'SnappyPilot could not complete this request. Contact your administrator.']);
        }
    }
}
