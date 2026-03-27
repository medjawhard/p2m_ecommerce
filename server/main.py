import os
import json
from fastapi import FastAPI, HTTPException, Depends, Security, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv
from google import genai
from sqlalchemy import or_, func
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models import Product, Customer, ProductVariant, GlobalFeedback, OrderItem, InventoryAlert
from datetime import datetime, timedelta
import bcrypt
from jose import JWTError, jwt

security = HTTPBearer()

load_dotenv()

# Security Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 # 1 day

def get_password_hash(password: str) -> str:
    # Hash a password for the first time
    # (bcrypt requires bytes)
    byte_pwd = password.encode('utf-8')
    salt = bcrypt.gensalt()
    pw_hash = bcrypt.hashpw(byte_pwd, salt)
    return pw_hash.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    # Check hashed password. Using bcrypt.checkpw
    try:
        byte_pwd = plain_password.encode('utf-8')
        byte_hash = hashed_password.encode('utf-8')
        return bcrypt.checkpw(byte_pwd, byte_hash)
    except Exception:
        return False

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gemini Client
api_key = os.getenv("GEMINI_API_KEY")
if api_key and isinstance(api_key, str):
    masked_key = f"{api_key[:4]}...{api_key[-4:]}" if len(api_key) > 8 else "***"
    print(f"🚀 [INIT] Gemini API Key chargée: {masked_key}")
else:
    print("❌ [INIT] GEMINI_API_KEY non trouvée dans .env !")

client = genai.Client(api_key=api_key)

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[dict]] = []

class SignupRequest(BaseModel):
    first_name: str
    email: str
    password: str
    gender: Optional[str] = None
    country: Optional[str] = None
    age: Optional[int] = None

class LoginRequest(BaseModel):
    email: str
    password: str

class ReviewCreate(BaseModel):
    rating: int
    comment: str

class FeedbackCreate(BaseModel):
    rating: int
    comment: str

class OrderItemCreate(BaseModel):
    variant_id: int
    quantity: int
    price: float

class OrderCreate(BaseModel):
    items: List[OrderItemCreate]
    total_price: float

class AnalysisRequest(BaseModel):
    description: str
    image_base64: Optional[str] = None

class AlertCreate(BaseModel):
    product_name: Optional[str] = "Rapport Global"
    message: str
    alert_type: str = "low_stock"

# Helper Functions
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire.timestamp()})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Token invalide")
    except JWTError:
        raise HTTPException(status_code=401, detail="Session expirée")
    
    user = db.query(Customer).filter(Customer.email == email).first()
    if user is None:
        raise HTTPException(status_code=401, detail="Utilisateur non trouvé")
    return user

def get_current_user_optional(credentials: Optional[HTTPAuthorizationCredentials] = Security(HTTPBearer(auto_error=False)), db: Session = Depends(get_db)):
    if not credentials:
        return None
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if not email:
            return None
        return db.query(Customer).filter(Customer.email == email).first()
    except:
        return None

def parse_gemini_filters(text: str) -> dict:
    """Extract JSON filters from Gemini response."""
    try:
        clean_text = text.replace("```json", "").replace("```", "").strip()
        return json.loads(clean_text)
    except json.JSONDecodeError:
        print(f"Failed to parse JSON: {text}")
        return {}
    except Exception as e:
        print(f"Error parsing filters: {e}")
        return {}

