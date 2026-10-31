// After `maxFails` wrong attempts for the same login ID from the same address, further attempts are refused until the window passes.
module.exports = function makeLoginLimiter({ maxFails = 5, windowMs = 15 * 60 * 1000, maxKeys = 10000 } = {}) {
    const fails = new Map();
    const keyOf = (loginId, ip) => `${ip}|${loginId}`;

    function prune(now) {
        for (const [k, v] of fails) if (v.resetAt <= now) fails.delete(k);
        if (fails.size > maxKeys) fails.clear();
    }

    return {
        retryAfter(loginId, ip, now = Date.now()) {
            const e = fails.get(keyOf(loginId, ip));
            if (!e || e.resetAt <= now || e.count < maxFails) return 0;
            return Math.ceil((e.resetAt - now) / 1000);
        },
        fail(loginId, ip, now = Date.now()) {
            if (fails.size > maxKeys) prune(now);
            const k = keyOf(loginId, ip);
            const e = fails.get(k);
            if (!e || e.resetAt <= now) fails.set(k, { count: 1, resetAt: now + windowMs });
            else e.count += 1;
        },
        succeed(loginId, ip) {
            fails.delete(keyOf(loginId, ip));
        },
    };
};