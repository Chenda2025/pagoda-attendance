"""User accounts, permissions, face login helpers, activity logging."""
import json
import math
from werkzeug.security import generate_password_hash, check_password_hash
from conn import connect_db

# Permission keys → URL prefixes each module may access
MODULE_PATHS = {
    'entry':       ('/entry',),
    'view':        ('/view', '/api/monks', '/api/check'),
    'layout':      ('/layout', '/api/monks', '/api/attendance', '/api/permissions',
                    '/api/export-layout', '/api/seat-order'),
    'classroom_layout': ('/classroom-layout', '/api/classroom-layout', '/report/sala-chan',
                         '/api/attendance', '/api/permissions', '/api/monks',
                         '/api/reports'),
    'approve':     ('/approve', '/api/submissions'),
    'report':      ('/report', '/api/reports', '/api/attendance/export-report',
                    '/api/attendance/report', '/api/attendance/daily-report'),
    'report_book': ('/report/book',),
    'kuti_links':  ('/kuti-links', '/kuti-status', '/api/kuti-links', '/api/kuti-status',
                    '/api/kuti/'),
    'telegram_notify': ('/telegram-notify', '/api/telegram-notify'),
    'telegram_bot': ('/telegram-settings', '/api/telegram-settings'),
    'users':       ('/users', '/api/users', '/api/activity-log'),
}

MODULE_LABELS = {
    'entry':       'បញ្ចូលទិន្នន័យ',
    'view':        'មើលទិន្នន័យ',
    'layout':      'ប្លង់អាសនៈ',
    'classroom_layout': 'ប្លងសាលាឆាន់',
    'approve':     'អនុម័ត',
    'report':      'របាយការណ៍',
    'report_book': 'សៀវភៅរបាយការណ៍',
    'kuti_links':  'តំណមេកុដិ',
    'telegram_notify': 'កិច្ចសន្យា',
    'telegram_bot': 'កំណត់ Telegram Bot',
    'users':       'គ្រប់គ្រងអ្នកប្រើ',
}

ALL_PERMISSIONS = list(MODULE_PATHS.keys())

ACTIVITY_RETENTION_DAYS = 15
FACE_MATCH_THRESHOLD = 0.55

# Wrong passwords allowed on one account before it is locked
MAX_PASSWORD_ATTEMPTS = 3

# Face ID may be used from several phones/tablets/computers for the same person
MAX_TRUSTED_DEVICES = 12

LOCK_REASON_DEVICE = 'ឧបករណ៍ខុសពីការចុះឈ្មោះ'
LOCK_REASON_PASSWORD = f'បញ្ចូលលេខសម្ងាត់ខុសលើសពី {MAX_PASSWORD_ATTEMPTS} ដង'

DEFAULT_ROLE_PERMISSIONS = {
    'admin': ALL_PERMISSIONS,
    'user1': ['layout'],
    'user2': ['report'],
    'staff': [],
}


def hash_password(password: str) -> str:
    # pbkdf2 works on every build; werkzeug's default scrypt needs OpenSSL support
    return generate_password_hash(password, method='pbkdf2:sha256')


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return check_password_hash(password_hash, password)
    except (AttributeError, ValueError):
        # Hash was made with an algorithm this interpreter cannot compute
        return False


_USER_COLUMNS = """
    id, username, password_hash, display_name, role, permissions,
    face_descriptor, device_id, face_enrolled, is_active,
    created_at, last_login_at, created_by,
    failed_attempts, login_count, locked_at, lock_reason, last_ip, last_location,
    device_ids
"""


def _row_to_user(row):
    if not row:
        return None
    perms = row[5]
    if isinstance(perms, str):
        perms = json.loads(perms)
    face = row[6]
    if isinstance(face, str):
        face = json.loads(face)
    return {
        'id': row[0],
        'username': row[1],
        'password_hash': row[2],
        'display_name': row[3] or row[1],
        'role': row[4],
        'permissions': perms or [],
        'face_descriptor': face,
        'device_id': row[7],
        'face_enrolled': bool(row[8]),
        'is_active': bool(row[9]),
        'created_at': row[10].isoformat() if row[10] else None,
        'last_login_at': row[11].isoformat() if row[11] else None,
        'created_by': row[12],
        'failed_attempts': row[13] or 0,
        'login_count': row[14] or 0,
        'locked_at': row[15].isoformat() if row[15] else None,
        'lock_reason': row[16],
        'last_ip': row[17],
        'last_location': row[18],
        'device_ids': _parse_device_ids(row[19] if len(row) > 19 else None) or _parse_device_ids(row[7]),
    }


