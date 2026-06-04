# Semantic Document Search Assistant using RAG

A high-performance, full-stack Retrieval-Augmented Generation (RAG) assistant built using JavaScript and Node.js.

---

## 📄 Project Overview

This application provides a secure portal where users can upload complex documents and ask conversational, natural language questions against them. 

The core system reads raw text strings, strips document structures and uses an intelligent background pipeline to compile content into vector coordinates. When a question is asked, it scans the custom knowledge base in real-time to augment a Large Language Model (LLM) with hyper-focused context, eliminating hallucinations and ensuring private data security.

---

## 🎯 Problem Statement

Standard Large Language Models (LLMs) are frozen in time and completely blind to private corporate data, personal documents, or specific context silos. Simply pasting massive documents into an LLM prompt windows hits strict token capacity boundaries, incurs massive API expenses and degrades processing performance.

This project resolves that exact architectural bottleneck. By building an isolated chunking, embedding, and vector-search engine, the system retrieves only the top $K$ most contextually relevant snippets required to answer a specific user question, enabling targeted, cheap and instantaneous factual generation.

---

## ✨ Features

- **Multi-Format Document Upload:** Supports dynamic processing of complex `.pdf`, `.md`, and `.txt` files.
- **Linguistic Word-Boundary Chunking:** A custom text segmentation tool that tracks whitespace breaks to prevent clipping vocabulary words.
-  **Duplicate File Detection:** Prevents users from uploading the same document multiple times while allowing different users to upload identical files independently by generating file hashes.
- **High-Dimensional Vector Generation:** Seamlessly transforms string blocks into structured algebraic floating-point matrices.
- **Advanced Postgres Hybrid Search:** Merges cosine similarity scores with Full-Text Search cover density matching via custom database procedures.
- **Multi-User Isolation via Row-Level Security (RLS):** Forces strict tenant isolation using cryptographically verified user tokens.
- **Dual Access System**: Supports both authenticated users and anonymous guests.
-**Persistent User Storage**: Logged-in users can save, manage, and access documents across sessions.
-**Guest Mode**: Anonymous users can upload and query documents without creating an account.
-**Automatic Data Cleanup**: Guest documents and embeddings are automatically deleted daily to maintain privacy and storage efficiency.
- **User-Controlled Data Management:** Users can permanently delete documents and all associated vector data from the system.


---

## 🏗️ System Architecture

```text
User ──> Upload Document (.pdf/.md/.txt) ──> Express Server (Multer Buffer)
                                                      │
             ┌────────────────────────────────────────┴────────────────────────────────────────┐
             ▼ (If .pdf)                                                                       ▼ (If .txt/.md)
       LlamaCloud API                                                                    Direct UTF-8 Stream
             │                                                                                 │
             └────────────────────────────────────────┬────────────────────────────────────────┘
                                                      ▼
                                       Word-Boundary Splitting (500ch)
                                                      │
                                                      ▼
                                        AI Vector Embedding Generation
                                                      │
                                                      ▼
                                       Supabase Postgres (+pgvector)
                                                      │
 User ──> Submit Query ──> Compute Embedding ───> Hybrid Search RPC ──> Context Prompt ──> LLM ──> Answer

```
# 🛠️ Tech Stack
---
## Frontend:

- HTML5 & Tailwind CSS

- Vanilla JavaScript 

## Backend:

- Node.js (v22 Engine running native ES Modules)

- Express.js

- Multer (In-memory multipart file handling)

## Database & Storage:

- Supabase (Cloud-hosted PostgreSQL)

- pgvector extension (Vector similarity storage)

- GIN Indexing (Trigram & Lexeme Full-Text matching)

## AI Frameworks (Framework-Free / Native APIs):

- LlamaCloud SDK (Advanced PDF structural layout processing)

- Custom Embedding Model Wrapper

- LLM Text Generation Models

#Project Structure
```
semantic-content-searcher/
├── .env                     # System infrastructure keys & endpoint targets
├── package.json             # Engine configuration and project dependencies
└── src/
    ├── server.js            # Express server initialization, routing, & proxy controls
    ├── lib/
    │   └── ai.js            # Native AI integrations and embedding vector transformations
    ├── middleware/
    │   └── rateLimiter.js   # Isolated endpoint traffic guardrails and flood protection
    ├── public/
    │   └── index.html       # Client interface and asynchronous asynchronous response display
    └── scripts/
        ├── ingest.js        # File parsing, hash matching, and vector database commit loops
        └── search.js        # Hybrid RPC invocation and context-augmented LLM orchestration
```

# ⚙️ RAG Pipeline Inside JavaScript
---
Because this project avoids high-level abstractions like LangChain, the entire RAG lifecycle is explicitly engineered via native control loops:

## 1. Document Ingestion
**Intercept**: Express intercepts files as raw binary Buffer streams inside memory via Multer.

**Normalize**: Conditional checking switches processing pipelines based on mime-types, outputting unified UTF-8 string data.

**Hash Verification**: A crypto utility runs an MD5 check across the buffer to ensure the file does not already exist inside the data tables.

**Batch Seed**: String segments are converted into embeddings and inserted into PostgreSQL using optimized bulk inserts to minimize network roundtrips.

## 2. Retrieval
**Vector Transformation**: The user's query string is dynamically mapped into a floating-point array matching the index model's dimension schema.

