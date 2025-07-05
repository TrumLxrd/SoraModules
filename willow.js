/**
 * Willow Sora Scraper Module - Corrected Version
 * Fixed to use synchronous functions as required by Sora framework
 * No async/await - returns arrays directly
 */

// Utility functions
function cleanTitle(title) {
    if (!title) return '';
    return title
        .replace(/'/g, "'")
        .replace(/–/g, "-")
        .replace(/&#[0-9]+;/g, "")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
}

function getAbsoluteUrl(url, baseUrl) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return (baseUrl || 'https://willow.arlen.icu') + url;
    return (baseUrl || 'https://willow.arlen.icu') + '/' + url;
}

/**
 * SYNCHRONOUS search results function
 * Takes HTML string and returns array of search results
 */
function searchResults(html) {
    console.log('[Willow] searchResults called with HTML length:', html ? html.length : 0);

    if (!html || html.trim() === '') {
        console.log('[Willow] Empty HTML provided');
        return [];
    }

    var results = [];

    try {
        // Create a temporary DOM element to parse HTML
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // Strategy 1: Look for direct movie/series links
        var movieLinks = tempDiv.querySelectorAll('a[href*="/movies/"], a[href*="/series/"]');
        console.log('[Willow] Found', movieLinks.length, 'direct movie/series links');

        for (var i = 0; i < movieLinks.length; i++) {
            var link = movieLinks[i];
            var href = link.getAttribute('href');
            var img = link.querySelector('img');
            var titleEl = link.querySelector('h1, h2, h3, h4, h5, h6, .title, [class*="title"]');

            if (!titleEl) {
                // Try parent elements
                var parent = link.parentElement;
                if (parent) {
                    titleEl = parent.querySelector('h1, h2, h3, h4, h5, h6, .title, [class*="title"]');
                }
            }

            var title = '';
            if (titleEl) {
                title = titleEl.textContent || titleEl.innerText || '';
            } else {
                // Extract title from href
                var urlMatch = href.match(/\/(movies|series)\/\d+-(.+)$/);
                if (urlMatch) {
                    title = urlMatch[2].replace(/-/g, ' ');
                }
            }

            var image = '';
            if (img) {
                image = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
            }

            if (title && href) {
                results.push({
                    title: cleanTitle(title),
                    image: getAbsoluteUrl(image),
                    href: getAbsoluteUrl(href)
                });
            }
        }

        // Strategy 2: Look for any links that might contain content
        if (results.length === 0) {
            console.log('[Willow] No direct links found, trying alternative selectors');
            var allLinks = tempDiv.querySelectorAll('a[href]');

            for (var j = 0; j < allLinks.length; j++) {
                var link = allLinks[j];
                var href = link.getAttribute('href');

                // Check if href contains movie/series patterns
                if (href && (href.includes('/movies/') || href.includes('/series/'))) {
                    var textContent = link.textContent || link.innerText || '';
                    var img = link.querySelector('img');

                    if (textContent.trim()) {
                        var image = '';
                        if (img) {
                            image = img.src || img.getAttribute('data-src') || '';
                        }

                        results.push({
                            title: cleanTitle(textContent.trim()),
                            image: getAbsoluteUrl(image),
                            href: getAbsoluteUrl(href)
                        });
                    }
                }
            }
        }

        // Strategy 3: Look for text-based results (last resort)
        if (results.length === 0) {
            console.log('[Willow] No structured results found, trying text-based parsing');
            var textContent = tempDiv.textContent || tempDiv.innerText || '';

            // Look for movie/series titles in text
            var lines = textContent.split('\n');
            var currentTitle = '';

            for (var k = 0; k < lines.length; k++) {
                var line = lines[k].trim();
                if (line.length > 3 && line.length < 100) {
                    // This might be a title
                    if (line.match(/^[A-Za-z0-9\s\-:.'()]+$/)) {
                        currentTitle = line;

                        // Create a dummy result
                        results.push({
                            title: cleanTitle(currentTitle),
                            image: '',
                            href: 'https://willow.arlen.icu/search?q=' + encodeURIComponent(currentTitle)
                        });

                        // Limit to prevent too many results
                        if (results.length >= 10) break;
                    }
                }
            }
        }

        // Remove duplicates
        var uniqueResults = [];
        var seenTitles = {};

        for (var l = 0; l < results.length; l++) {
            var result = results[l];
            var titleKey = result.title.toLowerCase();

            if (!seenTitles[titleKey]) {
                seenTitles[titleKey] = true;
                uniqueResults.push(result);
            }
        }

        console.log('[Willow] Returning', uniqueResults.length, 'unique search results');
        return uniqueResults;

    } catch (error) {
        console.log('[Willow] Error in searchResults:', error.toString());
        return [];
    }
}

/**
 * Extract details from a movie/series page
 */
function extractDetails(html) {
    console.log('[Willow] extractDetails called');

    if (!html) return [];

    try {
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        var description = '';
        var aliases = '';
        var airdate = '';

        // Extract description
        var descSelectors = [
            '.description', '.overview', '.synopsis', '.plot', '.summary',
            'meta[name="description"]', 'meta[property="og:description"]',
            'p:contains("plot")', '.content p'
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

        // Extract title/aliases
        var titleSelectors = ['h1', 'h2', '.title', '.movie-title', '.series-title'];
        for (var j = 0; j < titleSelectors.length; j++) {
            var element = tempDiv.querySelector(titleSelectors[j]);
            if (element) {
                aliases = element.textContent || element.innerText || '';
                if (aliases.trim()) break;
            }
        }

        // Extract year/date
        var dateSelectors = ['.year', '.date', '.release-date', 'time', '.aired'];
        for (var k = 0; k < dateSelectors.length; k++) {
            var element = tempDiv.querySelector(dateSelectors[k]);
            if (element) {
                var text = element.textContent || element.innerText || element.getAttribute('datetime') || '';
                var yearMatch = text.match(/\b(19|20)\d{2}\b/);
                if (yearMatch) {
                    airdate = yearMatch[0];
                    break;
                }
            }
        }

        return [{
            description: description.trim() || 'No description available',
            aliases: cleanTitle(aliases) || 'N/A',
            airdate: airdate || 'Unknown'
        }];

    } catch (error) {
        console.log('[Willow] Error in extractDetails:', error.toString());
        return [];
    }
}

/**
 * Extract episodes from a series page
 */
function extractEpisodes(html) {
    console.log('[Willow] extractEpisodes called');

    if (!html) return [];

    try {
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        var episodes = [];
        var episodeSelectors = [
            'a[href*="/series/"][href*="/1/"]', // Season 1 episodes
            'a[href*="/episodes/"]',
            '.episode a',
            '.episode-item a',
            '.episode-list a'
        ];

        for (var i = 0; i < episodeSelectors.length; i++) {
            var links = tempDiv.querySelectorAll(episodeSelectors[i]);
            if (links.length > 0) {
                for (var j = 0; j < links.length; j++) {
                    var link = links[j];
                    var href = link.getAttribute('href');
                    if (!href) continue;

                    var episodeNumber = '';
                    var urlMatch = href.match(/\/series\/\d+-[^/]+\/\d+\/(\d+)/);
                    if (urlMatch) {
                        episodeNumber = urlMatch[1];
                    } else {
                        var text = link.textContent || link.innerText || '';
                        var numberMatch = text.match(/(?:Episode|Ep\.?)\s*(\d+)|^(\d+)$/i);
                        if (numberMatch) {
                            episodeNumber = numberMatch[1] || numberMatch[2];
                        } else {
                            episodeNumber = (j + 1).toString();
                        }
                    }

                    if (href && episodeNumber) {
                        episodes.push({
                            href: getAbsoluteUrl(href),
                            number: episodeNumber
                        });
                    }
                }

                if (episodes.length > 0) break;
            }
        }

        // Sort episodes by number
        episodes.sort(function(a, b) {
            return parseInt(a.number) - parseInt(b.number);
        });

        console.log('[Willow] Found', episodes.length, 'episodes');
        return episodes;

    } catch (error) {
        console.log('[Willow] Error in extractEpisodes:', error.toString());
        return [];
    }
}

/**
 * Extract stream URL from a movie/episode page
 */
function extractStreamUrl(html) {
    console.log('[Willow] extractStreamUrl called');

    if (!html) return null;

    try {
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // Look for video sources
        var videoSelectors = [
            'video source', 'video', 'source[src]',
            'iframe[src*="embed"]', 'iframe[src*="player"]',
            '[data-src*=".mp4"]', '[data-src*=".m3u8"]'
        ];

        for (var i = 0; i < videoSelectors.length; i++) {
            var element = tempDiv.querySelector(videoSelectors[i]);
            if (element) {
                var src = element.src || element.getAttribute('data-src') || element.getAttribute('href');
                if (src) {
                    console.log('[Willow] Found video source:', src);
                    return getAbsoluteUrl(src);
                }
            }
        }

        // Look in script tags for embedded URLs
        var scripts = tempDiv.querySelectorAll('script');
        for (var j = 0; j < scripts.length; j++) {
            var script = scripts[j];
            var scriptContent = script.textContent || script.innerText || '';

            var urlPatterns = [
                /["']([^"']*\.m3u8[^"']*)/g,
                /["']([^"']*\.mp4[^"']*)/g,
                /src["']?\s*[:=]\s*["']([^"']+)/g
            ];

            for (var k = 0; k < urlPatterns.length; k++) {
                var pattern = urlPatterns[k];
                var match = pattern.exec(scriptContent);
                if (match) {
                    var url = match[1];
                    if (url && (url.includes('.m3u8') || url.includes('.mp4'))) {
                        console.log('[Willow] Found stream URL in script:', url);
                        return getAbsoluteUrl(url);
                    }
                }
            }
        }

        console.log('[Willow] No stream URL found');
        return null;

    } catch (error) {
        console.log('[Willow] Error in extractStreamUrl:', error.toString());
        return null;
    }
}

// Export functions for testing (optional)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        searchResults: searchResults,
        extractDetails: extractDetails,
        extractEpisodes: extractEpisodes,
        extractStreamUrl: extractStreamUrl
    };
}
