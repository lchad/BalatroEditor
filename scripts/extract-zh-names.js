/**
 * Extract Chinese card/entity names from Balatro's official zh_CN.lua
 * and generate public/js/i18n-data.js
 *
 * Usage: node scripts/extract-zh-names.js [path/to/zh_CN.lua]
 */

const fs = require('fs');
const path = require('path');

const INPUT = process.argv[2] || '/tmp/balatro_extract/game/localization/zh_CN.lua';
const OUTPUT = path.join(__dirname, '..', 'public', 'js', 'i18n-data.js');

if (!fs.existsSync(INPUT)) {
    console.error(`Input file not found: ${INPUT}`);
    process.exit(1);
}

const content = fs.readFileSync(INPUT, 'utf-8');

// --- Extract descriptions section ---
const descMatch = content.match(/descriptions\s*=\s*\{([\s\S]*?)\n\s*\},\s*\n\s*(?:UI|tutorial|misc)/);
if (!descMatch) {
    console.error('Could not find descriptions section');
    process.exit(1);
}
const descBody = descMatch[1];

// --- Extract misc section ---
// misc starts at 4-space indent, ends at "    }" (4-space indent close)
const miscMatch = content.match(/\n    misc\s*=\s*\{([\s\S]*?)\n    \}/);
const miscBody = miscMatch ? miscMatch[1] : '';

// --- Parse descriptions by category ---
// Category: 8-space indent "        CategoryName = {"
// Items:    12-space indent "            id_here = {"
// Category end: 8-space indent "        },"
// Item end:    12-space indent "            },"
// Key insight: match category end by the specific 8-space indentation BEFORE the },
const CATEGORIES = ['Joker', 'Voucher', 'Tarot', 'Planet', 'Spectral', 'Edition', 'Enhanced', 'Stake', 'Tag', 'Blind', 'Back', 'Other'];

const result = {};
for (const cat of CATEGORIES) {
    result[cat] = {};

    // Find category: "        Category = {\n            ...items...\n        },"
    // Item close: 12-space indent "            },"
    // Category close: 8-space indent "        },"
    // Match until }, preceded by exactly 8 spaces (category-level close only)
    const catRegex = new RegExp(`\\n {8}${cat}\\s*=\\s*\\{([\\s\\S]*?)\\n {8}\\},`, 'm');
    const catMatch = descBody.match(catRegex);
    if (!catMatch) continue;

    const catBody = catMatch[1];

    // Extract all: "            id_here = {"  followed by "                name = "Chinese","
    // Using line-by-line: id is on a line matching "xxx = {", name on next line
    const lines = catBody.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        const idMatch = line.match(/^(\w+)\s*=\s*\{$/);
        if (idMatch) {
            const nextLine = lines[i + 1].trim();
            const nameMatch = nextLine.match(/^name\s*=\s*"(.+)",?\s*$/);
            if (nameMatch) {
                result[cat][idMatch[1]] = nameMatch[1];
            }
        }
    }
}

// --- Parse misc section ---
// Sub-tables at 8-space indent, close at 8-space "        },"
// poker_hands
const pokerMatch = miscBody.match(/\n {8}poker_hands\s*=\s*\{([\s\S]*?)\n {8}\},/);
const pokerHands = {};
if (pokerMatch) {
    const re = /\['(.+?)'\]\s*=\s*"(.+)"/g;
    let m;
    while ((m = re.exec(pokerMatch[1])) !== null) pokerHands[m[1]] = m[2];
}

// suits_singular
const suitsMatch = miscBody.match(/\n {8}suits_singular\s*=\s*\{([\s\S]*?)\n {8}\},/);
const suits = {};
if (suitsMatch) {
    const re = /(\w+)\s*=\s*"(.+)"/g;
    let m;
    while ((m = re.exec(suitsMatch[1])) !== null) suits[m[1]] = m[2];
}

// ranks
const ranksMatch = miscBody.match(/\n {8}ranks\s*=\s*\{([\s\S]*?)\n {8}\},/);
const ranks = {};
if (ranksMatch) {
    const re = /(?:'(\d+)'|(\w+))\s*=\s*"(.+)"/g;
    let m;
    while ((m = re.exec(ranksMatch[1])) !== null) ranks[m[1] || m[2]] = m[3];
}

// *_seal = "xxx" (flat in misc)
const seals = {};
const sealRe = /(\w+_seal)\s*=\s*"(.+)"/g;
let sm;
while ((sm = sealRe.exec(miscBody)) !== null) seals[sm[1]] = sm[2];

