#!/usr/bin/env python3
"""Seed test monk records up to TARGET total (default 170)."""
import random
import sys
from conn import connect_db

TARGET = 170

RESIDENCES = [
    'កុដិលេខ១', 'កុដិលេខ២_ជាន់ក្រោម', 'កុដិលេខ២_ជាន់លើ', 'កុដិលេខ៤',
    'កុដិធំ_ជាន់ទី១', 'កុដិធំ_ជាន់ទី២', 'កុដិធំ_ជាន់ទី៣',
    'កុដិហោត្រៃ', 'សាលាបាលីចាស់', 'សាលាពុទ្ធិក',
]

BHikkHU_POSITIONS = [
    'ព្រះគ្រូសូត្រស្តាំ', 'ព្រះគ្រូសូត្រឆ្វេង', 'ព្រះគ្រូវិន័យធរ',
    'ព្រះគ្រូលេខា', 'ព្រះសង្ឃធម្មតា', 'មេកុដិ', 'អនុកុដិ',
]

SAMANERA_POSITIONS = ['សមណសិស្ស', 'មេក្រុម', 'អនុមេក្រុម']

EDUCATION = ['បឋមសិក្សា', 'អនុវិទ្យាល័យ', 'វិទ្យាល័យ', 'មហាវិទ្យាល័យ']
YEARS = ['ឆ្នាំទី១', 'ឆ្នាំទី២', 'ឆ្នាំទី៣', 'ឆ្នាំទី៤']
LIVING = ['កំពុងស្នាក់នៅ', 'កំពុងស្នាក់នៅ', 'កំពុងស្នាក់នៅ', 'នៅស្រុក']

GIVEN = [
    'សុខ', 'វណ្ណ', 'សម', 'បញ្ញា', 'ធា', 'រតន', 'ពិសិដ្ឋ', 'សុវណ្ណ', 'ចន្ទ', 'ពោធិ',
    'មករ', 'វិរ', 'សេច', 'ឧត្ត', 'ធម', 'ជ័យ', 'បុណ្យ', 'អនុ', 'កម្ម', 'លូ',
    'ពេជ្រ', 'រស', 'វិប', 'សិរ', 'ឧក', 'ព្រ', 'វិស', 'អាល', 'ចិ', 'ធម',
]

FAMILY = [
    'ព្រះ', 'ពុ', 'ព', 'ពុ', 'ព', 'ពុ', 'ព', 'ពុ', 'ព', 'ពុ',
]


def khmer_num(n):
    digits = '០១២៣៤៥៦៧៨៩'
    return ''.join(digits[int(c)] for c in str(n))


def make_name(i, monk_type):
    prefix = 'ភិក្ខុ' if monk_type == 'ភិក្ខុ' else 'សាមណេរ'
    g = GIVEN[i % len(GIVEN)]
    f = FAMILY[(i // 3) % len(FAMILY)]
    return f'{prefix} {g}{f} (សាកល្បង-{khmer_num(i)})'


def seed(target=TARGET):
    conn = connect_db()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM monk_tbl")
    current = cur.fetchone()[0]
    need = max(0, target - current)
    if need == 0:
        print(f'Already {current} monks — no seed needed.')
        cur.close()
        conn.close()
        return current

    rows = []
    for i in range(1, need + 1):
        idx = current + i
        monk_type = 'ភិក្ខុ' if idx % 5 != 0 else 'សាមណេរ'
        residence = RESIDENCES[idx % len(RESIDENCES)]
        if monk_type == 'ភិក្ខុ':
            position = BHikkHU_POSITIONS[idx % len(BHikkHU_POSITIONS)]
            vassa = random.randint(1, 25)
        else:
            position = SAMANERA_POSITIONS[idx % len(SAMANERA_POSITIONS)]
            vassa = random.randint(0, 5)
        rows.append((
            make_name(idx, monk_type),
            vassa,
            monk_type,
            residence,
            position,
            EDUCATION[idx % len(EDUCATION)],
            YEARS[idx % len(YEARS)],
            LIVING[idx % len(LIVING)],
        ))

    cur.executemany("""
        INSERT INTO monk_tbl (fullname, vassa_years, monk_type, residence, position,
                              education_level, academic_year, living_status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """, rows)
    conn.commit()
    cur.execute("SELECT COUNT(*) FROM monk_tbl")
    total = cur.fetchone()[0]
    cur.close()
    conn.close()
    print(f'Inserted {need} test monks. Total now: {total}')
    return total


if __name__ == '__main__':
    t = int(sys.argv[1]) if len(sys.argv) > 1 else TARGET
    seed(t)
