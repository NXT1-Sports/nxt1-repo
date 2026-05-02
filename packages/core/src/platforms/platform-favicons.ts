/**
 * @fileoverview Platform favicon domain map and resolver
 * @module @nxt1/core/platforms
 *
 * Maps every platform slug → canonical domain, used to fetch
 * platform favicons via the DuckDuckGo favicon service.
 *
 * ⭐ PURE DATA — No framework dependencies, no side effects.
 */

/**
 * Platform slug → canonical domain.
 * Used for favicon resolution via `https://icons.duckduckgo.com/ip3/{domain}.ico`.
 *
 * Includes both link-mode platforms and their `_signin` counterparts,
 * which share the same domain.
 */
export const PLATFORM_FAVICON_DOMAINS: Readonly<Record<string, string>> = {
  // Social
  instagram: 'instagram.com',
  twitter: 'x.com',
  tiktok: 'tiktok.com',
  youtube: 'youtube.com',
  facebook: 'facebook.com',
  // Film
  hudl: 'hudl.com',
  krossover: 'krossover.com',
  veo: 'veo.co',
  ballertv: 'ballertv.com',
  nfhsnetwork: 'nfhsnetwork.com',
  sportsengineplay: 'app.sportsengineplay.com',
  vimeo: 'vimeo.com',
  // Recruiting
  ncsa: 'ncsasports.org',
  fieldlevel: 'fieldlevel.com',
  captainu: 'captainu.com',
  sportsrecruits: 'sportsrecruits.com',
  streamlineathletes: 'streamlineathletes.com',
  recruitlook: 'recruitlook.com',
  connectlax: 'connectlax.com',
  collegeathtrack: 'collegeathtrack.com',
  imlcarecruits: 'imlcarecruits.com',
  berecruited: 'berecruited.com',
  // Stats & Metrics
  maxpreps: 'maxpreps.com',
  perfectgame: 'perfectgame.org',
  prepbaseballreport: 'prepbaseballreport.com',
  '247sports': '247sports.com',
  rivals: 'rivals.com',
  on3: 'on3.com',
  gamechanger: 'gc.com',
  scorebooklive: 'scorebooklive.com',
  athletic: 'athletic.net',
  milesplit: 'milesplit.com',
  swimcloud: 'swimcloud.com',
  trackwrestling: 'trackwrestling.com',
  tennisrecruiting: 'tennisrecruiting.net',
  usta: 'usta.com',
  utr: 'utrsports.com',
  usyouthsoccer: 'usyouthsoccer.org',
  golfstat: 'golfstat.com',
  prepsoccer: 'prepsoccer.com',
  juniorgolf: 'jgaa.com',
  prephoops: 'prephoops.com',
  prepfootball: 'prepfootball.com',
  topdrawersoccer: 'topdrawersoccer.com',
  prepvolleyball: 'prepvolleyball.com',
  catapult: 'catapultsports.com',
  // Schedule
  sportsengine: 'sportsengine.com',
  sidearm: 'sidearmsports.com',
  // Academic
  ncaaeligibility: 'eligibilitycenter.org',
  naiaeligibility: 'naia.org',
  parchment: 'parchment.com',
  collegeboard: 'collegeboard.org',
  act: 'act.org',
  // Contact
  linktree: 'linktr.ee',
  beacons: 'beacons.ai',
  campsite: 'campsite.bio',
  // Sign-in
  google: 'google.com',
  microsoft: 'microsoft.com',
  // Sign-in counterparts (same domain as link variants)
  instagram_signin: 'instagram.com',
  twitter_signin: 'x.com',
  tiktok_signin: 'tiktok.com',
  youtube_signin: 'youtube.com',
  facebook_signin: 'facebook.com',
  hudl_signin: 'hudl.com',
  krossover_signin: 'krossover.com',
  veo_signin: 'veo.co',
  ballertv_signin: 'ballertv.com',
  nfhsnetwork_signin: 'nfhsnetwork.com',
  sportsengineplay_signin: 'app.sportsengineplay.com',
  vimeo_signin: 'vimeo.com',
  maxpreps_signin: 'maxpreps.com',
  ncsa_signin: 'ncsasports.org',
  fieldlevel_signin: 'fieldlevel.com',
  captainu_signin: 'captainu.com',
  sportsrecruits_signin: 'sportsrecruits.com',
  streamlineathletes_signin: 'streamlineathletes.com',
  recruitlook_signin: 'recruitlook.com',
  collegeathtrack_signin: 'collegeathtrack.com',
  connectlax_signin: 'connectlax.com',
  imlcarecruits_signin: 'imlcarecruits.com',
  berecruited_signin: 'berecruited.com',
  perfectgame_signin: 'perfectgame.org',
  prepbaseballreport_signin: 'prepbaseballreport.com',
  '247sports_signin': '247sports.com',
  rivals_signin: 'rivals.com',
  on3_signin: 'on3.com',
  gamechanger_signin: 'gc.com',
  scorebooklive_signin: 'scorebooklive.com',
  athletic_signin: 'athletic.net',
  milesplit_signin: 'milesplit.com',
  swimcloud_signin: 'swimcloud.com',
  trackwrestling_signin: 'trackwrestling.com',
  tennisrecruiting_signin: 'tennisrecruiting.net',
  usta_signin: 'usta.com',
  utr_signin: 'utrsports.com',
  prepsoccer_signin: 'prepsoccer.com',
  usyouthsoccer_signin: 'usyouthsoccer.org',
  golfstat_signin: 'golfstat.com',
  juniorgolf_signin: 'jgaa.com',
  prephoops_signin: 'prephoops.com',
  prepfootball_signin: 'prepfootball.com',
  topdrawersoccer_signin: 'topdrawersoccer.com',
  prepvolleyball_signin: 'prepvolleyball.com',
  catapult_signin: 'catapultsports.com',
  sportsengine_signin: 'sportsengine.com',
  sidearm_signin: 'sidearmsports.com',
  linktree_signin: 'linktr.ee',
  beacons_signin: 'beacons.ai',
  campsite_signin: 'campsite.bio',
} as const;

/**
 * Returns the DuckDuckGo favicon service URL for a given platform ID.
 * Returns null when no domain mapping exists.
 *
 * @example
 * getPlatformFaviconUrl('instagram') // 'https://icons.duckduckgo.com/ip3/instagram.com.ico'
 * getPlatformFaviconUrl('unknown')   // null
 *
 * ⭐ PURE FUNCTION - No dependencies
 */
export function getPlatformFaviconUrl(platformId: string): string | null {
  const domain = (PLATFORM_FAVICON_DOMAINS as Record<string, string>)[platformId];
  return domain ? `https://icons.duckduckgo.com/ip3/${domain}.ico` : null;
}

/**
 * Resolve favicon URL from an arbitrary URL using the shared platform domain map.
 * Returns null when the URL host does not map to a known platform domain.
 */
export function getPlatformFaviconUrlFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    for (const domain of Object.values(PLATFORM_FAVICON_DOMAINS)) {
      const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
      if (hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`)) {
        return `https://icons.duckduckgo.com/ip3/${normalizedDomain}.ico`;
      }
    }
    return null;
  } catch {
    return null;
  }
}
