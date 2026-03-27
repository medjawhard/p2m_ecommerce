import os
import json
from google import genai
from database import SessionLocal
from models import InventoryAlert
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

def decompose_existing():
    db = SessionLocal()
    # Find global reports or very long messages
    global_alerts = db.query(InventoryAlert).filter(
        (InventoryAlert.product_name == "Rapport Global") | 
        (InventoryAlert.message.contains('\n'))
    ).all()
    
    print(f"🔄 Found {len(global_alerts)} alerts to decompose.")
    
    for alert in global_alerts:
        print(f"⚙️ Decomposing alert ID {alert.id}...")
        prompt = f"""
        Tu es un expert en logistique. Analyse ce rapport et décompose-le en alertes individuelles par article.
        Rapport : {alert.message}
        
        Réponds UNIQUEMENT avec un JSON au format :
        [
          {{"product_name": "NOM PRODUIT", "message": "Détail court", "alert_type": "low_stock ou out_of_stock"}}
        ]
        """
        try:
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
                config=genai.types.GenerateContentConfig(response_mime_type="application/json")
            )
            data = json.loads(response.text)
            
            for item in data:
                new_sa = InventoryAlert(
                    product_name=item.get("product_name", "Produit Inconnu"),
                    message=item.get("message", "Alerte de stock"),
                    alert_type=item.get("alert_type", "low_stock"),
                    created_at=alert.created_at # Keep original date
                )
                db.add(new_sa)
            
            # Delete the original "block"
            db.delete(alert)
            print(f"✅ Alert ID {alert.id} decomposed into {len(data)} items.")
            
        except Exception as e:
            print(f"❌ Error decomposing alert ID {alert.id}: {e}")
            
    db.commit()
    db.close()

if __name__ == "__main__":
    decompose_existing()
