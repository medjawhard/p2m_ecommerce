import os
import psycopg2
from dotenv import load_dotenv

load_dotenv('server/.env')

def init_db():
    conn = psycopg2.connect(
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432")
    )
    cur = conn.cursor()
    
    sql_files = [
        'products_table.sql',
        'custommer.sql',
        'insertion.sql',
        'others.sql'
    ]
    
    # Utiliser le dossier où se trouve ce script (p2m_ecommerce)
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    try:
        for f in sql_files:
            path = os.path.join(base_dir, f)
            print(f"Executing {f}...")
            with open(path, 'r', encoding='utf-8') as file:
                sql = file.read()
                cur.execute(sql)
        conn.commit()
        print("Database initialized successfully!")
    except Exception as e:
        print(f"Error during initialization: {e}")
        conn.rollback()
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    init_db()
