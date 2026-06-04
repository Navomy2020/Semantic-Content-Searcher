import rateLimit from 'express-rate-limit';

export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100, 
    standardHeaders: true,
    legacyHeaders: false, 
    message: {
        status: 429,
        error: "Too many requests from this IP, please try again after 15 minutes."
    }
});


export const aiIngestionLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, 
    max: 5, 
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: 429,
        error: "Security Alert: File upload capacity exceeded for this hour. Please try again later."
    }
});

export const searchLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute sliding window
    max: 15, // Limit each IP or user session to 15 search questions per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: 429,
        error: "Rate Limit Exceeded: You are submitting questions too quickly. Please pause for a moment and try again."
    }
});