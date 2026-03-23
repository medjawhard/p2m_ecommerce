import os
import psycopg2
from google import genai
from dotenv import load_dotenv

# Charger les variables d'environnement
load_dotenv('server/.env')

DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

def reindex_products():
    print(f"🚀 Démarrage de l'indexation des vecteurs (Gemini 2.0 Native)...")
    
    # 1. Connexion Base de Données
    try:
        conn = psycopg2.connect(
            dbname=DB_NAME, user=DB_USER, password=DB_PASSWORD, host=DB_HOST, port=DB_PORT
        )
        cur = conn.cursor()
    except Exception as e:
        print(f"❌ Erreur de connexion DB : {e}")
        return

    # 2. Initialisation Gemini
    client = genai.Client(api_key=GEMINI_API_KEY)

    # 3. Récupérer les produits sans vecteurs
    cur.execute("SELECT id, name, brand, category, description FROM products WHERE embedding IS NULL")
    products = cur.fetchall()
    
    if not products:
        print("✅ Tous les produits ont déjà leurs vecteurs (embeddings).")
        return

    print(f"📦 {len(products)} produits à traiter...")

    for p_id, name, brand, category, description in products:
        text_to_embed = f"{name} {brand or ''} {category or ''} {description or ''}"
        print(f"  - Traitement de : {name}...")
        
        try:
            # On utilise le nouveau modèle Gemini 2.0 Native Embedding (3072 dims)
            emb_res = client.models.embed_content(
                model="models/gemini-embedding-2-preview", 
                contents=text_to_embed
            )
            
            if emb_res.embeddings:
                vector = emb_res.embeddings[0].values
                cur.execute("UPDATE products SET embedding = %s WHERE id = %s", (vector, p_id))
                conn.commit()
                print(f"    ✅ Vecteur généré (3072 dims) !")
            else:
                print(f"    ⚠️ Pas de vecteur retourné pour {name}.")
                
        except Exception as e:
            print(f"    ❌ Erreur Gemini pour {name} : {e}")
            if "429" in str(e):
                print("🛑 Quota dépassé. Pause de 10 secondes...")
                import time
                time.sleep(10)

    cur.close()
    conn.close()
    print("\n🏁 Opération terminée.")

if __name__ == "__main__":
    reindex_products()
