// flixer.js

// Module exports
export const sourceName = "Flixer";
export const iconUrl = "https://flixer.su/favicon.ico";
export const author = "SoraCoder";
export const version = "1.0.0";
export const language = "English";
export const streamType = "embed";
export const quality = "720p - 1080p";
export const baseUrl = "https://flixer.su";
export const searchBaseUrl = "https://flixer.su/search/";
export const scriptUrl = "https://flixer.su";
export const type = "movie,tv";
export const asyncJS = true;
export const softsub = false;

// Main functions
export const search = async (query, page = 1) => {
  try {
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `${baseUrl}/ajax/search`;
    
    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': baseUrl
      },
      body: `keyword=${encodedQuery}`
    });
    
    if (!response.ok) {
      throw new Error(`Search failed with status ${response.status}`);
    }
    
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const results = [];
    const items = doc.querySelectorAll('.flw-item');
    
    for (const item of items) {
      const titleElem = item.querySelector('.film-name a');
      if (!titleElem) continue;
      
      const title = titleElem.textContent.trim();
      let url = titleElem.getAttribute('href');
      if (!url.startsWith('http')) {
        url = baseUrl + url;
      }
      
      // Determine media type
      let mediaType = "movie";
      const typeElem = item.querySelector('.fd-infor .fdi-item');
      if (typeElem && typeElem.textContent.includes('TV')) {
        mediaType = "tv";
      }
      
      // Get image
      const imgElem = item.querySelector('.film-poster img');
      const image = imgElem ? imgElem.getAttribute('data-src') || imgElem.getAttribute('src') : '';
      
      // Get year
      const yearElem = item.querySelector('.fd-infor .fdi-item:nth-child(2)');
      const year = yearElem ? yearElem.textContent.trim() : '';
      
      results.push({
        title,
        url,
        image,
        year,
        type: mediaType
      });
    }
    
    return results;
  } catch (error) {
    console.error('Search error:', error);
    return [];
  }
};

export const getSources = async (url, type) => {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': baseUrl
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch content with status ${response.status}`);
    }
    
    const html = await response.text();
    
    if (type === 'movie') {
      return extractMovieSources(html);
    } else {
      return { episodes: extractTvEpisodes(html, url) };
    }
  } catch (error) {
    console.error('Get sources error:', error);
    return type === 'movie' ? [] : { episodes: [] };
  }
};

export const getEpisodeSources = async (url) => {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': baseUrl
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch episode with status ${response.status}`);
    }
    
    const html = await response.text();
    return extractMovieSources(html); // Episodes use the same source extraction as movies
  } catch (error) {
    console.error('Get episode sources error:', error);
    return [];
  }
};

// Helper functions
function extractMovieSources(html) {
  const sources = [];
  
  // Extract server data using regex
  const serverDataMatch = html.match(/var\s+servers\s*=\s*(\[.*?\]);/s);
  if (serverDataMatch && serverDataMatch[1]) {
    try {
      const serverData = JSON.parse(serverDataMatch[1]);
      
      for (const server of serverData) {
        if (server.link) {
          sources.push({
            url: server.link,
            name: server.name || 'Unknown Server',
            type: 'iframe'
          });
        }
      }
    } catch (error) {
      console.error('Error parsing server data:', error);
    }
  }
  
  return sources;
}

function extractTvEpisodes(html, basePageUrl) {
  const episodes = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // Get all seasons
  const seasonElements = doc.querySelectorAll('.nav-item[data-season]');
  
  for (const seasonElem of seasonElements) {
    const seasonNumber = seasonElem.getAttribute('data-season');
    const seasonId = seasonElem.getAttribute('data-id');
    
    // Get episodes for this season
    const episodeElements = doc.querySelectorAll(`.episodes[data-season="${seasonNumber}"] .episode-item`);
    
    for (const episodeElem of episodeElements) {
      const episodeNumber = episodeElem.getAttribute('data-ep');
      const episodeId = episodeElem.getAttribute('data-id');
      const episodeTitle = episodeElem.querySelector('.episode-name') ? 
                           episodeElem.querySelector('.episode-name').textContent.trim() : 
                           `Episode ${episodeNumber}`;
      
      const episodeUrl = `${basePageUrl}?season=${seasonNumber}&episode=${episodeNumber}`;
      
      episodes.push({
        id: episodeId,
        title: episodeTitle,
        number: parseInt(episodeNumber),
        season: parseInt(seasonNumber),
        url: episodeUrl
      });
    }
  }
  
  // Sort episodes by season and episode number
  episodes.sort((a, b) => {
    if (a.season !== b.season) return a.season - b.season;
    return a.number - b.number;
  });
  
  return episodes;
}
