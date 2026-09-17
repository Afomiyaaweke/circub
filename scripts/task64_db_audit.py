#!/usr/bin/env python3
"""Find which DB rows still contain em/en dashes after the dedash run."""
import sqlite3

DB = "/home/z/my-project/db/custom.db"
TABLES = {
    "User": ["name", "bio", "headline", "location", "companyName", "expertiseTags", "guideBio", "guideSpecialties", "guideLanguages"],
    "Product": ["name", "description"],
    "Connection": ["note"],
    "Post": ["content"],
    "Comment": ["content"],
    "Message": ["content"],
    "Story": ["caption"],
    "LocalPricePost": ["productName", "description", "localTip"],
    "LocalPriceReport": ["note"],
    "GuideRating": ["comment"],
    "GuideBooking": ["message"],
    "ContactMessage": ["name", "message"],
}

con = sqlite3.connect(DB)
cur = con.cursor()
total = 0
for table, cols in TABLES.items():
    for col in cols:
        try:
            cur.execute(f'SELECT COUNT(*) FROM "{table}" WHERE "{col}" LIKE "%\u2014%" OR "{col}" LIKE "%\u2013%"')
            n = cur.fetchone()[0]
            if n:
                print(f"{table}.{col}: {n} row(s) still dirty")
                cur.execute(f'SELECT rowid, substr("{col}",1,80) FROM "{table}" WHERE "{col}" LIKE "%\u2014%" OR "{col}" LIKE "%\u2013%" LIMIT 3')
                for rowid, snippet in cur.fetchall():
                    print(f"   rowid={rowid}: {snippet!r}")
                total += n
        except sqlite3.OperationalError as e:
            print(f"{table}.{col}: SKIP ({e})")
print(f"\ntotal dirty rows: {total}")
con.close()
