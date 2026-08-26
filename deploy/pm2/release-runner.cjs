const fs = require('node:fs');
const path = require('node:path');

const root = '/opt/system-tracking';
const release = fs.realpathSync(path.join(root, 'current'));
const entry = process.env.SYSTEM_TRACKING_RUNNER_ENTRY;
if (!entry || path.isAbsolute(entry) || entry.includes('..')) {
  throw new Error('SYSTEM_TRACKING_RUNNER_ENTRY must be a relative release path');
}
process.chdir(release);
require(path.join(release, entry));
