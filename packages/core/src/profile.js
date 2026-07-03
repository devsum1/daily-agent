"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadProfile = loadProfile;
exports.clearProfileCache = clearProfileCache;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
let cached = null;
/** Load + lightly validate config/profile.json. */
function loadProfile(path = process.env.PROFILE_PATH ?? './config/profile.json') {
    if (cached)
        return cached;
    const raw = (0, node_fs_1.readFileSync)((0, node_path_1.resolve)(path), 'utf-8');
    const p = JSON.parse(raw);
    const wsum = Object.values(p.priorityWeights).reduce((a, b) => a + b, 0);
    if (Math.abs(wsum - 1) > 0.001) {
        throw new Error(`profile.priorityWeights must sum to 1.0 (got ${wsum})`);
    }
    if (!p.skills.core.length)
        throw new Error('profile.skills.core is empty');
    cached = p;
    return p;
}
function clearProfileCache() { cached = null; }
