-- TABESH Request Management System - Initial Schema
-- Migration 0001: Create tables for requests, notes, and history

-- =============================================================================
-- Table: requests
-- Stores both contact form submissions and product inquiry submissions
-- =============================================================================
CREATE TABLE requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('contact', 'product_inquiry')),
  name TEXT,                                  -- NULL allowed for product_inquiry
  contact TEXT NOT NULL,                      -- email/phone for contact, phone for product_inquiry
  subject TEXT,                               -- only for contact type
  message TEXT,                               -- only for contact type
  product TEXT,                               -- only for product_inquiry type
  status TEXT NOT NULL DEFAULT 'new'
    CHECK(status IN ('new', 'in_progress', 'follow_up', 'completed', 'rejected')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for queries
CREATE INDEX idx_requests_status ON requests(status);
CREATE INDEX idx_requests_type ON requests(type);
CREATE INDEX idx_requests_created_at ON requests(created_at DESC);
CREATE INDEX idx_requests_contact ON requests(contact);
CREATE INDEX idx_requests_status_created ON requests(status, created_at DESC);

-- =============================================================================
-- Table: request_notes
-- Internal notes added by admins
-- =============================================================================
CREATE TABLE request_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notes_request_id ON request_notes(request_id);
CREATE INDEX idx_notes_created_at ON request_notes(created_at DESC);

-- =============================================================================
-- Table: request_history
-- Audit trail for all changes to requests
-- =============================================================================
CREATE TABLE request_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  action TEXT NOT NULL,                       -- 'request_created' | 'status_changed' | 'note_added'
  old_status TEXT,
  new_status TEXT,
  changed_by TEXT NOT NULL,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  details TEXT
);

CREATE INDEX idx_history_request_id ON request_history(request_id);
CREATE INDEX idx_history_changed_at ON request_history(changed_at DESC);
CREATE INDEX idx_history_action ON request_history(action);

-- NOTE: updated_at is set explicitly by the Worker on every UPDATE to avoid
-- recursive-trigger semantics (PRAGMA recursive_triggers) inside D1.