@app.post("/signup")
async def signup(request: SignupRequest, db: Session = Depends(get_db)):
    # Check if user already exists
    existing_user = db.query(Customer).filter(Customer.email == request.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé.")
    
    # Hash password and create user
    hashed_password = get_password_hash(request.password)
    
    # Auto-admin rule for @shop.com domain
    is_admin = request.email.lower().endswith("@shop.com")
    
    new_user = Customer(
        first_name=request.first_name,
        email=request.email,
        password_hash=hashed_password,
        gender=request.gender,
        country=request.country,
        age=request.age,
        is_admin=is_admin
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {"message": "Compte créé avec succès !"}

@app.post("/login")
async def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(Customer).filter(Customer.email == request.email).first()
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect.")
    
    # Create JWT token
    access_token = create_access_token(data={"sub": user.email})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_name": user.first_name,
        "is_admin": user.is_admin
    }

@app.post("/api/orders")
async def create_order(order: OrderCreate, user: Customer = Depends(get_current_user), db: Session = Depends(get_db)):
    from models import Order, OrderItem
    
    new_order = Order(
        customer_id=user.id,
        total_price=order.total_price,
        status="En cours"
    )
    db.add(new_order)
    db.commit()
    db.refresh(new_order)
    
    for item in order.items:
        new_item = OrderItem(
            order_id=new_order.id,
            product_variant_id=item.variant_id,
            quantity=item.quantity,
            price=item.price
        )
        db.add(new_item)
    
    db.commit()
    return {"message": "Commande enregistrée !", "order_id": new_order.id}



@app.post("/api/products/{product_id}/reviews")
async def create_review(product_id: int, review: ReviewCreate, user: Customer = Depends(get_current_user), db: Session = Depends(get_db)):
    from models import Review
    new_review = Review(
        product_id=product_id,
        customer_id=user.id,
        rating=review.rating,
        comment=review.comment
    )
    db.add(new_review)
    db.commit()
    return {"message": "Avis ajouté !"}

@app.get("/api/products/{product_id}/reviews")
async def get_reviews(product_id: int, db: Session = Depends(get_db)):
    from models import Review
    reviews = db.query(Review).filter(Review.product_id == product_id).order_by(Review.created_at.desc()).all()
    return [{
        "id": r.id,
        "customer_name": r.customer.first_name,
        "rating": r.rating,
        "comment": r.comment,
        "date": r.created_at
    } for r in reviews]

@app.post("/api/feedback")
async def create_global_feedback(feedback: FeedbackCreate, user: Customer = Depends(get_current_user), db: Session = Depends(get_db)):
    from models import GlobalFeedback
    new_feedback = GlobalFeedback(
        customer_id=user.id,
        rating=feedback.rating,
        comment=feedback.comment
    )
    db.add(new_feedback)
    db.commit()
    return {"message": "Merci pour votre retour !"}

@app.get("/api/me/orders")
async def get_my_orders(user: Customer = Depends(get_current_user), db: Session = Depends(get_db)):
    from models import Order
    orders = db.query(Order).filter(Order.customer_id == user.id).order_by(Order.created_at.desc()).all()
    return [{
        "id": f"ORD-{o.id:04d}",
        "db_id": o.id,
        "total": float(o.total_price),
        "status": o.status,
        "date": o.created_at.strftime("%Y-%m-%d"),
        "items": [{
            "product": i.variant.product.name,
            "size": i.variant.size,
            "quantity": i.quantity,
            "price": float(i.price)
        } for i in o.items]
    } for o in orders]

# --- ADMIN ENDPOINTS ---

@app.get("/api/admin/stats")
async def get_admin_stats(user: Customer = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs.")
    
    from models import Product, ProductVariant, Order, OrderItem, GlobalFeedback
    from sqlalchemy import text
    
    total_users = db.query(Customer).count()
    total_products = db.query(Product).count()
    total_orders = db.query(Order).count()
    total_revenue = db.query(func.sum(Order.total_price)).scalar() or 0
    total_stock = db.query(func.sum(ProductVariant.stock_quantity)).scalar() or 0
    
    # 1. Revenue Trends (last 30 days)
    thirty_days_ago = datetime.now() - timedelta(days=30)
    revenue_trends = db.query(
        func.date(Order.created_at).label('date'),
        func.sum(Order.total_price).label('revenue')
    ).filter(Order.created_at >= thirty_days_ago)\
     .group_by(func.date(Order.created_at))\
     .order_by(func.date(Order.created_at)).all()
    
    # 2. Top Selling Products
    top_products = db.query(
        Product.name,
        func.sum(OrderItem.quantity).label('total_sold')
    ).join(ProductVariant, Product.id == ProductVariant.product_id)\
     .join(OrderItem, ProductVariant.id == OrderItem.product_variant_id)\
     .group_by(Product.id)\
     .order_by(func.sum(OrderItem.quantity).desc())\
     .limit(5).all()
     
    # 3. Customer Demographics
    gender_dist = db.query(Customer.gender, func.count(Customer.id)).group_by(Customer.gender).all()
    
    # 4. Category Performance
    category_perf = db.query(
        Product.category,
        func.sum(OrderItem.price * OrderItem.quantity).label('revenue')
    ).select_from(Product).join(ProductVariant, Product.id == ProductVariant.product_id)\
     .join(OrderItem, ProductVariant.id == OrderItem.product_variant_id)\
     .group_by(Product.category).all()

    # Recent Global Feedback (with joinedload to avoid lazy load issues)
    recent_feedbacks = db.query(GlobalFeedback).options(joinedload(GlobalFeedback.customer))\
                        .order_by(GlobalFeedback.created_at.desc()).limit(5).all()
    
    return {
        "total_users": total_users,
        "total_products": total_products,
        "total_orders": total_orders,
        "total_revenue": float(total_revenue),
        "total_stock": int(total_stock),
        "revenue_trends": [{"date": str(r.date), "revenue": float(r.revenue)} for r in revenue_trends],
        "top_products": [{"name": p.name, "sold": int(p.total_sold)} for p in top_products],
        "demographics": {"gender": {str(g[0] or "N/A"): g[1] for g in gender_dist}},
        "category_performance": [{"category": c.category, "revenue": float(c.revenue)} for c in category_perf],
        "recent_feedbacks": [{
            "id": f.id,
            "user": f.customer.first_name,
            "rating": f.rating,
            "comment": f.comment,
            "date": f.created_at
        } for f in recent_feedbacks]
    }

@app.get("/api/admin/customers")
async def get_admin_customers(user: Customer = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Accès réservé.")
    
    customers = db.query(Customer).all()
    return [{
        "id": c.id,
        "name": c.first_name,
        "email": c.email,
        "country": c.country or "N/A",
        "order_count": len(c.orders),
        "total_spent": sum(float(o.total_price) for o in c.orders),
        "joined_at": c.created_at
    } for c in customers]

@app.get("/api/admin/inventory")
async def get_admin_inventory(user: Customer = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Accès réservé.")
    
    from models import Product
    products = db.query(Product).order_by(Product.name).all()
    return [{
        "id": p.id,
        "name": p.name,
        "totalStock": sum(v.stock_quantity for v in p.variants),
        "minPrice": float(min([v.price for v in p.variants] or [0])),
        "variants": [{
            "id": v.id,
            "product_id": v.product_id,
            "sku": v.sku,
            "size": v.size,
            "color": v.color,
            "stock": v.stock_quantity,
            "price": float(v.price)
        } for v in p.variants]
    } for p in products]
@app.get("/api/admin/orders")
async def get_admin_orders(
    user: Customer = Depends(get_current_user), 
    db: Session = Depends(get_db),
    client_email: Optional[str] = None,
    product_name: Optional[str] = None,
    status: Optional[str] = None
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Accès réservé.")
    
    from models import Order, OrderItem, Product, ProductVariant
    query = db.query(Order)
    
    if client_email:
        query = query.join(Customer).filter(Customer.email.ilike(f"%{client_email}%"))
    
    if product_name:
        query = query.join(OrderItem).join(ProductVariant).join(Product).filter(Product.name.ilike(f"%{product_name}%"))
    
    if status:
        query = query.filter(Order.status == status)
        
    orders = query.order_by(Order.created_at.desc()).all()
    
    return [{
        "id": o.id,
        "customer_name": o.customer.first_name,
        "customer_email": o.customer.email,
        "total": float(o.total_price),
        "status": o.status,
        "date": o.created_at.strftime("%Y-%m-%d"),
        "items": [{
            "product": i.variant.product.name,
            "size": i.variant.size,
            "quantity": i.quantity,
            "price": float(i.price)
        } for i in o.items]
    } for o in orders]

@app.patch("/api/admin/orders/{order_id}/status")
async def update_order_status(
    order_id: int,
    status: str,
    user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Accès réservé.")
    
    from models import Order
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Commande non trouvée.")
    
    order.status = status
    db.commit()
    return {"message": "Statut mis à jour avec succès."}

class VariantUpdate(BaseModel):
    stock: Optional[int] = None
    price: Optional[float] = None

class VariantCreate(BaseModel):
    product_id: int
    size: str
    color: Optional[str] = "Unique"
    stock: int
    price: float
    sku: str

@app.patch("/api/admin/inventory/{variant_id}")
async def update_variant(
    variant_id: int,
    data: VariantUpdate,
    user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Accès réservé.")
    
    from models import ProductVariant
    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
    if not variant:
        raise HTTPException(status_code=404, detail="Variante non trouvée.")
    
    if data.stock is not None:
        variant.stock_quantity = data.stock
    if data.price is not None:
        variant.price = data.price
        
    db.commit()
    return {"message": "Variante mise à jour."}

@app.post("/api/admin/inventory")
async def create_variant(
    data: VariantCreate,
    user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Accès réservé.")
    
    from models import ProductVariant
    # Check if SKU exists
    existing = db.query(ProductVariant).filter(ProductVariant.sku == data.sku).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ce SKU existe déjà.")
        
    new_v = ProductVariant(
        product_id = data.product_id,
        size = data.size,
        color = data.color,
        stock_quantity = data.stock,
        price = data.price,
        sku = data.sku
    )
    db.add(new_v)
    db.commit()
    return {"message": "Nouvelle variante ajoutée."}

@app.delete("/api/admin/inventory/{variant_id}")
async def delete_variant(
    variant_id: int,
    user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Accès réservé.")
    
    from models import ProductVariant
    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
    if not variant:
        raise HTTPException(status_code=404, detail="Variante non trouvée.")
        
    db.delete(variant)
    db.commit()
    return {"message": "Variante supprimée."}

class ProductVariantInput(BaseModel):
    size: str
    stock: int
    price: float

class ProductCreate(BaseModel):
    name: str
    description: str = ""
    brand: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = 0.0
    gender: Optional[str] = "Unisexe"
    image_url: Optional[str] = None
    attributes: Optional[dict] = {}
    variants: Optional[List[ProductVariantInput]] = []

@app.get("/api/admin/feedbacks")
async def get_admin_feedbacks(user: Customer = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Accès réservé.")
    feedbacks = db.query(GlobalFeedback).order_by(GlobalFeedback.created_at.desc()).all()
    return [{
        "id": f.id,
        "user_name": f.customer.first_name,
        "user_email": f.customer.email,
        "rating": f.rating,
        "comment": f.comment,
        "date": f.created_at.strftime("%Y-%m-%d")
    } for f in feedbacks]

@app.delete("/api/admin/feedbacks/{fid}")
async def delete_feedback(fid: int, user: Customer = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Accès réservé.")
    f = db.query(GlobalFeedback).filter(GlobalFeedback.id == fid).first()
    if f:
        db.delete(f)
        db.commit()
    return {"message": "Avis supprimé."}

@app.post("/api/admin/products")
async def create_product(
    data: ProductCreate,
    user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Accès réservé.")
    
    try:
        new_p = Product(
            name=data.name, 
            brand=data.brand,
            description=data.description,
            category=data.category,
            gender=data.gender,
            image_url=data.image_url,
            attributes=data.attributes
        )
        db.add(new_p)
        db.commit()
        db.refresh(new_p)
        print(f"✅ [DB] Produit créé: {new_p.id} ({new_p.name})")

        # --- GENERATION DES EMBEDDINGS (VECTEUR IA) pour Synchronisation ---
        try:
            # On utilise le nouveau modèle Gemini 2.0 Native Embedding (3072 dims)
            emb_res = client.models.embed_content(
                model="models/gemini-embedding-2-preview",
                contents=text_to_embed
            )
            if emb_res.embeddings:
                new_p.embedding = emb_res.embeddings[0].values
                db.commit()
                print(f"✨ [SYNC] Embedding généré pour le produit {new_p.id}")
        except Exception as e:
            print(f"⚠️ [WARN] Échec de la génération d'embedding : {e}")

        # Create variants from the provided list
        active_variants = data.variants or []
        
        # If no variants provided but a price exists, create a default "Unique" variant
        if not active_variants and data.price and data.price > 0:
            attrs = data.attributes or {}
            active_variants.append(ProductVariantInput(
                size="Unique",
                stock=int(attrs.get("stock", 0)),
                price=float(data.price if data.price is not None else 0.0)
            ))

        for v_data in active_variants:
            attrs = data.attributes or {}
            # Using more robust SKU: Prefix(3) + Size + Milliseconds (to avoid collisions)
            sku_ts = datetime.now().strftime('%H%M%S%f')[:-3]
            generated_sku = f"{data.name[:3].upper()}-{v_data.size}-{sku_ts}"
            
            new_v = ProductVariant(
                product_id=new_p.id,
                size=v_data.size,
                color=attrs.get("color", "Unique"),
                stock_quantity=v_data.stock,
                price=v_data.price,
                sku=generated_sku
            )
            db.add(new_v)
        
        db.commit()
        print(f"📦 [DB] {len(active_variants)} variantes ajoutées pour {new_p.id}")
        return {"id": new_p.id, "message": "Produit créé et synchronisé avec l'IA."}
    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        print(f"❌ [ERROR] Create product failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur interne lors de la création: {str(e)}")

@app.delete("/api/admin/products/{product_id}")
async def delete_product(
    product_id: int,
    user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Accès réservé.")
    
    product = db.query(Product).filter(Product.id == product_id).first()
    
    if not product:
        raise HTTPException(status_code=404, detail="Produit non trouvé.")
        
    try:
        # Manually delete OrderItems associated with variants of this product
        # because ondelete="CASCADE" is missing on OrderItem.product_variant_id
        for variant in product.variants:
            db.query(OrderItem).filter(OrderItem.product_variant_id == variant.id).delete()
        
        # Now we can safely delete the product (cascade will handle variants and reviews)
        db.delete(product)
        db.commit()
    except Exception as e:
        print(f"Error deleting product: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erreur lors de la suppression: {str(e)}")
        
    return {"message": "Produit supprimé avec succès."}

@app.post("/api/admin/products/analyze")
async def analyze_product(
    request: AnalysisRequest,
    user: Customer = Depends(get_current_user)
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Accès réservé.")
    
    try:
        system_instruction = (
            "Tu es un expert en e-commerce de luxe. "
            "Analyse la description (et éventuellement l'image) d'un produit pour extraire les informations suivantes au format JSON strict.\n"
            "Champs demandés :\n"
            "- name: Nom court et élégant du produit\n"
            "- brand: La marque détectée\n"
            "- category: Catégorie logique (ex: Haute Joaillerie, Prêt-à-porter)\n"
            "- price: Prix suggéré (nombre sans devise)\n"
            "- gender: 'Homme', 'Femme' ou 'Unisexe'\n"
            "- variants: Liste d'objets {size: 'S', stock: 5}. EXTRAITS UNIQUEMENT s'ils sont mentionnés dans le texte. Ne suggère RIEN si ce n'est pas écrit. Si aucune taille n'est mentionnée, renvoie une liste vide [].\n"
            "- extra_attributes: Objet JSON contenant TOUTES les autres caractéristiques pertinentes trouvées (ex: { 'Matière': 'Soie', 'Coupe': 'Oversize', 'Saison': 'Hiver', 'Mouvement': 'Automatique' }). Sois exhaustif et précis.\n"
            "- features: Points forts (liste de strings)\n"
            "Réponds UNIQUEMENT avec le JSON."
        )

        contents_parts = [{"text": f"Description : {request.description}"}]
        
        if request.image_base64:
            try:
                if "," in request.image_base64:
                    header, data = request.image_base64.split(",", 1)
                    mime_type = header.split(";")[0].split(":")[1]
                else:
                    data = request.image_base64
                    mime_type = "image/jpeg" # Fallback
                
                contents_parts.append({
                    "inline_data": {
                        "mime_type": mime_type,
                        "data": data
                    }
                })
            except Exception as img_err:
                print(f"[WARN] Failed to parse image data: {img_err}")

        try:
            # On tente le modèle 2.5-flash qui apparaît dans votre liste
            response = client.models.generate_content(
                model="gemini-2.5-flash", 
                contents=[{"role": "user", "parts": contents_parts}],
                config={
                    "system_instruction": system_instruction,
                    "response_mime_type": "application/json"
                }
            )
            return json.loads(response.text)
        except Exception as e:
            err_msg = str(e)
            if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg or "404" in err_msg:
                print(f"⚠️ [SIMULATEUR] L'IA 2.5 est saturée. Simulation...")
                return {
                    "gender": "Unisex",
                    "category": "Vêtements",
                    "description": "Une pièce élégante de notre catalogue.",
                    "attributes": {"Style": "Moderne", "Matière": "Coton"}
                }
            else:
                raise e
    except Exception as e:
        print(f"[ERROR] AI Analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur d'analyse IA : {str(e)}")

@app.get("/api/user/profile")
async def get_user_profile(user: Customer = Depends(get_current_user), db: Session = Depends(get_db)):
    from models import Order
    orders = db.query(Order).filter(Order.customer_id == user.id).order_by(Order.created_at.desc()).all()
    
    purchase_history = [
        {
            "id": f"ORD-{o.id:04d}", 
            "date": o.created_at.strftime("%Y-%m-%d"), 
            "total_price": float(o.total_price), 
            "status": o.status,
            "item_count": sum(i.quantity for i in o.items),
            "items": [{
                "name": i.variant.product.name if i.variant and i.variant.product else "Produit inconnu",
                "image": i.variant.product.image_url if i.variant and i.variant.product else None,
                "size": i.variant.size if i.variant else "N/A",
                "quantity": i.quantity,
                "price": float(i.price)
            } for i in o.items]
        } for o in orders
    ]
    
    return {
        "id": user.id,
        "first_name": user.first_name,
        "email": user.email,
        "gender": user.gender or "Non spécifié",
        "country": user.country or "Non spécifié",
        "age": user.age or "N/A",
        "is_admin": user.is_admin,
        "created_at": user.created_at,
        "purchase_history": purchase_history
    }

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest, db: Session = Depends(get_db), current_user: Optional[Customer] = Depends(get_current_user_optional)):
    try:
        from sqlalchemy import text
        # print(f"[CHAT] Debut du Chat Hybride pour : {request.message}", flush=True)

        
        # --- PHASE 0 : RAISONNEMENT (DÉSACTIVÉ POUR ÉCONOMISER LE QUOTA) ---
        optimized_query = request.message
        # try:
        #     reasoning_prompt = "Expert styliste. Transforme en mots-clés optimisés (type, matière, météo, occasion). Uniquement mots-clés séparés par virgules."
        #     reasoning_response = client.models.generate_content(
        #         model="gemini-2.5-flash",
        #         contents=f"Requête utilisateur : {request.message}",
        #         config={"system_instruction": reasoning_prompt}
        #     )
        #     optimized_query = reasoning_response.text.strip()
        #     print(f"[REASONING] Termes optimises : {optimized_query}")
        # except Exception as e:
        #     msg = str(e).encode('ascii', 'ignore').decode()
        # --- PHASE 1 : RECHERCHE SÉMANTIQUE ---
        vector_ids = []
        try:
            # Generation de l'embedding pour la requête (doit être 3072 dims)
            emb_res = client.models.embed_content(
                model="models/gemini-embedding-001",
                contents=request.message
            )
            query_vector = emb_res.embeddings[0].values
            
            # Recherche pgvector avec seuil plus souple (0.7 au lieu de 0.6)
            vector_results = db.execute(text(
                "SELECT id FROM products "
                "WHERE (embedding <-> :vec) < 0.7 "
                "ORDER BY (embedding <-> :vec) LIMIT 5"
            ), {"vec": str(query_vector)}).fetchall()
            
            vector_ids = [r[0] for r in vector_results]
        except Exception as e:
            print(f"[WARN] Vector Search failed: {e}")

        # --- PHASE 2 : RECHERCHE CLASSIQUE (Stricte & History-Aware) ---
        classical_ids = []
        
        search_context = request.message
        # On augmente le seuil à 6 mots pour capturer "affiche toutes ces robes"
        if len(request.message.split()) < 6 and request.history:
            last_user_msg = next((h['content'] for h in reversed(request.history) if h['role'] == 'user'), "")
            search_context = f"{request.message} {last_user_msg}"

        if len(search_context) > 2:
            import re
            from sqlalchemy import or_
            clean_msg = re.sub(r'[^\w\s]', '', search_context.lower())
            raw_keywords = [w for w in clean_msg.split() if len(w) > 2]
            
            stop_words = {"bonjour", "salut", "cherche", "vouloir", "besoin", "merci", "quelle", "votre", "pour", "avec", "dans", "sur", "mais", "quel", "quelles", "cette", "ces", "une", "des", "les", "aux", "est", "sont", "fait", "faire", "veux", "voudrais", "coucou", "hello", "hey", "estce", "avez", "vous", "affiche", "montre", "donne", "voir", "toutes", "tous"}
            
            # Gestion simple des pluriels : si un mot finit par 's', on cherche aussi le singulier
            final_keywords = []
            for w in raw_keywords:
                if w not in stop_words:
                    final_keywords.append(w)
                    if w.endswith('s') and len(w) > 3:
                        final_keywords.append(w[:-1])
            
            if final_keywords:
                filters = []
                for kw in final_keywords[:3]:
                    filters.append(or_(
                        Product.name.ilike(f"%{kw}%"),
                        Product.category.ilike(f"%{kw}%")
                    ))
                
                if filters:
                    # Recherche classique TRÈS stricte (nom ou catégorie uniquement)
                    classical_results = db.query(Product).distinct().filter(or_(*filters)).limit(5).all()
                    classical_ids = [p.id for p in classical_results]
                    if classical_ids:
                        print(f"[CLASSICAL] Found {len(classical_ids)} matches for '{final_keywords}'")

        # --- PHASE 3 : FUSION DES RÉSULTATS ---
        # Priorité aux correspondances exactes (Classical) sur le sémantique (Vector)
        final_ids = list(dict.fromkeys(classical_ids + vector_ids))
        
        # --- PHASE 2.5 : CURATED FALLBACK ---
        no_results_found = False
        if not final_ids and len(search_context) > 2:
            print(f"[CHAT] No products found for '{search_context[:30]}', fetching curated...")
            curated_results = db.query(Product).limit(4).all()
            final_ids = [p.id for p in curated_results]
            no_results_found = True

        # On garde l'ordre de final_ids pour la présentation à l'IA
        if final_ids:
            # Query avec préservation de l'ordre
            from sqlalchemy import case
            order_case = case({id: index for index, id in enumerate(final_ids)}, value=Product.id)
            products_found = db.query(Product).filter(Product.id.in_(final_ids)).order_by(order_case).all()
        else:
            products_found = []

        # Préparation des données pour le frontend
        products_data = []
        for p in products_found:
            variant = p.variants[0] if p.variants else None
            attr_str = ", ".join([f"{k}: {v}" for k, v in p.attributes.items()]) if p.attributes else "N/A"
            short_desc = (p.description[:100] + "...") if p.description and len(p.description) > 100 else p.description
            
            products_data.append({
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "price": float(variant.price) if variant else 0,
                "image": p.image_url,
                "attributes": p.attributes,
                "prompt_info": f"Nom: {p.name} | Prix: {float(variant.price) if variant else 0}e | Attributs: {attr_str} | Desc: {short_desc}",
                "variants": [{
                    "id": v.id,
                    "size": v.size,
                    "stock": v.stock_quantity,
                    "price": float(v.price)
                } for v in p.variants if v.stock_quantity > 0]
            })

        # --- PHASE 3 : SYNTHÈSE IA AVEC TRI SÉMANTIQUE & JUSTIFICATION PAR ATTRIBUTS ---
        ai_reply = ""
        try:
            # --- Personnalisation & Historique Utilisateur ---
            user_context = ""
            if current_user:
                pref_str = json.dumps(current_user.preferences, ensure_ascii=False) if current_user.preferences else "Aucune préférence enregistrée."
                
                # Récupération de l'historique des commandes pour le contexte
                from models import Order
                recent_orders = db.query(Order).filter(Order.customer_id == current_user.id).order_by(Order.created_at.desc()).limit(3).all()
                orders_details = []
                for o in recent_orders:
                    items_str = ", ".join([f"{i.variant.product.name} (x{i.quantity})" for i in o.items])
                    orders_details.append(f"- Commande #{o.id} ({o.created_at.strftime('%Y-%m-%d')}): {items_str} [Statut: {o.status}]")
                orders_context = "\n".join(orders_details) if orders_details else "Aucune commande passée."

                user_context = (
                    f"\n\nCLIENT ACTUEL :\n"
                    f"- Prénom : {current_user.first_name}\n"
                    f"- Genre : {current_user.gender or 'Non spécifié'}\n"
                    f"- Préférences actuelles : {pref_str}\n"
                    f"- Historique de commandes :\n{orders_context}\n"
                    "Utilise ces informations pour personnaliser ton accueil et tes conseils (ex: 'Puisque vous avez déjà acheté...', 'D'après vos préférences...')."
                )

            
            system_instruction = (
                "Tu es 'L'Assistant', un Personal Shopper de luxe, humain, chaleureux et très distingué. "
                "Tu n'es PAS un robot de vente. Ton but est de créer une relation de confiance.\n\n"
                "RÈGLES DE COMPORTEMENT (CRITIQUE) :\n"
                "1. *Premier Contact* : Si la demande est vague ('Bonjour', 'Ça va'), utilise le prénom du client, accueille-le chaleureusement et pose une question ouverte. NE PROPOSE AUCUN PRODUIT. **MAIS** si la demande contient une intention claire ('Je veux un jean', 'Cherche des baskets'), saute l'accueil pur et propose DIRECTEMENT les produits pertinents.\n"
                "2. *Conversation* : Discute avec élégance. Ne sors le catalogue que si une intention d'achat est claire (besoin exprimé, recherche précise).\n"
                "3. *Utilisation du Catalogue* : Si des produits sont fournis dans , c'est qu'ils sont pertinents. Tu DOIS les montrer. Si l'utilisateur demande une catégorie (ex: 'robes'), tu DOIS inclure TOUS les produits de cette catégorie présents dans la liste.\n"
                "4. *Format de Réponse* : Ta réponse doit TOUJOURS se terminer par : JSON: {\"product_ids\": [IDs]}. Tu DOIS inclure TOUS les IDs des produits que tu mentionnes OU qui correspondent à la demande dans ton texte.\n"
                "5. *Format & Style* : SOIS BREF. Max 40 mots. Utilise des émojis chics. Sépare tes idées par des sauts de ligne."
            )


            history_str = "\n".join([f"{h['role']}: {h['content']}" for h in request.history[-3:]]) if request.history else "Pas d'historique."
            
            prompt_context = (
                f"HISTORIQUE DE LA CONVERSATION :\n{history_str}\n\n"
                f"MESSAGE ACTUEL : {request.message}\n\n"
            )
            for p in products_data:
                prompt_context += f"- {p['prompt_info']}\n"

            # Tentative de génération avec Gemini 2.5 Flash
            try:
                response = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=prompt_context,
                    config={"system_instruction": system_instruction}
                )
                ai_reply_full = response.text
            except Exception as e:
                err_msg = str(e)
                if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg or "404" in err_msg:
                    print(f"⚠️ [SIMULATEUR CHAT] Quota atteint (même en 2.5). Simulation.")
                    ai_reply_full = f"Je suis en train d'affiner votre sélection, {request.message}. Mon système est très sollicité, mais j'ai déjà quelques merveilles à vous proposer !"
                else:
                    raise e
            
            ai_reply_parts = ai_reply_full.split('\n')
            ai_reply = ai_reply_parts[0] if ai_reply_parts else ai_reply_full
            ai_actions = []
            
            if "JSON:" in ai_reply_full:
                parts_json = ai_reply_full.split("JSON:")
                ai_reply = parts_json[0].strip()
                json_str = parts_json[1].strip()
                try:
                    if "```" in json_str:
                        json_str = json_str.split("```")[1].replace("json", "").strip()
                    
                    json_data = json.loads(json_str)
                    selected_ids = json_data.get("product_ids", [])
                    ai_actions = json_data.get("actions", [])
                    
                    # --- SAFETY SYNC ---
                    # Si l'IA a oublié des IDs mais en parle dans le texte, on les rajoute
                    # ou si selected_ids est vide mais qu'on a des candidats
                    ai_text_lower = ai_reply.lower()
                    for p in products_data:
                        # Si le nom du produit est dans le texte de l'IA et pas dans selected_ids
                        if p["id"] not in selected_ids:
                            if p["name"].lower() in ai_text_lower:
                                selected_ids.append(p["id"])
                    
                    # On filtre pour ne garder que ce que l'IA a sélectionné (ou ce qu'on a forcé)
                    products_data = [p for p in products_data if p["id"] in selected_ids]
                except Exception as e:
                    print(f"[ERR] JSON AI parsing error: {e}")
            else:
                ai_reply = ai_reply_full.strip()
                # Fixed: ensure products_data is indexed safely
                if isinstance(products_data, list):
                    products_data = products_data[:4]

            print(f"[AI] Synthesis successful: {ai_reply[:40]}... (Displayed IDs: {[p['id'] for p in products_data]})")
            return {
                "reply": ai_reply,
                "products": products_data[:4],
                "actions": ai_actions
            }
        except Exception as e:
            import traceback
            traceback.print_exc()
            msg = str(e).encode('ascii', 'ignore').decode()
            print(f"[WARN] AI Synthesis failed (Quota or Error): {msg}", flush=True)

            # Fallback intelligent
            if isinstance(products_data, list) and products_data:
                 ai_reply = "Absolument ! Voici ma sélection de pièces qui correspondent parfaitement à votre demande :"
            else:
                 ai_reply = "Je n'ai pas trouvé de pièces correspondant exactement à votre recherche, mais permettez-moi de vous présenter ces quelques incontournables :"
                 
            return {
                "reply": ai_reply,
                "products": products_data[0:4],
                "actions": []
            }

    except Exception as e:
        import traceback
        traceback.print_exc()
        msg = str(e).encode('ascii', 'ignore').decode()
        print(f"[ERR] Erreur Chat Hybride : {msg}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/inventory")
async def get_inventory(db: Session = Depends(get_db)):
    """Lien pour n8n : Retourne l'état réel des stocks de la base de données."""
    products = db.query(Product).options(joinedload(Product.variants)).order_by(Product.name).all()
    return [{
        "id": p.id,
        "nom": p.name,
        "variants": [{
            "id": v.id,
            "sku": v.sku,
            "taille": v.size,
            "stock": v.stock_quantity,
            "prix": float(v.price)
        } for v in p.variants]
    } for p in products]

@app.post("/api/admin/alerts")
async def create_alert(alert: AlertCreate, x_api_key: str = Header(None), db: Session = Depends(get_db)):
    log_msg = f"\n[ALERT] Received: {alert.product_name} | Type: {alert.alert_type} | Msg Len: {len(alert.message)}"
    with open("alerts_debug.log", "a", encoding="utf-8") as f:
        f.write(log_msg + "\n")

    if x_api_key != os.getenv("STOCK_AGENT_KEY"):
        return {"status": "error", "message": "Invalid API Key"}
    
    # Trigger AI only for reports or long unstructured texts
    is_report = alert.product_name == "Rapport Global" or "rapport" in alert.message.lower() or len(alert.message) > 200
    
    if is_report:
        with open("alerts_debug.log", "a", encoding="utf-8") as f:
            f.write("DEBUG: Triggering Gemini Parser...\n")
        prompt = f"""
        Tu es un expert en logistique et gestion de stock. Analyse ce rapport et décompose-le en alertes individuelles.
        Rapport : {alert.message}
        
        Consignes de typologie :
        - "out_of_stock" : stock épuisé.
        - "low_stock" : stock critique.
        - "seasonal" : conseil lié à une saison, un événement ou une tendance (ex: Printemps, Mariages, Soldes).
        
        Réponds UNIQUEMENT avec un JSON au format suivant :
        [
          {{"product_name": "NOM DU PRODUIT ou GÉNÉRAL", "message": "Description courte", "alert_type": "out_of_stock | low_stock | seasonal"}}
        ]
        """
        models_to_try = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"]
        success = False
        for model_name in models_to_try:
            try:
                with open("alerts_debug.log", "a", encoding="utf-8") as f:
                    f.write(f"DEBUG: Attempting model '{model_name}'...\n")
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=genai.types.GenerateContentConfig(response_mime_type="application/json")
                )
                sub_alerts = json.loads(response.text)
                
                created_ids = []
                for sa in sub_alerts:
                    new_sa = InventoryAlert(
                        product_name=sa.get("product_name", "GÉNÉRAL"),
                        message=sa.get("message", ""),
                        alert_type=sa.get("alert_type", "low_stock")
                    )
                    db.add(new_sa)
                    db.flush()
                    created_ids.append(new_sa.id)
                
                db.commit()
                with open("alerts_debug.log", "a", encoding="utf-8") as f:
                    f.write(f"DEBUG: Success with '{model_name}'. Created {len(created_ids)} sub-alerts.\n")
                return {"status": "success", "count": len(created_ids), "ids": created_ids}
            except Exception as e:
                with open("alerts_debug.log", "a", encoding="utf-8") as f:
                    f.write(f"DEBUG: Model '{model_name}' failed: {e}\n")
                continue
        
        with open("alerts_debug.log", "a", encoding="utf-8") as f:
            f.write("ERROR: All Gemini models failed.\n")
    
    # Fallback or Single Alert
    new_alert = InventoryAlert(
        product_name=alert.product_name,
        message=alert.message,
        alert_type=alert.alert_type
    )
    db.add(new_alert)
    db.commit()
    db.refresh(new_alert)
    with open("alerts_debug.log", "a", encoding="utf-8") as f:
        f.write(f"DEBUG: Single alert saved ID={new_alert.id} Type={new_alert.alert_type}\n")
    return {"status": "success", "id": new_alert.id}

@app.get("/api/admin/alerts")
async def get_alerts(db: Session = Depends(get_db)):
    alerts = db.query(InventoryAlert).order_by(InventoryAlert.created_at.desc()).limit(50).all()
    # Let's attach images by searching for product names
    result = []
    for a in alerts:
        # Search for product to get image
        p = db.query(Product).filter(Product.name.ilike(f"%{a.product_name}%")).first()
        result.append({
            "id": a.id,
            "product_name": a.product_name,
            "message": a.message,
            "alert_type": a.alert_type,
            "is_read": a.is_read,
            "created_at": a.created_at,
            "image_url": p.image_url if p else None,
            "product_id": p.id if p else None
        })
    return result

@app.patch("/api/admin/alerts/{alert_id}/read")
async def mark_alert_read(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(InventoryAlert).filter(InventoryAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alerte non trouvée")
    alert.is_read = True
    db.commit()
    return {"status": "success"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
