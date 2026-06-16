import os
import psycopg2


def connect_db():
    database_url = os.environ.get('DATABASE_URL')
    if database_url:
        # Render provides DATABASE_URL — use it directly
        conn_db = psycopg2.connect(database_url)
    else:
        conn_db = psycopg2.connect(
            host=os.environ.get('DB_HOST', 'localhost'),
            database=os.environ.get('DB_NAME', 'pagoda_2026'),
            user=os.environ.get('DB_USER', 'admin'),
            password=os.environ.get('DB_PASSWORD', '121314'),
            port=int(os.environ.get('DB_PORT', 5432)),
        )
    return conn_db
