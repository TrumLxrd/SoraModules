/**
 * Willow.arlen.icu Sora Scraper Module - CORRECTED VERSION
 * Fixed searchResults function to properly handle the current HTML structure
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
 * CORRECTED: Extract search results from HTML - Updated for current willow.arlen.icu structure
 */
function searchResults(html) {
    const results = [];

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // NEW: Look for the specific search results structure found on willow.arlen.icu
        // The search results page has a "SEARCH RESULTS" section with specific formatting

        // First, check if this is the search results page with actual results
        const searchResultsSection = doc.querySelector('h1, h2, h3');
        const isSearchResultsPage = searchResultsSection && 
            (searchResultsSection.textContent.includes('SEARCH RESULTS') || 
             doc.body.textContent.includes('SEARCH RESULTS'));

        if (isSearchResultsPage) {
            // Look for movie/series cards in the search results section
            // Based on the HTML structure, each result appears to be in a specific format
            const movieCards = doc.querySelectorAll('div, section, article');

            for (const card of movieCards) {
                try {
                    // Look for title patterns within each potential card
                    const titleElements = card.querySelectorAll('h1, h2, h3, h4, h5, h6, .title, [class*="title"]');
                    const links = card.querySelectorAll('a[href*="/movies/"], a[href*="/series/"]');

                    // Check if this card contains a movie/series
                    if (links.length > 0 || titleElements.length > 0) {
                        let title = '';
                        let href = '';
                        let image = '';

                        // Extract link first
                        if (links.length > 0) {
                            href = links[0].getAttribute('href');
                        }

                        // Extract title from various possible locations
                        for (const titleEl of titleElements) {
                            const textContent = titleEl.textContent || titleEl.innerText || '';
                            if (textContent.trim() && !textContent.includes('SEARCH RESULTS') && 
                                !textContent.includes('Pages') && textContent.length > 1) {
                                title = textContent.trim();
                                break;
                            }
                        }

                        // If no title found in headers, look in the card text
                        if (!title) {
                            const cardText = card.textContent || card.innerText || '';
                            const lines = cardText.split('\n').filter(line => line.trim());
                            for (const line of lines) {
                                if (line.trim() && !line.includes('SEARCH RESULTS') && 
                                    !line.includes('Pages') && line.length > 1 && line.length < 100) {
                                    title = line.trim();
                                    break;
                                }
                            }
                        }

                        // Look for images
                        const img = card.querySelector('img');
                        if (img) {
                            image = img.src || img.getAttribute('data-src') || '';
                        }

                        // If we found valid data, add to results
                        if (title && title.length > 1) {
                            results.push({
                                title: cleanTitle(title),
                                image: getAbsoluteUrl(image),
                                href: getAbsoluteUrl(href)
                            });
                        }
                    }
                } catch (e) {
                    console.warn('Error parsing search result card:', e);
                }
            }
        }

        // FALLBACK: If no results found with the above method, try alternative selectors
        if (results.length === 0) {
            // Try to find any links that contain movie or series patterns
            const allLinks = doc.querySelectorAll('a[href*="/movies/"], a[href*="/series/"]');

            allLinks.forEach(link => {
                try {
                    const href = link.getAttribute('href');
                    let title = link.textContent || link.innerText || '';

                    // If link doesn't have text, look for nearby text
                    if (!title.trim()) {
                        const parent = link.parentElement;
                        if (parent) {
                            title = parent.textContent || parent.innerText || '';
                        }
                    }

                    // Extract title from URL if still no title
                    if (!title.trim() && href) {
                        const urlMatch = href.match(/\/(movies|series)\/\d+-(.+)$/);
                        if (urlMatch) {
                            title = urlMatch[2].replace(/-/g, ' ');
                        }
                    }

                    const img = link.querySelector('img') || link.parentElement?.querySelector('img');
                    const image = img ? img.src || img.getAttribute('data-src') || '' : '';

                    if (title.trim() && href) {
                        results.push({
                            title: cleanTitle(title),
                            image: getAbsoluteUrl(image),
                            href: getAbsoluteUrl(href)
                        });
                    }
                } catch (e) {
                    console.warn('Error parsing fallback link:', e);
                }
            });
        }

        // Remove duplicates based on href
        const uniqueResults = [];
        const seenHrefs = new Set();

        for (const result of results) {
            if (result.href && !seenHrefs.has(result.href)) {
                seenHrefs.add(result.href);
                uniqueResults.push(result);
            }
        }

        console.log(`Found ${uniqueResults.length} search results`);

    } catch (error) {
        console.error('Error in searchResults:', error);
        console.error('Error details:', error.message, error.stack);
    }

    return results;
}

/**
 * Extract details from a movie/series page
 */
function extractDetails(html) {
    const details = [];

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Extract description with multiple selector strategies
        let description = '';
        const descSelectors = [
            '[class*="description"]',
            '[class*="overview"]',
            '[class*="synopsis"]',
            'p:contains("plot")',
            '.content p',
            'meta[name="description"]',
            '[itemprop="description"]',
            'p' // Fallback to any paragraph
        ];

        for (const selector of descSelectors) {
            const element = doc.querySelector(selector);
            if (element) {
                if (element.tagName === 'META') {
                    description = element.getAttribute('content') || '';
                } else {
                    description = element.textContent || element.innerText || '';
                }
                if (description.trim() && description.length > 10) break;
            }
        }

        // Extract aliases/alternative titles
        let aliases = '';
        const aliasSelectors = [
            'h1',
            '.title',
            '[class*="original-title"]',
            '[class*="alt-title"]',
            'title'
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

        details.push({
            description: description.trim() || 'No description available',
            aliases: cleanTitle(aliases) || 'N/A',
            airdate: airdate || 'Unknown'
        });

    } catch (error) {
        console.error('Error in extractDetails:', error);
    }

    return details;
}

/**
 * Extract episodes from a series page
 */
function extractEpisodes(html) {
    const episodes = [];

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Look for episode links with multiple selector strategies
        const episodeSelectors = [
            'a[href*="/series/"][href*="/1/"]', // Season 1 episodes
            'a[href*="/episodes/"]',
            '[class*="episode"] a',
            '[class*="episode-item"] a',
            '.episode-list a',
            'a[href*="/watch/"]' // Alternative watch pattern
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

                // Extract episode number from URL pattern
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
 */
function extractStreamUrl(html) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Look for video sources with comprehensive detection
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
                if (src && (src.includes('.mp4') || src.includes('.m3u8') || src.includes('player'))) {
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
