import os
from flask import Flask
from routes import main_bp
from create_table import create_monks_table
from conn import connect_db

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'pagoda-niroth-rangsay-2026-secret')
app.register_blueprint(main_bp)


def _auto_setup():
    """Run DB init and trigger setup automatically on startup."""
    try:
        create_monks_table()
        print('[startup] Tables created / verified.')
    except Exception as e:
        print(f'[startup] init-db warning: {e}')

    try:
        conn = connect_db()
        cur  = conn.cursor()
        cur.execute("""
            CREATE OR REPLACE FUNCTION set_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        """)
        cur.execute("DROP TRIGGER IF EXISTS trg_set_updated_at ON monk_tbl;")
        cur.execute("""
            CREATE TRIGGER trg_set_updated_at
                BEFORE UPDATE ON monk_tbl
                FOR EACH ROW
                EXECUTE FUNCTION set_updated_at();
        """)
        conn.commit()
        cur.close()
        conn.close()
        print('[startup] Trigger created / verified.')
    except Exception as e:
        print(f'[startup] setup-trigger warning: {e}')


_auto_setup()

if __name__ == '__main__':
    app.run(debug=True)
