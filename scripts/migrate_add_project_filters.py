#!/usr/bin/env python3
"""
Migration: Add fan filters and require_contact to growhub_projects table
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'database', 'sqlite_tables.db')

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Check existing columns
    cursor.execute("PRAGMA table_info(growhub_projects)")
    columns = [col[1] for col in cursor.fetchall()]
    
    new_columns = [
        ("min_fans", "INTEGER DEFAULT 0"),
        ("max_fans", "INTEGER DEFAULT 0"),
        ("require_contact", "BOOLEAN DEFAULT 0"),
    ]
    
    for col_name, col_type in new_columns:
        if col_name not in columns:
            print(f"Adding {col_name} column...")
            cursor.execute(f"ALTER TABLE growhub_projects ADD COLUMN {col_name} {col_type}")
    
    conn.commit()
    print("Done!")
    conn.close()

if __name__ == "__main__":
    migrate()
