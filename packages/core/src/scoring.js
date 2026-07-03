"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.skillMatch = skillMatch;
exports.experienceMatch = experienceMatch;
exports.compFit = compFit;
exports.companyFit = companyFit;
exports.roleFit = roleFit;
exports.interviewProbability = interviewProbability;
exports.scoreJob = scoreJob;
const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9+.# ]/g, '').trim();
/** Map common aliases so JD text matches profile skill keys. */
const SKILL_ALIASES = {
    reactjs: 'react', 'react.js': 'react', 'react js': 'react',
    nextjs: 'next.js', 'next js': 'next.js',
    ts: 'typescript', js: 'javascript', 'core web vitals': 'core web vitals',
    cwv: 'core web vitals', node: 'node.js', nodejs: 'node.js',
    nest: 'nestjs', 'nest.js': 'nestjs', springboot: 'java spring boot',
    'spring boot': 'java spring boot', 'spring-boot': 'java spring boot',
};
const canon = (s) => SKILL_ALIASES[norm(s)] ?? norm(s);
// 1. SKILL MATCH — weighted overlap of profile skills present in the JD's required set.
function skillMatch(jd, p) {
    const weights = Object.fromEntries(Object.entries(p.skills.weights).map(([k, v]) => [canon(k), v]));
    const profileSkills = Object.keys(weights);
    const required = new Set(jd.requiredSkills.map(canon));
    let gained = 0;
    let total = 0;
    const matched = [];
    for (const s of profileSkills) {
        const w = weights[s] ?? 0.5;
        if (required.has(s)) {
            gained += w;
            matched.push(s);
        }
        total += w; // denominator = all the candidate's weighted skills the JD *could* want
    }
    // Also reward when the JD's required skills are mostly things we have (precision),
    // so a JD asking for 3 skills we all have scores high even if we have 10 more.
    const reqArr = [...required];
    const reqCovered = reqArr.filter((r) => profileSkills.includes(r));
    const coverage = reqArr.length ? reqCovered.length / reqArr.length : 0;
    const recall = total ? gained / total : 0;
    const pct = clamp(Math.round(100 * (0.6 * coverage + 0.4 * recall)));
    const missing = reqArr.filter((r) => !profileSkills.includes(r));
    return { pct, matched, missing };
}
// 2. EXPERIENCE MATCH — how well candidate years fit the JD band.
function experienceMatch(jd, p) {
    const yrs = p.candidate.yearsExperience;
    const min = jd.minYears;
    const max = jd.maxYears;
    if (min == null && max == null)
        return 85; // unspecified → neutral-positive
    const lo = min ?? 0;
    const hi = max ?? lo + 4;
    if (yrs >= lo && yrs <= hi)
        return 100;
    if (yrs < lo) {
        const gap = lo - yrs; // under-qualified hurts more
        return clamp(100 - gap * 30);
    }
    const over = yrs - hi; // over-qualified hurts less
    return clamp(100 - over * 12);
}
// 3. COMP FIT — likelihood the role beats current CTC + minHike%.
function compFit(jd, p) {
    const cur = p.candidate.currentCtcLpa;
    const target = cur != null ? cur * (1 + p.candidate.minHikePct / 100) : null;
    // No salary on the posting (common in India) → use a soft prior by archetype/company type.
    if (jd.salaryMaxLpa == null && jd.salaryMinLpa == null) {
        const base = jd.companyType && ['product', 'saas', 'fintech', 'ai'].includes(jd.companyType) ? 70 : 55;
        return base;
    }
    if (target == null)
        return 65; // we don't know current CTC → mild positive
    const top = jd.salaryMaxLpa ?? jd.salaryMinLpa;
    if (top >= target)
        return 100;
    const ratio = top / target;
    return clamp(Math.round(ratio * 100));
}
// 4. COMPANY FIT — prefer product/saas/fintech/ai/startup; avoid service; respect rating.
function companyFit(jd, p, companyRating) {
    let score = 60;
    const t = (jd.companyType ?? '').toLowerCase();
    if (p.companyPreferences.prefer.some((x) => t.includes(x.replace('-high-growth', ''))))
        score += 30;
    if (p.companyPreferences.avoid.some((x) => t.includes(x)))
        score -= 45;
    if (companyRating != null) {
        if (companyRating >= p.companyPreferences.minGlassdoorRating)
            score += 10;
        else
            score -= 25;
    }
    return clamp(score);
}
// 5. ROLE FIT — archetype alignment (hard reject for backend/devops/etc.).
function roleFit(jd, p) {
    const a = jd.archetype;
    if (p.roleFit.rejectArchetypes.includes(a))
        return 0;
    if (p.roleFit.acceptableArchetypes.includes(a))
        return 100;
    if (a === 'balanced-fullstack')
        return 75;
    return 40;
}
// 6. INTERVIEW PROBABILITY — heuristic blend (skill recall, exp fit, easyApply boost).
function interviewProbability(skill, exp, role, easyApply) {
    const base = 0.5 * skill + 0.3 * exp + 0.2 * role;
    return clamp(Math.round(base * (easyApply ? 1.05 : 1.0)));
}
/** Master entry point. */
function scoreJob(jd, p, opts = {}) {
    const sm = skillMatch(jd, p);
    const exp = experienceMatch(jd, p);
    const comp = compFit(jd, p);
    const company = companyFit(jd, p, opts.companyRating);
    const role = roleFit(jd, p);
    const interview = interviewProbability(sm.pct, exp, role, !!opts.easyApply);
    const w = p.priorityWeights;
    const priority = clamp(Math.round(w.skillMatch * sm.pct +
        w.experienceMatch * exp +
        w.compFit * comp +
        w.companyFit * company +
        w.roleFit * role +
        w.interviewProbability * interview));
    // The gate: ALL must hold (matches the spec's "Apply only if" rules).
    const passedGate = sm.pct > p.thresholds.skillMatchMinPct &&
        exp >= p.thresholds.experienceMatchMinPct &&
        role > 0 &&
        (!p.thresholds.compMustExceedCurrent || comp >= 60) &&
        priority > p.thresholds.shortlistMinScore;
    const rationale = buildRationale(sm, exp, comp, role, priority, passedGate);
    return {
        skillMatchPct: sm.pct,
        experienceMatchPct: exp,
        compFitPct: comp,
        companyFitPct: company,
        roleFitPct: role,
        interviewProbability: interview,
        priorityScore: priority,
        matchedSkills: sm.matched,
        missingSkills: sm.missing,
        archetype: jd.archetype,
        passedGate,
        rationale,
    };
}
function buildRationale(sm, exp, comp, role, priority, passed) {
    const bits = [
        `skill ${sm.pct}%`,
        `exp ${exp}%`,
        `comp ${comp}%`,
        `role ${role}%`,
        `priority ${priority}`,
    ];
    if (sm.missing.length)
        bits.push(`missing: ${sm.missing.slice(0, 5).join(', ')}`);
    bits.push(passed ? 'PASSED gate' : 'below gate');
    return bits.join(' · ');
}
