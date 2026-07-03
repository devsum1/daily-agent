// Shared domain types used by api, scraper and integrations.

export type Platform =
  | 'LINKEDIN' | 'NAUKRI' | 'INSTAHYRE' | 'HIRIST' | 'WELLFOUND' | 'CUTSHORT';

export type Archetype =
  | 'senior-frontend'
  | 'frontend-heavy-fullstack'
  | 'balanced-fullstack'
  | 'pure-backend'
  | 'devops'
  | 'data-engineering'
  | 'qa'
  | 'support'
  | 'other';

/** Raw card as scraped from a results page (pre-JD-extraction). */
export interface RawJobCard {
  platform: Platform;
  externalId?: string;
  title: string;
  company: string;
  location: string;
  url: string;
  postedText?: string;
  salaryText?: string;
  easyApply?: boolean;
  snippet?: string;
}

/** Full JD detail after opening the posting + LLM extraction. */
export interface JdDetail {
  description: string;
  requiredSkills: string[];        // normalized, e.g. ["react","next.js","typescript"]
  niceToHaveSkills: string[];
  minYears?: number;
  maxYears?: number;
  salaryMinLpa?: number;
  salaryMaxLpa?: number;
  archetype: Archetype;
  companyType?: string;            // product | service | saas | fintech | ai | startup
  remote?: boolean;
}

/** The candidate profile (parsed from config/profile.json). */
export interface Profile {
  candidate: {
    name: string;
    yearsExperience: number;
    currentRole: string;
    currentCtcLpa: number | null;
    minHikePct: number;
    noticePeriodDays: number;
    email: string;
    phone: string;
    linkedin: string;
    baseResumePath: string;
  };
  targetRoles: string[];
  searchKeywords: string[];
  skills: {
    core: string[];
    secondary: string[];
    weights: Record<string, number>;
  };
  locations: string[];
  companyPreferences: {
    prefer: string[];
    avoid: string[];
    minGlassdoorRating: number;
  };
  roleFit: {
    mustBeFrontendOrFullstack: boolean;
    acceptableArchetypes: Archetype[];
    rejectArchetypes: Archetype[];
  };
  thresholds: {
    skillMatchMinPct: number;
    experienceMatchMinPct: number;
    shortlistMinScore: number;
    compMustExceedCurrent: boolean;
  };
  priorityWeights: {
    skillMatch: number;
    experienceMatch: number;
    compFit: number;
    companyFit: number;
    roleFit: number;
    interviewProbability: number;
  };
  limits: Record<string, number>;
  platforms: Record<string, { enabled: boolean; easyApply: boolean; outreach: boolean }>;
}

/** Output of the deterministic scoring engine. */
export interface ScoreResult {
  skillMatchPct: number;
  experienceMatchPct: number;
  compFitPct: number;
  companyFitPct: number;
  roleFitPct: number;
  interviewProbability: number;
  priorityScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  archetype: Archetype;
  passedGate: boolean;
  rationale: string;
}
