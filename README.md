# Semantic Document Search Assistant using RAG
[![Ask DeepWiki](https://devin.ai/assets/askdeepwiki.png)](https://deepwiki.com/Navomy2020/Semantic-Content-Searcher)

A high-performance, full-stack Retrieval-Augmented Generation (RAG) assistant built using JavaScript and Node.js. This application provides a secure portal where users can upload complex documents and ask conversational, natural language questions about their content.

The core system reads raw text, splits it into intelligent chunks, and converts the content into vector embeddings. When a question is asked, it scans a custom knowledge base in real-time to augment a Large Language Model (LLM) with hyper-focused context, enabling accurate, private, and factual answers.

## ✨ Features

- **Multi-Format Document Upload:** Supports dynamic processing of complex `.pdf`, `.md`, and `.txt` files.
- **Advanced PDF Parsing**: Utilizes LlamaCloud's agentic parsing tier to accurately extract markdown from complex PDF layouts.
- **Word-Boundary Chunking:** A custom text segmentation algorithm that prevents splitting words in the middle, preserving semantic meaning.
- **Duplicate File Detection:** Generates an MD5 hash of uploaded files to prevent redundant data ingestion for the same user.
- **High-Dimensional Vector Generation:** Seamlessly transforms text chunks into vector embeddings using Google's `gemini-embedding-001` model.
- **Advanced Hybrid Search:** Merges vector cosine similarity scores with traditional keyword-based Full-Text Search for superior retrieval relevance.
- **Multi-User Isolation via RLS:** Enforces strict data tenancy in PostgreSQL using Row-Level Security, ensuring users can only access their own documents.
- **Dual Access System**: Supports both authenticated registered users and anonymous guests.
- **Persistent User Storage**: Logged-in users can save, manage, and access documents across sessions.
- **Automatic Data Cleanup**: A daily cleanup process deletes guest documents and embeddings to maintain privacy and manage storage.
- **User-Controlled Data Management:** Users can permanently delete their documents and all associated vector data from the system at any time.

## 🏗️ System Architecture

The application follows a classic RAG pipeline, orchestrated by a Node.js backend.

```text
User ──> Upload Document (.pdf/.md/.txt) ──> Express Server (Multer Buffer)
                                                      │
             ┌────────────────────────────────────────┴────────────────────────────────────────┐
             ▼ (If .pdf)                                                                       ▼ (If .txt/.md)
       LlamaCloud API                                                                    Direct UTF-8 Stream
             │                                                                                 │
             └────────────────────────────────────────┬────────────────────────────────────────┘
                                                      ▼
                                       Word-Boundary Splitting (500 chars)
                                                      │
                                                      ▼
                                        AI Vector Embedding Generation
                                                      │
                                                      ▼
                                       Supabase Postgres (+pgvector)
                                                      │
 User ──> Submit Query ──> Compute Embedding ───> Hybrid Search RPC ──> Context Prompt ──> LLM ──> Answer
```

## 🛠️ Tech Stack

- **Frontend:**
    - HTML5 & Tailwind CSS
    - Vanilla JavaScript (for asynchronous communication and UI manipulation)
- **Backend:**
    - Node.js (running native ES Modules)
    - Express.js (for routing and middleware)
    - Multer (for in-memory multipart file handling)
    - `express-rate-limit` (for API endpoint traffic control)
- **Database & Storage:**
    - Supabase (Cloud-hosted PostgreSQL)
    - `pgvector` extension (for vector similarity storage and search)
- **AI & Services:**
    - LlamaCloud SDK (for advanced PDF parsing)
    - Google GenAI (`gemini-embedding-001`) for embeddings
    - Groq & Google GenAI (`gemini-2.5-flash`, `llama-3.3-70b-versatile`) for text generation with automatic fallback.

## 📂 Project Structure

```
semantic-content-searcher/
├── .env                     # System infrastructure keys & endpoint targets
├── package.json             # Engine configuration and project dependencies
└── src/
    ├── server.js            # Express server initialization, auth, and routing
    ├── lib/
    │   └── ai.js            # Native AI integrations and embedding transformations
    ├── middleware/
    │   └── rateLimiter.js   # Endpoint traffic guardrails and flood protection
    ├── public/
    │   └── index.html       # Client interface and dynamic response display
    └── scripts/
        ├── ingest.js        # File parsing, chunking, and vector database ingestion
        └── search.js        # Hybrid search RPC invocation and LLM orchestration
```

## ⚙️ How It Works

This project avoids high-level abstractions like LangChain, providing explicit control over each stage of the RAG pipeline.

### 1. Document Ingestion (`ingest.js`)

1.  **Intercept**: Express receives the file as a raw binary buffer in memory using Multer.
2.  **Deduplication**: A crypto utility runs an MD5 check on the buffer to see if the user has already uploaded this exact file.
3.  **Normalization**: The system checks the file's MIME type. If it's a PDF, the buffer is sent to the LlamaCloud API for advanced layout parsing. If it's `.txt` or `.md`, the buffer is decoded directly into a UTF-8 string.
4.  **Chunking**: The normalized text is passed through a custom word-boundary-aware splitter, ensuring that chunks do not cut words in half.
5.  **Embedding & Seeding**: The text chunks are sent in batches to the embedding model. The resulting vectors and content are then bulk-inserted into the PostgreSQL `document_chunks` table to minimize network roundtrips.

### 2. Retrieval (`search.js`)

1.  **Vector Transformation**: The user's query is converted into a vector embedding using the same model as the documents.
2.  **Hybrid Search**: The system invokes a custom PostgreSQL Remote Procedure Call (RPC) named `similarity_fun`. This function performs a hybrid search by combining:
    - **Vector Similarity Search**: Uses the `<=>` (cosine distance) operator from `pgvector` to find semantically similar chunks.
    - **Full-Text Search**: Uses `ts_rank_cd` to boost the score of chunks that contain the exact keywords from the query.
3.  **Ranking**: The RPC returns the top-ranked chunks based on a combined score, providing a set of highly relevant context.

The hybrid score is calculated as:
```
Final Score = (1 - Cosine Distance) + (ts_rank_cd * 0.5)
```

### 3. Generation (`ai.js`)

1.  **Context Assembly**: The content from the retrieved chunks is compiled into a single block of text.
2.  **Prompting**: This context block is inserted into a system prompt that instructs the LLM to answer the user's original question based *only* on the provided information.
3.  **Streaming**: The prompt is sent to the generation model (Gemini or Groq Llama-3). The response is streamed back to the user token by token for a real-time conversational effect.

## 🗄️ Database Schema

The system uses two primary tables in a PostgreSQL database hosted on Supabase.

#### Table: `uploaded_files`
Tracks document metadata and ownership to enforce security and prevent duplicates.

| Column       | Type        | Description                                  |
|--------------|-------------|----------------------------------------------|
| `id`         | `BIGINT`    | Unique file identifier (Primary Key)         |
| `file_hash`  | `TEXT`      | MD5 hash for per-user duplicate detection    |
| `file_name`  | `TEXT`      | Original uploaded filename                   |
| `uploaded_at`| `TIMESTAMPTZ` | Upload timestamp                             |
| `user_id`    | `UUID`      | ID of the user who owns the document (Foreign Key) |
| `is_anonymous`| `BOOLEAN`   | Flag for guest-uploaded documents            |

#### Table: `document_chunks`
Stores the text chunks and their corresponding vector embeddings.

| Column            | Type          | Description                                    |
|-------------------|---------------|------------------------------------------------|
| `id`              | `BIGSERIAL`   | Unique chunk identifier (Primary Key)          |
| `content`         | `TEXT`        | The text content of the chunk                  |
| `embedding`       | `VECTOR(768)` | 768-dimension vector from `gemini-embedding-001` |
| `source_filename` | `TEXT`        | Original document name for reference           |
| `chunk_index`     | `INTEGER`     | Position of the chunk within the document      |
| `file_id`         | `BIGINT`      | Reference to the parent file in `uploaded_files` |

## 🚦 API & Rate Limiting

The API endpoints are protected by `express-rate-limit` to prevent abuse.

| Endpoint           | Method   | Description                  | Rate Limit                 |
|--------------------|----------|------------------------------|----------------------------|
| `/api/upload`      | `POST`   | Uploads and ingests a document. | **5 uploads** per hour per IP.    |
| `/api/search`      | `POST`   | Submits a question for RAG.     | **15 requests** per minute per user. |
| `/api/documents`   | `GET`    | Fetches the user's documents.   | Governed by global limits. |
| `/api/documents/:id`| `DELETE` | Deletes a document and its data. | Governed by global limits. |
| `/api/auth/*`      | `POST`   | Handles user authentication. | Governed by global limits. |


## 🚀 Installation & Local Deployment

Follow these steps to run the project on your local machine.

**1. Clone the Repository**
```bash
git clone https://github.com/Navomy2020/semantic-content-searcher.git
cd semantic-content-searcher
```

**2. Install Dependencies**
```bash
npm install
```

**3. Configure Environment Variables**
Create a `.env` file in the project's root folder and populate it with your API keys and credentials.

```env
# Server Configuration
PORT=3000

# Supabase Credentials
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-supabase-public-anon-key

# AI Service Keys
LLAMA_CLOUD_API_KEY=llx-your-llamacloud-access-key
GEMINI_API_KEY_PRIMARY=your-google-gemini-api-key
GROQ_API_KEY_FALLBACK=gsk_your-groq-api-key
```

**4. Set Up the Database**
In your Supabase project's SQL Editor, run the following SQL script to create the hybrid search function. This assumes you have already enabled the `vector` extension.

```sql
CREATE OR REPLACE FUNCTION similarity_fun(
  question TEXT,
  vector_array vector(768),
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
    dc.id,
    dc.content,
    dc.source_filename,
    dc.chunk_index,
    (
      (1 - (dc.embedding <=> vector_array)) -- Cosine Similarity
      + (ts_rank_cd(dc.fts, websearch_to_tsquery('english', question)) * 0.5) -- Keyword Bonus
    ) AS similarity
  FROM document_chunks AS dc
  WHERE (1 - (dc.embedding <=> vector_array)) > threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;
```

**5. Start the Server**
```bash
npm start
```

The server will be available at `http://localhost:3000`.
