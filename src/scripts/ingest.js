import 'dotenv/config';
import fs from "fs/promises";
import path from 'path';
import { getEmbedding } from '../lib/ai.js';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { createRequire } from 'module';

import LlamaCloud from '@llamaindex/llama-cloud';
const client = new LlamaCloud();

export async function readFile(req) {
    const jwtToken = req.userToken;
    if(!jwtToken){
        throw new Error("Security Violation: Ingestion blocked due to missing user session token.");
    }
    const isUserAnonymous = req.isAnonymousSession;
    const userScopedSupabase = createClient(
        process.env.SUPABASE_URL, 
        process.env.SUPABASE_ANON_KEY, 
        {
            global: {
                headers: {
                    Authorization: `Bearer ${jwtToken}`,
                },
            },
        }
    );
    
    let chunks;
    let index;
    const batchsize = 100;
    let final_files = [];
    
    // 1. Check file deduplication hash
    const fileHash = crypto.createHash('md5').update(req.file.buffer).digest('hex');
    const { data: existingFile, error: lookupError } = await userScopedSupabase
        .from('uploaded_files')
        .select('id')
        .eq('file_hash', fileHash)
        .maybeSingle();
        
    if (lookupError) {
        console.error("Database lookup fault during hash verification:", lookupError);
        throw lookupError;
    }
    if (existingFile) {
        return { status: "already_indexed", fileId: existingFile.id };
    }
    
    // 2. Register file entry
    const { data: newFileRecord, error: insertFileError } = await userScopedSupabase
        .from('uploaded_files')
        .insert({
            file_hash: fileHash,
            file_name: req.file.originalname,
            is_anonymous: isUserAnonymous
        })
        .select('id')
        .single();
        
    if (insertFileError) {
        console.error("Failed to register new file hash record:", insertFileError);
        throw insertFileError;
    }   
    
    const targetFileId = newFileRecord.id;
    let rawTextContent = '';
    if (req.file.mimetype === 'application/pdf') {
        try {
            console.log(`☁️ Converting memory buffer to stream payload for LlamaCloud: ${req.file.originalname}`);
            const filePayload = new File([req.file.buffer], req.file.originalname, {
                type: req.file.mimetype,
            });

    
            const fileRecord = await client.files.create({
                file: filePayload,
                purpose: 'parse',
            });

            // 3. Request the parsing job using the modern agentic tier layout
            const result = await client.parsing.parse({
                file_id: fileRecord.id,
                tier: 'agentic',
                version: 'latest',
                expand: ['markdown'],
            });

        
            if (result.markdown && result.markdown.pages) {
                rawTextContent = result.markdown.pages
                    .map(page => page.markdown)
                    .join('\n\n');
            } else {
                throw new Error("LlamaCloud successfully completed the job but did not return standard markdown structural keys.");
            }

            console.log("✅ Stream parsing complete. Markdown strings successfully loaded!");

        } catch (pdfError) {
            console.error("LlamaCloud pipeline failed to parse the buffer stream:", pdfError);
            throw pdfError;
        }
    } else {
        // Fallback for native .txt and .md files
        rawTextContent = req.file.buffer.toString('utf-8');
    }
    
    // 4. Run through semantic text splitter chunks
    chunks = await splitText(rawTextContent);
    
    index = 0;
    for (let c of chunks) {
        final_files.push({
            'source_filename': req.file.originalname,
            'file_size_bytes': req.file.size, 
            'chunk_index': index,
            'content': c,
            'file_id': targetFileId
        });
        index++;
    }
    
    // 5. Batch vector embeddings processing loop
    for (let i = 0; i < final_files.length; i += batchsize) {
        const currentBatchObjects = final_files.slice(i, i + batchsize);
        const contentarray = currentBatchObjects.map(c => c.content);
        
        const vectors = await getEmbedding(contentarray);
        
        if (vectors && vectors.length === currentBatchObjects.length) {
            currentBatchObjects.forEach((obj, idx) => {
                obj.embedding = vectors[idx];
            });
        }
        
        const { error } = await userScopedSupabase.from('document_chunks').insert(currentBatchObjects);
        if (error) {
            console.error("❌ Supabase Bulk Insertion Block Fault:", error);
            throw error;
        }
    }
    
    console.log("✨ All vector segments successfully committed to Supabase permanent indexes!");
    return final_files;
}



export async function splitText(text, chunkSize = 500, chunkOverlap = 90) {
   
    let start = 0;
    let end;
    let chunks = [];
    let l = text.length;
    
    while (start < l) {
        end = start + chunkSize;
        
        if (end > l) {
            end = l;
        } else {
            let lastSpace = text.lastIndexOf(' ', end);
            if (lastSpace > start && lastSpace < end) {
                end = lastSpace;
            }
        }
        
        let current_chunksize = end - start;
        let chunk = text.slice(start, end);
        chunks.push(chunk);
        
        if (current_chunksize <= chunkOverlap) {
            
            chunkOverlap = Math.max(0, current_chunksize - 10);
        } else {
            chunkOverlap = 90;
        }
        
        
        let nextStart = end - chunkOverlap;
        start = (nextStart <= start) ? end + 1 : nextStart;
    }
    return chunks;
}