**Hybrid Execution**: The system triggers an explicit Database Remote Procedure Call (RPC) that cross-examines the vector indices and text columns in parallel.

## 3. Generation
**Context Assembly**: The returned database records are appended together to build a robust context string block.

**Execution**: A custom prompt instruction matrix forces the LLM to restrict its factual boundaries strictly to the provided document text, generating the answer.

## Chunking Strategy
Standard character chunkers frequently slash words in half, damaging semantic search accuracy. This pipeline uses a specialized Word-Boundary Aware Segmentation Utility
- **Chunk Size Constraint**: $500$ characters maximum per block.
- **Sliding Overlap**: $90$ characters to maintain structural context between sequential text segments.
- **Linguistic Correction Math**: If an index target falls inside a word, the code leverages a backtracking space locator (lastIndexOf(' ')). This forces chunk cuts to wait for a natural gap, maintaining word structural integrity.
## 🧬 Embedding Model SchemaModel Target:
- High-efficiency multi-dimensional semantic text model.
- Vector Spatial Dimensions: $3072$ dimensions per float array.
- Distance Metric Metric: Cosine Distance (<=>) implemented natively inside database memory scans.
## 🔍 Retrieval Strategy & Hybrid Scoring
The application implements a single-stage Weighted Arithmetic Hybrid Search executed at the database hardware layer via a PostgreSQL Remote Procedure Call (similarity_fun).Instead of scanning row-by-row linearly, the database leverages a vector index alongside a GIN Index on the text tokens. It calculates a unified score following this logic
```
:$$\text{Final Score} = \text{Semantic Cosine Similarity } (1 - (\text{embedding} \Leftrightarrow \text{query\_vector})) + \text{Keyword Match Bonus } (\text{ts\_rank\_cd} \times 0.5)$$Plaintext       ┌──> Vector Similarity Scan (pgvector index) ──> [0.0 to 1.0 Score] ──┐
Query ─┤                                                                     ├──> Combined Ranking Score
       └──> Full-Text Cover Density (GIN lexeme index) ─> [Up to 0.5 Bonus] ─┘
```
The system uses ts_rank_cd (Cover Density) to check how close search tokens are physically situated to each other in the text block, prioritizing precise phrase hits above loose keyword presence.

# 🗄️ Database SchemaTable: 
**uploaded_files**
Tracks document registration status to ensure data integrity and prevent hash collisions.
```
ColumnTypeDescriptionidbigint (PK)Auto-incrementing unique document record IDfile_hashtext (Unique)MD5 checksum of raw input file bufferfile_nametextOriginal file name for interface referencescreated_attimestampAudit timestamp of document ingestionTable:
```
 **document_chunks**
 Stores the target contextual information and spatial vectors.
 ```
ColumnTypeDescriptionidbigint (PK)Unique chunk ID identifierfile_idbigint (FK)Reference mapping link pointing back to uploaded_filessource_filenametextSource metadata tracking referencechunk_indexintegerPositional index sequence identifier inside parent doccontenttextRaw text characters stored inside this specific window sliceembeddingvector(1536)Multi-dimensional spatial coordinate embeddingftstsvectorComputed linguistic search lexeme array tokens
```
## Traffic Control & Rate Limiting API Endpoints
Routes are aggressively throttled via express-rate-limit middlewares. The server implements trust proxy: 1 structures to correctly read true client IPs across cloud infrastructure reverse proxies (like Render):

**1. File Ingestion**
Endpoint: POST /api/upload

Traffic Restriction: Maximum of 5 file uploads per hour per IP.

Description: Accepts a multipart form file stream, validates token schemas, and triggers text transformations.

**2. Conversational Search**
Endpoint: POST /api/search

Traffic Restriction: Maximum of 15 query requests per minute per user ID.

Description: Generates a real-time semantic query vector, fires the hybrid search database RPC, and strings the final generative answer back to the frontend bubble.
## Installation & Local Deployment
**1. Repository Setup**
 ```
git clone [https://github.com/Navomy2020/semantic-content-searcher.git](https://github.com/your-username/semantic-content-searcher.git)
cd semantic-content-searcher
npm install
```
**2. Configure Environment Keys**
Create a .env file in the project's root folder:
```
PORT=3000
SUPABASE_URL=[https://your-project-id.supabase.co](https://your-project-id.supabase.co)
SUPABASE_ANON_KEY=your-supabase-public-anon-token
LLAMA_CLOUD_API_KEY=llx-your-llamacloud-access-key
# Configuration targets for your choice of model connections go here...
```
**3.Build the Database Logic**
Run the following structure statement in your Supabase SQL window to initialize your hybrid engine structure:
```
CREATE OR REPLACE FUNCTION similarity_fun(
  question TEXT,
  vector_array EXTENSIONS.vector(1536),
  threshold FLOAT,
  match_count INT
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  source_filename TEXT,
  chunk_index INT,
  similarity FLOAT
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    document_chunks.id,
    document_chunks.content,
    document_chunks.source_filename,
    document_chunks.chunk_index,
    ((1 - (document_chunks.embedding <=> vector_array)) + COALESCE(ts_rank_cd(document_chunks.fts, websearch_to_tsquery('english', question)) * 0.5, 0)) AS similarity
  FROM document_chunks
  WHERE (1 - (document_chunks.embedding <=> vector_array)) > threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;
```
**4. Boot the Server Matrix**
 ```
node src/server.js
```
The server will bind onto http://localhost:3000.

   
