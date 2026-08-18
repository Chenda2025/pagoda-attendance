#!/usr/bin/env python3
"""Re-enable a locked account from the server, for when no admin can log in.

Usage:
    python3 unlock_account.py                 # list every account and its status
    python3 unlock_account.py admin           # unlock one account by username
    python3 unlock_account.py --all           # unlock every locked account
    python3 unlock_account.py admin --password 'newpass'   # unlock and reset password
"""
import argparse
import sys

from conn import connect_db
from auth_service import hash_password


def list_accounts():
    conn = connect_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, username, role, is_active, failed_attempts, lock_reason, locked_at
        FROM app_users ORDER BY id
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    if not rows:
        print('No accounts found.')
        return

    print(f'{"ID":<5}{"USERNAME":<20}{"ROLE":<10}{"STATUS":<10}{"FAILS":<7}REASON')
    print('-' * 78)
    for r in rows:
        status = 'active' if r[3] else 'LOCKED'
        reason = r[5] or ''
        if r[6]:
            reason = f'{reason} @ {r[6]:%Y-%m-%d %H:%M}'
        print(f'{r[0]:<5}{r[1]:<20}{r[2]:<10}{status:<10}{r[4] or 0:<7}{reason}')


def unlock(username=None, unlock_all=False, new_password=None):
    conn = connect_db()
    cur = conn.cursor()

    sets = ['is_active = TRUE', 'locked_at = NULL', 'lock_reason = NULL',
            'failed_attempts = 0']
    params = []
    if new_password:
        sets.append('password_hash = %s')
        params.append(hash_password(new_password))

    if unlock_all:
        cur.execute(f'UPDATE app_users SET {", ".join(sets)} '
                    'WHERE is_active = FALSE RETURNING username', params)
    else:
        params.append(username)
        cur.execute(f'UPDATE app_users SET {", ".join(sets)} '
                    'WHERE username = %s RETURNING username', params)

    freed = [r[0] for r in cur.fetchall()]
    conn.commit()
    cur.close()
    conn.close()

    if not freed:
        print('Nothing to unlock.' if unlock_all else f'No account named "{username}".')
        return 1

    for name in freed:
        extra = ' (password reset)' if new_password else ''
        print(f'Unlocked: {name}{extra}')
    return 0


def main():
    parser = argparse.ArgumentParser(description='Unlock a disabled account.')
    parser.add_argument('username', nargs='?', help='account to unlock')
    parser.add_argument('--all', action='store_true', help='unlock every locked account')
    parser.add_argument('--password', help='also set a new password')
    args = parser.parse_args()

    if not args.username and not args.all:
        list_accounts()
        return 0
    return unlock(args.username, args.all, args.password)


if __name__ == '__main__':
    sys.exit(main())
