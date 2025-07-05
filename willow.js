/**
 * Willow.arlen.icu Sora Scraper Module
 * A comprehensive scraper for the Willow streaming platform
 * Supports both movies and TV series with episode extraction
 */

function cleanTitle(title) {
    return title
        .replace(/'/g, "'")
        .replace(/–/g, "-")
        .replace(/&#[0-9]+;/g, "")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .trim();
}

function getAbsoluteUrl(url, baseUrl = "https://willow.arlen.icu") {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return baseUrl + url;
    return baseUrl + '/' + url;
}

/**
 * Extract search results from HTML
 * @param {string} html - Raw HTML content
 * @returns {Array} Array of search result objects
 */
function searchResults(html) {
    const results = [];

    try {
        // Parse HTML using DOMParser
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Look for movie/series cards in search results
        // Based on the site structure observed
        const mediaCards = doc.querySelectorAll('a[href*="/movies/"], a[href*="/series/"]');

        mediaCards.forEach(card => {
            try {
                const href = card.getAttribute('href');
                const img = card.querySelector('img');
                const titleElement = card.querySelector('h3, .title, [class*="title"]') || 
                                   card.parentElement.querySelector('h3, .title, [class*="title"]');

                let title = '';
                if (titleElement) {
                    title = titleElement.textContent || titleElement.innerText || '';
                } else {
                    // Fallback: extract title from href
                    const urlMatch = href.match(/\/(movies|series)\/\d+-(.+)$/);
                    if (urlMatch) {
                        title = urlMatch[2].replace(/-/g, ' ');
                    }
                }

                const image = img ? img.src || img.getAttribute('data-src') || '' : '';

                if (title && href) {
                    results.push({
                        title: cleanTitle(title),
                        image: getAbsoluteUrl(image),
                        href: getAbsoluteUrl(href)
                    });
                }
            } catch (e) {
                console.warn('Error parsing search card:', e);
            }
        });

        // If no specific cards found, try alternative selectors
        if (results.length === 0) {
            const alternativeCards = doc.querySelectorAll('[href*="/movies/"], [href*="/series/"]');
            alternativeCards.forEach(card => {
                try {
                    const href = card.getAttribute('href');
                    const textContent = card.textContent || card.innerText || '';
                    const img = card.querySelector('img') || card.parentElement.querySelector('img');

                    if (href && textContent.trim()) {
                        results.push({
                            title: cleanTitle(textContent.trim()),
                            image: img ? getAbsoluteUrl(img.src || img.getAttribute('data-src') || '') : '',
                            href: getAbsoluteUrl(href)
                        });
                    }
                } catch (e) {
                    console.warn('Error parsing alternative card:', e);
                }
            });
        }

    } catch (error) {
        console.error('Error in searchResults:', error);
    }

    return results;
}

/**
 * Extract details from a movie/series page
 * @param {string} html - Raw HTML content
 * @returns {Array} Array with details object
 */
function extractDetails(html) {
    const details = [];

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Extract description
        let description = '';
        const descSelectors = [
            '[class*="description"]',
            '[class*="overview"]',
            '[class*="synopsis"]',
            'p:contains("plot")',
            '.content p',
            'meta[name="description"]',
            '[itemprop="description"]'
        ];

        for (const selector of descSelectors) {
            const element = doc.querySelector(selector);
            if (element) {
                if (element.tagName === 'META') {
                    description = element.getAttribute('content') || '';
                } else {
                    description = element.textContent || element.innerText || '';
                }
                if (description.trim()) break;
            }
        }

        // Extract aliases/alternative titles
        let aliases = '';
        const aliasSelectors = [
            'h1',
            '.title',
            '[class*="original-title"]',
            '[class*="alt-title"]'
        ];

        for (const selector of aliasSelectors) {
            const element = doc.querySelector(selector);
            if (element) {
                aliases = element.textContent || element.innerText || '';
                if (aliases.trim()) break;
            }
        }

        // Extract air date/release year
        let airdate = '';
        const airdateSelectors = [
            '[class*="year"]',
            '[class*="date"]',
            '[class*="release"]',
            'time',
            '.release-date'
        ];

        for (const selector of airdateSelectors) {
            const element = doc.querySelector(selector);
            if (element) {
                const text = element.textContent || element.innerText || element.getAttribute('datetime') || '';
                const yearMatch = text.match(/\b(19|20)\d{2}\b/);
                if (yearMatch) {
                    airdate = yearMatch[0];
                    break;
                }
            }
        }

        // Fallback: try to extract from URL or page title
        if (!airdate) {
            const title = doc.title || '';
            const yearMatch = title.match(/\b(19|20)\d{2}\b/);
            if (yearMatch) {
                airdate = yearMatch[0];
            }
        }

        if (description || aliases || airdate) {
            details.push({
                description: description.trim() || 'No description available',
                aliases: cleanTitle(aliases) || 'N/A',
                airdate: airdate || 'Unknown'
            });
        }

    } catch (error) {
        console.error('Error in extractDetails:', error);
    }

    return details;
}

/**
 * Extract episodes from a series page
 * @param {string} html - Raw HTML content
 * @returns {Array} Array of episode objects
 */
function extractEpisodes(html) {
    const episodes = [];

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Look for episode links
        const episodeSelectors = [
            'a[href*="/series/"][href*="/1/"]', // Season 1 episodes
            'a[href*="/episodes/"]',
            '[class*="episode"] a',
            '[class*="episode-item"] a',
            '.episode-list a'
        ];

        let episodeLinks = [];
        for (const selector of episodeSelectors) {
            episodeLinks = doc.querySelectorAll(selector);
            if (episodeLinks.length > 0) break;
        }

        episodeLinks.forEach((link, index) => {
            try {
                const href = link.getAttribute('href');
                if (!href) return;

                // Extract episode number
                let episodeNumber = '';

                // Try to extract from URL pattern like /series/id-title/season/episode
                const urlMatch = href.match(/\/series\/\d+-[^/]+\/\d+\/(\d+)/);
                if (urlMatch) {
                    episodeNumber = urlMatch[1];
                } else {
                    // Try to extract from link text
                    const text = link.textContent || link.innerText || '';
                    const numberMatch = text.match(/(?:Episode|Ep\.?)\s*(\d+)|^(\d+)$/i);
                    if (numberMatch) {
                        episodeNumber = numberMatch[1] || numberMatch[2];
                    } else {
                        // Fallback: use index + 1
                        episodeNumber = (index + 1).toString();
                    }
                }

                if (href && episodeNumber) {
                    episodes.push({
                        href: getAbsoluteUrl(href),
                        number: episodeNumber
                    });
                }
            } catch (e) {
                console.warn('Error parsing episode link:', e);
            }
        });

        // Sort episodes by episode number
        episodes.sort((a, b) => parseInt(a.number) - parseInt(b.number));

    } catch (error) {
        console.error('Error in extractEpisodes:', error);
    }

    return episodes;
}

