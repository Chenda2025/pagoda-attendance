"""Seed attendance test data for Telegram contract-notify page.

Run:  python3 seed_telegram_test_data.py

Inserts records in the current 15-day block (Aug 16–31 when run on Aug 18).
Monks seeded:
  - 3× absent only      (≥2 threshold)
  - 4× permission only  (≥3 threshold)
  - 2 absent + 3 perm (both reasons)
  - 2× absent only    (exactly at threshold)
  - 3× permission only (exactly at threshold)
"""
from datetime import date

from conn import connect_db

# monk_id → list of (date, status)
TEST_RECORDS = {
    5: [   # សែ គាត — absent only (3)
        ('2026-08-16', 'absent'),
        ('2026-08-17', 'absent'),
        ('2026-08-18', 'absent'),
    ],
    6: [   # រឹម មករា — permission only (4)
        ('2026-08-16', 'permission'),
        ('2026-08-17', 'permission'),
        ('2026-08-18', 'permission'),
        ('2026-08-19', 'permission'),
    ],
    8: [   # ធីម ប្រេម — both absent + permission
        ('2026-08-16', 'absent'),
        ('2026-08-17', 'absent'),
        ('2026-08-18', 'permission'),
        ('2026-08-19', 'permission'),
        ('2026-08-20', 'permission'),
    ],
    9: [   # ចាន់ សុធា — absent exactly 2
        ('2026-08-16', 'absent'),
        ('2026-08-17', 'absent'),
    ],
    10: [  # ត្រង់ សុខរ៉ុម — permission exactly 3
        ('2026-08-16', 'permission'),
        ('2026-08-17', 'permission'),
        ('2026-08-18', 'permission'),
    ],
    11: [  # សារ៉ុម ឆៃរ៉ង — below threshold (1 absent, should NOT appear)
        ('2026-08-16', 'absent'),
    ],
}


def seed():
    conn = connect_db()
    cur = conn.cursor()
    inserted = updated = 0

    for monk_id, records in TEST_RECORDS.items():
        cur.execute(
            "SELECT fullname FROM monk_tbl WHERE id = %s",
            (monk_id,),
        )
        row = cur.fetchone()
        if not row:
            print(f'  skip monk_id={monk_id} (not found)')
            continue
        name = row[0]
        for d, status in records:
            cur.execute("""
                INSERT INTO attendance_tbl (monk_id, status, date)
                VALUES (%s, %s, %s)
                ON CONFLICT (monk_id, date) DO UPDATE SET status = EXCLUDED.status
                RETURNING (xmax = 0) AS inserted
            """, (monk_id, status, d))
            was_insert = cur.fetchone()[0]
            if was_insert:
                inserted += 1
            else:
                updated += 1
        absent = sum(1 for _, s in records if s == 'absent')
        perm = sum(1 for _, s in records if s == 'permission')
        print(f'  {name} (id={monk_id}): absent={absent}, permission={perm}')

    conn.commit()
    cur.close()
    conn.close()
    print(f'\nDone — {inserted} inserted, {updated} updated.')
    print('Open /telegram-notify with date 2026-08-18 — expect 5 monks (not monk 11).')


if __name__ == '__main__':
    print('Seeding Telegram contract test attendance (block 2026-08-16 → 2026-08-31)...\n')
    seed()
