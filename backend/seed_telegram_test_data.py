"""Seed attendance test data for Telegram contract-notify page.

Run:  python3 seed_telegram_test_data.py

Inserts records in the current 15-day block (Aug 16–31 when run on Aug 18).
Uses source='layout' (ប្លង់អាសនៈ) unless noted.

Monks seeded:
  - 3× absent only      (>2 threshold)
  - 4× permission only  (≥3 threshold)
  - 2 absent + 3 perm   (both reasons)
  - 2× absent only      (exactly at threshold — not listed)
  - 3× permission only  (exactly at threshold)
  - 1 absent + 3 perm   (ត្រង់ សុខរ៉ុម — contract repeat test)
"""
from datetime import date

from conn import connect_db

DEFAULT_SOURCE = 'layout'

# monk_id → list of (date, status) or (date, status, source)
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
    9: [   # ចាន់ សុធា — absent exactly 2 (below >2 threshold)
        ('2026-08-16', 'absent'),
        ('2026-08-17', 'absent'),
    ],
    10: [  # ត្រង់ សុខរ៉ុម — 1 absent + 3 permission (both violations)
        ('2026-08-16', 'absent'),
        ('2026-08-17', 'permission'),
        ('2026-08-18', 'permission'),
        ('2026-08-19', 'permission'),
    ],
    11: [  # សារ៉ុម ឆៃរ៉ង — below threshold (1 absent, should NOT appear)
        ('2026-08-16', 'absent'),
    ],
    12: [  # sala_chan absent-only test (3 absent on sala tab)
        ('2026-08-16', 'absent', 'sala_chan'),
        ('2026-08-17', 'absent', 'sala_chan'),
        ('2026-08-18', 'absent', 'sala_chan'),
    ],
}


def _record_parts(rec):
    if len(rec) == 2:
        d, status = rec
        return d, status, DEFAULT_SOURCE
    d, status, source = rec
    return d, status, source


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
        by_source = {}
        for rec in records:
            d, status, source = _record_parts(rec)
            cur.execute("""
                INSERT INTO attendance_tbl (monk_id, status, date, source)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (monk_id, date, source) DO UPDATE SET status = EXCLUDED.status
                RETURNING (xmax = 0) AS inserted
            """, (monk_id, status, d, source))
            was_insert = cur.fetchone()[0]
            if was_insert:
                inserted += 1
            else:
                updated += 1
            bucket = by_source.setdefault(source, {'absent': 0, 'permission': 0})
            if status == 'absent':
                bucket['absent'] += 1
            elif status == 'permission':
                bucket['permission'] += 1
        parts = [
            f'{src}: absent={counts["absent"]}, permission={counts["permission"]}'
            for src, counts in sorted(by_source.items())
        ]
        print(f'  {name} (id={monk_id}): {" | ".join(parts)}')

    conn.commit()
    cur.close()
    conn.close()
    print(f'\nDone — {inserted} inserted, {updated} updated.')
    print('Open /telegram-notify with date 2026-08-18')
    print('  · ប្លង់អាសនៈ — expect 5 monks (ids 5,6,8,10; not 9 or 11)')
    print('  · ប្លងសាលាឆាន់ — expect monk id=12 if seated on sala layout')


if __name__ == '__main__':
    print('Seeding Telegram contract test attendance (block 2026-08-16 → 2026-08-31)...\n')
    seed()
