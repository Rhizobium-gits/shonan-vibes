/**
 * Launches VS Code with a throwaway profile, loads this extension in
 * development mode and runs integration/suite.ts inside it.
 * Set CODE=/path/to/code-binary if VS Code is not in the default macOS location.
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const root = path.resolve(__dirname, '..', '..');
const code = process.env.CODE ?? '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shonan-integration-'));
const logFile = path.join(tmp, 'result.log');

const result = spawnSync(
  code,
  [
    `--user-data-dir=${path.join(tmp, 'user')}`,
    `--extensions-dir=${path.join(tmp, 'extensions')}`,
    '--disable-extensions',
    '--disable-workspace-trust',
    '--skip-welcome',
    '--skip-release-notes',
    '--new-window',
    `--extensionDevelopmentPath=${root}`,
    `--extensionTestsPath=${path.join(root, 'out', 'integration', 'suite.js')}`,
  ],
  { env: { ...process.env, SHONAN_INTEGRATION_LOG: logFile, ELECTRON_RUN_AS_NODE: undefined }, stdio: 'ignore', timeout: 120_000 },
);

const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '(no result log)\n';
process.stdout.write(log);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(result.status === 0 && !log.includes('✘') ? 0 : 1);
