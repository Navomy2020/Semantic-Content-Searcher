import { getEmbedding ,generateAnswerByStream} from "../lib/ai.js";
import { createClient } from '@supabase/supabase-js';
import fs from "fs/promises";
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
async function search(query,jwtToken){
const userScopedSupabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
        global:{
            headers:{
                Authorization:`Bearer ${jwtToken}`
            }
        }
    }
);
const vector = await getEmbedding([query]);
const flatvector=vector[0];
const {data:matchedChunks,error:dbError}=await userScopedSupabase.rpc('similarity_fun',{
    question: query,
    vector_array:flatvector,
    threshold:0.1,
    match_count:3
})
if(dbError){
    console.error("❌ Vector search database failure:", dbError.message);
    throw dbError;
}

return matchedChunks;}


function calculateDotProduct(a, b) {
    if (!a || !b || a.length !== b.length) {
        return -1; 
    }
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        sum += a[i] * b[i];
    }
    return sum;
}


export  async function searchAndAnswerByStream(query,jwtToken,onChunk){
    const topChunks = await search(query,jwtToken);
    const contextText = topChunks.map((c)=>c.content).join('\n\n');
     const systemPrompt = `
You are an expert AI documentation assistant. Use the following pieces of retrieved context to answer the user's question accurately. If the context does not contain the answer, politely state that you do not know.

---
RETRIEVED CONTEXT:
${contextText}
---

USER QUESTION:
${query}

YOUR CONVERSATIONAL ANSWER:`;
let answer = await generateAnswerByStream(systemPrompt,onChunk);
}