// high_scores = { hand = "最佳出牌", ... },
// high_scores
const hsMatch = miscBody.match(/\n {8}high_scores\s*=\s*\{([\s\S]*?)\n {8}\},/);
const highScores = {};
if (hsMatch) {
    const re = /(\w+)\s*=\s*"(.+)"/g;
    let m;
    while ((m = re.exec(hsMatch[1])) !== null) {
        if (m[2]) highScores[m[1]] = m[2];
    }
}

// challenge_names = { c_five_card_1 = "五连抽", ... }
const challengeMatch = miscBody.match(/\n {8}challenge_names\s*=\s*\{([\s\S]*?)\n {8}\},?/);
const challenges = {};
if (challengeMatch) {
    const re = /(\w+)\s*=\s*"(.+)"/g;
    let m;
    while ((m = re.exec(challengeMatch[1])) !== null) {
        challenges[m[1]] = m[2];
    }
}

// --- Generate output ---
// Add seal display-name aliases (save-editor uses 'Red' not 'red_seal')
const SEAL_ALIASES = {
    'Gold': seals['gold_seal'] || '',
    'Blue': seals['blue_seal'] || '',
    'Red': seals['red_seal'] || '',
    'Purple': seals['purple_seal'] || '',
};
Object.assign(seals, SEAL_ALIASES);

function toJS(obj) {
    if (Object.keys(obj).length === 0) return '{}';
    const entries = Object.entries(obj).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
    return '{\n' + entries.join(',\n') + '\n}';
}

const output = `// Auto-generated by scripts/extract-zh-names.js from Balatro official zh_CN.lua
// Do not edit manually. Regenerate with: node scripts/extract-zh-names.js
const GAME_NAMES_ZH = {
    jokers: ${toJS(result.Joker)},
    vouchers: ${toJS(result.Voucher)},
    tarots: ${toJS(result.Tarot)},
    planets: ${toJS(result.Planet)},
    spectrals: ${toJS(result.Spectral)},
    editions: ${toJS(result.Edition)},
    enhancements: ${toJS(result.Enhanced)},
    stakes: ${toJS(result.Stake)},
    tags: ${toJS(result.Tag)},
    blinds: ${toJS(result.Blind)},
    backs: ${toJS(result.Back)},
    pokerHands: ${toJS(pokerHands)},
    suits: ${toJS(suits)},
    ranks: ${toJS(ranks)},
    seals: ${toJS(seals)},
    highScores: ${toJS(highScores)},
    challenges: ${toJS(challenges)},
};

/**
 * Get Chinese game entity name for a given internal key.
 * Falls back to the key itself for non-Chinese languages or unknown keys.
 * @param {string} key - The internal game ID or English display name
 * @param {string} lang - Current language code ('zh' for Chinese)
 * @returns {string} Chinese name or original key
 */
function i18nGameName(key, lang) {
    if (lang !== 'zh') return key;
    if (!key) return key;
    for (const cat of Object.values(GAME_NAMES_ZH)) {
        if (cat[key] !== undefined) return cat[key];
    }
    return key;
}
`;

fs.writeFileSync(OUTPUT, output, 'utf-8');

// --- Summary ---
const counts = {
    jokers: Object.keys(result.Joker).length,
    vouchers: Object.keys(result.Voucher).length,
    tarots: Object.keys(result.Tarot).length,
    planets: Object.keys(result.Planet).length,
    spectrals: Object.keys(result.Spectral).length,
    editions: Object.keys(result.Edition).length,
    enhancements: Object.keys(result.Enhanced).length,
    stakes: Object.keys(result.Stake).length,
    tags: Object.keys(result.Tag).length,
    blinds: Object.keys(result.Blind).length,
    backs: Object.keys(result.Back).length,
    pokerHands: Object.keys(pokerHands).length,
    suits: Object.keys(suits).length,
    ranks: Object.keys(ranks).length,
    seals: Object.keys(seals).length,
    highScores: Object.keys(highScores).length,
    challenges: Object.keys(challenges).length,
};

console.log(`Generated: ${OUTPUT}`);
for (const [cat, count] of Object.entries(counts)) {
    console.log(`  ${cat}: ${count}`);
}
console.log(`  TOTAL: ${Object.values(counts).reduce((a, b) => a + b, 0)}`);
