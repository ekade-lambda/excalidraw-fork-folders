CREATE TABLE excalidraw.pointers (
    id VARCHAR(128) PRIMARY KEY,
    target_folder_id VARCHAR(128) REFERENCES excalidraw.folders(id) ON DELETE RESTRICT,
    name VARCHAR(255),
    icon TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE excalidraw.boards ADD COLUMN files JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE excalidraw.boards ADD COLUMN viewport JSONB;

ALTER TABLE excalidraw.folders ADD COLUMN icon JSONB;
