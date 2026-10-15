/**
 * Writes themes/shonan-vibes-color-theme.json from the same engine the
 * extension runs, so the static theme and the dynamic one never drift apart.
 */

import * as fs from 'fs';
import * as path from 'path';
import { staticAtmosphere } from '../src/engine';
import { buildTheme, themeDocument } from '../src/theme/mapper';

const root = path.resolve(__dirname, '..', '..');
const file = path.join(root, 'themes', 'shonan-vibes-color-theme.json');

const doc = themeDocument(buildTheme(staticAtmosphere().palette));
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
console.log(`wrote ${path.relative(root, file)} (${Object.keys(doc.colors as object).length} colors)`);