def get_user_by_username(username: str, include_inactive=False):
    """Look up by username. Pass include_inactive to also see locked accounts."""
    conn = connect_db()
    cur = conn.cursor()
    where = 'username = %s' if include_inactive else 'username = %s AND is_active = TRUE'
    cur.execute(f'SELECT {_USER_COLUMNS} FROM app_users WHERE {where}', (username,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    return _row_to_user(row)


def get_user_by_id(user_id: int):
    conn = connect_db()
    cur = conn.cursor()
    cur.execute(f'SELECT {_USER_COLUMNS} FROM app_users WHERE id = %s', (user_id,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    return _row_to_user(row)


def list_users():
    conn = connect_db()
    cur = conn.cursor()
    cur.execute(f'SELECT {_USER_COLUMNS} FROM app_users ORDER BY id')
    rows = cur.fetchall()
    cur.close()
    conn.close()
    users = []
    for row in rows:
        u = _row_to_user(row)
        u.pop('password_hash', None)
        u.pop('face_descriptor', None)
        users.append(u)
    return users


def create_user(username, password, display_name, role, permissions, created_by):
    perms = permissions or DEFAULT_ROLE_PERMISSIONS.get(role, [])
    conn = connect_db()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO app_users (username, password_hash, display_name, role, permissions, created_by)
        VALUES (%s, %s, %s, %s, %s::jsonb, %s)
        RETURNING id
    """, (username, hash_password(password), display_name or username, role,
          json.dumps(perms), created_by))
    uid = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return uid


def update_user(user_id, display_name=None, role=None, permissions=None,
                password=None, is_active=None):
    conn = connect_db()
    cur = conn.cursor()
    sets, vals = [], []
    if display_name is not None:
        sets.append('display_name = %s')
        vals.append(display_name)
    if role is not None:
        sets.append('role = %s')
        vals.append(role)
    if permissions is not None:
        sets.append('permissions = %s::jsonb')
        vals.append(json.dumps(permissions))
    if password:
        sets.append('password_hash = %s')
        vals.append(hash_password(password))
    if is_active is not None:
        sets.append('is_active = %s')
        vals.append(is_active)
        if is_active:
            sets += ['locked_at = NULL', 'lock_reason = NULL', 'failed_attempts = 0']
    if not sets:
        cur.close()
        conn.close()
        return False
    vals.append(user_id)
    cur.execute(f"UPDATE app_users SET {', '.join(sets)} WHERE id = %s", vals)
    ok = cur.rowcount > 0
    conn.commit()
    cur.close()
    conn.close()
    return ok


def delete_user(user_id):
    conn = connect_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM app_users WHERE id = %s", (user_id,))
    ok = cur.rowcount > 0
    conn.commit()
    cur.close()
    conn.close()
    return ok


def _parse_device_ids(value):
    """Normalise stored device data to a unique list (legacy string or JSON array)."""
    if not value:
        return []
    items = []
    if isinstance(value, list):
        items = value
    elif isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        if text.startswith('['):
            try:
                parsed = json.loads(text)
                items = parsed if isinstance(parsed, list) else [text]
            except (TypeError, ValueError):
                items = [text]
        else:
            items = [text]
    else:
        return []
    seen, out = set(), []
    for item in items:
        device = str(item).strip()[:128]
        if device and device not in seen:
            seen.add(device)
            out.append(device)
    return out


def trusted_devices(user):
    ids = _parse_device_ids((user or {}).get('device_ids'))
    if not ids:
        ids = _parse_device_ids((user or {}).get('device_id'))
    return ids


def device_is_trusted(user, device_id):
    """True when this browser may use Face ID without a password re-bind."""
    trusted = trusted_devices(user)
    if not trusted:
        return True
    return bool(device_id) and device_id in trusted


def save_face_enrollment(user_id, descriptors, device_id):
    """Store one or many angle descriptors (Face ID style multi-angle enrollment)."""
    conn = connect_db()
    cur = conn.cursor()
    cur.execute("""
        UPDATE app_users
        SET face_descriptor = %s::jsonb, face_enrolled = TRUE
        WHERE id = %s
    """, (json.dumps(_as_descriptor_list(descriptors)), user_id))
    ok = cur.rowcount > 0
    conn.commit()
    cur.close()
    conn.close()
    if ok and device_id:
        bind_device(user_id, device_id)
    return ok


def bind_device(user_id, device_id):
    """Add a browser/device to the trusted Face ID list (does not drop the others).

    Returns True when this device was newly added.
    """
    if not device_id:
        return False
    conn = connect_db()
    cur = conn.cursor()
    cur.execute('SELECT device_id, device_ids FROM app_users WHERE id = %s', (user_id,))
    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        return False
    devices = _parse_device_ids(row[1]) or _parse_device_ids(row[0])
    already = device_id in devices
    if not already:
        devices.append(device_id)
        if len(devices) > MAX_TRUSTED_DEVICES:
            devices = devices[-MAX_TRUSTED_DEVICES:]
    cur.execute("""
        UPDATE app_users
        SET device_id = %s, device_ids = %s::jsonb
        WHERE id = %s
    """, (device_id, json.dumps(devices), user_id))
    conn.commit()
    cur.close()
    conn.close()
    return not already


def touch_last_login(user_id, ip=None, location=None):
    """Record a successful login and clear the failed-attempt counter."""
    conn = connect_db()
    cur = conn.cursor()
    cur.execute("""
        UPDATE app_users
        SET last_login_at = NOW(),
            login_count = COALESCE(login_count, 0) + 1,
            failed_attempts = 0,
            last_ip = COALESCE(%s, last_ip),
            last_location = COALESCE(%s, last_location)
        WHERE id = %s
    """, (ip, location, user_id))
    conn.commit()
    cur.close()
    conn.close()


def lock_user(user_id, reason, ip=None, location=None):
    """Disable an account so only an admin can bring it back."""
    conn = connect_db()
    cur = conn.cursor()
    cur.execute("""
        UPDATE app_users
        SET is_active = FALSE,
            locked_at = NOW(),
            lock_reason = %s,
            last_ip = COALESCE(%s, last_ip),
            last_location = COALESCE(%s, last_location)
        WHERE id = %s
    """, (reason[:160], ip, location, user_id))
    ok = cur.rowcount > 0
    conn.commit()
    cur.close()
    conn.close()
    return ok


def unlock_user(user_id):
    """Re-enable an account and reset its failure counter."""
    conn = connect_db()
    cur = conn.cursor()
    cur.execute("""
        UPDATE app_users
        SET is_active = TRUE, locked_at = NULL, lock_reason = NULL, failed_attempts = 0
        WHERE id = %s
    """, (user_id,))
    ok = cur.rowcount > 0
    conn.commit()
    cur.close()
    conn.close()
    return ok


def register_failed_password(user_id, ip=None, location=None):
    """Count one wrong password. Returns (attempts, locked)."""
    conn = connect_db()
    cur = conn.cursor()
    cur.execute("""
        UPDATE app_users
        SET failed_attempts = COALESCE(failed_attempts, 0) + 1,
            last_ip = COALESCE(%s, last_ip),
            last_location = COALESCE(%s, last_location)
        WHERE id = %s
        RETURNING failed_attempts
    """, (ip, location, user_id))
    row = cur.fetchone()
    attempts = row[0] if row else 0
    locked = False
    if attempts >= MAX_PASSWORD_ATTEMPTS:
        cur.execute("""
            UPDATE app_users
            SET is_active = FALSE, locked_at = NOW(), lock_reason = %s
            WHERE id = %s
        """, (LOCK_REASON_PASSWORD, user_id))
        locked = True
    conn.commit()
    cur.close()
    conn.close()
    return attempts, locked


def _as_descriptor_list(value):
    """Normalise stored/incoming face data to a list of descriptors."""
    if not value:
        return []
    if isinstance(value[0], (int, float)):
        return [list(value)]
    return [list(d) for d in value if d]


def face_distance(a, b):
    if not a or not b or len(a) != len(b):
        return float('inf')
    return math.sqrt(sum((float(x) - float(y)) ** 2 for x, y in zip(a, b)))


def best_face_distance(probe, stored):
    """Closest match between one probe descriptor and all enrolled angles."""
    return min((face_distance(probe, d) for d in _as_descriptor_list(stored)),
               default=float('inf'))


def find_user_by_face(descriptor, device_id=None):
    conn = connect_db()
    cur = conn.cursor()
    cur.execute(f"""
        SELECT {_USER_COLUMNS}
        FROM app_users
        WHERE is_active = TRUE AND face_enrolled = TRUE AND face_descriptor IS NOT NULL
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    best, best_dist = None, float('inf')
    for row in rows:
        user = _row_to_user(row)
        desc = user.get('face_descriptor')
        if not desc:
            continue
        dist = best_face_distance(descriptor, desc)
        if dist < best_dist:
            best_dist = dist
            best = user
    if best and best_dist <= FACE_MATCH_THRESHOLD:
        return best, best_dist, best_dist <= FACE_MATCH_THRESHOLD
    return None, best_dist, False


def user_allowed(user_or_role, path, permissions=None):
    """Check if user may access path. user_or_role can be role string (legacy) or dict."""
    if isinstance(user_or_role, dict):
        role = user_or_role.get('role', '')
        perms = user_or_role.get('permissions') or []
    else:
        role = user_or_role
        perms = permissions or DEFAULT_ROLE_PERMISSIONS.get(role, [])

    if role == 'admin' or '*' in perms:
        return True

    # Dashboard home for any logged-in user with at least one permission
    if path in ('/', '/api/dashboard/stats', '/setup-face', '/api/auth/face-enroll'):
        return bool(perms) or role in DEFAULT_ROLE_PERMISSIONS

    for mod in perms:
        prefixes = MODULE_PATHS.get(mod, ())
        if any(path.startswith(p) for p in prefixes):
            return True
    return False


def user_home(user_or_role, permissions=None):
    if isinstance(user_or_role, dict):
        role = user_or_role.get('role', '')
        perms = user_or_role.get('permissions') or []
    else:
        role = user_or_role
        perms = permissions or DEFAULT_ROLE_PERMISSIONS.get(role, [])

    if role == 'admin' or 'users' in perms or len(perms) > 2:
        return '/'
    if 'layout' in perms:
        return '/layout'
    if 'classroom_layout' in perms:
        return '/classroom-layout'
    if 'report' in perms:
        return '/report'
    if 'view' in perms:
        return '/view'
    if 'entry' in perms:
        return '/entry'
    if 'approve' in perms:
        return '/approve'
    if 'kuti_links' in perms:
        return '/kuti-links'
    return '/'


def purge_old_activity(days=ACTIVITY_RETENTION_DAYS):
    """Delete activity log rows older than the retention window."""
    try:
        conn = connect_db()
        cur = conn.cursor()
        cur.execute("""
            DELETE FROM activity_log
            WHERE created_at < NOW() - make_interval(days => %s)
        """, (days,))
        deleted = cur.rowcount
        conn.commit()
        cur.close()
        conn.close()
        if deleted:
            print(f'[activity] Purged {deleted} entries older than {days} days')
        return deleted
    except Exception as e:
        print(f'[activity] purge error: {e}')
        return 0


def log_activity(user_id, username, action, module=None, detail=None,
                 ip_address=None, device_id=None):
    try:
        conn = connect_db()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO activity_log (user_id, username, action, module, detail, ip_address, device_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (user_id, username, action, module, detail, ip_address, device_id))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f'[activity] log error: {e}')


def list_activity(limit=100, module=None, days=ACTIVITY_RETENTION_DAYS):
    conn = connect_db()
    cur = conn.cursor()
    if module:
        cur.execute("""
            SELECT id, user_id, username, action, module, detail, ip_address, device_id, created_at
            FROM activity_log
            WHERE module = %s
              AND created_at >= NOW() - make_interval(days => %s)
            ORDER BY created_at DESC LIMIT %s
        """, (module, days, limit))
    else:
        cur.execute("""
            SELECT id, user_id, username, action, module, detail, ip_address, device_id, created_at
            FROM activity_log
            WHERE created_at >= NOW() - make_interval(days => %s)
            ORDER BY created_at DESC LIMIT %s
        """, (days, limit))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [{
        'id': r[0], 'user_id': r[1], 'username': r[2], 'action': r[3],
        'module': r[4], 'detail': r[5], 'ip_address': r[6], 'device_id': r[7],
        'created_at': r[8].strftime('%d/%m/%Y %H:%M') if r[8] else '',
    } for r in rows]


DEFAULT_USERS = [
    ('admin', 'admin@2026', 'អ្នកគ្រប់គ្រង', 'admin', ALL_PERMISSIONS),
    ('user1', 'layout@2026', 'ប្លង់អាសនៈ', 'user1', ['layout']),
    ('user2', 'report@2026', 'របាយការណ៍', 'user2', ['report']),
]


def seed_default_users():
    """Create the built-in accounts on first run and keep their hashes readable."""
    conn = connect_db()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM app_users")
    empty = cur.fetchone()[0] == 0

    if empty:
        for username, pw, name, role, perms in DEFAULT_USERS:
            cur.execute("""
                INSERT INTO app_users (username, password_hash, display_name, role, permissions, created_by)
                VALUES (%s, %s, %s, %s, %s::jsonb, 'system')
            """, (username, hash_password(pw), name, role, json.dumps(perms)))
        conn.commit()
        print('[auth] Default users seeded.')
    else:
        # Rehash built-in accounts stored with an algorithm this build can't verify
        for username, pw, _name, _role, _perms in DEFAULT_USERS:
            cur.execute("SELECT password_hash FROM app_users WHERE username = %s", (username,))
            row = cur.fetchone()
            if row and row[0] and row[0].startswith('scrypt:'):
                cur.execute("UPDATE app_users SET password_hash = %s WHERE username = %s",
                            (hash_password(pw), username))
                print(f'[auth] Rehashed default account: {username}')
        conn.commit()

    cur.close()
    conn.close()
