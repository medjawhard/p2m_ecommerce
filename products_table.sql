-- ==============================================================================
-- PARTIE 1 : STRUCTURE DE LA BASE DE DONNÉES (SCHEMA)
-- ==============================================================================

-- 1. ACTIVATION DE L'EXTENSION IA (pgvector)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. NETTOYAGE (Décommentez ces lignes si vous voulez réinitialiser la base à zéro)
-- DROP TABLE IF EXISTS product_variants CASCADE;
-- DROP TABLE IF EXISTS products CASCADE;

-- 3. TABLE PARENT : Produits (Optimisée pour l'IA)
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    brand VARCHAR(50),
    category VARCHAR(50),
    gender VARCHAR(20), -- Homme, Femme, Mixte
    
    -- Les caractéristiques de base (Fournies par l'admin)
    attributes JSONB DEFAULT '{}',
    
    -- Le contenu généré par l'IA (Texte + Mathématiques)
    description TEXT,
    embedding vector(3072), -- Dimension standard de Google Gemini
    
    image_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 4. TABLE ENFANT : Variantes (Stocks et Prix)
CREATE TABLE IF NOT EXISTS product_variants (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    size VARCHAR(20),
    color VARCHAR(50),
    color_hex VARCHAR(7),
    price DECIMAL(10, 2) NOT NULL,
    promo_price DECIMAL(10, 2),
    stock_quantity INTEGER DEFAULT 0,
    sku VARCHAR(50) UNIQUE
);

-- 5. INDEX DE PERFORMANCE
CREATE INDEX idx_products_attributes ON products USING GIN (attributes);

SELECT 'Structure des tables créée avec succès !' as status;