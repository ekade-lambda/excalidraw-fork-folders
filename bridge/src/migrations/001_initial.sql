
CREATE TABLE excalidraw.system_config (
    id VARCHAR(128) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE excalidraw.folders (
    id VARCHAR(128) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    parent_id VARCHAR(128) REFERENCES excalidraw.folders(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE excalidraw.boards (
    id VARCHAR(128) PRIMARY KEY,
    folder_id VARCHAR(128) REFERENCES excalidraw.folders(id) ON DELETE RESTRICT,
    elements JSONB NOT NULL DEFAULT '[]'::jsonb,
    app_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    schema_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE excalidraw.assets (
    id VARCHAR(128) PRIMARY KEY,
    hash VARCHAR(64) NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    size_bytes BIGINT NOT NULL,
    relative_path VARCHAR(1024) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_folders_parent_id ON excalidraw.folders(parent_id);
CREATE INDEX idx_boards_folder_id ON excalidraw.boards(folder_id);
CREATE INDEX idx_assets_hash ON excalidraw.assets(hash);