/**
 * Extract stream URL from a movie/episode page
 * @param {string} html - Raw HTML content
 * @returns {string|null} Stream URL or null if not found
 */
function extractStreamUrl(html) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Look for video sources
        const videoSelectors = [
            'video source',
            'video',
            'source[src]',
            'iframe[src*="embed"]',
            'iframe[src*="player"]',
            '[data-src*=".mp4"]',
            '[data-src*=".m3u8"]'
        ];

        for (const selector of videoSelectors) {
            const element = doc.querySelector(selector);
            if (element) {
                const src = element.src || element.getAttribute('data-src') || element.getAttribute('href');
                if (src) {
                    return getAbsoluteUrl(src);
                }
            }
        }

        // Look for JavaScript embedded URLs
        const scripts = doc.querySelectorAll('script');
        for (const script of scripts) {
            const scriptContent = script.textContent || script.innerText || '';

            // Look for common video URL patterns
            const urlPatterns = [
                /["']([^"']*\.m3u8[^"']*)/g,
                /["']([^"']*\.mp4[^"']*)/g,
                /src["']?\s*[:=]\s*["']([^"']+)/g,
                /url["']?\s*[:=]\s*["']([^"']+)/g
            ];

            for (const pattern of urlPatterns) {
                const matches = scriptContent.matchAll(pattern);
                for (const match of matches) {
                    const url = match[1];
                    if (url && (url.includes('.m3u8') || url.includes('.mp4'))) {
                        return getAbsoluteUrl(url);
                    }
                }
            }
        }

        // Check for data attributes and meta tags
        const metaSelectors = [
            'meta[property="og:video"]',
            'meta[property="og:video:url"]',
            'meta[name="twitter:player"]',
            '[data-video-url]',
            '[data-stream-url]'
        ];

        for (const selector of metaSelectors) {
            const element = doc.querySelector(selector);
            if (element) {
                const url = element.getAttribute('content') || 
                           element.getAttribute('data-video-url') || 
                           element.getAttribute('data-stream-url');
                if (url) {
                    return getAbsoluteUrl(url);
                }
            }
        }

        // Last resort: look for any URL in the page that might be a stream
        const pageText = doc.documentElement.textContent || doc.documentElement.innerText || '';
        const streamUrlMatch = pageText.match(/https?:\/\/[^\s"'<>]+\.(m3u8|mp4)/i);
        if (streamUrlMatch) {
            return streamUrlMatch[0];
        }

    } catch (error) {
        console.error('Error in extractStreamUrl:', error);
    }

    return null;
}
