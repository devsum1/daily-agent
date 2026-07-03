// Search matrix + candidate profile. Edit freely — this is the only scraper file
// you should need to touch.

export const SEARCHES = {
  // Keep the matrix small: every (keyword × location) is one request per platform.
  keywords: [
    'Senior Frontend Engineer',
    'Frontend Engineer',
    'React Developer',
    'Fullstack Engineer',
    'Software Engineer II',
    'Next.js Developer',
  ],
  locations: ['Bangalore', 'Gurgaon', 'Noida', 'Hyderabad', 'Pune'],
  // LinkedIn: r86400 = jobs posted in the last 24 h (the workflow runs daily).
  linkedinFreshness: 'r86400',
};

// How many LinkedIn job-detail pages to fetch for full descriptions (better
// scoring). Each is one extra request with a polite delay; keep modest.
export const MAX_DESCRIPTION_FETCHES = 40;

// Milliseconds between outbound requests. Be polite; don't lower this.
export const REQUEST_DELAY_MS = 1500;

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
