"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const scoring_1 = require("./scoring");
const profile = {
    candidate: { name: 'Sumit', yearsExperience: 5, currentRole: 'SDE II', currentCtcLpa: 24,
        minHikePct: 30, noticePeriodDays: 60, email: '', phone: '', linkedin: '', baseResumePath: '' },
    targetRoles: [], searchKeywords: [],
    skills: {
        core: ['React', 'Next.js', 'TypeScript', 'JavaScript', 'Frontend Architecture', 'Core Web Vitals', 'SEO'],
        secondary: ['Java Spring Boot', 'Node.js', 'NestJS'],
        weights: { React: 1, 'Next.js': 1, TypeScript: 0.9, JavaScript: 0.8,
            'Frontend Architecture': 0.9, 'Core Web Vitals': 0.7, SEO: 0.5,
            'Java Spring Boot': 0.6, 'Node.js': 0.7, NestJS: 0.6 },
    },
    locations: [], companyPreferences: { prefer: ['product', 'saas', 'fintech', 'ai'], avoid: ['service'], minGlassdoorRating: 3.5 },
    roleFit: { mustBeFrontendOrFullstack: true,
        acceptableArchetypes: ['senior-frontend', 'frontend-heavy-fullstack'],
        rejectArchetypes: ['pure-backend', 'devops', 'data-engineering', 'qa', 'support'] },
    thresholds: { skillMatchMinPct: 70, experienceMatchMinPct: 80, shortlistMinScore: 70, compMustExceedCurrent: true },
    priorityWeights: { skillMatch: 0.35, experienceMatch: 0.2, compFit: 0.15, companyFit: 0.15, roleFit: 0.1, interviewProbability: 0.05 },
    limits: {}, platforms: {},
};
(0, vitest_1.describe)('scoreJob', () => {
    (0, vitest_1.it)('shortlists a strong senior-frontend match', () => {
        const jd = {
            description: 'Senior Frontend Engineer building React/Next.js apps with strong Core Web Vitals.',
            requiredSkills: ['react', 'next.js', 'typescript', 'core web vitals'],
            niceToHaveSkills: ['seo'], minYears: 4, maxYears: 8,
            salaryMinLpa: 30, salaryMaxLpa: 40, archetype: 'senior-frontend',
            companyType: 'product', remote: true,
        };
        const r = (0, scoring_1.scoreJob)(jd, profile, { easyApply: true, companyRating: 4.1 });
        (0, vitest_1.expect)(r.skillMatchPct).toBeGreaterThan(70);
        (0, vitest_1.expect)(r.experienceMatchPct).toBe(100);
        (0, vitest_1.expect)(r.passedGate).toBe(true);
        (0, vitest_1.expect)(r.priorityScore).toBeGreaterThan(70);
    });
    (0, vitest_1.it)('rejects a pure-backend role via roleFit gate', () => {
        const jd = {
            description: 'Backend Engineer, Go + Kafka.', requiredSkills: ['go', 'kafka'],
            niceToHaveSkills: [], minYears: 5, maxYears: 9, archetype: 'pure-backend',
            companyType: 'product',
        };
        const r = (0, scoring_1.scoreJob)(jd, profile, {});
        (0, vitest_1.expect)(r.roleFitPct).toBe(0);
        (0, vitest_1.expect)(r.passedGate).toBe(false);
    });
    (0, vitest_1.it)('penalizes a service company', () => {
        const jd = {
            description: 'React developer at IT services firm.', requiredSkills: ['react', 'javascript'],
            niceToHaveSkills: [], minYears: 4, maxYears: 7, archetype: 'frontend-heavy-fullstack',
            companyType: 'service',
        };
        const r = (0, scoring_1.scoreJob)(jd, profile, { companyRating: 3.0 });
        (0, vitest_1.expect)(r.companyFitPct).toBeLessThan(40);
    });
});
