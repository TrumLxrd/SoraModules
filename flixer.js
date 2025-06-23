// Filename: flixer.js

function Flixer() {
    this.name = "Flixer";
    this.baseUrl = "https://flixer.su";
    this.tmdbKey = "d9956abacedb5b43a16cc4864b26d451";
    this.searchUrl = "https://api.themoviedb.org/3/search/multi?api_key=" + this.tmdbKey + "&language=en-US&query=";
    this.imageBase = "https://image.tmdb.org/t/p/w500";
    this.headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    };
}

/**
 * Search Function (via TMDB) - No HTML parsing, so no changes needed.
 * Returns a Promise that resolves with an array of search results.
 */
Flixer.prototype.search = function(query, type) {
    var self = this;
    return fetch(self.searchUrl + encodeURIComponent(query))
        .then(function(res) {
            if (!res.ok) { throw new Error("TMDB search request failed"); }
            return res.json();
        })
        .then(function(json) {
            var results = [];
            if (json.results) {
                for (var i = 0; i < json.results.length; i++) {
                    var item = json.results[i];
                    if ((type === "movie" && item.media_type === "movie") || (type === "tv" && item.media_type === "tv")) {
                        var title = item.media_type === "movie" ? item.title : item.name;
                        var date = item.release_date || item.first_air_date || "";
                        var year = date.split("-")[0] || "";
                        var img = item.poster_path ? self.imageBase + item.poster_path : "";
                        var syntheticUrl = self.baseUrl + "/tmdb/" + item.media_type + "/" + item.id;
                        results.push({
                            title: title,
                            url: syntheticUrl,
                            img: img,
                            year: year
                        });
                    }
                }
            }
            return results;
        })
        .catch(function(err) {
            console.error("Flixer Search Error:", err);
            return [];
        });
};

/**
 * Get Sources Function (for Movies or TV Shows) - Uses regex for parsing.
 */
Flixer.prototype.get_sources = function(url) {
    var self = this;
    return new Promise(function(resolve) {
        var match = url.match(/\/(movie|tv)\/(\d+)/);
        if (!match) return resolve([]);

        var type = match[1];
        var tmdbId = match[2];

        var detailsUrl = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + self.tmdbKey;
        fetch(detailsUrl)
            .then(function(res) { if (!res.ok) throw new Error("TMDB details failed"); return res.json(); })
            .then(function(details) {
                var title = (type === "movie" ? details.title : details.name) || "";
                var slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/[\s-]+/g, '-');
                var flixerSearchUrl = self.baseUrl + "/search/" + slug;
                return fetch(flixerSearchUrl, { headers: self.headers });
            })
            .then(function(res) { if (!res.ok) throw new Error("Flixer search failed"); return res.text(); })
            .then(function(html) {
                // Use regex to find the first search result link
                var linkRegex = /<a class="film-poster-ahref" href="([^"]+)">/g;
                var linkMatch = linkRegex.exec(html);
                if (!linkMatch || !linkMatch[1]) throw new Error("No content link found on Flixer");
                
                var contentUrl = self.baseUrl + linkMatch[1];
                return fetch(contentUrl, { headers: self.headers });
            })
            .then(function(res) { if (!res.ok) throw new Error("Flixer content page failed"); return res.text(); })
            .then(function(contentHtml) {
                if (type === "tv") {
                    resolve(self._extract_tv_sources(contentHtml));
                } else {
                    resolve(self._extract_movie_sources(contentHtml));
                }
            })
            .catch(function(err) {
                console.error("Flixer Get Sources Error:", err);
                resolve([]);
            });
    });
};

/**
 * Get Episode Sources Function - No HTML parsing needed here.
 */
Flixer.prototype.get_episode_sources = function(url) {
    // The URL passed here is already the direct playable iframe embed link
    return Promise.resolve([{
        url: url,
        type: 'iframe',
        title: 'VidSrc Player'
    }]);
};

// --- Internal Helper Functions (Regex-Only) ---

Flixer.prototype._extract_movie_sources = function(html) {
    var sources = [];
    // Use regex to find the movie iframe player
    var iframeRegex = /<iframe id="iframe-embed" src="([^"]+)"/g;
    var iframeMatch = iframeRegex.exec(html);

    if (iframeMatch && iframeMatch[1]) {
        sources.push({
            url: iframeMatch[1],
            type: 'iframe',
            title: 'VidSrc Player'
        });
    }
    return sources;
};

Flixer.prototype._extract_tv_sources = function(html) {
    var sources = [];
    var baseEmbedUrl = "";

    // Use regex to find the base iframe URL, which contains the IMDb ID
    var iframeRegex = /<iframe id="iframe-embed" src="([^"]+)"/g;
    var iframeMatch = iframeRegex.exec(html);
    if (!iframeMatch || !iframeMatch[1]) return [];
    baseEmbedUrl = iframeMatch[1];

    // Use regex in a loop to find all seasons
    var seasonRegex = /<div class="ss-item" data-id="(\d+)">\s*Season (\d+)\s*<\/div>/g;
    var seasonMatch;
    while ((seasonMatch = seasonRegex.exec(html)) !== null) {
        var seasonNum = seasonMatch[2];
        var seasonDataId = seasonMatch[1];

        // Use another regex in a loop to find all episodes for the current season
        var episodeRegex = new RegExp('<div class="eps-item[^"]*" data-s-id="' + seasonDataId + '" data-number="(\\d+)"', "g");
        var epMatch;
        while ((epMatch = episodeRegex.exec(html)) !== null) {
            var epNum = epMatch[1];
            sources.push({
                url: baseEmbedUrl + '/' + seasonNum + '/' + epNum,
                title: 'Season ' + seasonNum + ' Episode ' + epNum,
                type: 'episode'
            });
        }
    }
    return sources;
};


// Finally, instantiate the module so Sora can use it.
var module = new Flixer();
