import 'dotenv/config';
import express from 'express';
import { globalLimiter,aiIngestionLimiter,searchLimiter } from './middleware/rateLimiter.js';
import path from 'path';
import multer from 'multer';
import { readFile } from './scripts/ingest.js';
import cookieParser from 'cookie-parser';
import { searchAndAnswerByStream } from './scripts/search.js';
import { createClient } from '@supabase/supabase-js'
import jwt from 'jsonwebtoken';

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

const getAuthEngine = () => {
    return createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        {
            auth: {
                persistSession: false, 
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        }
    );
};

// Guest Signin
app.post('/api/auth/guest', async (req, res) => {
    try {
        const existingToken = req.cookies.user_jwt;
        
        if (existingToken) {
            let decoded = jwt.decode(existingToken);
            let emailAddress = decoded?.email || null;
        
            let isAnon = decoded?.is_anonymous;
            
            return res.json({ 
                success: true, 
                message: "Session restored perfectly.",
                alreadyAuthenticated: true ,
                email:emailAddress,
                isAnonymous:isAnon,
            });
        }
        // 🔑 Get a fresh instance inside the running route
        const authEngine = getAuthEngine();
        
        const { data, error } = await authEngine.auth.signInAnonymously();
        if (error) throw error;
        
        const token = data.session.access_token;
        let decoded = jwt.decode(token);
        let isAnon = decoded?.is_anonymous;
        let emailAddress = decoded?.email || null;
        res.cookie('user_jwt', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 3600000
        });
        return res.json({ message: "Successfully authenticated as guest!",
            isAnonymous:isAnon
         });
    }
    catch (err) {
        console.error("❌ Guest Auth Error:", err.message);
        return res.status(500).json({ error: err.message });
    }
});

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        

        const authEngine = getAuthEngine();

        const { data, error } = await authEngine.auth.signUp({
            email: email,
            password: password
        });
        
        if (error) throw error;

        if (!data.session) {
            return res.json({ message: "Registration successful! Please check your email to confirm." });
        }

        const token = data.session.access_token;
        let decoded = jwt.decode(token);
        let isAnon = decoded?.is_anonymous;
        let emailAddress = decoded?.email || null;
        res.cookie('user_jwt', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 3600000
        });

        return res.json({ message: "Account created and logged in successfully!",
            
            isAnonymous:isAnon,
            email:emailAddress
         });
    } catch (err) {
        console.error("❌ Registration Error:", err.message);
        return res.status(500).json({ error: err.message });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        

        const authEngine = getAuthEngine();

        const { data, error } = await authEngine.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) throw error;

        const token = data.session.access_token;
        
        let decoded = jwt.decode(token);
        let isAnon = decoded?.is_anonymous;
        let emailAddress = decoded?.email || null;
        res.cookie('user_jwt', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 3600000
            
        });

        return res.json({ message: "Logged in successfully!",
            
            isAnonymous:isAnon,
            email:emailAddress
         });
    } catch (err) {
        console.error("❌ Login Error:", err.message);
        return res.status(401).json({ error: err.message });
    }
});
//logout

app.post('/api/auth/logout', async (req, res) => {
    try {
    
        const authEngine = getAuthEngine();
        

        const { error } = await authEngine.auth.signOut();
        if (error) {
            console.warn("⚠️ Supabase server signout warning:", error.message);
            // We continue anyway to make sure we still destroy the browser cookie!
        }

        // 2. Clear the httpOnly cookie from the browser instantly
        res.clearCookie('user_jwt', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });

        
        
        return res.json({ 
            success: true, 
            message: "User session terminated cleanly." 
        });
    }
    catch (err) {
        console.error("❌ Signout Route Error:", err.message);
        return res.status(500).json({ error: "Internal server error during session termination." });
    }
});

// Static assets config
app.use(express.static(path.join(process.cwd(), 'src/public')));

