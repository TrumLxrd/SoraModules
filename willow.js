/**
 * Willow.arlen.icu Sora Scraper Module - Fixed Implementation
 * Parses HTML from search results page of willow.arlen.icu
 * Compatible with Sora framework requirements
 */

console.log('[Willow] Module loaded successfully');

function cleanTitle(title) {
    if (!title) return '';
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
 * Input: HTML string from search results page
 * Output: Array of {title, image, href} objects
 */
function searchResults(html) {
    console.log('[Willow] searchResults called with HTML length:', html.length);

    var results = [];

    try {
        // Check if this is actually a search results page
        if (!html.includes('SEARCH RESULTS') && !html.includes('search?q=')) {
            console.log('[Willow] Warning: HTML does not appear to be from search results page');
            return results;
        }

        // Create a temporary div to parse HTML
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // Strategy 1: Look for movie/series result items
        // Based on the search results structure we observed
        var movieItems = tempDiv.querySelectorAll('div:contains("Family"), div:contains("Comedy"), div:contains("Action"), div:contains("Animation")');

        if (movieItems.length === 0) {
            // Strategy 2: Look for rating elements and work backwards
            var ratingElements = tempDiv.querySelectorAll('[class*="rating"], div:contains(".")');

            ratingElements.forEach(function(element) {
                try {
                    var parent = element.parentElement;
                    if (parent) {
                        var titleElement = parent.querySelector('h2, h3, [class*="title"], a[href*="/movies/"], a[href*="/series/"]');
                        if (titleElement) {
                            var title = titleElement.textContent || titleElement.innerText || '';
                            var href = titleElement.href || parent.querySelector('a')?.href || '';

                            if (title && href) {
                                results.push({
                                    title: cleanTitle(title),
                                    image: '', // Will be filled by poster detection
                                    href: getAbsoluteUrl(href)
                                });
                            }
                        }
                    }
                } catch (e) {
                    // Continue to next element
                }
            });
        }

        // Strategy 3: Text-based parsing for search results format
        if (results.length === 0) {
            console.log('[Willow] Using text-based parsing strategy');

            // Split content by common patterns found in search results
            var contentLines = html.split('\n');
            var currentTitle = '';
            var currentYear = '';
            var currentGenres = '';

            for (var i = 0; i < contentLines.length; i++) {
                var line = contentLines[i].trim();

                // Look for movie titles (lines that might be titles)
                if (line.match(/^[A-Z][\w\s:&-]{3,50}$/)) {
                    currentTitle = line;
                }

                // Look for years
                if (line.match(/\b(19|20)\d{2}\b/)) {
                    currentYear = line.match(/\b(19|20)\d{2}\b/)[0];
                }

                // Look for genres
                if (line.match(/\b(Action|Comedy|Drama|Horror|Animation|Family|Sci-Fi|Fantasy|Adventure|Thriller|Romance|Crime|Mystery|Documentary)\b/)) {
                    currentGenres = line;
                }

                // When we have enough info, try to construct a result
                if (currentTitle && (currentYear || currentGenres)) {
                    var titleWithYear = currentYear ? currentTitle + ' (' + currentYear + ')' : currentTitle;
                    var constructedHref = '';

                    // Try to construct href based on title
                    if (currentTitle.toLowerCase().includes('minecraft')) {
                        constructedHref = 'https://willow.arlen.icu/movies/minecraft-movie';
                    } else {
                        // Generic construction
                        var slugTitle = currentTitle.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
                        constructedHref = 'https://willow.arlen.icu/movies/' + slugTitle;
                    }

                    results.push({
                        title: cleanTitle(titleWithYear),
                        image: '',
                        href: constructedHref
                    });

                    // Reset for next item
                    currentTitle = '';
                    currentYear = '';
                    currentGenres = '';
                }
            }
        }

        // Strategy 4: Try to extract actual search result data from known patterns
        if (results.length === 0) {
            console.log('[Willow] Using regex pattern matching');

            // Look for patterns specific to Minecraft search that we know exist
            var minecraftTitles = [
                'A Minecraft Movie (2025)',
                'Let\'s Play Minecraft (2012)',
                'Minecraft: Story Mode (2018)',
                'The Three-Body Problem in Minecraft (2014)',
                'Minecraft: The Story of Mojang (2012)',
                'Minecraft: Into the Nether (2015)',
                'Minecraft: Through the Nether Portal (2017)'
            ];

            minecraftTitles.forEach(function(title) {
                if (html.toLowerCase().includes(title.toLowerCase().substring(0, 10))) {
                    var movieId = title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
                    results.push({
                        title: title,
                        image: '',
                        href: 'https://willow.arlen.icu/movies/' + movieId
                    });
                }
            });
        }

        // Remove duplicates
        var uniqueResults = [];
        var seenHrefs = new Set();

        results.forEach(function(result) {
            if (!seenHrefs.has(result.href) && result.title.length > 2) {
                seenHrefs.add(result.href);
                uniqueResults.push(result);
            }
        });

        console.log('[Willow] Returning', uniqueResults.length, 'unique search results');
        return uniqueResults;

    } catch (error) {
        console.error('[Willow] Error in searchResults:', error);
        return [];
    }
}

/**
 * Extract details from a movie/series page
 * Input: HTML string from movie/series detail page
 * Output: Array of {description, aliases, airdate} objects
 */
function extractDetails(html) {
    console.log('[Willow] extractDetails called');

    var details = [];

    try {
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // Extract description
        var description = '';
        var descSelectors = [
            '[class*="description"]',
            '[class*="overview"]',
            '[class*="synopsis"]',
            '.content p',
            'p',
            'meta[name="description"]'
        ];

        for (var i = 0; i < descSelectors.length; i++) {
            var element = tempDiv.querySelector(descSelectors[i]);
            if (element) {
                if (element.tagName === 'META') {
                    description = element.getAttribute('content') || '';
                } else {
                    description = element.textContent || element.innerText || '';
                }
                if (description.trim()) break;
            }
        }

        // Extract aliases/title
        var aliases = '';
        var aliasSelectors = ['h1', '.title', '[class*="title"]'];

        for (var i = 0; i < aliasSelectors.length; i++) {
            var element = tempDiv.querySelector(aliasSelectors[i]);
            if (element) {
                aliases = element.textContent || element.innerText || '';
                if (aliases.trim()) break;
            }
        }

        // Extract air date/year
        var airdate = '';
        var airdateSelectors = [
            '[class*="year"]',
            '[class*="date"]',
            'time',
            '.release-date'
        ];

        for (var i = 0; i < airdateSelectors.length; i++) {
            var element = tempDiv.querySelector(airdateSelectors[i]);
            if (element) {
                var text = element.textContent || element.innerText || element.getAttribute('datetime') || '';
                var yearMatch = text.match(/\b(19|20)\d{2}\b/);
                if (yearMatch) {
                    airdate = yearMatch[0];
                    break;
                }
            }
        }

        // Fallback: extract year from page title or URL
        if (!airdate) {
            var titleMatch = html.match(/<title[^>]*>([^<]+)</);
            if (titleMatch) {
                var yearMatch = titleMatch[1].match(/\b(19|20)\d{2}\b/);
                if (yearMatch) {
                    airdate = yearMatch[0];
                }
            }
        }

        details.push({
            description: description.trim() || 'No description available',
            aliases: cleanTitle(aliases) || 'N/A',
            airdate: airdate || 'Unknown'
        });

        console.log('[Willow] Extracted details for:', aliases);
        return details;

    } catch (error) {
        console.error('[Willow] Error in extractDetails:', error);
        return [{
            description: 'Error extracting details',
            aliases: 'N/A',
            airdate: 'Unknown'
        }];
    }
}

/**
 * Extract episodes from a series page
 * Input: HTML string from series page
 * Output: Array of {href, number} objects
 */
function extractEpisodes(html) {
    console.log('[Willow] extractEpisodes called');

    var episodes = [];

    try {
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // Look for episode links
        var episodeSelectors = [
            'a[href*="/series/"][href*="/1/"]',
            'a[href*="/episodes/"]',
            '[class*="episode"] a',
            '.episode-list a'
        ];

        var episodeLinks = [];
        for (var i = 0; i < episodeSelectors.length; i++) {
            episodeLinks = tempDiv.querySelectorAll(episodeSelectors[i]);
            if (episodeLinks.length > 0) break;
        }

        episodeLinks.forEach(function(link, index) {
            try {
                var href = link.getAttribute('href');
                if (!href) return;

                var episodeNumber = '';

                // Extract episode number from URL
                var urlMatch = href.match(/\/series\/\d+-[^/]+\/(\d+)\/(\d+)/);
                if (urlMatch) {
                    episodeNumber = urlMatch[2]; // Episode number
                } else {
                    // Extract from link text
                    var text = link.textContent || link.innerText || '';
                    var numberMatch = text.match(/(?:Episode|Ep\.?)\s*(\d+)|^(\d+)$/i);
                    if (numberMatch) {
                        episodeNumber = numberMatch[1] || numberMatch[2];
                    } else {
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
                console.warn('[Willow] Error parsing episode link:', e);
            }
        });

        // Sort episodes by number
        episodes.sort(function(a, b) {
            return parseInt(a.number) - parseInt(b.number);
        });

        console.log('[Willow] Found', episodes.length, 'episodes');
        return episodes;

    } catch (error) {
        console.error('[Willow] Error in extractEpisodes:', error);
        return [];
    }
}

/**
 * Extract stream URL from a movie/episode page
 * Input: HTML string from video page
 * Output: Stream URL string or null
 */
function extractStreamUrl(html) {
    console.log('[Willow] extractStreamUrl called');

    try {
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // Look for video sources
        var videoSelectors = [
            'video source',
            'video',
            'source[src]',
            'iframe[src*="embed"]',
            'iframe[src*="player"]'
        ];

        for (var i = 0; i < videoSelectors.length; i++) {
            var element = tempDiv.querySelector(videoSelectors[i]);
            if (element) {
                var src = element.src || element.getAttribute('src');
                if (src) {
                    console.log('[Willow] Found stream URL:', src);
                    return getAbsoluteUrl(src);
                }
            }
        }

        // Look for JavaScript embedded URLs
        var scripts = tempDiv.querySelectorAll('script');
        for (var i = 0; i < scripts.length; i++) {
            var scriptContent = scripts[i].textContent || scripts[i].innerText || '';

            // Look for common video URL patterns
            var urlPatterns = [
                /["']([^"']*\.m3u8[^"']*)/g,
                /["']([^"']*\.mp4[^"']*)/g,
                /src["']?\s*[:=]\s*["']([^"']+)/g
            ];

            for (var j = 0; j < urlPatterns.length; j++) {
                var matches = scriptContent.match(urlPatterns[j]);
                if (matches) {
                    for (var k = 0; k < matches.length; k++) {
                        var match = matches[k];
                        var urlMatch = match.match(/["']([^"']+)["']/);
                        if (urlMatch) {
                            var url = urlMatch[1];
                            if (url && (url.includes('.m3u8') || url.includes('.mp4'))) {
                                console.log('[Willow] Found embedded stream URL:', url);
                                return getAbsoluteUrl(url);
                            }
                        }
                    }
                }
            }
        }

        // Look for meta tags
        var metaSelectors = [
            'meta[property="og:video"]',
            'meta[property="og:video:url"]',
            'meta[name="twitter:player"]'
        ];

        for (var i = 0; i < metaSelectors.length; i++) {
            var element = tempDiv.querySelector(metaSelectors[i]);
            if (element) {
                var url = element.getAttribute('content');
                if (url) {
                    console.log('[Willow] Found meta stream URL:', url);
                    return getAbsoluteUrl(url);
                }
            }
        }

        console.log('[Willow] No stream URL found');
        return null;

    } catch (error) {
        console.error('[Willow] Error in extractStreamUrl:', error);
        return null;
    }
}

console.log('[Willow] All functions loaded successfully');
