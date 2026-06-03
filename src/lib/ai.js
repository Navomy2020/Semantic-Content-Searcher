import dotenv from "dotenv";
dotenv.config();
import { GoogleGenAI } from '@google/genai';

import Groq from 'groq-sdk';


const primaryAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY_PRIMARY });
const fallbackAI = new Groq({ apiKey: process.env.GROQ_API_KEY_FALLBACK });
export async function getEmbedding(textBatch) {
    try {
       
        const response = await primaryAI.models.embedContent({
            model: 'gemini-embedding-001',
            contents: textBatch,
        });
        
        return response.embeddings.map((c) => c.values);
        
    } catch (error) {
        console.log("Error generating embedding on primary instance:");
        
        if (process.env.GEMINI_API_KEY_FALLBACK) {
            console.warn("[SYSTEM] Primary embedding key failed. Using fallback client...");
            const fallbackResponse = await fallbackAI.models.embedContent({
                model: 'gemini-embedding-001',
                contents: textBatch,
            });
            return fallbackResponse.embeddings.map((c) => c.values);
        }
        throw error;
    }
}




export async function generateAnswerByStream(systemPrompt, onChunk) {
    try {
        console.log("🤖 Attempting generation with Primary Engine (Gemini)...");
        return await executeGeminiStream(systemPrompt, onChunk);
    } catch (error) {
        if (error.status === 429 || error.status === 503 ||
            String(error).includes("429") || String(error).includes("503") ||
            String(error).includes("quota") || String(error).includes("demand")) {
            console.warn("\n🚨 [SYSTEM] Gemini API quota exhausted! Failing over to Groq (Llama-3)...");
            
            try {
                return await executeGroqStream(systemPrompt, onChunk);
            } catch (groqError) {
                console.error("❌ Both Gemini and Groq API channels failed.");
                throw groqError;
            }
        }
        throw error;
    }
}


async function executeGeminiStream(prompt, onChunk) {

    const responseStream = await primaryAI.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents: [prompt],
    });

    for await (const chunk of responseStream) {
        const textToken = chunk.candidates?.[0]?.content?.parts?.[0]?.text || "";
        
        if (textToken) {
            onChunk(textToken);
        }
    }
}

async function executeGroqStream(prompt, onChunk) {
    
    const responseStream = await fallbackAI.chat.completions.create({
        model: "llama-3.3-70b-versatile", 
        messages: [
            { role: "user", content: prompt }
        ],
        stream: true, 
    });
    
    for await (const chunk of responseStream) {
        
        const textToken = chunk.choices[0]?.delta?.content || "";
    
        if (textToken) {
            onChunk(textToken);
        }
    }
}