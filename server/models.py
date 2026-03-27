from sqlalchemy import Column, Integer, String, Text, DECIMAL, TIMESTAMP, func, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from database import Base

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    brand = Column(String(50))
    category = Column(String(50))
    description = Column(Text)
    image_url = Column(Text)
    gender = Column(String(20))
    attributes = Column(JSONB, default={})
    embedding = Column(Vector(3072)) # Gemini 2.0 Native Embedding dimension (3072)
    created_at = Column(TIMESTAMP, server_default=func.now())

    variants = relationship("ProductVariant", back_populates="product", cascade="all, delete-orphan")
    reviews = relationship("Review", back_populates="product", cascade="all, delete-orphan")

class ProductVariant(Base):
    __tablename__ = "product_variants"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"))
    
    size = Column(String(20))
    color = Column(String(50))
    color_hex = Column(String(7))
    
    price = Column(DECIMAL(10, 2), nullable=False)
    promo_price = Column(DECIMAL(10, 2), nullable=True)
    stock_quantity = Column(Integer, default=0)
    sku = Column(String(50), unique=True)

    product = relationship("Product", back_populates="variants")

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String(50))
    email = Column(String(100), unique=True, nullable=False)
    password_hash = Column(Text, nullable=False)
    
    # New Fields
    gender = Column(String(10))
    country = Column(String(100))
    age = Column(Integer)
    
    preferences = Column(JSONB, default={})
    is_admin = Column(Boolean, default=False)
    created_at = Column(TIMESTAMP, server_default=func.now())

    reviews = relationship("Review", back_populates="customer")
    orders = relationship("Order", back_populates="customer")
    global_feedbacks = relationship("GlobalFeedback", back_populates="customer")

class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"))
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"))
    rating = Column(Integer, nullable=False) # 1-5
    comment = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())

    product = relationship("Product", back_populates="reviews")
    customer = relationship("Customer", back_populates="reviews")

class GlobalFeedback(Base):
    __tablename__ = "global_feedback"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"))
    rating = Column(Integer, nullable=False) # 1-5
    comment = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())

    customer = relationship("Customer", back_populates="global_feedbacks")

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"))
    total_price = Column(DECIMAL(10, 2), nullable=False)
    status = Column(String(50), default="En cours") # En cours, Expédié, Livré
    created_at = Column(TIMESTAMP, server_default=func.now())

    customer = relationship("Customer", back_populates="orders")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")

class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"))
    product_variant_id = Column(Integer, ForeignKey("product_variants.id"))
    quantity = Column(Integer, default=1)
    price = Column(DECIMAL(10, 2), nullable=False)

    order = relationship("Order", back_populates="items")
    variant = relationship("ProductVariant")

class InventoryAlert(Base):
    __tablename__ = "inventory_alerts"

    id = Column(Integer, primary_key=True, index=True)
    product_name = Column(String(150))
    message = Column(Text, nullable=False)
    alert_type = Column(String(50), default="low_stock") # low_stock, out_of_stock, restock
    is_read = Column(Boolean, default=False)
    created_at = Column(TIMESTAMP, server_default=func.now())
