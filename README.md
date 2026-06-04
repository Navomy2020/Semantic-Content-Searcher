# Semantic Document Search Assistant using RAG

A high-performance, full-stack Retrieval-Augmented Generation (RAG) assistant built from scratch using pure JavaScript and Node.js.

---

## 📄 Project Overview

This application provides a secure portal where users can upload complex documents and ask conversational, natural language questions against them. 

The core system reads raw text strings, strips document structures and uses an intelligent background pipeline to compile content into vector coordinates. When a question is asked, it scans the custom knowledge base in real-time to augment a Large Language Model (LLM) with hyper-focused context, eliminating hallucinations and ensuring private data security.

---

## 🎯 Problem Statement

Standard Large Language Models (LLMs) are frozen in time and completely blind to private corporate data, personal documents, or specific context silos. Simply pasting massive documents into an LLM prompt windows hits strict token capacity boundaries, incurs massive API expenses and degrades processing performance.

This project resolves that exact architectural bottleneck. By building an isolated chunking, embedding, and vector-search engine, the system surgically retrieves only the top $K$ most contextually relevant snippets required to answer a specific user question, enabling targeted, cheap and instantaneous factual generation.

---

## ✨ Features

- **Multi-Format Document Upload:** Supports dynamic processing of complex `.pdf`, `.md`, and `.txt` files.
- **Linguistic Word-Boundary Chunking:** A custom text segmentation tool that tracks whitespace breaks to prevent clipping vocabulary words.
- **MD5 Cryptographic Deduplication:** Generates file hashes to block identical documents from consuming duplicate vector database rows.
- **High-Dimensional Vector Generation:** Seamlessly transforms string blocks into structured algebraic floating-point matrices.
- **Advanced Postgres Hybrid Search:** Merges cosine similarity scores with Full-Text Search cover density matching via custom database procedures.
- **Multi-User Isolation via Row-Level Security (RLS):** Forces strict tenant isolation using cryptographically verified user tokens.
- **Dual Access System**: Supports both authenticated users and anonymous guests.
-**Persistent User Storage**: Logged-in users can save, manage, and access documents across sessions.
-**Guest Mode**: Anonymous users can upload and query documents without creating an account.
-**Automatic Data Cleanup**: Guest documents and embeddings are automatically deleted daily to maintain privacy and storage efficiency.


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
🛠️ Tech Stack
Frontend:

HTML5 & Tailwind CSS

Vanilla JavaScript (Asynchronous Streams & Fetch API)

Backend:

Node.js (v22 Engine running native ES Modules)

Express.js

Multer (In-memory multipart file handling)

Database & Storage:

Supabase (Cloud-hosted PostgreSQL)

pgvector extension (Vector similarity storage)

GIN Indexing (Trigram & Lexeme Full-Text matching)

AI Frameworks (Framework-Free / Native APIs):

LlamaCloud SDK (Advanced PDF structural layout processing)

Custom Embedding Model Wrapper

LLM Text Generation Models
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

⚙️ RAG Pipeline Inside JavaScript
Because this project avoids high-level abstractions like LangChain, the entire RAG lifecycle is explicitly engineered via native control loops:

1. Document Ingestion
Intercept: Express intercepts files as raw binary Buffer streams inside memory via Multer.

Normalize: Conditional checking switches processing pipelines based on mime-types, outputting unified UTF-8 string data.

Hash Verification: A crypto utility runs an MD5 check across the buffer to ensure the file does not already exist inside the data tables.

Batch Seed: String segments are converted into embeddings and inserted into PostgreSQL using optimized bulk inserts to minimize network roundtrips.

2. Retrieval
Vector Transformation: The user's query string is dynamically mapped into a floating-point array matching the index model's dimension schema.

Hybrid Execution: The system triggers an explicit Database Remote Procedure Call (RPC) that cross-examines the vector indices and text columns in parallel.

3. Generation
Context Assembly: The returned database records are appended together to build a robust context string block.

Execution: A custom prompt instruction matrix forces the LLM to restrict its factual boundaries strictly to the provided document text, generating the answer.

Chunking StrategyStandard character chunkers frequently slash words in half, damaging semantic search accuracy. This pipeline uses a specialized Word-Boundary Aware Segmentation Utility:Chunk Size Constraint: $500$ characters maximum per block.Sliding Overlap: $90$ characters to maintain structural context between sequential text segments.Linguistic Correction Math: If an index target falls inside a word, the code leverages a backtracking space locator (lastIndexOf(' ')). This forces chunk cuts to wait for a natural gap, maintaining word structural integrity.🧬 Embedding Model SchemaModel Target: High-efficiency multi-dimensional semantic text model.Vector Spatial Dimensions: $1536$ dimensions per float array.Distance Metric Metric: Cosine Distance (<=>) implemented natively inside database memory scans.🔍 Retrieval Strategy & Hybrid ScoringThe application implements a single-stage Weighted Arithmetic Hybrid Search executed at the database hardware layer via a PostgreSQL Remote Procedure Call (similarity_fun).Instead of scanning row-by-row linearly, the database leverages a vector index alongside a GIN Index on the text tokens. It calculates a unified score following this logic
```
:$$\text{Final Score} = \text{Semantic Cosine Similarity } (1 - (\text{embedding} \Leftrightarrow \text{query\_vector})) + \text{Keyword Match Bonus } (\text{ts\_rank\_cd} \times 0.5)$$Plaintext       ┌──> Vector Similarity Scan (pgvector index) ──> [0.0 to 1.0 Score] ──┐
Query ─┤                                                                     ├──> Combined Ranking Score
       └──> Full-Text Cover Density (GIN lexeme index) ─> [Up to 0.5 Bonus] ─┘
```
The system uses ts_rank_cd (Cover Density) to check how close search tokens are physically situated to each other in the text block, prioritizing precise phrase hits above loose keyword presence.
🗄️ Database SchemaTable: uploaded_filesTracks document registration status to ensure data integrity and prevent hash collisions.ColumnTypeDescriptionidbigint (PK)Auto-incrementing unique document record IDfile_hashtext (Unique)MD5 checksum of raw input file bufferfile_nametextOriginal file name for interface referencescreated_attimestampAudit timestamp of document ingestionTable: document_chunksStores the target contextual information and spatial vectors.ColumnTypeDescriptionidbigint (PK)Unique chunk ID identifierfile_idbigint (FK)Reference mapping link pointing back to uploaded_filessource_filenametextSource metadata tracking referencechunk_indexintegerPositional index sequence identifier inside parent doccontenttextRaw text characters stored inside this specific window sliceembeddingvector(1536)Multi-dimensional spatial coordinate embeddingftstsvectorComputed linguistic search lexeme array tokens

🔐 Authentication & Tenant Isolation
To ensure production security, data privacy is locked down at the database core:

JWT Authorization Verification: The server demands a verified JSON Web Token passed inside incoming headers.

User Scoped Supabase Clients: The application dynamically provisions database instances wrapped with the individual visitor's active session bearer token.

PostgreSQL Row Level Security (RLS): Policies inside the database block cross-tenant lookups. Even if a user attempts an injection attack, the database engine drops access if the row's user identifier mismatch occurs.
