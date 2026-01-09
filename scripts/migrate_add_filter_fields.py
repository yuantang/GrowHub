#!/usr/bin/env python3
"""
数据库迁移脚本：添加高级过滤字段
- min_likes, max_likes
- min_comments, max_comments
- min_shares, max_shares
- min_favorites, max_favorites
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'database', 'sqlite_tables.db')

COLUMNS_TO_ADD = [
    ('min_likes', 'INTEGER DEFAULT 0'),
    ('max_likes', 'INTEGER DEFAULT 0'),
    ('min_comments', 'INTEGER DEFAULT 0'),
    ('max_comments', 'INTEGER DEFAULT 0'),
    ('min_shares', 'INTEGER DEFAULT 0'),
    ('max_shares', 'INTEGER DEFAULT 0'),
    ('min_favorites', 'INTEGER DEFAULT 0'),
    ('max_favorites', 'INTEGER DEFAULT 0'),
]

def get_existing_columns(cursor):
    cursor.execute("PRAGMA table_info(growhub_projects)")
    return {row[1] for row in cursor.fetchall()}

def migrate():
    print(f"📍 Database path: {DB_PATH}")
    
    if not os.path.exists(DB_PATH):
        print("❌ Database not found!")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    existing = get_existing_columns(cursor)
    print(f"📋 Existing columns: {len(existing)}")
    
    added = 0
    for col_name, col_type in COLUMNS_TO_ADD:
        if col_name in existing:
            print(f"  ⏭️  {col_name} already exists")
        else:
            cursor.execute(f"ALTER TABLE growhub_projects ADD COLUMN {col_name} {col_type}")
            print(f"  ✅ Added: {col_name}")
            added += 1
    
    conn.commit()
    conn.close()
    
    print(f"\n🎉 Migration complete! Added {added} new columns.")

if __name__ == '__main__':
    migrate()
