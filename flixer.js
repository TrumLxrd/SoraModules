// flixer.js

// Main functions
export const search = async (query, page = 1) => {
  try {
    const encodedQuery = encodeURIComponent(query);
    const tmdbUrl = searchBaseUrl.replace('%s', encodedQuery);
    
    const response = await fetch(tmdbUrl);
    
    if (!response.ok) {
      throw new Error(`TMDB search failed with status ${response.status}`);
    }
    
    const data = await response.json();
    const results = [];
    
    for (const item of data.results || []) {
      // Skip if not movie or tv
      if (item.media_type !== 'movie' && item.media_type !== 'tv') continue;
      
      const title = item.media_type === 'movie' ? item.title : item.name;
      const year = item.release_date ? 
                   item.release_date.split('-')[0] : 
                   (item.first_air_date ? item.first_air_date.split('-')[0] : '');
      
      const image = item.poster_path ? 
                    `https://image.tmdb.org/t/p/w500${item.poster_path}` : 
                    '';
      
      // Format the URL for Flixer's site structure
      let url = `${baseUrl}/${item.media_type === 'movie' ? 'movie' : 'tv-show'}/${item.id}`;
      
      results.push({
        title,
        url,
        image,
        year,
        type: item.media_type
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
