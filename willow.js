/**
 * Willow Sora Scraper Module with TMDB API Integration
 * Uses The Movie Database API for search and metadata
 * Constructs streaming URLs for willow.arlen.icu
 * API Key: d9956abacedb5b43a16cc4864b26d451
 */

// TMDB API Configuration
const TMDB_API_KEY = "d9956abacedb5b43a16cc4864b26d451";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const WILLOW_BASE_URL = "https://willow.arlen.icu";

/**
 * Utility function to make HTTP requests
 * Compatible with Sora's soraFetch if available, otherwise uses basic fetch
 */
async function makeRequest(url, options = {}) {
    try {
        // Use soraFetch if available (Sora environment)
        if (typeof soraFetch !== 'undefined') {
            const response = await soraFetch(url, options);
            return await response.json();
        }

        // Fallback to standard fetch
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Request failed:', error);
        throw error;
    }
}

/**
 * Search for movies and TV shows using TMDB API
 * @param {string} keyword - Search query
 * @returns {string} JSON string of search results
 */
async function searchResults(keyword) {
    try {
        console.log(`Searching for: "${keyword}"`);

        if (!keyword || keyword.trim() === '') {
            console.log('Empty search keyword');
            return JSON.stringify([]);
        }

        const encodedKeyword = encodeURIComponent(keyword.trim());
        const searchUrl = `${TMDB_BASE_URL}/search/multi?api_key=${TMDB_API_KEY}&query=${encodedKeyword}&include_adult=false`;

        console.log(`TMDB Search URL: ${searchUrl}`);

        const data = await makeRequest(searchUrl);

        if (!data || !data.results || !Array.isArray(data.results)) {
            console.log('Invalid TMDB response format');
            return JSON.stringify([]);
        }

        console.log(`Found ${data.results.length} results from TMDB`);

        const transformedResults = data.results
            .filter(result => {
                // Filter out person results and items without titles
                return (result.media_type === 'movie' || result.media_type === 'tv') && 
                       (result.title || result.name);
            })
            .map(result => {
                const isMovie = result.media_type === 'movie' || result.title;
                const title = result.title || result.name || result.original_title || result.original_name || 'Unknown';
                const releaseYear = result.release_date ? 
                    result.release_date.split('-')[0] : 
                    (result.first_air_date ? result.first_air_date.split('-')[0] : '');

                const titleWithYear = releaseYear ? `${title} (${releaseYear})` : title;
                const image = result.poster_path ? `${TMDB_IMAGE_BASE}${result.poster_path}` : '';

                // Construct willow.arlen.icu URLs based on TMDB data
                let href;
                if (isMovie) {
                    href = `${WILLOW_BASE_URL}/movies/${result.id}-${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
                } else {
                    href = `${WILLOW_BASE_URL}/series/${result.id}-${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
                }

                return {
                    title: titleWithYear,
                    image: image,
                    href: href
                };
            });

        console.log(`Transformed ${transformedResults.length} results for Sora`);

        return JSON.stringify(transformedResults);

    } catch (error) {
        console.error('Error in searchResults:', error);
        return JSON.stringify([{
            title: 'Search Error - Check API Key',
            image: '',
            href: ''
        }]);
    }
}

/**
 * Extract movie/TV show details using TMDB API
 * @param {string} url - The URL from search results
 * @returns {string} JSON string of details
 */
async function extractDetails(url) {
    try {
        console.log(`Extracting details from: ${url}`);

        // Parse TMDB ID from the constructed URL
        const movieMatch = url.match(/\/movies\/(\d+)-/);
        const seriesMatch = url.match(/\/series\/(\d+)-/);

        let tmdbId, mediaType;

        if (movieMatch) {
            tmdbId = movieMatch[1];
            mediaType = 'movie';
        } else if (seriesMatch) {
            tmdbId = seriesMatch[1];
            mediaType = 'tv';
        } else {
            console.log('Could not parse TMDB ID from URL');
            return JSON.stringify([]);
        }

        console.log(`Getting details for ${mediaType} ID: ${tmdbId}`);

        const detailsUrl = `${TMDB_BASE_URL}/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
        const data = await makeRequest(detailsUrl);

        if (!data) {
            console.log('No data received from TMDB details API');
            return JSON.stringify([]);
        }

        const title = data.title || data.name || 'Unknown';
        const originalTitle = data.original_title || data.original_name || '';
        const description = data.overview || 'No description available';
        const releaseDate = data.release_date || data.first_air_date || 'Unknown';
        const rating = data.vote_average || 0;
        const genres = data.genres ? data.genres.map(g => g.name).join(', ') : 'Unknown';

        const details = [{
            description: description,
            aliases: originalTitle !== title ? originalTitle : 'N/A',
            airdate: releaseDate,
            rating: rating.toString(),
            genres: genres,
            runtime: data.runtime || data.episode_run_time?.[0] || 'Unknown'
        }];

        console.log(`Extracted details for: ${title}`);

        return JSON.stringify(details);

    } catch (error) {
        console.error('Error in extractDetails:', error);
        return JSON.stringify([{
            description: 'Error fetching details',
            aliases: 'N/A',
            airdate: 'Unknown',
            rating: '0',
            genres: 'Unknown',
            runtime: 'Unknown'
        }]);
    }
}

/**
 * Extract episodes for TV series using TMDB API
 * @param {string} url - The series URL
 * @returns {string} JSON string of episodes
 */
async function extractEpisodes(url) {
    try {
        console.log(`Extracting episodes from: ${url}`);

        // Check if this is a movie URL (movies don't have episodes)
        const movieMatch = url.match(/\/movies\/(\d+)-/);
        if (movieMatch) {
            const tmdbId = movieMatch[1];
            const movieUrl = `${WILLOW_BASE_URL}/movies/${tmdbId}-movie?play=true`;

            return JSON.stringify([{
                href: movieUrl,
                number: '1',
                title: 'Full Movie'
            }]);
        }

        // Parse TV series ID
        const seriesMatch = url.match(/\/series\/(\d+)-/);
        if (!seriesMatch) {
            console.log('Could not parse series ID from URL');
            return JSON.stringify([]);
        }

        const tmdbId = seriesMatch[1];
        console.log(`Getting episodes for TV series ID: ${tmdbId}`);

        // Get series details first to check number of seasons
        const seriesUrl = `${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
        const seriesData = await makeRequest(seriesUrl);

        if (!seriesData) {
            console.log('No series data received');
            return JSON.stringify([]);
        }

        // Get season 1 episodes (most common case)
        const seasonUrl = `${TMDB_BASE_URL}/tv/${tmdbId}/season/1?api_key=${TMDB_API_KEY}&language=en-US`;
        const seasonData = await makeRequest(seasonUrl);

        if (!seasonData || !seasonData.episodes || !Array.isArray(seasonData.episodes)) {
            console.log('No episodes found for season 1');
            return JSON.stringify([]);
        }

        const episodes = seasonData.episodes.map(episode => {
            const episodeUrl = `${WILLOW_BASE_URL}/series/${tmdbId}-${seriesData.name?.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'series'}/1/${episode.episode_number}`;

            return {
                href: episodeUrl,
                number: episode.episode_number.toString(),
                title: episode.name || `Episode ${episode.episode_number}`
            };
        });

        console.log(`Found ${episodes.length} episodes for season 1`);

        return JSON.stringify(episodes);

    } catch (error) {
        console.error('Error in extractEpisodes:', error);
        return JSON.stringify([]);
    }
}

/**
 * Extract streaming URL from willow.arlen.icu page
 * @param {string} url - The content URL
 * @returns {string} Streaming URL or null
 */
async function extractStreamUrl(url) {
    try {
        console.log(`Extracting stream URL from: ${url}`);

        // Add play parameter to the URL for willow.arlen.icu
        const playUrl = url.includes('?') ? `${url}&play=true` : `${url}?play=true`;

        console.log(`Play URL: ${playUrl}`);

        // Try to fetch the page content
        let response;
        try {
            if (typeof soraFetch !== 'undefined') {
                response = await soraFetch(playUrl);
            } else {
                response = await fetch(playUrl);
            }

            if (!response.ok) {
                console.log(`HTTP error: ${response.status}`);
                return null;
            }

            const html = await response.text();

            // Look for common video URL patterns in the HTML
            const videoUrlPatterns = [
                /["']([^"']*\.m3u8[^"']*)/gi,
                /["']([^"']*\.mp4[^"']*)/gi,
                /src["']?\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4))/gi,
                /url["']?\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4))/gi
            ];

            for (const pattern of videoUrlPatterns) {
                const matches = html.matchAll(pattern);
                for (const match of matches) {
                    const potentialUrl = match[1];
                    if (potentialUrl && (potentialUrl.includes('.m3u8') || potentialUrl.includes('.mp4'))) {
                        console.log(`Found potential stream URL: ${potentialUrl}`);

                        // Make URL absolute if relative
                        if (potentialUrl.startsWith('//')) {
                            return 'https:' + potentialUrl;
                        } else if (potentialUrl.startsWith('/')) {
                            return WILLOW_BASE_URL + potentialUrl;
                        } else if (potentialUrl.startsWith('http')) {
                            return potentialUrl;
                        }
                    }
                }
            }

            // Look for video elements
            const videoMatch = html.match(/<video[^>]*>.*?<source[^>]*src=["']([^"']+)["']/i);
            if (videoMatch) {
                console.log(`Found video source: ${videoMatch[1]}`);
                return videoMatch[1];
            }

            // Look for iframe sources
            const iframeMatch = html.match(/<iframe[^>]*src=["']([^"']+)["']/i);
            if (iframeMatch) {
                console.log(`Found iframe source: ${iframeMatch[1]}`);
                return iframeMatch[1];
            }

        } catch (fetchError) {
            console.log(`Fetch error: ${fetchError.message}`);
        }

        // Fallback: Return a constructed stream URL based on the content URL
        console.log('No stream URL found, returning constructed URL');
        return playUrl;

    } catch (error) {
        console.error('Error in extractStreamUrl:', error);
        return null;
    }
}

// Export functions for Sora framework
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        searchResults,
        extractDetails,
        extractEpisodes,
        extractStreamUrl
    };
}
