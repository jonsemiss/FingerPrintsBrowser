// Auto-detect timezone from IP address.
// Uses free APIs: first tries ip-api.com, fallback to worldtimeapi.org.
// Returns { timezone, geoposition, country, city } or null on failure.

const http = require('http');

function httpGet(url, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { timeout }, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve(d));
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.on('error', reject);
    });
}

/**
 * Get timezone info for an IP address (or current machine's public IP if ip is null).
 * @param {string|null} ip - IP address to query, or null for current public IP.
 * @returns {Promise<{timezone: string, geoposition: string, country: string, city: string, ip: string}|null>}
 */
async function getTimezoneForIp(ip) {
    // ip-api.com (free, no key, 45 req/min)
    try {
        const target = ip || '';  // empty = caller's IP
        const raw = await httpGet(`http://ip-api.com/json/${target}?fields=status,timezone,lat,lon,country,city,query`);
        const data = JSON.parse(raw);
        if (data.status === 'success') {
            return {
                timezone: data.timezone,
                geoposition: `${data.lat},${data.lon},1000`,
                country: data.country,
                city: data.city,
                ip: data.query,
            };
        }
    } catch { /* fallback */ }

    // Fallback: worldtimeapi.org (only works for caller's own IP)
    if (!ip) {
        try {
            const raw = await httpGet('http://worldtimeapi.org/api/ip');
            const data = JSON.parse(raw);
            return {
                timezone: data.timezone,
                geoposition: '',  // worldtimeapi doesn't give lat/lon
                country: '',
                city: '',
                ip: data.client_ip || '',
            };
        } catch { /* give up */ }
    }

    return null;
}

module.exports = { getTimezoneForIp };
