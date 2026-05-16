import psycopg2


def connect_db():
        conn_db = psycopg2.connect(
                host="localhost",
                database="pagoda_2026",
                user="admin",
                password="121314"
        )
        return conn_db

