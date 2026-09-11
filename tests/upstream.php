<?php
declare(strict_types=1);
// Use actual 2.38.2 loader, plugin base, config/property classes and logger.
namespace RainLoop {
    class Actions {
        public array $params = [];
        public bool $authenticated = false;
        private \MailSo\Log\Logger $logger;
        public function __construct() { $this->logger = new \MailSo\Log\Logger(); }
        public function Logger() { return $this->logger; }
        public function Config() { return new class { public function Get($section, $key, $default = null) { return $key === 'enable' ? true : $default; } }; }
        public function getAccountFromToken($throw = true) { return $this->authenticated ? new \stdClass() : null; }
        public function GetActionParam($key, $default = null) { return $this->params[$key] ?? $default; }
        public function DefaultResponse($data, $extra, $name) { return ['Result' => $data]; }
    }
}
namespace {
    $source = getenv('SNAPPYMAIL_SOURCE');
    if (!$source || !is_file($source . '/plugins/README.md')) { throw new RuntimeException('Set SNAPPYMAIL_SOURCE to a checkout of v2.38.2.'); }
    spl_autoload_register(function ($class) use ($source) {
        $path = $source . '/snappymail/v/0.0.0/app/libraries/' . str_replace('\\', '/', $class) . '.php';
        if (is_file($path)) require $path;
    });
    define('APP_PLUGINS_PATH', dirname(__DIR__, 2) . '/');
    $actions = new \RainLoop\Actions();
    $manager = new \RainLoop\Plugins\Manager($actions);
    if ($manager->loadPluginByName('snappy-pilot') !== 'SnappyPilotPlugin') throw new RuntimeException('Loader mismatch');
    $plugin = new \SnappyPilotPlugin();
    $config = new class extends \RainLoop\Config\Plugin {
        public function __construct() {}
        public function IsInited(): bool { return false; }
        public function Get($section, $key, $default = null) { return $default; }
    };
    $plugin->SetName('snappy-pilot')->SetPath(dirname(__DIR__))->SetPluginManager($manager)->SetPluginConfig($config);
    $plugin->Init();
    if (!$manager->HasAdditionalJson('DoPluginSnappyPilotGenerate')) throw new RuntimeException('JSON registration failed');
    if (!$manager->HaveJs() || !str_contains($manager->CompileJs(), 'SnappyPilotGenerate')) throw new RuntimeException('Asset registration failed');
    foreach ($plugin->ConfigMap(true) as $property) {
        if ($property->AllowedInJs()) throw new RuntimeException('Unexpected client property');
        if ($property->Name() === 'api_key' && (!$property->encrypted || $property->Type() !== \RainLoop\Enumerations\PluginPropertyType::PASSWORD)) throw new RuntimeException('Secret setting mismatch');
    }
    $app = ['Auth' => true, 'Plugins' => []];
    $params = [];
    $plugin->ProtectRequestLogs('DoPluginSnappyPilotGenerate', $params);
    $level = new \ReflectionProperty($actions->Logger(), 'iLevel');
    if ($level->getValue($actions->Logger()) !== LOG_ERR) throw new RuntimeException('Request logging suppression failed');
    $actions->Logger()->SetLevel(LOG_DEBUG);
    $settingsParams = ['id' => 'snappy-pilot', 'settings' => ['api_key' => 'private test value']];
    $plugin->ProtectRequestLogs('DoAdminPluginSettingsUpdate', $settingsParams);
    if ($level->getValue($actions->Logger()) !== LOG_ERR) throw new RuntimeException('Admin key logging suppression failed');
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $response = $manager->RunAdditionalJson('DoPluginSnappyPilotGenerate');
    if ($response['Result']['ok'] || !str_contains($response['Result']['error'], 'Sign in')) throw new RuntimeException('Authentication check failed');
    $actions->authenticated = true;
    $response = $plugin->Generate();
    if ($response['Result']['ok'] || !str_contains($response['Result']['error'], 'disabled')) throw new RuntimeException('Disabled check failed');
    $exposed = ['api_key' => 'must disappear'];
    $plugin->FilterAppDataPluginSection(false, true, $exposed);
    if (isset($exposed['api_key']) || array_keys($exposed) !== ['enabled', 'language']) throw new RuntimeException('Client config allowlist failed');
    printf("SnappyMail v2.38.2 loader, initialization, assets, encrypted settings, auth, disabled and logging checks passed.\n");
}
