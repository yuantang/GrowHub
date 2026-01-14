#!/usr/bin/env python3
"""
Migration: Add author_unique_id column to growhub_contents table
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'database', 'sqlite_tables.db')

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Check if column exists
    cursor.execute("PRAGMA table_info(growhub_contents)")
    columns = [col[1] for col in cursor.fetchall()]
    
    if 'author_unique_id' not in columns:
        print("Adding author_unique_id column...")
        cursor.execute("ALTER TABLE growhub_contents ADD COLUMN author_unique_id VARCHAR(100)")
        conn.commit()
        print("Done!")
    else:
        print("Column author_unique_id already exists.")
    
    conn.close()

if __name__ == "__main__":
    migrate()