// Uploads setup
const storage = multer.memoryStorage();
const textFileFilter = (req, file, cb) => {
    if (
        file.mimetype === 'text/plain' || 
        file.mimetype === 'application/pdf' || 
        file.originalname.endsWith('.txt') || 
        file.originalname.endsWith('.md') || 
        file.originalname.endsWith('.pdf')  
    ) {
        cb(null, true);
    } else {
        
        cb(new Error('Security Block: Only plain text (.txt), markdown (.md), or PDF (.pdf) documents are allowed'), false);
    }
}
const upload = multer({
    storage: storage,
    fileFilter: textFileFilter,
    limits: { fileSize: 500 * 1024 }
});

app.post('/api/upload',aiIngestionLimiter, upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 'message': 'Provide .txt or .md file' });
        } else {
            const jwtToken=req.cookies.user_jwt;
            if(!jwtToken){
                return res.status(401).json({error:"Access Denied:No active session cookie found."});
            }
            req.userToken=jwtToken;
            await readFile(req);
        
            return res.json({ 
                success: true, 
                message: `File "${req.file.originalname}" loaded cleanly.` 
            });
        }
    } catch (error) {
        console.error("Upload route exception caught:", error);
        res.status(500).json({ error: error.message });
    }
});

// Search route
app.post('/api/search',searchLimiter, async (req, res) => {
    const { question } = req.body;

    if (!question) {
        return res.status(400).json({ error: "Question parameter is required." });
    }
    const jwtToken = req.cookies.user_jwt;
    if(!jwtToken){
        return res.status(401).json({error:"Access Denied: No active session cookie found."});
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        await searchAndAnswerByStream(question,jwtToken ,(textChunk) => {
            const dataPayload = JSON.stringify({ chunk: textChunk });
            res.write(`data: ${dataPayload}\n\n`);
        });
        res.end();
    } catch (error) {
        
        console.error(error.message || error);
        let friendlyMessage = "The AI generation service is temporarily busy.";
        
        if (error.status === 429 || String(error).includes("429")) {
            friendlyMessage = "API Quota exceeded for the free tier. Please wait a moment before trying again.";
        }
        res.write(`data: ${JSON.stringify({ chunk: `\n\n🔴 [SYSTEM NOTICE]: ${friendlyMessage}\n` })}\n\n`);
        res.end();
    }
});

//documents

app.get('/api/documents',async (req,res)=>{
    try{
    const jwtToken=req.cookies.user_jwt;
    if(!jwtToken){
        return res.status(401).json({message:"Access denied."});
    }
    const userScopedSupabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            {
                global: {
                    headers: { Authorization: `Bearer ${jwtToken}` }
                }
            }
        );
        const { data: files, error } = await userScopedSupabase
            .from('uploaded_files')
            .select('id, file_name, uploaded_at')
            .order('uploaded_at', { ascending: false });
        if (error) throw error;
    
        return res.json({success:true,documents:files});    
}
catch(err){
    console.error("❌ Fetch Documents Error:", err.message);
    return res.status(500).json({ error: err.message });
}
});

app.delete('/api/documents/:id',async (req,res)=>{
    try{
    const fileId=req.params.id;
    const jwtToken = req.cookies.user_jwt;
    if(!jwtToken){
        return res.status(401).json({error:"Access Denied:Unauthenticated session,"});
    }
    const userScopedSupabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            {
                global: {
                    headers: { Authorization: `Bearer ${jwtToken}` }
                }
            }
        );
    const { error, count } = await userScopedSupabase
            .from('uploaded_files')
            .delete({ count: 'exact' }) 
            .eq('id', fileId);
    if(error) throw error;
    
        return res.json({ success: true, message: "Document and vector footprints permanently destroyed." });
}
catch(err){
    console.error("❌ Delete Document Error:", err.message);
    return res.status(500).json({ error: err.message });
}});

app.listen(PORT, () => {
    console.log(`🚀 Gateway Node active and listening on port ${PORT}`);
});