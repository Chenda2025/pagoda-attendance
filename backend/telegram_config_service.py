"""Telegram bot credentials stored in DB — editable from the admin UI."""
from conn import connect_db

# Legacy defaults used only to seed an empty config once
_SEED_TOKEN = '8950898077:AAHNR0tTgtJWy17wMXooKwg4nfQLGdfe5aw'
_SEED_CHAT_ID = '-1003960014484'


def create_telegram_bot_config_table():
    conn = None
    try:
        conn = connect_db()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS telegram_bot_config (
                id           INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
                bot_token    TEXT NOT NULL DEFAULT '',
                chat_id      TEXT NOT NULL DEFAULT '',
                bot_label    TEXT NOT NULL DEFAULT '',
                enabled      BOOLEAN NOT NULL DEFAULT TRUE,
                updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        cur.execute("SELECT id FROM telegram_bot_config WHERE id = 1")
        if not cur.fetchone():
            cur.execute("""
                INSERT INTO telegram_bot_config (id, bot_token, chat_id, bot_label, enabled)
                VALUES (1, %s, %s, %s, TRUE)
            """, (_SEED_TOKEN, _SEED_CHAT_ID, 'វត្តមាន / កិច្ចសន្យា'))
        conn.commit()
        cur.close()
        print("Table 'telegram_bot_config' created / verified.")
    except Exception as e:
        print(f"Database error creating telegram_bot_config: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()


def get_telegram_bot_config(mask_token=False):
    """Return config dict. mask_token=True hides most of the token for UI display."""
    conn = None
    try:
        conn = connect_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT bot_token, chat_id, bot_label, enabled, updated_at
            FROM telegram_bot_config WHERE id = 1
        """)
        row = cur.fetchone()
        cur.close()
        if not row:
            return {
                'bot_token': '',
                'chat_id': '',
                'bot_label': '',
                'enabled': True,
                'updated_at': None,
                'configured': False,
            }
        token, chat_id, label, enabled, updated = row
        token = token or ''
        display_token = token
        if mask_token and token:
            if len(token) > 12:
                display_token = token[:6] + '…' + token[-4:]
            else:
                display_token = '••••••••'
        return {
            'bot_token': display_token,
            'bot_token_set': bool(token),
            'chat_id': str(chat_id or ''),
            'bot_label': label or '',
            'enabled': bool(enabled),
            'updated_at': updated.isoformat() if updated else None,
            'configured': bool(token and chat_id),
        }
    except Exception as e:
        print(f'[telegram-config] get failed: {e}')
        return {
            'bot_token': '',
            'bot_token_set': False,
            'chat_id': '',
            'bot_label': '',
            'enabled': True,
            'updated_at': None,
            'configured': False,
        }
    finally:
        if conn:
            conn.close()


def get_telegram_bot_creds():
    """Return (token, chat_id) for sending. chat_id as string. Empty if disabled/missing."""
    conn = None
    try:
        conn = connect_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT bot_token, chat_id, enabled
            FROM telegram_bot_config WHERE id = 1
        """)
        row = cur.fetchone()
        cur.close()
        if not row:
            return '', ''
        token, chat_id, enabled = row
        if not enabled:
            return '', ''
        return (token or '').strip(), str(chat_id or '').strip()
    except Exception as e:
        print(f'[telegram-config] creds failed: {e}')
        return '', ''
    finally:
        if conn:
            conn.close()


def save_telegram_bot_config(bot_token=None, chat_id=None, bot_label=None, enabled=None,
                             keep_token_if_blank=True):
    """
    Update singleton config.
    If keep_token_if_blank and bot_token is blank/masked, leave existing token unchanged.
    """
    conn = None
    try:
        conn = connect_db()
        cur = conn.cursor()
        cur.execute("SELECT bot_token FROM telegram_bot_config WHERE id = 1")
        row = cur.fetchone()
        current_token = (row[0] if row else '') or ''

        token = (bot_token if bot_token is not None else current_token) or ''
        token = token.strip()
        if keep_token_if_blank and (not token or '…' in token or token.startswith('••')):
            token = current_token

        chat = '' if chat_id is None else str(chat_id).strip()
        label = '' if bot_label is None else str(bot_label).strip()
        en = True if enabled is None else bool(enabled)

        cur.execute("""
            INSERT INTO telegram_bot_config (id, bot_token, chat_id, bot_label, enabled, updated_at)
            VALUES (1, %s, %s, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
                bot_token  = EXCLUDED.bot_token,
                chat_id    = EXCLUDED.chat_id,
                bot_label  = EXCLUDED.bot_label,
                enabled    = EXCLUDED.enabled,
                updated_at = CURRENT_TIMESTAMP
        """, (token, chat, label, en))
        conn.commit()
        cur.close()
        return True, None
    except Exception as e:
        if conn:
            conn.rollback()
        return False, str(e)
    finally:
        if conn:
            conn.close()
