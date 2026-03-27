import React, { useState, useEffect, useRef } from 'react';
import { Navbar, Footer } from './HomeLayout';
import CONFIG from '../config';
import BackgroundSlideshow from './BackgroundSlideshow';

const adminSlides = [
    { id: 1, image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1400" },
    { id: 2, image: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1400" },
    { id: 3, image: "https://images.unsplash.com/photo-1551434678-e076c223a692?w=1400" },
    { id: 4, image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1400" },
];

const DEMO_DATA = {
    stats: {
        total_users: 142,
        total_products: 48,
        total_orders: 856,
        total_revenue: 124500.00,
        total_stock: 1240,
        recent_feedbacks: [
            { id: 101, user: "Marc-Antoine", rating: 5, comment: "L'expérience de shopping IA est bluffante. Livraison en 24h respectée.", date: "2026-02-04" },
            { id: 102, user: "Éléonore", rating: 5, comment: "Le Studio est d'une élégance rare. Les produits sont d'une qualité exceptionnelle.", date: "2026-02-03" },
            { id: 103, user: "Sébastien", rating: 4, comment: "Interface fluide et service client très réactif. Je recommande.", date: "2026-02-02" }
        ]
    },
    customers: [
        { id: 1, name: "Jean-Pierre", email: "jp@luxe.fr", country: "France", order_count: 12, total_spent: 4500.00 },
        { id: 2, name: "Sofia", email: "sofia@madrid.es", country: "Espagne", order_count: 8, total_spent: 2800.00 },
        { id: 3, name: "Alexander", email: "alex@london.uk", country: "Royaume-Uni", order_count: 15, total_spent: 7200.00 }
    ],
    inventory: [
        {
            id: 101,
            name: "VESTE SUR MESURE",
            totalStock: 10,
            minPrice: 890.00,
            variants: [
                { id: 99, sku: "VEST-NVY-S", size: "S", color: "Navy", stock: 2, price: 890.00, product_id: 101 },
                { id: 100, sku: "VEST-NVY-M", size: "M", color: "Navy", stock: 8, price: 890.00, product_id: 101 }
            ]
        },
        {
            id: 102,
            name: "SAC DE VOYAGE CUIR",
            totalStock: 12,
            minPrice: 1200.00,
            variants: [
                { id: 98, sku: "BAG-LEA-05", size: "Uniq", color: "Cognac", stock: 12, price: 1200.00, product_id: 102 }
            ]
        },
        {
            id: 103,
            name: "DERBIES VERNIES",
            totalStock: 3,
            minPrice: 450.00,
            variants: [
                { id: 97, sku: "SHOE-DER-09", size: "42", color: "Noir", stock: 3, price: 450.00, product_id: 103 }
            ]
        }
    ]
};

const AdminDashboard = ({ onLogout }) => {
    const [stats, setStats] = useState(null);
    const [inventory, setInventory] = useState([]);
    const [orders, setOrders] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [orderFilters, setOrderFilters] = useState({ email: '', product: '', status: '' });
    const [selectedProductId, setSelectedProductId] = useState(null);
    const [feedbacks, setFeedbacks] = useState([]);
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [currentSlide, setCurrentSlide] = useState(0);
    const [inventoryFilter, setInventoryFilter] = useState('all');
    const [inventorySort, setInventorySort] = useState({ key: null, direction: 'asc' });
    const [orderSort, setOrderSort] = useState({ key: null, direction: 'asc' });
    const [alerts, setAlerts] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [activeAlertCategory, setActiveAlertCategory] = useState(0); // 0: Ruptures, 1: Stocks Bas, 2: Historique

    const selectedProduct = inventory.find(p => p.id === selectedProductId);

    const fetchAdminData = async () => {
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            const results = await Promise.allSettled([
                fetch(`${CONFIG.API_BASE_URL}/api/admin/stats`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${CONFIG.API_BASE_URL}/api/admin/inventory`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${CONFIG.API_BASE_URL}/api/admin/orders`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${CONFIG.API_BASE_URL}/api/admin/customers`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${CONFIG.API_BASE_URL}/api/admin/feedbacks`, { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            const [statsRes, invRes, ordersRes, custRes, feedRes] = results;

            // Stats
            if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
                const data = await statsRes.value.json();
                setStats(data);
            }

            // Inventory
            if (invRes.status === 'fulfilled' && invRes.value.ok) {
                const data = await invRes.value.json();
                setInventory(data);
            }

            // Orders
            if (ordersRes.status === 'fulfilled' && ordersRes.value.ok) {
                setOrders(await ordersRes.value.json());
            }

            // Customers
            if (custRes.status === 'fulfilled' && custRes.value.ok) {
                const data = await custRes.value.json();
                setCustomers(data);
            } else {
                setCustomers([]); // Clear if fetch fails, don't show demo data
            }

            // Feedbacks
            if (feedRes.status === 'fulfilled' && feedRes.value.ok) {
                setFeedbacks(await feedRes.value.json());
            }

            // Fetch Alerts separately (optional but good)
            await fetchAlerts();

        } catch (err) {
            console.error("Erreur générale admin:", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchAlerts = async () => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${CONFIG.API_BASE_URL}/api/admin/alerts`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAlerts(data);
                setUnreadCount(data.filter(a => !a.is_read).length);
            }
        } catch (err) {
            console.error("Erreur fetch alerts:", err);
        }
    };

    const urgentCount = alerts.filter(a => a.alert_type === 'out_of_stock' && !a.is_read).length;
    const warningCount = alerts.filter(a => a.alert_type === 'low_stock' && !a.is_read).length;
    const seasonalCount = alerts.filter(a => a.alert_type === 'seasonal' && !a.is_read).length;

    const markAlertAsRead = async (id) => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${CONFIG.API_BASE_URL}/api/admin/alerts/${id}/read`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) fetchAlerts();
        } catch (err) {
            console.error("Erreur mark read:", err);
        }
    };

    const markAllAlertsAsRead = async () => {
        const token = localStorage.getItem('token');
        try {
            // Sequential mark read for simplicity or just a new endpoint? 
            // I'll do it sequentially for now to avoid server changes, 
            // but for performance a bulk endpoint is better.
            // Let's assume I'll add a bulk endpoint or just loop.
            const unread = alerts.filter(a => !a.is_read);
            await Promise.all(unread.map(a => 
                fetch(`${CONFIG.API_BASE_URL}/api/admin/alerts/${a.id}/read`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}` }
                })
            ));
            fetchAlerts();
        } catch (err) {
            console.error("Erreur mark all read:", err);
        }
    };

    useEffect(() => {
        fetchAdminData();
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentSlide((prev) => (prev + 1) % adminSlides.length);
        }, 4000);
        return () => clearInterval(interval);
    }, []);

    const filterOrders = async () => {
        const token = localStorage.getItem('token');
        let url = `${CONFIG.API_BASE_URL}/api/admin/orders?`;
        if (orderFilters.email) url += `client_email=${orderFilters.email}&`;
        if (orderFilters.product) url += `product_name=${orderFilters.product}&`;
        if (orderFilters.status) url += `status=${orderFilters.status}&`;

        try {
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setOrders(await res.json());
        } catch (err) {
            console.error("Erreur filtre:", err);
        }
    };

    const updateStatus = async (orderId, newStatus) => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${CONFIG.API_BASE_URL}/api/admin/orders/${orderId}/status?status=${newStatus}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) fetchAdminData();
        } catch (err) {
            console.error("Erreur statut:", err);
        }
    };

    const updateVariant = async (variantId, data) => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${CONFIG.API_BASE_URL}/api/admin/inventory/${variantId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            if (res.ok) fetchAdminData();
        } catch (err) {
            console.error("Erreur update variant:", err);
        }
    };

    const addVariant = async (data) => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${CONFIG.API_BASE_URL}/api/admin/inventory`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            if (res.ok) fetchAdminData();
            return res.ok;
        } catch (err) {
            console.error("Erreur add variant:", err);
            return false;
        }
    };

    const deleteVariant = async (variantId) => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${CONFIG.API_BASE_URL}/api/admin/inventory/${variantId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) fetchAdminData();
        } catch (err) {
            console.error("Erreur delete variant:", err);
        }
    };

    const deleteFeedback = async (id) => {
        const token = localStorage.getItem('token');
        if (!window.confirm("Supprimer cet avis ?")) return;
        try {
            const res = await fetch(`${CONFIG.API_BASE_URL}/api/admin/feedbacks/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) fetchAdminData();
        } catch (err) {
            console.error("Erreur delete feedback:", err);
        }
    };

    const deleteProduct = async (id) => {
        const token = localStorage.getItem('token');
        if (!window.confirm("Supprimer définitivement ce produit et toutes ses variantes ?")) return;
        try {
            const res = await fetch(`${CONFIG.API_BASE_URL}/api/admin/products/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                fetchAdminData();
                setSelectedProductId(null); // Close modal if open
            }
        } catch (err) {
            console.error("Erreur delete product:", err);
        }
    };

    const createProduct = async (data) => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${CONFIG.API_BASE_URL}/api/admin/products`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                const data = await res.json();
                await fetchAdminData();
                setIsProductModalOpen(false);
                setSelectedProductId(data.id);
            } else {
                const errData = await res.json().catch(() => ({}));
                alert(`Erreur lors de la création : ${errData.detail || 'Erreur inconnue'}`);
            }
        } catch (err) {
            console.error("Erreur create product:", err);
            alert("Erreur réseau ou serveur lors de la création du produit.");
        }
    };

    const handleSort = (key) => {
        setInventorySort((prev) => {
            if (prev.key !== key) return { key, direction: 'asc' };
            if (prev.direction === 'asc') return { key, direction: 'desc' };
            return { key: null, direction: 'asc' }; // Reset
        });
    };

    const handleOrderSort = (key) => {
        setOrderSort((prev) => {
            if (prev.key !== key) return { key, direction: 'asc' };
            if (prev.direction === 'asc') return { key, direction: 'desc' };
            return { key: null, direction: 'asc' }; // Reset
        });
    };

    const getFilteredOrders = () => {
        let filtered = [...orders];

        // Filter by Email/Client
        if (orderFilters.email) {
            const search = orderFilters.email.toLowerCase();
            filtered = filtered.filter(o =>
                o.customer_name.toLowerCase().includes(search) ||
                o.customer_email.toLowerCase().includes(search) ||
                o.id.toString().includes(search)
            );
        }

        // Filter by Status
        if (orderFilters.status && orderFilters.status !== 'all') {
            filtered = filtered.filter(o => o.status === orderFilters.status);
        }

        // Sort
        if (orderSort.key) {
            filtered.sort((a, b) => {
                let valA, valB;

                if (orderSort.key === 'total') {
                    valA = a.total;
                    valB = b.total;
                } else if (orderSort.key === 'date') {
                    valA = new Date(a.date).getTime();
                    valB = new Date(b.date).getTime();
                } else if (orderSort.key === 'items_count') {
                    valA = a.items.reduce((acc, i) => acc + i.quantity, 0);
                    valB = b.items.reduce((acc, i) => acc + i.quantity, 0);
                }

                if (orderSort.direction === 'asc') return valA - valB;
                else return valB - valA;
            });
        }

        return filtered;
    };

    const getFilteredInventory = () => {
        let filtered = [...inventory];

        // Filter
        if (inventoryFilter === 'stable') {
            filtered = filtered.filter(p => p.totalStock >= 15);
        } else if (inventoryFilter === 'restock') {
            filtered = filtered.filter(p => p.totalStock < 15);
        }

        // Sort
        if (inventorySort.key) {
            filtered.sort((a, b) => {
                let valA, valB;
                if (inventorySort.key === 'price') {
                    valA = a.minPrice;
                    valB = b.minPrice;
                } else if (inventorySort.key === 'stock') {
                    valA = a.totalStock;
                    valB = b.totalStock;
                } else if (inventorySort.key === 'name') {
                    valA = a.name.toLowerCase();
                    valB = b.name.toLowerCase();
                    if (inventorySort.direction === 'asc') return valA.localeCompare(valB);
                    else return valB.localeCompare(valA);
                }

                if (inventorySort.direction === 'asc') return valA - valB;
                else return valB - valA;
            });
        }

        return filtered;
    };


    if (loading) return (
        <div className="profile-luxury-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div className="signup-luxury-box" style={{ width: 'auto', padding: '40px' }}>ACCÈS SÉCURISÉ...</div>
        </div>
    );

    return (
        <div className="admin-full-page" style={{
            position: 'fixed', inset: 0, background: '#020203', color: 'white',
            display: 'flex', fontFamily: "'Outfit', sans-serif", zIndex: 1000, overflow: 'hidden'
        }}>
            {/* Background Slideshow Layer - High visibility */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}>
                <BackgroundSlideshow currentSlide={currentSlide} slidesData={adminSlides} />
                {/* Deep Contrast Overlay */}
                <div style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    background: 'radial-gradient(circle at center, rgba(2, 2, 3, 0.2) 0%, rgba(2, 2, 3, 0.8) 90%), linear-gradient(to right, rgba(2, 2, 3, 0.9) 10%, transparent 70%)',
                    zIndex: 2
                }}></div>
            </div>
            {/* Sidebar Navigation */}
            <aside style={{
                width: '300px', height: '100%', background: 'rgba(5, 5, 7, 0.7)',
                backdropFilter: 'blur(40px)', borderRight: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', flexDirection: 'column', padding: '50px 25px', zIndex: 20,
                boxShadow: '20px 0 50px rgba(0,0,0,0.5)'
            }}>
                <div style={{ marginBottom: '60px', padding: '0 20px' }}>
                    <span style={{ color: '#c5a059', fontSize: '0.65rem', letterSpacing: '6px', fontWeight: 'bold', display: 'block', opacity: 0.8 }}>SMARTSHOP</span>
                    <h1 style={{ fontSize: '2.2rem', marginTop: '8px', letterSpacing: '-1px' }}>STUDIO</h1>
                </div>

                <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                        { id: 'overview', label: "VUE D'ENSEMBLE", icon: "📊" },
                        { id: 'reports', label: "RAPPORTS", icon: "📈" },
                        { id: 'customers', label: "CLIENTS", icon: "👥" },
                        { id: 'orders', label: "COMMANDES", icon: "📦" },
                        { id: 'inventory', label: "INVENTAIRE", icon: "🏗️" },
                        { id: 'feedbacks', label: "AVIS STUDIO", icon: "💬" },
                        { id: 'alerts', label: "AGENT IA & ALERTES", icon: unreadCount > 0 ? "🔔" : "🤖", badge: unreadCount },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                background: activeTab === tab.id ? 'linear-gradient(90deg, rgba(197, 160, 89, 0.15), transparent)' : 'transparent',
                                border: 'none', color: activeTab === tab.id ? '#c5a059' : 'rgba(255,255,255,0.45)',
                                padding: '15px 20px', borderRadius: '12px', textAlign: 'left', cursor: 'pointer',
                                fontSize: '0.75rem', fontWeight: activeTab === tab.id ? '700' : '400',
                                letterSpacing: '2px', display: 'flex', alignItems: 'center', gap: '15px',
                                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                                borderLeft: activeTab === tab.id ? '3px solid #c5a059' : '3px solid transparent',
                                position: 'relative'
                            }}
                        >
                            <span style={{ fontSize: '1.2rem', transition: '0.3s', transform: activeTab === tab.id ? 'scale(1.1)' : 'scale(1)' }}>{tab.icon}</span>
                            {tab.label}
                            {tab.badge > 0 && (
                                <span style={{
                                    position: 'absolute', right: '15px', background: '#ff4444', color: 'white',
                                    fontSize: '0.6rem', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold'
                                }}>{tab.badge}</span>
                            )}
                        </button>
                    ))}
                </nav>

                <div style={{ marginTop: 'auto', padding: '10px' }}>
                    <button onClick={onLogout} style={{
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.5)', width: '100%', padding: '14px',
                        borderRadius: '12px', cursor: 'pointer', fontSize: '0.7rem',
                        letterSpacing: '2px', fontWeight: 'bold', transition: '0.3s'
                    }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
                    >DÉCONNEXION</button>
                </div>
            </aside>

            {/* Main Content Area - Fully transparent to let background show through */}
            <main className="reveal" style={{ flex: 1, height: '100%', position: 'relative', overflowY: 'auto', background: 'transparent' }}>
                {/* Header */}
                <header className="reveal-delay-1" style={{
                    padding: '35px 60px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderBottom: '1px solid rgba(255,255,255,0.05)', position: 'sticky', top: 0,
                    background: 'rgba(2, 2, 3, 0.7)',
                    backdropFilter: 'blur(20px)', zIndex: 10
                }}>
                    <div>
                        <div style={{ color: '#c5a059', fontSize: '0.65rem', letterSpacing: '5px', fontWeight: 'bold', marginBottom: '10px', opacity: 0.8 }}>ESPACE DE GESTION</div>
                        <h2 style={{ fontSize: '2.4rem', fontFamily: "'Playfair Display', serif", fontWeight: '300', letterSpacing: '-0.5px' }}>
                            {activeTab === 'overview' && "Tableau de Bord"}
                            {activeTab === 'reports' && "Rapports de Performance"}
                            {activeTab === 'customers' && "Gestion Clientèle"}
                            {activeTab === 'orders' && "Suivi Commandes"}
                            {activeTab === 'inventory' && "Gestion des Stocks"}
                            {activeTab === 'feedbacks' && "Retours d'Expérience"}
                            {activeTab === 'alerts' && "Agent IA & Notifications"}
                        </h2>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
                        <div style={{ textAlign: 'right', borderRight: '1px solid rgba(197, 160, 89, 0.3)', paddingRight: '20px' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: '800', letterSpacing: '1px' }}>AMINA STUDIO</div>
                            <div style={{ fontSize: '0.65rem', color: '#c5a059', marginTop: '4px', fontWeight: 'bold' }}>SESSION SÉCURISÉE • 2026</div>
                        </div>
                        <button onClick={onLogout} style={{
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                            color: 'white', padding: '12px 25px', borderRadius: '100px', cursor: 'pointer',
                            fontSize: '0.7rem', fontWeight: '900', letterSpacing: '2px', transition: '0.3s'
                        }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#ff4444'; e.currentTarget.style.borderColor = '#ff4444'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                        >LOGOUT</button>
                    </div>
                </header>

                <div className="custom-scroll" style={{ padding: '60px', overflowY: 'auto' }}>
                    <style>{`
                        .custom-scroll::-webkit-scrollbar { width: 4px; }
                        .custom-scroll::-webkit-scrollbar-thumb { background: rgba(197, 160, 89, 0.4); border-radius: 10px; }
                        .glass-card { 
                            background: rgba(255,255,255,0.04); 
                            border: 1px solid rgba(255,255,255,0.08); 
                            border-radius: 24px; 
                            padding: 35px; 
                            backdrop-filter: blur(10px);
                            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                            transition: all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
                        }
                        .glass-card:hover {
                            background: rgba(255,255,255,0.06);
                            border-color: rgba(255,255,255,0.15);
                            transform: translateY(-5px);
                            box-shadow: 0 20px 60px rgba(0,0,0,0.4);
                        }
                    `}</style>

                    {activeTab === 'overview' && (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '30px', marginBottom: '50px' }}>
                                {[
                                    { label: "CHIFFRE D'AFFAIRES", val: `${stats?.total_revenue?.toFixed(2)} €`, color: '#c5a059', icon: '💰', trend: '+12%' },
                                    { label: "COMMANDES", val: stats?.total_orders, color: 'white', icon: '📦', trend: '+8%' },
                                    { label: "CLIENTS", val: stats?.total_users, color: 'white', icon: '👥', trend: '+5%' },
                                    { label: "STOCK PIÈCES", val: stats?.total_stock, color: '#ff4444', icon: '📊', trend: '-3%' },
                                ].map((s, i) => (
                                    <div key={i} className="glass-card reveal" style={{
                                        textAlign: 'center',
                                        transitionDelay: `${i * 0.1}s`,
                                        position: 'relative',
                                        overflow: 'hidden',
                                        transition: 'transform 0.3s, box-shadow 0.3s',
                                        cursor: 'none'
                                    }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = 'translateY(-5px)';
                                            e.currentTarget.style.boxShadow = '0 10px 30px rgba(197, 160, 89, 0.2)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.boxShadow = 'none';
                                        }}
                                    >
                                        <div style={{ position: 'absolute', top: '15px', right: '15px', fontSize: '2rem', opacity: 0.1 }}>{s.icon}</div>
                                        <h4 style={{ fontSize: '0.65rem', letterSpacing: '3px', opacity: 0.4, marginBottom: '20px' }}>{s.label}</h4>
                                        <div style={{ fontSize: '2.5rem', color: s.color, marginBottom: '10px' }}>{s.val}</div>
                                        <div style={{
                                            fontSize: '0.75rem',
                                            color: s.trend.startsWith('+') ? '#00ff00' : '#ff4444',
                                            fontWeight: 'bold',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '5px'
                                        }}>
                                            <span>{s.trend.startsWith('+') ? '↑' : '↓'}</span>
                                            <span>{s.trend}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '30px', marginBottom: '50px' }}>
                                {/* Recent Feedbacks */}
                                <div className="glass-card">
                                    <h3 style={{ fontSize: '1.5rem', fontWeight: '300', marginBottom: '35px', display: 'flex', alignItems: 'center', gap: '15px' }}>
                                        <span style={{ fontSize: '1.6rem' }}>💬</span> DERNIERS RETOURS CLIENTS
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '25px', maxHeight: '450px', overflowY: 'auto' }} className="custom-scroll">
                                        {stats?.recent_feedbacks?.length > 0 ? stats.recent_feedbacks.map(f => (
                                            <div key={f.id} style={{
                                                padding: '30px',
                                                background: 'rgba(255,255,255,0.02)',
                                                borderRadius: '20px',
                                                border: '1px solid rgba(255,255,255,0.05)',
                                                borderLeft: '5px solid #c5a059',
                                                transition: 'transform 0.3s'
                                            }}
                                                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                                                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                                    <span style={{ fontWeight: 'bold', fontSize: '1rem', letterSpacing: '1px' }}>{f.user.toUpperCase()}</span>
                                                    <span style={{ color: '#c5a059', letterSpacing: '3px', fontSize: '0.9rem' }}>{'★'.repeat(f.rating)}</span>
                                                </div>
                                                <p style={{ margin: 0, opacity: 0.8, fontSize: '0.95rem', lineHeight: '1.7', fontStyle: 'italic', fontWeight: '300' }}>"{f.comment}"</p>
                                                <div style={{ fontSize: '0.7rem', opacity: 0.4, marginTop: '15px', letterSpacing: '2px', fontWeight: '700' }}>{f.date}</div>
                                            </div>
                                        )) : (
                                            <div style={{ textAlign: 'center', padding: '40px', opacity: 0.3 }}>
                                                <div style={{ fontSize: '2rem', marginBottom: '10px' }}>💬</div>
                                                <p>Aucun retour récent</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Quick Stats & Alerts */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                                    <div className="glass-card">
                                        <h3 style={{ fontSize: '1.2rem', fontWeight: '300', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span>⚡</span> ACTIONS RAPIDES
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {[
                                                { label: 'Nouvelle Commande', action: () => setActiveTab('orders') },
                                                { label: 'Ajouter Produit', action: () => { setActiveTab('inventory'); setIsProductModalOpen(true); } },
                                                { label: 'Voir Clients', action: () => setActiveTab('customers') }
                                            ].map((action, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={action.action}
                                                    style={{
                                                        background: 'rgba(197, 160, 89, 0.1)',
                                                        border: '1px solid rgba(197, 160, 89, 0.3)',
                                                        color: '#c5a059',
                                                        padding: '12px',
                                                        borderRadius: '8px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 'bold',
                                                        letterSpacing: '1px',
                                                        transition: 'all 0.3s'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.background = 'rgba(197, 160, 89, 0.2)';
                                                        e.currentTarget.style.transform = 'translateX(5px)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = 'rgba(197, 160, 89, 0.1)';
                                                        e.currentTarget.style.transform = 'translateX(0)';
                                                    }}
                                                >
                                                    {action.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="glass-card">
                                        <h3 style={{ fontSize: '1.2rem', fontWeight: '300', marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{ fontSize: '1.4rem' }}>⚠️</span> ALERTES STOCK
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {inventory.filter(p => p.totalStock < 15).slice(0, 3).map(p => (
                                                <div key={p.id} style={{
                                                    padding: '15px',
                                                    background: 'rgba(255, 68, 68, 0.05)',
                                                    borderRadius: '12px',
                                                    border: '1px solid rgba(255, 68, 68, 0.15)',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center'
                                                }}>
                                                    <div>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: 'bold', letterSpacing: '1px' }}>{p.name.toUpperCase()}</div>
                                                        <div style={{ fontSize: '0.7rem', color: '#ff4444', marginTop: '4px', fontWeight: '600' }}>Critique : {p.totalStock} unités</div>
                                                    </div>
                                                    <div style={{ fontSize: '1.2rem' }}>📉</div>
                                                </div>
                                            ))}
                                            {inventory.filter(p => p.totalStock < 15).length === 0 && (
                                                <div style={{ textAlign: 'center', padding: '20px', opacity: 0.3, fontSize: '0.8rem' }}>
                                                    ✓ Tous les stocks sont stables
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {
                        activeTab === 'reports' && (
                            <div className="glass-card">
                                <h3 style={{ fontSize: '1.6rem', fontWeight: '300', marginBottom: '45px' }}>ANALYSE DES PERFORMANCES</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '50px' }}>
                                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '40px', borderRadius: '20px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.03)' }}>
                                        <h4 style={{ fontSize: '0.75rem', letterSpacing: '3px', opacity: 0.6, marginBottom: '30px' }}>TRAFFIC ET VENTES</h4>
                                        <div style={{ height: '180px', display: 'flex', alignItems: 'flex-end', gap: '10px', justifyContent: 'center' }}>
                                            {[25, 55, 40, 95, 65, 110, 75].map((h, i) => (
                                                <div key={i} style={{ height: `${h}%`, width: '40px', background: 'linear-gradient(to top, #c5a059, #8b6e37)', borderRadius: '6px 6px 0 0', position: 'relative' }}>
                                                    <div style={{ position: 'absolute', bottom: '-25px', left: '50%', transform: 'translateX(-50%)', fontSize: '0.6rem', opacity: 0.3 }}>{['L', 'M', 'M', 'J', 'V', 'S', 'D'][i]}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '40px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.03)' }}>
                                        <h4 style={{ fontSize: '0.75rem', letterSpacing: '3px', opacity: 0.6, marginBottom: '30px' }}>TOP CATÉGORIES</h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                                            {[
                                                { l: 'Maroquinerie de Luxe', p: 48 },
                                                { l: 'Collection Prêt-à-porter', p: 32 },
                                                { l: 'Accessoires Studio', p: 20 }
                                            ].map(it => (
                                                <div key={it.l}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '10px' }}>
                                                        <span style={{ fontWeight: '300' }}>{it.l}</span>
                                                        <span style={{ color: '#c5a059', fontWeight: 'bold' }}>{it.p}%</span>
                                                    </div>
                                                    <div style={{ height: '6px', width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: '3px' }}>
                                                        <div style={{ height: '100%', width: `${it.p}%`, background: '#c5a059', borderRadius: '3px', boxShadow: '0 0 10px rgba(197, 160, 89, 0.3)' }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    }

                    {
                        activeTab === 'customers' && (
                            <div className="glass-card">
                                <h3 style={{ fontSize: '1.6rem', fontWeight: '300', marginBottom: '40px' }}>MEMBRES PRIVÉS</h3>
                                <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '15px' }} className="custom-scroll">
                                    <table className="history-table-luxury">
                                        <thead>
                                            <tr>
                                                <th>NOM COMPLET</th>
                                                <th>COORDONNÉES</th>
                                                <th>LOCALISATION</th>
                                                <th>COMMANDES</th>
                                                <th>VALEUR CLIENT</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {customers.map(c => (
                                                <tr key={c.id}>
                                                    <td style={{ fontWeight: '600', fontSize: '1rem' }}>{c.name}</td>
                                                    <td style={{ opacity: 0.5, fontSize: '0.85rem' }}>{c.email}</td>
                                                    <td><span style={{ opacity: 0.7 }}>{c.country}</span></td>
                                                    <td style={{ textAlign: 'center' }}>{c.order_count}</td>
                                                    <td style={{ color: '#c5a059', fontWeight: 'bold', fontSize: '1rem' }}>{c.total_spent.toFixed(2)} €</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )
                    }

                    {
                        activeTab === 'orders' && (
                            <div className="glass-card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
                                    <div>
                                        <h3 style={{ fontSize: '1.6rem', fontWeight: '300', margin: 0 }}>SUIVI DES COMMANDES</h3>
                                        <div style={{ fontSize: '0.8rem', opacity: 0.5, marginTop: '5px' }}>
                                            Total pour cette sélection : <span style={{ color: '#c5a059', fontWeight: 'bold' }}>{getFilteredOrders().reduce((sum, o) => sum + o.total, 0).toFixed(2)} €</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '15px' }}>
                                        <select
                                            value={orderFilters.status || 'all'}
                                            onChange={(e) => setOrderFilters({ ...orderFilters, status: e.target.value })}
                                            style={{ background: '#111', color: 'white', border: '1px solid #333', padding: '12px 15px', borderRadius: '8px', fontSize: '0.85rem', outline: 'none' }}
                                        >
                                            <option value="all">Tous les statuts</option>
                                            <option value="En cours">En cours</option>
                                            <option value="Expédié">Expédié</option>
                                            <option value="Livré">Livré</option>
                                        </select>
                                        <input
                                            placeholder="Chercher par nom, email..."
                                            className="input-field-luxury"
                                            style={{ margin: 0, padding: '12px 20px', width: '250px', fontSize: '0.85rem' }}
                                            onChange={(e) => setOrderFilters({ ...orderFilters, email: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '15px' }} className="custom-scroll">
                                    <table className="history-table-luxury">
                                        <thead>
                                            <tr>
                                                <th># REF</th>
                                                <th
                                                    onClick={() => handleOrderSort('date')}
                                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                                >
                                                    DATE {orderSort.key === 'date' && (orderSort.direction === 'asc' ? '↑' : '↓')}
                                                </th>
                                                <th>CLIENT</th>
                                                <th
                                                    onClick={() => handleOrderSort('items_count')}
                                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                                >
                                                    ARTICLES {orderSort.key === 'items_count' && (orderSort.direction === 'asc' ? '↑' : '↓')}
                                                </th>
                                                <th
                                                    onClick={() => handleOrderSort('total')}
                                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                                >
                                                    TOTAL {orderSort.key === 'total' && (orderSort.direction === 'asc' ? '↑' : '↓')}
                                                </th>
                                                <th>STATUT</th>
                                                <th>ACTION</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {getFilteredOrders().map((o) => (
                                                <tr key={o.id}>
                                                    <td style={{ opacity: 0.4, fontFamily: 'monospace' }}>{o.id}</td>
                                                    <td style={{ fontSize: '0.85rem' }}>{o.date}</td>
                                                    <td>
                                                        <div style={{ fontWeight: '600' }}>{o.customer_name}</div>
                                                        <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>{o.customer_email}</div>
                                                    </td>
                                                    <td>
                                                        <div style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>
                                                            {o.items.reduce((acc, i) => acc + i.quantity, 0)} articles
                                                        </div>
                                                        <div style={{ fontSize: '0.7rem', opacity: 0.5, marginTop: '2px' }}>
                                                            {o.items.map(i => `${i.quantity}x ${i.product}`).join(', ').substring(0, 30)}...
                                                        </div>
                                                    </td>
                                                    <td style={{ color: '#c5a059', fontWeight: 'bold' }}>{o.total.toFixed(2)} €</td>
                                                    <td>
                                                        <span style={{
                                                            padding: '6px 12px', borderRadius: '6px', fontSize: '0.65rem', letterSpacing: '1px', fontWeight: 'bold',
                                                            background: o.status === 'Livré' ? 'rgba(0,255,0,0.1)' : o.status === 'Expédié' ? 'rgba(197, 160, 89, 0.1)' : 'rgba(255,255,255,0.05)',
                                                            color: o.status === 'Livré' ? '#00ff00' : o.status === 'Expédié' ? '#c5a059' : '#fff'
                                                        }}>
                                                            {o.status.toUpperCase()}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <select
                                                            onChange={(e) => updateStatus(o.id, e.target.value)}
                                                            value={o.status}
                                                            style={{ background: '#111', color: 'white', border: '1px solid #333', padding: '8px', borderRadius: '8px', fontSize: '0.75rem', outline: 'none' }}
                                                        >
                                                            <option value="En cours">En cours</option>
                                                            <option value="Expédié">Expédié</option>
                                                            <option value="Livré">Livré</option>
                                                        </select>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )
                    }

                    {
                        activeTab === 'inventory' && (
                            <div className="glass-card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
                                    <div>
                                        <h3 style={{ fontSize: '1.6rem', fontWeight: '300', margin: 0 }}>REGISTRE DU STOCK</h3>
                                        <div style={{ display: 'flex', gap: '15px', marginTop: '15px' }}>
                                            <select
                                                value={inventoryFilter}
                                                onChange={(e) => setInventoryFilter(e.target.value)}
                                                style={{ background: '#111', color: 'white', border: '1px solid #333', padding: '8px 15px', borderRadius: '8px', fontSize: '0.75rem', outline: 'none' }}
                                            >
                                                <option value="all">Tous les états</option>
                                                <option value="stable">Stock Stable</option>
                                                <option value="restock">À réapprovisionner</option>
                                            </select>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setIsProductModalOpen(true)}
                                        className="login-btn-luxury"
                                        style={{ width: 'auto', padding: '12px 25px' }}
                                    >+ NOUVEAU PRODUIT</button>
                                </div>
                                <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '15px' }} className="custom-scroll">
                                    <table className="history-table-luxury">
                                        <thead>
                                            <tr>
                                                <th style={{ cursor: 'pointer', userSelect: 'none' }}>DÉSIGNATION</th>
                                                <th
                                                    onClick={() => handleSort('stock')}
                                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                                >
                                                    STOCK CUMULÉ {inventorySort.key === 'stock' && (inventorySort.direction === 'asc' ? '↑' : '↓')}
                                                </th>
                                                <th
                                                    onClick={() => handleSort('price')}
                                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                                >
                                                    PRIX DE BASE {inventorySort.key === 'price' && (inventorySort.direction === 'asc' ? '↑' : '↓')}
                                                </th>
                                                <th>ÉTAT DES STOCKS</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {getFilteredInventory().map((prod) => (
                                                <tr key={prod.id}
                                                    onClick={() => setSelectedProductId(prod.id)}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(197, 160, 89, 0.05)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                    style={{ cursor: 'pointer', transition: '0.4s', borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                                                >
                                                    <td style={{ fontWeight: '600', letterSpacing: '1.5px', padding: '25px 20px' }}>{prod.name.toUpperCase()}</td>
                                                    <td>
                                                        <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{prod.totalStock}</span> <span style={{ opacity: 0.4, fontSize: '0.8rem' }}>unités</span>
                                                    </td>
                                                    <td style={{ color: '#c5a059', fontWeight: 'bold' }}>{prod.minPrice.toFixed(2)} €</td>
                                                    <td style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: '20px' }}>
                                                        <span style={{
                                                            padding: '8px 16px', borderRadius: '8px', fontSize: '0.7rem', letterSpacing: '2px',
                                                            background: prod.totalStock < 15 ? 'rgba(255,68,68,0.1)' : 'rgba(0,255,0,0.1)',
                                                            color: prod.totalStock < 15 ? '#ff4444' : '#00ff00', fontWeight: 'bold'
                                                        }}>
                                                            {prod.totalStock < 15 ? 'RÉAPPROVISIONNER' : 'STABLE'}
                                                        </span>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); deleteProduct(prod.id); }}
                                                            style={{
                                                                background: 'rgba(255, 68, 68, 0.1)', border: '1px solid rgba(255, 68, 68, 0.2)',
                                                                color: '#ff4444', padding: '8px 12px', borderRadius: '6px',
                                                                cursor: 'pointer', fontSize: '0.65rem'
                                                            }}
                                                        >
                                                            SUPPRIMER
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )
                    }

                    {
                        activeTab === 'feedbacks' && (
                            <div className="glass-card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
                                    <h3 style={{ fontSize: '1.6rem', fontWeight: '300', margin: 0 }}>AVIS & RETOURS STUDIO</h3>
                                    {feedbacks.length > 0 && (
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '2.5rem', color: '#c5a059', lineHeight: 1 }}>
                                                {(feedbacks.reduce((acc, f) => acc + f.rating, 0) / feedbacks.length).toFixed(1)} <span style={{ fontSize: '1rem', opacity: 0.5 }}>/ 5</span>
                                            </div>
                                            <div style={{ color: '#c5a059', letterSpacing: '2px', fontSize: '1rem' }}>
                                                {'★'.repeat(Math.round(feedbacks.reduce((acc, f) => acc + f.rating, 0) / feedbacks.length))}
                                                <span style={{ opacity: 0.3 }}>{'★'.repeat(5 - Math.round(feedbacks.reduce((acc, f) => acc + f.rating, 0) / feedbacks.length))}</span>
                                            </div>
                                            <div style={{ fontSize: '0.65rem', opacity: 0.5, marginTop: '5px' }}>NOTE GLOBALE</div>
                                        </div>
                                    )}
                                </div>
                                <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '15px' }} className="custom-scroll">
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                        {feedbacks.length > 0 ? feedbacks.map((f) => (
                                            <div key={f.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '30px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                                                        <div style={{ color: '#c5a059', letterSpacing: '2px', fontSize: '1.2rem' }}>{'★'.repeat(f.rating)}</div>
                                                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>• {f.date}</span>
                                                    </div>
                                                    <p style={{ fontSize: '1.1rem', fontStyle: 'italic', margin: '0 0 15px 0', lineHeight: '1.6', opacity: 0.9 }}>"{f.comment}"</p>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.8rem' }}>{f.user_name}</span>
                                                        <span style={{ opacity: 0.3, fontSize: '0.7rem' }}>({f.user_email})</span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => deleteFeedback(f.id)}
                                                    style={{ background: 'none', border: 'none', color: '#ff4444', fontSize: '0.7rem', cursor: 'pointer', opacity: 0.4, padding: '10px' }}
                                                >SUPPRIMER L'AVIS</button>
                                            </div>
                                        )) : (
                                            <div style={{ textAlign: 'center', padding: '100px', opacity: 0.3 }}>
                                                <div style={{ fontSize: '3rem', marginBottom: '20px' }}>💬</div>
                                                <p>AUCUN RETOUR CLIENT POUR LE MOMENT</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    }

                    {
                        activeTab === 'alerts' && (
                            <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
                                {/* Modern Header & Stats Bar */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '30px' }}>
                                    <div>
                                        <h2 style={{ fontSize: '2.5rem', fontWeight: '200', margin: 0, fontFamily: "'Playfair Display', serif" }}>PANORAMA DES ALERTES</h2>
                                        <p style={{ color: '#c5a059', letterSpacing: '3px', fontSize: '0.7rem', fontWeight: 'bold' }}>NAVIGATION INTERACTIVE IA</p>
                                    </div>
                                    <div style={{ display: 'flex', gap: '20px' }}>
                                        <button onClick={markAllAlertsAsRead} disabled={unreadCount === 0} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '12px 25px', borderRadius: '12px', cursor: 'pointer', fontSize: '0.75rem', opacity: unreadCount === 0 ? 0.3 : 1 }}>MARQUER TOUT LU</button>
                                        <button onClick={fetchAlerts} style={{ background: '#c5a059', border: 'none', color: 'black', padding: '12px 30px', borderRadius: '12px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>ACTUALISER</button>
                                    </div>
                                </div>

                                {/* Sliding Window Tabs */}
                                <div style={{ display: 'flex', gap: '40px', marginBottom: '40px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '15px' }}>
                                    {[
                                        { id: 0, label: 'RUPTURES CRITIQUES', color: '#ff4444', count: urgentCount },
                                        { id: 1, label: 'STOCKS FAIBLES', color: '#ffbb33', count: warningCount },
                                        { id: 2, label: 'TENDANCES & SAISONS', color: '#ace1af', count: seasonalCount },
                                        { id: 3, label: 'HISTORIQUE TRAITÉ', color: '#c5a059', count: alerts.filter(a => a.is_read).length }
                                    ].map((cat) => (
                                        <div 
                                            key={cat.id}
                                            onClick={() => setActiveAlertCategory(cat.id)}
                                            style={{ 
                                                cursor: 'pointer',
                                                padding: '10px 0',
                                                position: 'relative',
                                                transition: '0.3s',
                                                opacity: activeAlertCategory === cat.id ? 1 : 0.4
                                            }}
                                        >
                                            <span style={{ fontSize: '0.75rem', fontWeight: '900', letterSpacing: '2px', color: activeAlertCategory === cat.id ? cat.color : 'white' }}>
                                                {cat.label}
                                                <span style={{ marginLeft: '10px', fontSize: '0.6rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '100px' }}>{cat.count}</span>
                                            </span>
                                            {activeAlertCategory === cat.id && (
                                                <div style={{ 
                                                    position: 'absolute', bottom: '-2px', left: 0, right: 0, height: '2px', 
                                                    background: cat.color, boxShadow: `0 0 15px ${cat.color}`
                                                }}></div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                
                                {/* Sliding Windows Deck */}
                                <div style={{ overflow: 'hidden', position: 'relative', height: '65vh', borderRadius: '30px' }}>
                                    <div style={{ 
                                        display: 'flex', 
                                        transition: 'transform 0.8s cubic-bezier(0.19, 1, 0.22, 1)',
                                        transform: `translateX(-${activeAlertCategory * 100}%)`,
                                        height: '100%'
                                    }}>
                                        {[
                                            { type: 'out_of_stock', items: alerts.filter(a => a.alert_type === 'out_of_stock' && !a.is_read), title: 'URGENCES ABSOLUES', color: '#ff4444' },
                                            { type: 'low_stock', items: alerts.filter(a => a.alert_type === 'low_stock' && !a.is_read), title: 'PRÉVENTION STOCK', color: '#ffbb33' },
                                            { type: 'seasonal', items: alerts.filter(a => a.alert_type === 'seasonal' && !a.is_read), title: 'STRATÉGIE SAISONNIÈRE', color: '#ace1af' },
                                            { type: 'all', items: alerts.filter(a => a.is_read), title: 'ARCHIVES IA', color: '#c5a059' }
                                        ].map((pane, idx) => (
                                            <div key={idx} style={{ minWidth: '100%', padding: '0 5px' }}>
                                                <div style={{ 
                                                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '30px', 
                                                    height: '100%', overflowY: 'auto', paddingRight: '15px' 
                                                }} className="custom-scroll">
                                                    {pane.items.length > 0 ? pane.items.map((a) => (
                                                        <div key={a.id} className="glass-card" style={{ 
                                                            padding: 0, borderRadius: '24px', overflow: 'hidden', position: 'relative',
                                                            background: 'rgba(0,0,0,0.5)', border: `1px solid ${activeAlertCategory === idx ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)'}`,
                                                            transition: '0.4s'
                                                        }}>
                                                            <div style={{ display: 'flex', height: '220px' }}>
                                                                {/* Product Side Visual */}
                                                                <div style={{ width: '40%', position: 'relative', overflow: 'hidden' }}>
                                                                    {a.image_url ? (
                                                                        <img src={a.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                                                                    ) : (
                                                                        <div style={{ width: '100%', height: '100%', background: '#111', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>📦</div>
                                                                    )}
                                                                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, transparent, rgba(0,0,0,0.8))' }}></div>
                                                                </div>

                                                                {/* Content Area */}
                                                                <div style={{ width: '60%', padding: '30px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                                                    <div style={{ fontSize: '0.6rem', letterSpacing: '3px', color: pane.color, fontWeight: 'bold', marginBottom: '10px' }}>{pane.title}</div>
                                                                    <h4 style={{ margin: '0 0 10px 0', fontSize: '1.2rem', fontFamily: "'Playfair Display', serif" }}>{a.product_name.toUpperCase()}</h4>
                                                                    <p style={{ margin: '0 0 20px 0', fontSize: '0.8rem', opacity: 0.6, lineHeight: '1.6' }}>{a.message}</p>
                                                                    
                                                                    <div style={{ display: 'flex', gap: '15px' }}>
                                                                        {a.product_id && (
                                                                            <button 
                                                                                onClick={() => setSelectedProductId(a.product_id)}
                                                                                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '10px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 'bold', cursor: 'pointer' }}
                                                                            >STUDIO</button>
                                                                        )}
                                                                        {!a.is_read && (
                                                                            <button 
                                                                                onClick={() => markAlertAsRead(a.id)}
                                                                                style={{ flex: 1, background: pane.color, border: 'none', color: 'black', padding: '10px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 'bold', cursor: 'pointer' }}
                                                                            >RÉGLÉ</button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )) : (
                                                        <div style={{ textAlign: 'center', padding: '100px 0', opacity: 0.1 }}>
                                                            <div style={{ fontSize: '5rem' }}>✨</div>
                                                            <p style={{ letterSpacing: '5px', fontSize: '0.8rem' }}>AUCUNE ALERTE DANS CETTE SECTION</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )
                    }
                </div >

                <footer style={{ padding: '60px', opacity: 0.3, textAlign: 'center', fontSize: '0.7rem', letterSpacing: '4px' }}>
                    SMARTSHOP STUDIO • SYSTÈME DE GESTION PRIVÉ • 2026
                </footer>
            </main >

            <StockDetailModal
                product={selectedProduct}
                onClose={() => setSelectedProductId(null)}
                onUpdate={updateVariant}
                onAdd={addVariant}
                onDelete={deleteVariant}
            />

            <IntelligentProductModal
                isOpen={isProductModalOpen}
                onClose={() => setIsProductModalOpen(false)}
                onCreate={createProduct}
                currentSlide={currentSlide}
            />
        </div >
    );
};

const StockDetailModal = ({ product, onClose, onUpdate, onAdd, onDelete }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [newV, setNewV] = useState({ size: '', stock: 0, price: product?.minPrice || 0, sku: '' });

    if (!product) return null;

    const handleAdd = async () => {
        const generatedSku = newV.sku.trim() || `${product.name.substring(0, 3).toUpperCase()}-${newV.size}-${Date.now().toString().slice(-6)}`;
        const success = await onAdd({ ...newV, sku: generatedSku, product_id: product.id });
        if (success) {
            setIsAdding(false);
            setNewV({ size: '', stock: 0, price: product.minPrice, sku: '' });
        }
    };

    return (
        <div className="modal-overlay" style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000000
        }}>
            <div className="signup-luxury-box" style={{ width: '600px', maxWidth: '95%', padding: '40px', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
                <button onClick={onClose} style={{ position: 'absolute', top: '25px', right: '25px', background: 'none', border: 'none', color: '#c5a059', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>

                <div style={{ marginBottom: '30px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '15px', display: 'flex', gap: '20px', alignItems: 'center' }}>
                    {product.image && (
                        <img
                            src={product.image}
                            alt={product.name}
                            style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '10px', border: '1px solid rgba(197, 160, 89, 0.3)' }}
                        />
                    )}
                    <div>
                        <div style={{ color: '#c5a059', fontSize: '0.7rem', letterSpacing: '3px', fontWeight: 'bold', marginBottom: '10px' }}>REGISTRE D'INVENTAIRE</div>
                        <h2 style={{ color: 'white', fontSize: '1.8rem', margin: 0 }}>{product.name.toUpperCase()}</h2>
                        <p style={{ opacity: 0.5, fontSize: '0.8rem', marginTop: '5px' }}>Gestion détaillée des variantes et réapprovisionnement</p>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {product.variants.map((v, idx) => (
                        <div key={idx} style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{
                                        width: '40px', height: '40px', borderRadius: '50%',
                                        background: '#111', display: 'flex', justifyContent: 'center',
                                        alignItems: 'center', border: '1px solid #c5a059', color: '#c5a059',
                                        fontWeight: 'bold', fontSize: '0.8rem'
                                    }}>
                                        {v.size}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'white' }}>{v.color || 'Couleur Unique'}</div>
                                        <div style={{ fontSize: '0.7rem', opacity: 0.4, fontFamily: 'monospace' }}>SKU: {v.sku}</div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => { if (window.confirm('Supprimer cette variante ?')) onDelete(v.id); }}
                                    style={{ background: 'none', border: 'none', color: '#ff4444', fontSize: '0.7rem', cursor: 'pointer', opacity: 0.5 }}
                                >SUPPRIMER</button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                <div>
                                    <label style={{ fontSize: '0.6rem', opacity: 0.4, display: 'block', marginBottom: '5px' }}>STOCK ACTUEL</label>
                                    <input
                                        type="number"
                                        defaultValue={v.stock}
                                        onBlur={(e) => onUpdate(v.id, { stock: parseInt(e.target.value) })}
                                        style={{ background: '#111', border: '1px solid #333', color: 'white', padding: '8px', borderRadius: '6px', width: '80px' }}
                                    />
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <label style={{ fontSize: '0.6rem', opacity: 0.4, display: 'block', marginBottom: '5px' }}>PRIX (€)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        defaultValue={v.price}
                                        onBlur={(e) => onUpdate(v.id, { price: parseFloat(e.target.value) })}
                                        style={{ background: '#111', border: '1px solid #333', color: '#c5a059', padding: '8px', borderRadius: '6px', width: '100px', textAlign: 'right' }}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {!isAdding ? (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="login-btn-luxury"
                        style={{ width: '100%', marginTop: '30px', background: 'transparent', border: '1px dashed #c5a059', color: '#c5a059' }}
                    >+ AJOUTER UNE TAILLE</button>
                ) : (
                    <div style={{ marginTop: '30px', padding: '25px', background: 'rgba(197, 160, 89, 0.05)', borderRadius: '15px', border: '1px solid rgba(197, 160, 89, 0.2)' }}>
                        <h4 style={{ fontSize: '0.7rem', color: '#c5a059', marginBottom: '20px', letterSpacing: '2px' }}>NOUVELLE VARIANTE</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                            <input placeholder="Taille (S, M, 42...)" value={newV.size} onChange={e => setNewV({ ...newV, size: e.target.value })} className="input-field-luxury" style={{ margin: 0 }} />
                            <input placeholder="SKU Manuel" value={newV.sku} onChange={e => setNewV({ ...newV, sku: e.target.value })} className="input-field-luxury" style={{ margin: 0 }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                            <input type="number" placeholder="Stock" value={newV.stock} onChange={e => setNewV({ ...newV, stock: parseInt(e.target.value) })} className="input-field-luxury" style={{ margin: 0 }} />
                            <input type="number" placeholder="Prix" value={newV.price} onChange={e => setNewV({ ...newV, price: parseFloat(e.target.value) })} className="input-field-luxury" style={{ margin: 0 }} />
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={handleAdd} className="login-btn-luxury" style={{ flex: 1 }}>VALIDER</button>
                            <button onClick={() => setIsAdding(false)} style={{ background: 'none', border: 'none', color: 'white', opacity: 0.5, cursor: 'pointer' }}>Annuler</button>
                        </div>
                    </div>
                )}

                <button
                    onClick={onClose}
                    className="login-btn-luxury"
                    style={{ width: '100%', marginTop: '20px' }}
                >
                    FERMER LE REGISTRE
                </button>
            </div>
        </div>
    );
};

const IntelligentProductModal = ({ isOpen, onClose, onCreate, currentSlide }) => {
    const [name, setName] = useState("");
    const [desc, setDesc] = useState("");
    const [category, setCategory] = useState("");
    const [price, setPrice] = useState("");
    const [brand, setBrand] = useState("");
    const [gender, setGender] = useState("");
    const [attributes, setAttributes] = useState({}); 
    const [variants, setVariants] = useState([]); 
    const [imagePreview, setImagePreview] = useState(null);
    const [imageBase64, setImageBase64] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [autoFilledFields, setAutoFilledFields] = useState(new Set());
    const [analysisError, setAnalysisError] = useState("");
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef(null);
    const lastAnalyzedRef = useRef("");

    useEffect(() => {
        if (!isOpen) {
            setName("");
            setDesc("");
            setCategory("");
            setPrice("");
            setBrand("");
            setGender("");
            setAttributes({});
            setVariants([]);
            setImagePreview(null);
            setImageBase64(null);
            setAutoFilledFields(new Set());
            setIsListening(false);
            if (recognitionRef.current) recognitionRef.current.stop();
        }
    }, [isOpen]);

    const toggleVoice = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Désolé, votre navigateur ne supporte pas la reconnaissance vocale.");
            return;
        }

        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'fr-FR';
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event) => {
            let transcript = '';
            for (let i = 0; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            setDesc(transcript);
        };

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onerror = () => setIsListening(false);

        recognitionRef.current = recognition;
        recognition.start();
    };

    useEffect(() => {
        if (!isOpen) return;
        if (desc.trim().length < 15 && !imageBase64) return;
        const charDiff = Math.abs(desc.length - lastAnalyzedRef.current.length);
        if (desc === lastAnalyzedRef.current && !imageBase64) return;
        if (lastAnalyzedRef.current && charDiff < 10 && !imageBase64) return;

        const timer = setTimeout(() => {
            analyzeProduct();
        }, 5000); // Increased debounce to 5 seconds

        return () => clearTimeout(timer);
    }, [desc, imageBase64, isOpen]);

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result);
                setImageBase64(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const analyzeProduct = async () => {
        if (!desc && !imageBase64) return;
        setIsAnalyzing(true);
        setAnalysisError("");
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${CONFIG.API_BASE_URL}/api/admin/products/analyze`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ description: desc, image_base64: imageBase64 })
            });
            
            if (res.status === 429) {
                setAnalysisError("Quota épuisé (IA). Réessayez plus tard.");
                return;
            }

            if (res.ok) {
                const data = await res.json();
                lastAnalyzedRef.current = desc;
                const filled = new Set();
                if (data.name && !name) { setName(data.name); filled.add('name'); }
                if (data.brand && !brand) { setBrand(data.brand); filled.add('brand'); }
                if (data.category && !category) { setCategory(data.category); filled.add('category'); }
                if (data.price && !price) { setPrice(data.price.toString()); filled.add('price'); }
                if (data.gender && !gender) { setGender(data.gender); filled.add('gender'); }
                
                if (data.extra_attributes) {
                    const newAttrs = { ...attributes };
                    Object.entries(data.extra_attributes).forEach(([key, val]) => {
                        if (!newAttrs[key]) { newAttrs[key] = val; filled.add(`attr_${key}`); }
                    });
                    setAttributes(newAttrs);
                }

                setVariants(data.variants || []);
                if (data.variants?.length > 0) filled.add('variants');
                setAutoFilledFields(filled);
            }
        } catch (err) {
            console.error("Analysis failed:", err);
        } finally {
            setIsAnalyzing(false);
        }
    };

    if (!isOpen) return null;

    const Label = ({ children, field }) => (
        <label style={{ fontSize: '0.65rem', letterSpacing: '2px', color: autoFilledFields.has(field) ? '#c5a059' : 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '10px', fontWeight: autoFilledFields.has(field) ? 'bold' : 'normal' }}>
            {children} {autoFilledFields.has(field) && "✨"}
        </label>
    );

    return (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000000, backdropFilter: 'blur(5px)' }}>
            <div style={{ position: 'absolute', inset: 0, zIndex: -1, filter: 'blur(15px) brightness(0.4)' }}>
                <BackgroundSlideshow currentSlide={currentSlide} slidesData={adminSlides} />
            </div>

            <div className="signup-luxury-box" style={{ width: '800px', maxWidth: '95%', padding: '40px', position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '40px', maxHeight: '90vh', overflowY: 'auto' }}>
                <button onClick={onClose} style={{ position: 'absolute', top: '25px', right: '25px', background: 'none', border: 'none', color: '#c5a059', fontSize: '1.5rem', cursor: 'pointer', zIndex: 10 }}>✕</button>

                {/* Left Side: Inputs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '25px', borderRight: '1px solid rgba(255,255,255,0.05)', paddingRight: '40px' }}>
                    <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                        <div style={{ color: '#c5a059', fontSize: '0.7rem', letterSpacing: '4px', fontWeight: 'bold', marginBottom: '15px' }}>ASSISTANT IA STUDIO</div>
                        <h2 style={{ color: 'white', fontSize: '1.8rem', margin: 0, fontFamily: "'Playfair Display', serif" }}>CRÉATION INTELLIGENTE</h2>
                    </div>

                    <div>
                        <Label field="image">PHOTO DU PRODUIT</Label>
                        <div onClick={() => document.getElementById('product-img-upload').click()} style={{ width: '100%', height: '200px', border: '1px dashed rgba(197, 160, 89, 0.3)', borderRadius: '15px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', overflow: 'hidden', position: 'relative', background: 'rgba(255,255,255,0.02)' }}>
                            {imagePreview ? <img src={imagePreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Preview" /> : <div style={{ textAlign: 'center', opacity: 0.5 }}><span style={{ fontSize: '2rem' }}>📸</span><p style={{ fontSize: '0.7rem', marginTop: '10px' }}>CLIQUEZ POUR UPLOADER</p></div>}
                            <input id="product-img-upload" type="file" hidden accept="image/*" onChange={handleImageUpload} />
                        </div>
                    </div>

                    <div className="input-field-luxury">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <Label field="description">DESCRIPTION GÉNÉRALE</Label>
                            <button onClick={toggleVoice} style={{ background: isListening ? 'rgba(255, 59, 48, 0.2)' : 'rgba(197, 160, 89, 0.1)', border: isListening ? '1px solid #ff3b30' : '1px solid rgba(197, 160, 89, 0.3)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', animation: isListening ? 'pulse-lux 1.5s infinite' : 'none', color: isListening ? '#ff3b30' : '#c5a059' }}>
                                {isListening ? "🛑" : "🎤"}
                            </button>
                        </div>
                        <textarea placeholder="Décrivez l'article naturellement... L'IA s'occupe du reste." value={desc} onChange={e => setDesc(e.target.value)} style={{ width: '100%', height: '150px', resize: 'none', padding: '15px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(197, 160, 89, 0.2)', borderRadius: '12px' }} />
                        {isAnalyzing && <div style={{ fontSize: '0.65rem', color: '#c5a059', marginTop: '10px', textAlign: 'center', animation: 'pulse 1.5s infinite' }}>✨ ANALYSE EN COURS...</div>}
                        {analysisError && <div style={{ fontSize: '0.65rem', color: '#ff4d4d', marginTop: '10px', textAlign: 'center' }}>⚠️ {analysisError}</div>}
                    </div>
                </div>

                {/* Right Side: Form */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="input-field-luxury">
                        <Label field="name">NOM DE L'ARTICLE</Label>
                        <input placeholder="Nom généré ou manuel" value={name} onChange={e => { setName(e.target.value); autoFilledFields.delete('name'); }} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(197, 160, 89, 0.2)', padding: '12px', borderRadius: '8px' }} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div className="input-field-luxury">
                            <Label field="category">CATÉGORIE</Label>
                            <input placeholder="ex: Accessoires" value={category} onChange={e => { setCategory(e.target.value); autoFilledFields.delete('category'); }} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(197, 160, 89, 0.2)', padding: '12px', borderRadius: '8px' }} />
                        </div>
                        <div className="input-field-luxury">
                            <Label field="brand">MARQUE</Label>
                            <input placeholder="ex: Chanel, Dior" value={brand} onChange={e => { setBrand(e.target.value); autoFilledFields.delete('brand'); }} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(197, 160, 89, 0.2)', padding: '12px', borderRadius: '8px' }} />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div className="input-field-luxury">
                            <Label field="price">PRIX (€)</Label>
                            <input type="number" placeholder="0.00" value={price} onChange={e => { setPrice(e.target.value); autoFilledFields.delete('price'); }} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(197, 160, 89, 0.2)', padding: '12px', borderRadius: '8px' }} />
                        </div>
                        <div className="input-field-luxury">
                            <Label field="gender">GENRE</Label>
                            <div style={{ display: 'flex', gap: '5px' }}>
                                {['Homme', 'Femme', 'Unisexe'].map(g => (
                                    <button key={g} onClick={() => { setGender(g); autoFilledFields.delete('gender'); }} style={{ flex: 1, padding: '8px', borderRadius: '8px', fontSize: '0.65rem', background: gender === g ? '#c5a059' : 'rgba(255,255,255,0.05)', color: gender === g ? 'black' : 'white', border: '1px solid rgba(197, 160, 89, 0.3)', cursor: 'pointer', transition: '0.3s', fontWeight: 'bold' }}>{g.toUpperCase()}</button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="input-field-luxury">
                        <Label field="variants">TAILLES & STOCK</Label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {['XS', 'S', 'M', 'L', 'XL', 'Unique'].map(size => {
                                const variant = variants.find(v => v.size === size);
                                return (
                                    <div key={size} style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', border: '1px solid rgba(197, 160, 89, 0.2)', padding: '5px 10px' }}>
                                        <button onClick={() => { if (variant) { setVariants(variants.filter(v => v.size !== size)); } else { setVariants([...variants, { size, stock: 1 }]); } autoFilledFields.delete('variants'); }} style={{ background: variant ? '#c5a059' : 'transparent', color: variant ? 'black' : 'white', border: 'none', padding: '4px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}>{size}</button>
                                        {variant && <input type="number" min="0" value={variant.stock} onChange={e => setVariants(variants.map(v => v.size === size ? { ...v, stock: parseInt(e.target.value) || 0 } : v))} style={{ width: '40px', background: 'transparent', border: 'none', borderBottom: '1px solid #c5a059', color: 'white', fontSize: '0.8rem', textAlign: 'center', outline: 'none', marginLeft: '5px' }} />}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div style={{ marginTop: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <Label field="dynamic_attrs">CARACTÉRISTIQUES SPÉCIALES</Label>
                            <button onClick={() => { const key = prompt("Nom :"); if (key) setAttributes({ ...attributes, [key]: "" }); }} style={{ background: 'none', border: '1px solid rgba(197, 160, 89, 0.4)', color: '#c5a059', fontSize: '0.6rem', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer' }}>+ AJOUTER</button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            {Object.entries(attributes).map(([key, val]) => (
                                <div key={key} className="input-field-luxury" style={{ position: 'relative', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <button onClick={() => { const na = { ...attributes }; delete na[key]; setAttributes(na); }} style={{ position: 'absolute', top: '5px', right: '5px', background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer', opacity: 0.5 }}>×</button>
                                    <label style={{ fontSize: '0.6rem', color: autoFilledFields.has(`attr_${key}`) ? '#c5a059' : 'rgba(255,255,255,0.4)', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>{key}</label>
                                    <input value={val} onChange={e => { setAttributes({ ...attributes, [key]: e.target.value }); autoFilledFields.delete(`attr_${key}`); }} style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '0.8rem' }} />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
                        <button onClick={() => { if (!name.trim()) { alert("Nom requis."); return; } onCreate({ name, brand, description: desc, category, price: parseFloat(price) || 0, image_url: imagePreview, attributes, variants: variants.map(v => ({ ...v, price: parseFloat(price) || 0 })) }); }} className="login-btn-luxury" style={{ width: '100%', height: '50px', background: '#c5a059', color: 'black', fontWeight: 'bold' }}>ENREGISTRER LA COLLECTION</button>
                    </div>
                </div>
            </div>
            <style>{`
                @keyframes pulse-lux {
                    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(197, 160, 89, 0.4); }
                    70% { transform: scale(1.1); box-shadow: 0 0 0 10px rgba(197, 160, 89, 0); }
                    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(197, 160, 89, 0); }
                }
                @keyframes pulse {
                    0% { opacity: 0.4; }
                    50% { opacity: 1; }
                    100% { opacity: 0.4; }
                }
            `}</style>
        </div>
    );
};

export default AdminDashboard;
