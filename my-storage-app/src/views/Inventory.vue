<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { supabase } from '../supabase';
import heic2any from 'heic2any';

// ==========================================
// 1. 狀態管理
// ==========================================
const items = ref([]);
const categories = ref(['未分類']);
const isModalOpen = ref(false);
const isEditMode = ref(false);
const editingId = ref(null);
const file = ref(null);
const imagePreview = ref(null);
const isSaving = ref(false);

// 檢視模式：網格 'grid' 或 清單 'list'
const viewMode = ref('grid');

// 搜尋、篩選與排序
const searchQuery = ref('');
const selectedCategories = ref(['全部']);
const selectedLocation = ref('全部');
const sortBy = ref('created_desc');
const activeQuickFilter = ref('all'); // 'all', 'low_stock', 'favorites', 'expired'
const newCategoryName = ref('');

// 圖片燈箱
const previewModalImage = ref(null);

const initialForm = {
    name: '',
    category_id: ['未分類'],
    description: '',
    is_favorite: false,
    location: '',
    price: 0,
    quantity: 1,
    min_quantity: 1, // 新增：安全庫存量
    item_code: '',   // 新增：物品/條碼/收納盒編號
    brand: '',       // 新增：品牌或購買通路
    purchase_date: new Date().toISOString().slice(0, 10),
    expiry_date: '', // 新增：有效期限/保固到期日
    imageUrl: ''
};

const form = ref({ ...initialForm });

// ==========================================
// 2. 生命週期與資料互動
// ==========================================
onMounted(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        await Promise.all([
            fetchItems(session.user.id),
            fetchUserCategories()
        ]);
    }
    window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown);
    cleanupPreviewUrl();
});

const cleanupPreviewUrl = () => {
    if (imagePreview.value && imagePreview.value.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview.value);
    }
};

const fetchItems = async (userId) => {
    const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) console.error('Error fetching items:', error);
    items.value = data || [];
};

const fetchUserCategories = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
        .from('categories')
        .select('name')
        .eq('user_id', user.id)
        .order('name', { ascending: true });

    if (!error && data) {
        const userCats = data.map(c => c.name);
        categories.value = userCats.includes('未分類') ? userCats : ['未分類', ...userCats];
    }
};

// ==========================================
// 3. 快速操作（卡片上即時修改）
// ==========================================
const changeQuantity = async (item, delta) => {
    const targetQty = Math.max(0, (Number(item.quantity) || 0) + delta);
    if (targetQty === item.quantity) return;

    const previousQty = item.quantity;
    item.quantity = targetQty; // 樂觀更新

    const { error } = await supabase
        .from('items')
        .update({ quantity: targetQty, updated_at: new Date().toISOString() })
        .eq('id', item.id);

    if (error) {
        item.quantity = previousQty;
        alert('更新庫存失敗：' + error.message);
    }
};

const toggleFavorite = async (item) => {
    const targetFav = !item.is_favorite;
    item.is_favorite = targetFav; // 樂觀更新

    const { error } = await supabase
        .from('items')
        .update({ is_favorite: targetFav, updated_at: new Date().toISOString() })
        .eq('id', item.id);

    if (error) {
        item.is_favorite = !targetFav;
        alert('更新收藏狀態失敗：' + error.message);
    }
};

// ==========================================
// 4. 到期日與庫存狀態計算
// ==========================================
const getExpiryStatus = (expiryDate) => {
    if (!expiryDate) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const exp = new Date(expiryDate);
    exp.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
        return { text: `已過期 ${Math.abs(diffDays)} 天`, class: 'status-expired', level: 'danger' };
    } else if (diffDays <= 30) {
        return { text: `${diffDays === 0 ? '今日到期' : diffDays + ' 天內到期'}`, class: 'status-warning', level: 'warning' };
    }
    return { text: `${diffDays} 天後到期`, class: 'status-good', level: 'good' };
};

const isLowStock = (item) => {
    const min = item.min_quantity !== undefined && item.min_quantity !== null ? Number(item.min_quantity) : 1;
    return Number(item.quantity || 0) <= min;
};

// ==========================================
// 5. 標籤輔助方法
// ==========================================
const parseItemCategories = (rawCats) => {
    if (!rawCats) return ['未分類'];
    if (Array.isArray(rawCats)) return rawCats.length ? rawCats : ['未分類'];
    const cleaned = String(rawCats).replace(/[\[\]"]/g, '').trim();
    const list = cleaned.split(',').map(s => s.trim()).filter(Boolean);
    return list.length ? list : ['未分類'];
};

const isSelected = (cat) => {
    return Array.isArray(form.value.category_id) && form.value.category_id.includes(cat);
};

const toggleTag = (cat) => {
    if (!Array.isArray(form.value.category_id)) form.value.category_id = [];
    const index = form.value.category_id.indexOf(cat);

    if (index > -1) {
        form.value.category_id.splice(index, 1);
        if (form.value.category_id.length === 0) form.value.category_id = ['未分類'];
    } else {
        if (cat === '未分類') {
            form.value.category_id = ['未分類'];
        } else {
            form.value.category_id = form.value.category_id.filter(c => c !== '未分類');
            form.value.category_id.push(cat);
        }
    }
};

const addNewCategory = async () => {
    const name = newCategoryName.value.trim();
    if (!name) return;

    if (categories.value.some(c => c.toLowerCase() === name.toLowerCase())) {
        if (!isSelected(name)) toggleTag(name);
        newCategoryName.value = '';
        return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
        const { error } = await supabase.from('categories').insert([{ name, user_id: user.id }]);
        if (!error) {
            categories.value.push(name);
            toggleTag(name);
            newCategoryName.value = '';
        } else if (error.code === '23505') {
            if (!categories.value.includes(name)) categories.value.push(name);
            toggleTag(name);
            newCategoryName.value = '';
        } else {
            throw error;
        }
    } catch (err) {
        alert('新增標籤失敗：' + err.message);
    }
};

// ==========================================
// 6. 安全檔案處理與 Modal 控制
// ==========================================
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (selectedFile.size > MAX_FILE_SIZE) {
        alert('檔案大小不能超過 10MB');
        e.target.value = '';
        return;
    }

    const isHeic = selectedFile.name.toLowerCase().endsWith('.heic');
    if (!ALLOWED_MIME.includes(selectedFile.type) && !isHeic) {
        alert('僅支援 JPG、PNG、WEBP 或 HEIC 圖片格式');
        e.target.value = '';
        return;
    }

    isSaving.value = true;
    try {
        let blob = selectedFile;
        if (isHeic) {
            const converted = await heic2any({ blob: selectedFile, toType: 'image/jpeg', quality: 0.8 });
            blob = Array.isArray(converted) ? converted[0] : converted;
        }

        const resizedBlob = await resizeImage(blob, 1200);
        file.value = new File([resizedBlob], "upload.jpg", { type: 'image/jpeg' });

        cleanupPreviewUrl();
        imagePreview.value = URL.createObjectURL(file.value);
    } catch (error) {
        alert('圖片處理失敗');
    } finally {
        isSaving.value = false;
    }
};

const resizeImage = (blob, maxWidth) => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.8);
            };
        };
    });
};

const openAddModal = () => {
    cleanupPreviewUrl();
    isEditMode.value = false;
    editingId.value = null;
    file.value = null;
    imagePreview.value = null;
    form.value = JSON.parse(JSON.stringify(initialForm));
    isModalOpen.value = true;
    document.body.style.overflow = 'hidden';
};

const openEditModal = (item) => {
    cleanupPreviewUrl();
    isEditMode.value = true;
    editingId.value = item.id;
    form.value = {
        ...initialForm,
        ...item,
        category_id: parseItemCategories(item.category_id)
    };
    imagePreview.value = item.imageUrl;
    isModalOpen.value = true;
};

const closeModal = () => {
    cleanupPreviewUrl();
    isModalOpen.value = false;
    document.body.style.overflow = 'auto';
};

const handleKeydown = (e) => {
    if (e.key === 'Escape') {
        if (previewModalImage.value) previewModalImage.value = null;
        else if (isModalOpen.value) closeModal();
    }
};

// ==========================================
// 7. 儲存、刪除與安全 CSV 匯出
// ==========================================
const handleSave = async () => {
    if (!form.value.name.trim()) return alert('請填寫物品名稱');

    isSaving.value = true;
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session.user.id;

        let finalImageUrl = form.value.imageUrl;
        if (file.value) {
            const fileName = `${userId}/${Date.now()}.jpg`;
            const { error: uploadError } = await supabase.storage
                .from('images')
                .upload(fileName, file.value);
            if (uploadError) throw uploadError;
            const { data } = supabase.storage.from('images').getPublicUrl(fileName);
            finalImageUrl = data.publicUrl;
        }

        const payload = {
            name: form.value.name.trim(),
            category_id: Array.isArray(form.value.category_id)
                ? form.value.category_id.filter(c => typeof c === 'string').join(',')
                : String(form.value.category_id),
            description: form.value.description || '',
            is_favorite: Boolean(form.value.is_favorite),
            location: form.value.location || '',
            price: Number(form.value.price) || 0,
            quantity: Number(form.value.quantity) || 0,
            purchase_date: form.value.purchase_date || null,
            user_id: userId,
            imageUrl: finalImageUrl,
            updated_at: new Date().toISOString()
        };

        // 如果資料庫已支援新欄位，則自動帶入；若無亦安全處理
        if (form.value.expiry_date) payload.expiry_date = form.value.expiry_date;
        if (form.value.min_quantity !== undefined) payload.min_quantity = Number(form.value.min_quantity);
        if (form.value.item_code) payload.item_code = form.value.item_code.trim();
        if (form.value.brand) payload.brand = form.value.brand.trim();

        let res;
        if (isEditMode.value) {
            res = await supabase.from('items').update(payload).eq('id', editingId.value);
        } else {
            res = await supabase.from('items').insert([payload]);
        }

        // 若資料庫尚未擴充新欄位導致報錯，自動剔除擴充欄位重試，確保保證存檔成功
        if (res.error && res.error.message.includes('column')) {
            delete payload.expiry_date;
            delete payload.min_quantity;
            delete payload.item_code;
            delete payload.brand;
            if (isEditMode.value) {
                res = await supabase.from('items').update(payload).eq('id', editingId.value);
            } else {
                res = await supabase.from('items').insert([payload]);
            }
        }

        if (res.error) throw res.error;

        closeModal();
        await fetchItems(userId);
    } catch (error) {
        console.error('儲存錯誤：', error);
        alert(`儲存失敗：${error.message}`);
    } finally {
        isSaving.value = false;
    }
};

const handleDelete = async () => {
    if (!confirm('確定要永久刪除此物品嗎？')) return;
    try {
        const { error } = await supabase.from('items').delete().eq('id', editingId.value);
        if (error) throw error;
        closeModal();
        const { data: { session } } = await supabase.auth.getSession();
        fetchItems(session.user.id);
    } catch (error) {
        alert('刪除失敗');
    }
};

const sanitizeCSV = (val) => {
    if (val === null || val === undefined) return '""';
    let str = String(val).replace(/"/g, '""');
    if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
    return `"${str}"`;
};

const exportToCSV = () => {
    if (filteredItems.value.length === 0) return alert('目前沒有可匯出的物品');

    const headers = ['物品編號', '物品名稱', '品牌/通路', '標籤分類', '存放位置', '數量', '安全庫存', '單價', '總金額', '購買日', '到期日', '收藏', '備註'];
    const rows = filteredItems.value.map(item => [
        sanitizeCSV(item.item_code || ''),
        sanitizeCSV(item.name),
        sanitizeCSV(item.brand || ''),
        sanitizeCSV(parseItemCategories(item.category_id).join(';')),
        sanitizeCSV(item.location),
        item.quantity ?? 0,
        item.min_quantity ?? 1,
        item.price ?? 0,
        (item.quantity ?? 0) * (item.price ?? 0),
        sanitizeCSV(item.purchase_date),
        sanitizeCSV(item.expiry_date || ''),
        item.is_favorite ? '是' : '否',
        sanitizeCSV(item.description)
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `物品收納清單_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
};

// ==========================================
// 8. 統計指標 (KPI Dashboard)
// ==========================================
const totalItemsCount = computed(() => items.value.length);
const totalAssetValue = computed(() => {
    return items.value.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)), 0);
});
const lowStockCount = computed(() => {
    return items.value.filter(isLowStock).length;
});
const favoritesCount = computed(() => {
    return items.value.filter(i => i.is_favorite).length;
});

// ==========================================
// 9. 搜尋、位置篩選與進階排序
// ==========================================
const availableLocations = computed(() => {
    const locs = items.value.map(i => i.location?.trim()).filter(Boolean);
    return ['全部', ...new Set(locs)];
});

const toggleFilterCategory = (cat) => {
    if (cat === '全部') {
        selectedCategories.value = ['全部'];
        return;
    }
    selectedCategories.value = selectedCategories.value.filter(c => c !== '全部');
    const index = selectedCategories.value.indexOf(cat);
    if (index > -1) {
        selectedCategories.value.splice(index, 1);
        if (selectedCategories.value.length === 0) selectedCategories.value = ['全部'];
    } else {
        selectedCategories.value.push(cat);
    }
};

const setQuickFilter = (type) => {
    if (activeQuickFilter.value === type) {
        activeQuickFilter.value = 'all';
    } else {
        activeQuickFilter.value = type;
    }
};

const filteredItems = computed(() => {
    const query = searchQuery.value.toLowerCase().trim();

    const result = items.value.filter(item => {
        // 1. 搜尋文字（名稱、編號、品牌、位置、描述）
        const matchSearch = item.name.toLowerCase().includes(query) ||
            (item.item_code && item.item_code.toLowerCase().includes(query)) ||
            (item.brand && item.brand.toLowerCase().includes(query)) ||
            (item.location && item.location.toLowerCase().includes(query)) ||
            (item.description && item.description.toLowerCase().includes(query));

        // 2. 標籤篩選
        let matchCategory = false;
        if (selectedCategories.value.includes('全部')) {
            matchCategory = true;
        } else {
            const itemCats = parseItemCategories(item.category_id);
            matchCategory = selectedCategories.value.every(selectedCat => itemCats.includes(selectedCat));
        }

        // 3. 存放位置
        const matchLocation = selectedLocation.value === '全部' || item.location === selectedLocation.value;

        // 4. 快速篩選 (全部、缺貨、收藏、即期)
        let matchQuick = true;
        if (activeQuickFilter.value === 'low_stock') {
            matchQuick = isLowStock(item);
        } else if (activeQuickFilter.value === 'favorites') {
            matchQuick = item.is_favorite;
        } else if (activeQuickFilter.value === 'expired') {
            const exp = getExpiryStatus(item.expiry_date);
            matchQuick = exp && (exp.level === 'danger' || exp.level === 'warning');
        }

        return matchSearch && matchCategory && matchLocation && matchQuick;
    });

    // 5. 排序演算法
    return result.sort((a, b) => {
        switch (sortBy.value) {
            case 'price_desc': return (b.price || 0) - (a.price || 0);
            case 'price_asc': return (a.price || 0) - (b.price || 0);
            case 'qty_asc': return (a.quantity || 0) - (b.quantity || 0);
            case 'qty_desc': return (b.quantity || 0) - (a.quantity || 0);
            case 'expiry_asc':
                if (!a.expiry_date) return 1;
                if (!b.expiry_date) return -1;
                return new Date(a.expiry_date) - new Date(b.expiry_date);
            case 'name_asc': return (a.name || '').localeCompare(b.name || '', 'zh-Hant');
            case 'created_asc': return new Date(a.created_at || 0) - new Date(b.created_at || 0);
            case 'created_desc':
            default:
                return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        }
    });
});

const filteredTotalAmount = computed(() => {
    return filteredItems.value.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)), 0);
});

const getQuantityClass = (item) => {
    if (Number(item.quantity || 0) === 0) return 'stock-out';
    if (isLowStock(item)) return 'stock-low';
    return 'stock-normal';
};
</script>

<template>
    <div class="inventory-page">
        <!-- 頂部頁面抬頭與快捷操作 -->
        <header class="page-header">
            <div class="header-title">
                <h1>📦 智能收納總覽</h1>
                <p class="subtitle">全面掌控生活物資、即時庫存與空間配置</p>
            </div>
            <div class="header-actions">
                <!-- 網格 / 清單 視圖切換 -->
                <div class="view-toggle">
                    <button :class="{ active: viewMode === 'grid' }" @click="viewMode = 'grid'" title="網格卡片檢視">⊞</button>
                    <button :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'" title="清單表格檢視">☰</button>
                </div>
                <button class="export-btn" @click="exportToCSV" title="匯出 Excel / CSV 試算表">
                    📥 匯出清單
                </button>
                <button class="add-btn" @click="openAddModal">
                    + 新增物品
                </button>
            </div>
        </header>

        <!-- KPI 數據儀表看板 (統計指標) -->
        <section class="kpi-grid">
            <div class="kpi-card" :class="{ 'active-card': activeQuickFilter === 'all' }" @click="setQuickFilter('all')">
                <div class="kpi-icon">📦</div>
                <div class="kpi-data">
                    <span class="kpi-label">登記總品項</span>
                    <span class="kpi-value">{{ totalItemsCount }} <small>項</small></span>
                </div>
            </div>

            <div class="kpi-card">
                <div class="kpi-icon gold">💰</div>
                <div class="kpi-data">
                    <span class="kpi-label">庫存總估值</span>
                    <span class="kpi-value gold">NT$ {{ totalAssetValue.toLocaleString() }}</span>
                </div>
            </div>

            <div class="kpi-card" :class="{ 'active-card': activeQuickFilter === 'low_stock', 'has-alert': lowStockCount > 0 }"
                @click="setQuickFilter('low_stock')" title="點擊快速篩選需補貨物品">
                <div class="kpi-icon red">⚠️</div>
                <div class="kpi-data">
                    <span class="kpi-label">庫存緊張 / 缺貨</span>
                    <span class="kpi-value red">{{ lowStockCount }} <small>項需注意</small></span>
                </div>
            </div>

            <div class="kpi-card" :class="{ 'active-card': activeQuickFilter === 'favorites' }"
                @click="setQuickFilter('favorites')" title="點擊快速篩選星號收藏品">
                <div class="kpi-icon purple">✦</div>
                <div class="kpi-data">
                    <span class="kpi-label">星號特別標記</span>
                    <span class="kpi-value purple">{{ favoritesCount }} <small>項收藏</small></span>
                </div>
            </div>
        </section>

        <!-- 搜尋與進階過濾面板 -->
        <section class="controls-card">
            <!-- 第一排：主搜尋框 + 位置篩選 + 排序選單 -->
            <div class="controls-main-row">
                <div class="search-box">
                    <span class="search-icon">🔍</span>
                    <input v-model="searchQuery" placeholder="搜尋物品名稱、編號、品牌、存放位置或備註描述..." class="main-input" />
                    <button v-if="searchQuery" class="clear-search-btn" @click="searchQuery = ''" title="清除搜尋">✕</button>
                </div>

                <div class="dropdown-group">
                    <div class="select-box">
                        <span class="select-icon">📍</span>
                        <select v-model="selectedLocation" class="custom-select" title="存放位置篩選">
                            <option value="全部">全部存放位置</option>
                            <option v-for="loc in availableLocations.filter(l => l !== '全部')" :key="loc" :value="loc">{{ loc }}</option>
                        </select>
                    </div>

                    <div class="select-box">
                        <span class="select-icon">🔄</span>
                        <select v-model="sortBy" class="custom-select" title="排序依據">
                            <option value="created_desc">最新建立</option>
                            <option value="expiry_asc">⌛ 到期日 (即期優先)</option>
                            <option value="price_desc">價格 (高 → 低)</option>
                            <option value="price_asc">價格 (低 → 高)</option>
                            <option value="qty_asc">庫存緊張 (少 → 多)</option>
                            <option value="qty_desc">庫存充裕 (多 → 少)</option>
                            <option value="name_asc">名稱 (筆畫/A-Z)</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- 第二排：快捷狀態篩選膠囊 -->
            <div class="filter-sub-row">
                <span class="filter-section-title">狀態過濾</span>
                <div class="quick-filter-pills">
                    <button class="pill-btn" :class="{ active: activeQuickFilter === 'all' }" @click="setQuickFilter('all')">
                        全部 ({{ totalItemsCount }})
                    </button>
                    <button class="pill-btn warn" :class="{ active: activeQuickFilter === 'low_stock' }" @click="setQuickFilter('low_stock')">
                        ⚠️ 需補貨 ({{ lowStockCount }})
                    </button>
                    <button class="pill-btn fav" :class="{ active: activeQuickFilter === 'favorites' }" @click="setQuickFilter('favorites')">
                        ★ 特別關注 ({{ favoritesCount }})
                    </button>
                    <button class="pill-btn exp" :class="{ active: activeQuickFilter === 'expired' }" @click="setQuickFilter('expired')">
                        ⌛ 即期 / 已過期
                    </button>
                </div>
            </div>

            <div class="filter-divider"></div>

            <!-- 第三排：分類標籤按鈕 -->
            <div class="filter-sub-row tags-row">
                <span class="filter-section-title">標籤分類</span>
                <div class="filter-categories">
                    <button v-for="cat in ['全部', ...categories]" :key="cat" class="filter-btn"
                        :class="{ active: selectedCategories.includes(cat) }" @click="toggleFilterCategory(cat)">
                        {{ cat }}
                    </button>
                </div>
            </div>
        </section>

        <!-- 模式一：網格卡片檢視 (Grid View) -->
        <main v-if="filteredItems.length > 0 && viewMode === 'grid'" class="grid-container">
            <div v-for="item in filteredItems" :key="item.id" class="card" @click="openEditModal(item)">
                <div class="img-box"
                    :style="{ backgroundImage: `url(${item.imageUrl || 'https://placehold.co/400x300/111/444?text=NO+IMAGE'})` }">
                    <!-- 收藏按鈕 -->
                    <button class="fav-btn-badge" :class="{ 'is-active': item.is_favorite }"
                        @click.stop="toggleFavorite(item)" title="切換收藏狀態">
                        {{ item.is_favorite ? '★' : '☆' }}
                    </button>

                    <!-- 放大看圖按鈕 -->
                    <button v-if="item.imageUrl" class="zoom-btn-badge"
                        @click.stop="previewModalImage = item.imageUrl" title="點擊放大檢視圖片">
                        🔍
                    </button>

                    <!-- 到期日提示標籤 -->
                    <div v-if="getExpiryStatus(item.expiry_date)" class="expiry-tag"
                        :class="getExpiryStatus(item.expiry_date).class">
                        {{ getExpiryStatus(item.expiry_date).text }}
                    </div>

                    <!-- 物品編號標籤 -->
                    <div v-if="item.item_code" class="code-badge">
                        #{{ item.item_code }}
                    </div>
                </div>

                <div class="info">
                    <div class="info-top">
                        <div class="badge-group">
                            <span v-for="cat in parseItemCategories(item.category_id)" :key="cat" class="badge">
                                {{ cat }}
                            </span>
                        </div>
                        <span class="price-tag">NT$ {{ (item.price || 0).toLocaleString() }}</span>
                    </div>

                    <div class="title-row">
                        <h3>{{ item.name }}</h3>
                        <span v-if="item.brand" class="brand-text">({{ item.brand }})</span>
                    </div>

                    <div class="info-bottom">
                        <span class="loc-text" :title="item.location">
                            <i class="icon">📍</i>
                            {{ item.location || '未標記位置' }}
                        </span>

                        <!-- 卡片快速加減數量 -->
                        <div class="quick-qty-box" @click.stop>
                            <button class="quick-btn minus" @click="changeQuantity(item, -1)" :disabled="item.quantity <= 0">-</button>
                            <span class="qty-display" :class="getQuantityClass(item)">
                                x{{ item.quantity }}
                            </span>
                            <button class="quick-btn plus" @click="changeQuantity(item, 1)">+</button>
                        </div>
                    </div>
                </div>
            </div>
        </main>

        <!-- 模式二：清單檢視 (List View) -->
        <div v-else-if="filteredItems.length > 0 && viewMode === 'list'" class="list-view-section">
            <!-- 1. 手機端專屬：極致美學橫式卡片清單 (100% 貼合手機螢幕，排版美觀、層次分明) -->
            <div class="mobile-item-list">
                <div v-for="item in filteredItems" :key="'mob-' + item.id" class="mob-item-card" :class="{ 'is-fav': item.is_favorite }" @click="openEditModal(item)">
                    <div class="mob-card-media">
                        <div class="mob-thumb" :style="{ backgroundImage: `url(${item.imageUrl || 'https://placehold.co/120x120/12101a/4a3b69?text=📦'})` }">
                            <button class="mob-star-badge" :class="{ active: item.is_favorite }" @click.stop="toggleFavorite(item)" title="切換收藏">
                                {{ item.is_favorite ? '★' : '☆' }}
                            </button>
                        </div>
                    </div>

                    <div class="mob-card-body">
                        <div class="mob-row-top">
                            <div class="mob-title-wrap">
                                <h4 class="mob-title">{{ item.name }}</h4>
                                <span v-if="item.brand" class="mob-brand">({{ item.brand }})</span>
                            </div>
                            <span class="mob-price-tag">NT$ {{ (item.price || 0).toLocaleString() }}</span>
                        </div>

                        <div class="mob-row-meta">
                            <span class="mob-loc-chip">
                                📍 {{ item.location || '未標記位置' }}
                            </span>
                            <span v-for="cat in parseItemCategories(item.category_id).slice(0, 2)" :key="cat" class="mob-tag-chip">
                                {{ cat }}
                            </span>
                            <span v-if="item.item_code" class="mob-code-chip">#{{ item.item_code }}</span>
                        </div>

                        <div class="mob-row-bottom">
                            <div class="mob-status-col">
                                <span v-if="getExpiryStatus(item.expiry_date)" :class="getExpiryStatus(item.expiry_date).class" class="mini-expiry-badge">
                                    {{ getExpiryStatus(item.expiry_date).text }}
                                </span>
                                <span v-else-if="item.quantity <= (item.min_quantity || 1)" class="mob-low-alert">
                                    ⚠️ 庫存偏低
                                </span>
                            </div>

                            <div class="mob-stepper-pill" @click.stop>
                                <button class="stepper-btn minus" @click="changeQuantity(item, -1)" :disabled="item.quantity <= 0" aria-label="減少">−</button>
                                <span class="stepper-value" :class="getQuantityClass(item)">x{{ item.quantity }}</span>
                                <button class="stepper-btn plus" @click="changeQuantity(item, 1)" aria-label="增加">+</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 2. 電腦端專屬：完整 10 欄寬表格 (桌面瀏覽大器俐落) -->
            <div class="desktop-table-container table-container">
                <table class="inventory-table">
                    <thead>
                        <tr>
                            <th width="40">收藏</th>
                            <th width="60">照片</th>
                            <th>編號</th>
                            <th>物品名稱</th>
                            <th>分類標籤</th>
                            <th>存放位置</th>
                            <th class="text-right">單價</th>
                            <th class="text-center">庫存數量</th>
                            <th>保存期限</th>
                            <th width="80" class="text-center">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="item in filteredItems" :key="item.id" @click="openEditModal(item)">
                            <td class="text-center" @click.stop>
                                <button class="star-btn" :class="{ active: item.is_favorite }" @click="toggleFavorite(item)">
                                    {{ item.is_favorite ? '★' : '☆' }}
                                </button>
                            </td>
                            <td>
                                <div class="table-thumb" :style="{ backgroundImage: `url(${item.imageUrl || 'https://placehold.co/100x100/111/444?text=-'})` }"></div>
                            </td>
                            <td class="code-col">{{ item.item_code || '-' }}</td>
                            <td class="name-col">
                                <strong>{{ item.name }}</strong>
                                <small v-if="item.brand" class="brand-sub">{{ item.brand }}</small>
                            </td>
                            <td>
                                <span v-for="cat in parseItemCategories(item.category_id)" :key="cat" class="mini-badge">{{ cat }}</span>
                            </td>
                            <td class="loc-col">📍 {{ item.location || '-' }}</td>
                            <td class="text-right price-col">NT$ {{ (item.price || 0).toLocaleString() }}</td>
                            <td class="text-center" @click.stop>
                                <div class="quick-qty-box">
                                    <button class="quick-btn" @click="changeQuantity(item, -1)" :disabled="item.quantity <= 0">-</button>
                                    <span class="qty-display" :class="getQuantityClass(item)">{{ item.quantity }}</span>
                                    <button class="quick-btn" @click="changeQuantity(item, 1)">+</button>
                                </div>
                            </td>
                            <td>
                                <span v-if="getExpiryStatus(item.expiry_date)" :class="getExpiryStatus(item.expiry_date).class" class="mini-expiry">
                                    {{ getExpiryStatus(item.expiry_date).text }}
                                </span>
                                <span v-else class="text-muted">-</span>
                            </td>
                            <td class="text-center">
                                <button class="edit-link" @click.stop="openEditModal(item)">編輯</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div v-else class="empty-state">
            <p>找不到符合條件的物品</p>
        </div>

        <!-- 圖片全螢幕大圖燈箱 Modal -->
        <transition name="modal-fade">
            <div v-if="previewModalImage" class="lightbox-overlay" @click="previewModalImage = null">
                <div class="lightbox-content" @click.stop>
                    <img :src="previewModalImage" class="lightbox-img" />
                    <button class="lightbox-close" @click="previewModalImage = null">✕ 關閉</button>
                </div>
            </div>
        </transition>

        <!-- 編輯 / 新增彈窗 Modal (分組排版) -->
        <transition name="modal-fade">
            <div v-if="isModalOpen" class="overlay" @click.self="closeModal">
                <div class="modal">
                    <div class="modal-header">
                        <h2>{{ isEditMode ? '編輯物品資訊' : '登錄新物品' }}</h2>
                        <button @click="closeModal" class="close-x">✕</button>
                    </div>

                    <div class="modal-body scrollable">
                        <!-- 照片上傳區 -->
                        <div class="image-upload-wrapper">
                            <label class="image-preview-box">
                                <input type="file" @change="handleFileChange" accept="image/*,image/heic" class="hidden-input" />
                                <div v-if="imagePreview" class="preview-overlay">
                                    <img :src="imagePreview" class="img-content" />
                                    <div class="change-hint">點擊更換照片 (上限 10MB)</div>
                                </div>
                                <div v-else class="upload-placeholder">
                                    <span>📸 點擊上傳實體物品照片</span>
                                </div>
                            </label>
                        </div>

                        <!-- 表單欄位 -->
                        <div class="form-grid">
                            <div class="row">
                                <div class="field">
                                    <label>物品名稱 *</label>
                                    <input v-model="form.name" placeholder="請輸入名稱" maxlength="100" />
                                </div>
                                <div class="field">
                                    <label>物品/收納箱編號 (可選)</label>
                                    <input v-model="form.item_code" placeholder="例：A1-03, 條碼" maxlength="50" />
                                </div>
                            </div>

                            <div class="row">
                                <div class="field">
                                    <label>品牌 / 購買通路</label>
                                    <input v-model="form.brand" placeholder="例：IKEA, 好市多, 蝦皮" maxlength="50" />
                                </div>
                                <div class="field">
                                    <label>存放位置</label>
                                    <input v-model="form.location" placeholder="例：防潮箱、客廳抽屜 A" maxlength="50" />
                                </div>
                            </div>

                            <div class="field full-width">
                                <label>標籤分類 (可複選)</label>
                                <div class="tag-input-container">
                                    <div class="tag-wrapper">
                                        <div v-for="cat in categories" :key="cat" class="editable-tag"
                                            :class="{ active: isSelected(cat) }" @click="toggleTag(cat)">
                                            {{ cat }}
                                        </div>
                                    </div>
                                    <div class="add-tag-row">
                                        <input v-model="newCategoryName" placeholder="新增標籤..."
                                            @keyup.enter="addNewCategory" maxlength="30" />
                                        <button type="button" @click="addNewCategory" class="btn-tag-add">建立</button>
                                    </div>
                                </div>
                            </div>

                            <div class="row">
                                <div class="field">
                                    <label>單價 (NT$)</label>
                                    <input type="number" v-model.number="form.price" min="0" class="no-spin" />
                                </div>
                                <div class="field">
                                    <label>目前庫存數量</label>
                                    <div class="qty-control">
                                        <button @click="form.quantity > 0 && form.quantity--">-</button>
                                        <input type="number" v-model.number="form.quantity" min="0" class="no-spin" />
                                        <button @click="form.quantity++">+</button>
                                    </div>
                                </div>
                            </div>

                            <div class="row">
                                <div class="field">
                                    <label>安全最低庫存 (低於此數預警)</label>
                                    <input type="number" v-model.number="form.min_quantity" min="0" class="no-spin" placeholder="預設 1" />
                                </div>
                                <div class="field">
                                    <label>有效期限 / 保固到期日</label>
                                    <input type="date" v-model="form.expiry_date" class="date-input" />
                                </div>
                            </div>

                            <div class="field full-width">
                                <label>購買日期</label>
                                <input type="date" v-model="form.purchase_date" class="date-input" />
                            </div>

                            <div class="field full-width">
                                <label>備註描述</label>
                                <textarea v-model="form.description" rows="3" placeholder="補充保存條件、採購通路、保固資訊或用途說明..." maxlength="500"></textarea>
                            </div>
                        </div>

                        <div class="fav-toggle-bar" :class="{ 'is-fav': form.is_favorite }"
                            @click="form.is_favorite = !form.is_favorite">
                            <span>{{ form.is_favorite ? '★ 已設為特別關注' : '☆ 標記為收藏關注' }}</span>
                        </div>
                    </div>

                    <div class="modal-footer">
                        <button v-if="isEditMode" class="btn-delete" @click="handleDelete">刪除物品</button>
                        <div class="spacer"></div>
                        <button class="btn-cancel" @click="closeModal">取消</button>
                        <button class="btn-save" @click="handleSave" :disabled="isSaving">
                            {{ isSaving ? '處理中...' : '儲存資料' }}
                        </button>
                    </div>
                </div>
            </div>
        </transition>
    </div>
</template>

<style scoped>
/* ========================================================
   基礎與版面排版
   ======================================================== */
.inventory-page {
    padding: 30px 24px;
    max-width: 1300px;
    margin: 0 auto;
    color: #e0e0e0;
}

.page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 25px;
    flex-wrap: wrap;
    gap: 15px;
}

.header-title h1 {
    font-size: 2rem;
    color: #fff;
    margin: 0;
    letter-spacing: 1px;
}

.subtitle {
    color: #888;
    font-size: 0.85rem;
    margin-top: 5px;
}

.header-actions {
    display: flex;
    gap: 12px;
    align-items: center;
}

.view-toggle {
    display: flex;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(188, 19, 254, 0.4);
    border-radius: 10px;
    overflow: hidden;
}

.view-toggle button {
    background: transparent;
    border: none;
    color: #888;
    padding: 8px 14px;
    font-size: 1.1rem;
    cursor: pointer;
    transition: 0.2s;
}

.view-toggle button.active {
    background: #bc13fe;
    color: #fff;
}

.export-btn {
    background: rgba(188, 19, 254, 0.1);
    color: #e0d5ff;
    border: 1px solid rgba(188, 19, 254, 0.5);
    padding: 10px 18px;
    border-radius: 12px;
    font-weight: 700;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.3s ease;
}

.export-btn:hover {
    background: rgba(188, 19, 254, 0.3);
    border-color: #00f2ff;
    color: #fff;
    box-shadow: 0 0 15px rgba(0, 242, 255, 0.4);
    transform: translateY(-2px);
}

.add-btn {
    background: linear-gradient(135deg, #a855f7 0%, #c084fc 100%);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.3);
    padding: 11px 24px;
    border-radius: 12px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 0 15px rgba(192, 132, 252, 0.4);
    letter-spacing: 1px;
    transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
}

.add-btn:hover {
    transform: translateY(-2px);
    background: linear-gradient(135deg, #c084fc 0%, #d8b4fe 100%);
    box-shadow: 0 0 25px rgba(192, 132, 252, 0.7);
    color: #000;
}

/* ========================================================
   KPI 數據指標卡片 (儀表板)
   ======================================================== */
.kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
    margin-bottom: 25px;
}

.kpi-card {
    background: rgba(20, 10, 35, 0.6);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(188, 19, 254, 0.25);
    border-radius: 16px;
    padding: 18px 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.kpi-card:hover {
    border-color: #bc13fe;
    transform: translateY(-3px);
    box-shadow: 0 8px 20px rgba(188, 19, 254, 0.2);
}

.kpi-card.active-card {
    border-color: #00f2ff;
    box-shadow: 0 0 15px rgba(0, 242, 255, 0.3);
    background: rgba(0, 242, 255, 0.05);
}

.kpi-card.has-alert {
    border-color: rgba(239, 68, 68, 0.5);
    animation: pulseBorder 2s infinite;
}

@keyframes pulseBorder {
    0% { box-shadow: 0 0 0 rgba(239, 68, 68, 0); }
    50% { box-shadow: 0 0 12px rgba(239, 68, 68, 0.4); }
    100% { box-shadow: 0 0 0 rgba(239, 68, 68, 0); }
}

.kpi-icon {
    width: 46px;
    height: 46px;
    border-radius: 12px;
    background: rgba(188, 19, 254, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.4rem;
}

.kpi-icon.gold { background: rgba(255, 215, 0, 0.15); color: #ffd700; }
.kpi-icon.red { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
.kpi-icon.purple { background: rgba(192, 132, 252, 0.15); color: #c084fc; }

.kpi-data {
    display: flex;
    flex-direction: column;
}

.kpi-label {
    font-size: 0.75rem;
    color: #888;
    margin-bottom: 4px;
}

.kpi-value {
    font-size: 1.25rem;
    font-weight: 800;
    color: #fff;
    font-family: 'JetBrains Mono', monospace;
}

.kpi-value small { font-size: 0.75rem; font-weight: normal; color: #888; }
.kpi-value.gold { color: #ffd700; }
.kpi-value.red { color: #ff5f5f; }
.kpi-value.purple { color: #c084fc; }


/* ========================================================
   控制面板與搜尋過濾 (重新排版，保證不跑版)
   ======================================================== */
.controls-card {
    background: rgba(20, 10, 35, 0.6);
    backdrop-filter: blur(12px);
    border-radius: 20px;
    padding: 24px;
    border: 1px solid rgba(188, 19, 254, 0.3);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), inset 0 0 15px rgba(188, 19, 254, 0.1);
    margin-bottom: 25px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

/* 第一排：搜尋欄與下拉選單 */
.controls-main-row {
    display: flex;
    gap: 16px;
    align-items: center;
    width: 100%;
}

.search-box {
    position: relative;
    flex: 1;
    min-width: 240px;
}

.search-icon {
    position: absolute;
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
    color: #bc13fe;
    font-size: 1rem;
    text-shadow: 0 0 8px rgba(188, 19, 254, 0.8);
    pointer-events: none;
    z-index: 1;
}

.main-input {
    width: 100%;
    height: 46px;
    padding: 10px 42px 10px 48px;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(188, 19, 254, 0.4);
    border-radius: 12px;
    color: #e0d5ff;
    font-size: 0.95rem;
    transition: all 0.3s ease;
    box-sizing: border-box;
}

.main-input:focus {
    outline: none;
    border-color: #00f2ff;
    box-shadow: 0 0 15px rgba(0, 242, 255, 0.3);
    background: rgba(15, 5, 25, 0.7);
}

.main-input::placeholder {
    color: rgba(224, 213, 255, 0.4);
}

.clear-search-btn {
    position: absolute;
    right: 14px;
    top: 50%;
    transform: translateY(-50%);
    background: transparent;
    border: none;
    color: #888;
    cursor: pointer;
    font-size: 0.9rem;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: 0.2s;
}

.clear-search-btn:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.1);
}

.dropdown-group {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-shrink: 0;
}

.select-box {
    position: relative;
    display: flex;
    align-items: center;
}

.select-icon {
    position: absolute;
    left: 12px;
    font-size: 0.9rem;
    pointer-events: none;
    z-index: 1;
}

.custom-select {
    height: 46px;
    padding: 10px 16px 10px 36px;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(188, 19, 254, 0.4);
    color: #e0d5ff;
    border-radius: 12px;
    outline: none;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    min-width: 155px;
    transition: all 0.3s ease;
    box-sizing: border-box;
}

.custom-select:focus {
    border-color: #00f2ff;
    box-shadow: 0 0 12px rgba(0, 242, 255, 0.3);
}

.custom-select option {
    background: #111116;
    color: #fff;
}

/* 分隔細線 */
.filter-divider {
    height: 1px;
    background: linear-gradient(90deg, rgba(188, 19, 254, 0.3), rgba(0, 242, 255, 0.2), transparent);
    width: 100%;
}

/* 第二排與第三排：過濾列 */
.filter-sub-row {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
}

.filter-section-title {
    font-size: 0.8rem;
    color: #bc13fe;
    font-weight: 700;
    letter-spacing: 1px;
    min-width: 65px;
    flex-shrink: 0;
}

.quick-filter-pills {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
}

.pill-btn {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #aaa;
    padding: 7px 16px;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    white-space: nowrap;
}

.pill-btn:hover {
    color: #fff;
    border-color: #bc13fe;
    background: rgba(188, 19, 254, 0.15);
}

.pill-btn.active {
    background: rgba(188, 19, 254, 0.3);
    border-color: #bc13fe;
    color: #fff;
    box-shadow: 0 0 12px rgba(188, 19, 254, 0.4);
}

.pill-btn.warn:hover,
.pill-btn.warn.active {
    background: rgba(239, 68, 68, 0.25);
    border-color: #ef4444;
    color: #ff8e8e;
    box-shadow: 0 0 12px rgba(239, 68, 68, 0.4);
}

.pill-btn.fav:hover,
.pill-btn.fav.active {
    background: rgba(255, 215, 0, 0.2);
    border-color: #ffd700;
    color: #ffd700;
    box-shadow: 0 0 12px rgba(255, 215, 0, 0.4);
}

.pill-btn.exp:hover,
.pill-btn.exp.active {
    background: rgba(234, 179, 8, 0.25);
    border-color: #eab308;
    color: #fde047;
    box-shadow: 0 0 12px rgba(234, 179, 8, 0.4);
}

/* 標籤分類列 */
.tags-row {
    align-items: flex-start;
}

.tags-row .filter-section-title {
    margin-top: 6px;
}

.filter-categories {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    flex: 1;
}

.filter-btn {
    padding: 6px 16px;
    border-radius: 8px;
    border: 1px solid rgba(188, 19, 254, 0.3);
    background: rgba(188, 19, 254, 0.05);
    color: #c084fc;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 500;
    transition: all 0.2s ease;
    white-space: nowrap;
}

.filter-btn:hover {
    background: rgba(188, 19, 254, 0.2);
    border-color: #bc13fe;
    color: #fff;
    transform: translateY(-1px);
}

.filter-btn.active {
    background: #bc13fe;
    color: #fff;
    border-color: #fff;
    box-shadow: 0 0 14px rgba(188, 19, 254, 0.8);
}

/* RWD 響應式：中小型螢幕優化，徹底解決擠壓跑版 */
@media (max-width: 1024px) {
    .controls-main-row {
        flex-direction: column;
        align-items: stretch;
    }
    .dropdown-group {
        width: 100%;
    }
    .select-box {
        flex: 1;
    }
    .custom-select {
        width: 100%;
    }
}

@media (max-width: 640px) {
    .controls-card {
        padding: 16px;
    }
    .dropdown-group {
        flex-direction: column;
    }
    .filter-sub-row {
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
    }
}

/* ========================================================
   模式一：網格卡片樣式
   ======================================================== */
.grid-container {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 20px;
}

.card {
    background: #16161a;
    border-radius: 16px;
    border: 1px solid #2a2a2e;
    overflow: hidden;
    cursor: pointer;
    transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.card:hover {
    border-color: #bc13fe;
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(188, 19, 254, 0.2);
}

.img-box {
    height: 180px;
    background-size: cover;
    background-position: center;
    position: relative;
    background-color: #111;
}

.fav-btn-badge {
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.65);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #888;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
    z-index: 2;
}

.fav-btn-badge.is-active {
    color: #ffd700;
    border-color: #ffd700;
    box-shadow: 0 0 10px rgba(255, 215, 0, 0.6);
}

.zoom-btn-badge {
    position: absolute;
    bottom: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.65);
    border: 1px solid rgba(255, 255, 255, 0.2);
    width: 28px;
    height: 28px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.85rem;
    transition: 0.2s;
}

.zoom-btn-badge:hover {
    background: #bc13fe;
    color: #fff;
}

.code-badge {
    position: absolute;
    top: 10px;
    left: 10px;
    background: rgba(0, 0, 0, 0.7);
    color: #00f2ff;
    border: 1px solid rgba(0, 242, 255, 0.3);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.7rem;
    font-family: 'JetBrains Mono', monospace;
}

.expiry-tag {
    position: absolute;
    bottom: 10px;
    left: 10px;
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 0.7rem;
    font-weight: bold;
    backdrop-filter: blur(4px);
}

.expiry-tag.status-expired {
    background: rgba(239, 68, 68, 0.85);
    color: #fff;
    box-shadow: 0 0 10px rgba(239, 68, 68, 0.5);
}

.expiry-tag.status-warning {
    background: rgba(234, 179, 8, 0.85);
    color: #000;
    box-shadow: 0 0 10px rgba(234, 179, 8, 0.5);
}

.expiry-tag.status-good {
    background: rgba(34, 197, 94, 0.2);
    color: #4ade80;
    border: 1px solid rgba(34, 197, 94, 0.4);
}

.info {
    padding: 16px;
}

.info-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.badge-group {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    max-width: 65%;
}

.badge {
    font-size: 0.65rem;
    color: #c084fc;
    border: 1px solid rgba(192, 132, 252, 0.4);
    padding: 1px 6px;
    border-radius: 4px;
}

.price-tag {
    font-weight: bold;
    color: #4ade80;
    font-family: 'JetBrains Mono', monospace;
}

.title-row {
    margin-bottom: 10px;
    display: flex;
    align-items: baseline;
    gap: 6px;
}

.card h3 {
    margin: 0;
    font-size: 1.05rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #fff;
}

.brand-text {
    font-size: 0.75rem;
    color: #888;
}

.info-bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 0.85rem;
    color: #aaa;
}

.loc-text {
    max-width: 120px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.quick-qty-box {
    display: inline-flex;
    align-items: center;
    background: rgba(0, 0, 0, 0.6);
    border: 1px solid rgba(188, 19, 254, 0.4);
    border-radius: 8px;
    padding: 2px 6px;
    gap: 6px;
}

.quick-btn {
    background: transparent;
    border: none;
    color: #bc13fe;
    width: 22px;
    height: 22px;
    cursor: pointer;
    font-weight: 900;
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
}

.quick-btn:hover:not(:disabled) {
    background: #bc13fe;
    color: #000;
}

.quick-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
}

.qty-display {
    font-size: 0.85rem;
    min-width: 32px;
    text-align: center;
    font-weight: bold;
}

.stock-out { color: #ff5f5f !important; }
.stock-low { color: #facc15 !important; }
.stock-normal { color: #4ade80 !important; }

/* ========================================================
   模式二：清單表格樣式 (Table View)
   ======================================================== */
.table-container {
    background: rgba(20, 10, 35, 0.6);
    backdrop-filter: blur(12px);
    border-radius: 16px;
    border: 1px solid rgba(188, 19, 254, 0.3);
    overflow-x: auto;
}

.inventory-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
    color: #ddd;
}

.inventory-table th {
    background: rgba(0, 0, 0, 0.4);
    padding: 14px 16px;
    text-align: left;
    color: #bc13fe;
    font-weight: 700;
    border-bottom: 1px solid rgba(188, 19, 254, 0.3);
}

.inventory-table td {
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    vertical-align: middle;
}

.inventory-table tbody tr {
    cursor: pointer;
    transition: background 0.2s;
}

.inventory-table tbody tr:hover {
    background: rgba(188, 19, 254, 0.08);
}

.star-btn {
    background: none;
    border: none;
    color: #666;
    font-size: 1.1rem;
    cursor: pointer;
}

.star-btn.active { color: #ffd700; }

.table-thumb {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background-size: cover;
    background-position: center;
    background-color: #222;
}

.code-col {
    color: #00f2ff;
    font-family: 'JetBrains Mono', monospace;
}

.name-col strong {
    display: block;
    color: #fff;
    font-size: 0.95rem;
}

.brand-sub {
    color: #888;
    font-size: 0.75rem;
}

.mini-badge {
    background: rgba(192, 132, 252, 0.15);
    color: #c084fc;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.75rem;
    margin-right: 4px;
}

.loc-col { color: #aaa; }
.price-col { font-family: 'JetBrains Mono', monospace; font-weight: bold; color: #4ade80; }
.mini-expiry { font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
.mini-expiry.status-expired { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
.mini-expiry.status-warning { background: rgba(234, 179, 8, 0.2); color: #facc15; }
.mini-expiry.status-good { color: #4ade80; }
.edit-link {
    background: rgba(188, 19, 254, 0.1);
    border: 1px solid rgba(188, 19, 254, 0.4);
    color: #e0d5ff;
    padding: 4px 10px;
    border-radius: 6px;
    cursor: pointer;
}
.edit-link:hover { background: #bc13fe; color: #fff; }

.text-right { text-align: right; }
.text-center { text-align: center; }
.text-muted { color: #555; }

.empty-state {
    text-align: center;
    padding: 60px;
    color: #888;
    font-size: 1.1rem;
}

/* ========================================================
   圖片燈箱 Modal
   ======================================================== */
.lightbox-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(10px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 2000;
}

.lightbox-content {
    position: relative;
    max-width: 90vw;
    max-height: 90vh;
}

.lightbox-img {
    max-width: 100%;
    max-height: 85vh;
    border-radius: 12px;
    border: 1px solid #555;
    box-shadow: 0 0 40px rgba(0, 0, 0, 0.9);
}

.lightbox-close {
    position: absolute;
    top: -40px;
    right: 0;
    background: #333;
    color: #fff;
    border: none;
    padding: 6px 14px;
    border-radius: 20px;
    cursor: pointer;
}

/* ========================================================
   編輯 / 新增彈窗 Modal (分組排版)
   ======================================================== */
.overlay {
    background: rgba(0, 0, 0, 0.85);
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    backdrop-filter: blur(8px);
}

.modal {
    background: #111;
    width: 100%;
    max-width: 580px;
    max-height: 90vh;
    border-radius: 20px;
    border: 1px solid #333;
    display: flex;
    flex-direction: column;
}

.modal-header {
    padding: 20px 24px;
    border-bottom: 1px solid #222;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.modal-header h2 { margin: 0; font-size: 1.25rem; color: #fff; }
.close-x {
    background: transparent;
    border: none;
    color: #888;
    font-size: 1.5rem;
    cursor: pointer;
    line-height: 1;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: 0.2s;
}

.close-x:hover { color: #fff; transform: rotate(90deg); }

.modal-body {
    padding: 20px 24px;
    overflow-y: auto;
    flex-grow: 1;
}

.image-upload-wrapper { margin-bottom: 20px; }

.image-preview-box {
    width: 100%;
    height: 200px;
    background: #000;
    border: 2px dashed #333;
    border-radius: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
}

.img-content { width: 100%; height: 100%; object-fit: cover; }
.hidden-input { display: none; }
.preview-overlay { width: 100%; height: 100%; position: relative; }
.change-hint {
    position: absolute;
    bottom: 0;
    width: 100%;
    background: rgba(0, 0, 0, 0.6);
    text-align: center;
    padding: 5px;
    font-size: 0.8rem;
    color: #ccc;
}

.upload-placeholder { color: #666; font-size: 0.9rem; }

.form-grid {
    display: flex;
    flex-direction: column;
    gap: 15px;
}

.row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
}

.field label {
    display: block;
    font-size: 0.75rem;
    color: #c084fc;
    margin-bottom: 5px;
    font-weight: 600;
}

input, select, textarea {
    background: #000;
    border: 1px solid #222;
    padding: 10px 12px;
    border-radius: 8px;
    color: #fff;
    width: 100%;
    box-sizing: border-box;
}

input:focus, select:focus, textarea:focus {
    border-color: #00f2ff;
    outline: none;
    box-shadow: 0 0 10px rgba(0, 242, 255, 0.2);
}

.no-spin::-webkit-inner-spin-button, .no-spin::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

.qty-control {
    display: flex;
    border: 1px solid #222;
    border-radius: 8px;
    overflow: hidden;
    height: 42px;
}

.qty-control button {
    width: 40px;
    background: #222;
    border: none;
    color: #c084fc;
    font-weight: bold;
    cursor: pointer;
}

.qty-control input { border: none; text-align: center; }
.date-input { color-scheme: dark; cursor: pointer; }

.tag-input-container {
    background: #09090b;
    border: 1px solid #222;
    padding: 12px;
    border-radius: 12px;
}

.tag-wrapper {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
    max-height: 100px;
    overflow-y: auto;
}

.editable-tag {
    cursor: pointer;
    padding: 5px 12px;
    border: 1px solid #333;
    border-radius: 20px;
    background: #1a1a1c;
    font-size: 0.8rem;
    transition: 0.2s;
}

.editable-tag.active {
    background: #c084fc;
    color: #000;
    border-color: #c084fc;
    font-weight: bold;
}

.add-tag-row {
    display: flex;
    gap: 8px;
    border-top: 1px solid #222;
    padding-top: 10px;
}

.add-tag-row input {
    flex: 1;
    background: #000;
    border: 1px solid #333;
    padding: 6px 10px;
    border-radius: 6px;
    color: #fff;
}

.btn-tag-add {
    background: #333;
    border: none;
    color: #fff;
    padding: 0 14px;
    border-radius: 6px;
    cursor: pointer;
}

.fav-toggle-bar {
    margin-top: 15px;
    padding: 12px;
    border: 1px solid #222;
    border-radius: 10px;
    text-align: center;
    cursor: pointer;
    transition: 0.2s;
}

.fav-toggle-bar.is-fav {
    background: rgba(255, 215, 0, 0.1);
    border-color: #ffd700;
    color: #ffd700;
}

.modal-footer {
    padding: 18px 24px;
    border-top: 1px solid #222;
    display: flex;
    gap: 10px;
    align-items: center;
}

.btn-save {
    background: #c084fc;
    color: #000;
    font-weight: bold;
    border: none;
    padding: 10px 22px;
    border-radius: 8px;
    cursor: pointer;
}

.btn-cancel {
    background: #222;
    color: #fff;
    border: none;
    padding: 10px 18px;
    border-radius: 8px;
    cursor: pointer;
}

.btn-delete {
    background: none;
    border: none;
    color: #ff5f5f;
    cursor: pointer;
}

.spacer { flex: 1; }

.modal-fade-enter-active, .modal-fade-leave-active { transition: all 0.3s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; transform: scale(0.95); }
.scrollable::-webkit-scrollbar { width: 6px; }
.scrollable::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }


/* ========================================================
   極致美學升級：手機專屬橫式清單卡片 (Mobile List View)
   ======================================================== */
.mobile-item-list {
    display: none; /* 電腦版隱藏 */
}

.desktop-table-container {
    display: block;
}

/* ========================================================
   全面 RWD 響應式優化 (手機、平板與折疊螢幕深度美化，絕不超出畫面)
   ======================================================== */

/* 平板與中螢幕適配 (769px ~ 1024px) */
@media (max-width: 1024px) {
    .inventory-page {
        padding: 20px 16px;
        max-width: 100%;
        box-sizing: border-box;
    }

    .kpi-grid {
        grid-template-columns: repeat(2, 1fr) !important;
        gap: 12px;
    }

    .controls-main-row {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 12px !important;
    }

    .dropdown-group {
        width: 100% !important;
        display: flex !important;
        gap: 10px !important;
    }

    .select-box {
        flex: 1 !important;
    }

    .custom-select {
        width: 100% !important;
    }

    .grid-container {
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)) !important;
        gap: 16px !important;
    }
}

/* 手機版主力適配 (<= 768px) */
@media (max-width: 768px) {
    /* 容器保證絕不橫向溢出 */
    .inventory-page {
        padding: 0 0 36px 0 !important;
        margin: 0 !important;
        width: 100% !important;
        max-width: 100% !important;
        overflow-x: hidden !important;
        box-sizing: border-box !important;
    }

    /* 頂部 Header 自適應堆疊，精緻霓虹字體 */
    .page-header {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 12px !important;
        margin-bottom: 16px !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
    }

    .header-title h1 {
        font-size: 1.45rem !important;
        font-weight: 800 !important;
        letter-spacing: 0.5px !important;
        background: linear-gradient(135deg, #ffffff 0%, #c084fc 100%) !important;
        -webkit-background-clip: text !important;
        -webkit-text-fill-color: transparent !important;
        word-break: break-word;
    }

    .header-title .subtitle {
        font-size: 0.78rem !important;
        color: #9494a0 !important;
        margin-top: 3px !important;
        line-height: 1.4 !important;
    }

    .header-actions {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
    }

    .view-toggle {
        display: flex !important;
        flex-shrink: 0;
        background: rgba(10, 8, 16, 0.7) !important;
        border: 1px solid rgba(188, 19, 254, 0.3) !important;
        border-radius: 12px !important;
        padding: 2px !important;
    }

    .view-toggle button {
        padding: 7px 12px !important;
        font-size: 0.95rem !important;
        border-radius: 8px !important;
    }

    .export-btn {
        flex: 1 !important;
        min-width: 0 !important;
        padding: 9px 10px !important;
        font-size: 0.82rem !important;
        font-weight: 600 !important;
        text-align: center !important;
        justify-content: center !important;
        border-radius: 12px !important;
        background: rgba(255, 255, 255, 0.05) !important;
        border: 1px solid rgba(255, 255, 255, 0.15) !important;
    }

    .add-btn {
        flex: 1.4 !important;
        min-width: 0 !important;
        padding: 9px 14px !important;
        font-size: 0.88rem !important;
        font-weight: 700 !important;
        text-align: center !important;
        justify-content: center !important;
        border-radius: 12px !important;
        letter-spacing: 0.5px !important;
        background: linear-gradient(135deg, #a855f7 0%, #c084fc 100%) !important;
        box-shadow: 0 0 15px rgba(192, 132, 252, 0.4) !important;
    }

    /* KPI 卡片看板：手機 2x2 曜石磨砂玻璃風格 */
    .kpi-grid {
        grid-template-columns: repeat(2, 1fr) !important;
        gap: 8px !important;
        margin-bottom: 16px !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
    }

    .kpi-card {
        padding: 10px 12px !important;
        gap: 10px !important;
        border-radius: 14px !important;
        min-width: 0 !important;
        overflow: hidden !important;
        background: rgba(18, 14, 28, 0.75) !important;
        backdrop-filter: blur(12px) !important;
        border: 1px solid rgba(192, 132, 252, 0.18) !important;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4) !important;
    }

    .kpi-icon {
        width: 36px !important;
        height: 36px !important;
        font-size: 1.15rem !important;
        border-radius: 10px !important;
        flex-shrink: 0;
        background: rgba(188, 19, 254, 0.12) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
    }

    .kpi-label {
        font-size: 0.68rem !important;
        color: #9494a0 !important;
        letter-spacing: 0.5px !important;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .kpi-value {
        font-size: 1.05rem !important;
        font-weight: 800 !important;
        letter-spacing: 0.3px !important;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .kpi-value small {
        font-size: 0.65rem !important;
        font-weight: normal;
        margin-left: 2px;
    }

    /* 搜尋與篩選面板：完全消除 min-width，精緻磨砂質感 */
    .controls-card {
        padding: 12px 14px !important;
        border-radius: 16px !important;
        margin-bottom: 16px !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        background: rgba(18, 14, 28, 0.7) !important;
        border: 1px solid rgba(188, 19, 254, 0.22) !important;
    }

    .controls-main-row {
        flex-direction: column !important;
        gap: 10px !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
    }

    .search-box {
        width: 100% !important;
        min-width: 0 !important;
        flex: none !important;
        position: relative;
    }

    .search-box .main-input {
        width: 100% !important;
        box-sizing: border-box !important;
        font-size: 16px !important; /* 避免 iOS 縮放 */
        padding: 11px 14px 11px 38px !important;
        border-radius: 12px !important;
        background: rgba(10, 8, 16, 0.75) !important;
        border: 1px solid rgba(188, 19, 254, 0.35) !important;
        color: #fff !important;
    }

    .search-icon {
        left: 12px !important;
        font-size: 0.9rem !important;
        color: #c084fc !important;
    }

    .clear-search-btn {
        right: 10px !important;
    }

    .dropdown-group {
        display: flex !important;
        flex-direction: row !important;
        gap: 8px !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
    }

    .select-box {
        flex: 1 !important;
        min-width: 0 !important;
        width: 50% !important;
        position: relative;
    }

    .custom-select {
        width: 100% !important;
        min-width: 0 !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        padding: 8px 8px 8px 28px !important;
        height: 42px !important;
        border-radius: 10px !important;
        text-overflow: ellipsis;
        box-sizing: border-box !important;
        background: rgba(10, 8, 16, 0.75) !important;
        border: 1px solid rgba(188, 19, 254, 0.3) !important;
        color: #e0d5ff !important;
    }

    .select-icon {
        left: 8px !important;
        font-size: 0.8rem !important;
    }

    .filter-sub-row {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 6px !important;
        width: 100% !important;
        box-sizing: border-box !important;
    }

    .filter-section-title {
        font-size: 0.7rem !important;
        color: #a855f7 !important;
        letter-spacing: 0.5px !important;
        font-weight: 700 !important;
        min-width: 0 !important;
    }

    /* 快捷狀態膠囊：橫向平滑滑動 */
    .quick-filter-pills {
        display: flex !important;
        flex-wrap: nowrap !important;
        overflow-x: auto !important;
        -webkit-overflow-scrolling: touch !important;
        gap: 6px !important;
        padding-bottom: 2px !important;
        width: 100% !important;
        box-sizing: border-box !important;
    }

    .quick-filter-pills::-webkit-scrollbar {
        display: none;
    }

    .pill-btn {
        flex-shrink: 0 !important;
        padding: 5px 11px !important;
        font-size: 0.75rem !important;
        font-weight: 600 !important;
        white-space: nowrap !important;
        border-radius: 8px !important;
        background: rgba(255, 255, 255, 0.05) !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
    }

    .pill-btn.active {
        background: rgba(192, 132, 252, 0.2) !important;
        border-color: #c084fc !important;
        color: #c084fc !important;
    }

    /* 標籤分類：橫向平滑滑動 */
    .filter-categories {
        display: flex !important;
        flex-wrap: nowrap !important;
        overflow-x: auto !important;
        -webkit-overflow-scrolling: touch !important;
        gap: 6px !important;
        padding-bottom: 2px !important;
        width: 100% !important;
        box-sizing: border-box !important;
    }

    .filter-categories::-webkit-scrollbar {
        display: none;
    }

    .filter-btn {
        flex-shrink: 0 !important;
        padding: 5px 12px !important;
        font-size: 0.78rem !important;
        white-space: nowrap !important;
        border-radius: 8px !important;
    }

    /* ----------------------------------------------------
       模式一：網格卡片清單 (Grid View on Mobile) 美化
       ---------------------------------------------------- */
    .grid-container {
        grid-template-columns: 1fr !important;
        gap: 14px !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
    }

    .card {
        border-radius: 16px !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
        background: rgba(18, 14, 28, 0.85) !important;
        backdrop-filter: blur(12px) !important;
        border: 1px solid rgba(192, 132, 252, 0.22) !important;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45) !important;
    }

    .card:active {
        transform: scale(0.985) !important;
        border-color: #c084fc !important;
    }

    .card .img-box {
        height: 185px !important;
        width: 100% !important;
        position: relative !important;
    }

    .card .info {
        padding: 12px 14px !important;
        width: 100% !important;
        box-sizing: border-box !important;
    }

    .card .title-row h3 {
        font-size: 1.05rem !important;
        font-weight: 700 !important;
        color: #fff !important;
    }

    .card .info-top .price-tag {
        font-family: 'JetBrains Mono', monospace !important;
        font-size: 1rem !important;
        font-weight: 800 !important;
        color: #fbbf24 !important;
        text-shadow: 0 0 10px rgba(251, 191, 36, 0.25) !important;
    }

    /* ----------------------------------------------------
       模式二：手機專屬極致美學橫式卡片清單 (List View on Mobile)
       ---------------------------------------------------- */
    .mobile-item-list {
        display: flex !important;
        flex-direction: column !important;
        gap: 10px !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
    }

    .desktop-table-container {
        display: none !important;
    }

    .mob-item-card {
        background: rgba(18, 14, 28, 0.85) !important;
        backdrop-filter: blur(14px) !important;
        -webkit-backdrop-filter: blur(14px) !important;
        border: 1px solid rgba(192, 132, 252, 0.18) !important;
        border-radius: 16px !important;
        padding: 12px 14px !important;
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        cursor: pointer !important;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
        width: 100% !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }

    .mob-item-card.is-fav {
        border-left: 3px solid #fbbf24 !important;
    }

    .mob-item-card:active {
        transform: scale(0.985) !important;
        border-color: #00f2ff !important;
    }

    .mob-card-media {
        flex-shrink: 0 !important;
    }

    .mob-thumb {
        width: 68px !important;
        height: 68px !important;
        border-radius: 12px !important;
        background-size: cover !important;
        background-position: center !important;
        background-color: #12101a !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
        position: relative !important;
        box-shadow: 0 3px 10px rgba(0, 0, 0, 0.5) !important;
    }

    .mob-star-badge {
        position: absolute !important;
        top: 3px !important;
        left: 3px !important;
        background: rgba(0, 0, 0, 0.75) !important;
        border: 1px solid rgba(255, 255, 255, 0.18) !important;
        color: #777 !important;
        width: 22px !important;
        height: 22px !important;
        border-radius: 50% !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 0.75rem !important;
        cursor: pointer !important;
        padding: 0 !important;
        line-height: 1 !important;
        transition: all 0.2s ease !important;
    }

    .mob-star-badge.active {
        color: #fbbf24 !important;
        border-color: #fbbf24 !important;
        text-shadow: 0 0 8px rgba(251, 191, 36, 0.7) !important;
    }

    .mob-card-body {
        flex: 1 !important;
        min-width: 0 !important; /* 防止長文字撐破 flex */
        display: flex !important;
        flex-direction: column !important;
        gap: 5px !important;
    }

    .mob-row-top {
        display: flex !important;
        justify-content: space-between !important;
        align-items: flex-start !important;
        gap: 8px !important;
    }

    .mob-title-wrap {
        display: flex !important;
        align-items: baseline !important;
        gap: 4px !important;
        min-width: 0 !important;
        flex: 1 !important;
    }

    .mob-title {
        font-size: 0.98rem !important;
        font-weight: 700 !important;
        color: #fff !important;
        line-height: 1.35 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
    }

    .mob-brand {
        font-size: 0.72rem !important;
        color: #8a8a93 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
    }

    .mob-price-tag {
        font-family: 'JetBrains Mono', monospace !important;
        font-size: 0.92rem !important;
        font-weight: 800 !important;
        color: #fbbf24 !important;
        white-space: nowrap !important;
        flex-shrink: 0 !important;
        text-shadow: 0 0 10px rgba(251, 191, 36, 0.25) !important;
    }

    /* 中部元數據標籤膠囊 */
    .mob-row-meta {
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
        flex-wrap: wrap !important;
        margin: 1px 0 !important;
    }

    .mob-loc-chip {
        font-size: 0.72rem !important;
        color: #d4d4d8 !important;
        background: rgba(255, 255, 255, 0.06) !important;
        padding: 2px 7px !important;
        border-radius: 6px !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        max-width: 120px !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 2px !important;
    }

    .mob-tag-chip {
        font-size: 0.7rem !important;
        color: #c084fc !important;
        background: rgba(188, 19, 254, 0.12) !important;
        border: 1px solid rgba(188, 19, 254, 0.3) !important;
        padding: 2px 7px !important;
        border-radius: 6px !important;
        font-weight: 500 !important;
        white-space: nowrap !important;
    }

    .mob-code-chip {
        font-size: 0.7rem !important;
        color: #00f2ff !important;
        background: rgba(0, 242, 255, 0.08) !important;
        border: 1px solid rgba(0, 242, 255, 0.25) !important;
        padding: 2px 6px !important;
        border-radius: 6px !important;
        font-family: monospace !important;
        white-space: nowrap !important;
    }

    /* 底部操作與步進加減器 (Stepper) */
    .mob-row-bottom {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        margin-top: 2px !important;
        padding-top: 6px !important;
        border-top: 1px solid rgba(255, 255, 255, 0.05) !important;
        gap: 8px !important;
    }

    .mob-status-col {
        flex: 1 !important;
        min-width: 0 !important;
    }

    .mini-expiry-badge {
        font-size: 0.68rem !important;
        padding: 2px 6px !important;
        border-radius: 5px !important;
        font-weight: 600 !important;
    }

    .mob-low-alert {
        font-size: 0.7rem !important;
        color: #f87171 !important;
        background: rgba(248, 113, 113, 0.12) !important;
        padding: 2px 6px !important;
        border-radius: 5px !important;
        font-weight: 600 !important;
    }

    /* 一體化現代跑道步進器 (Stepper Pill) */
    .mob-stepper-pill {
        display: inline-flex !important;
        align-items: center !important;
        background: rgba(10, 8, 16, 0.85) !important;
        border: 1px solid rgba(188, 19, 254, 0.35) !important;
        border-radius: 20px !important;
        padding: 2px 3px !important;
        gap: 4px !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4) !important;
    }

    .stepper-btn {
        width: 26px !important;
        height: 26px !important;
        border-radius: 50% !important;
        background: rgba(255, 255, 255, 0.06) !important;
        border: none !important;
        color: #e4e4e7 !important;
        font-size: 0.95rem !important;
        font-weight: 700 !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        line-height: 1 !important;
        transition: all 0.15s ease !important;
    }

    .stepper-btn:hover:not(:disabled),
    .stepper-btn:active:not(:disabled) {
        background: #c084fc !important;
        color: #000 !important;
    }

    .stepper-btn:disabled {
        opacity: 0.25 !important;
        cursor: not-allowed !important;
    }

    .stepper-value {
        font-size: 0.88rem !important;
        font-weight: 800 !important;
        font-family: 'JetBrains Mono', monospace !important;
        min-width: 32px !important;
        text-align: center !important;
        color: #fff !important;
    }

    .stepper-value.low-stock {
        color: #f87171 !important;
        text-shadow: 0 0 6px rgba(248, 113, 113, 0.6) !important;
    }

    /* 彈窗 Dialog：手機端底部抽屜樣式 (Bottom Sheet) */
    .overlay {
        padding: 0 !important;
        align-items: flex-end !important;
    }

    .modal {
        width: 100% !important;
        max-width: 100% !important;
        max-height: 92vh !important;
        border-radius: 22px 22px 0 0 !important;
        margin: 0 !important;
        border-bottom: none !important;
        animation: slideUpModal 0.28s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }

    @keyframes slideUpModal {
        from {
            transform: translateY(100%);
        }
        to {
            transform: translateY(0);
        }
    }

    .modal-header {
        padding: 14px 18px !important;
    }

    .modal-header h2 {
        font-size: 1.15rem !important;
    }

    .close-x {
        width: 36px !important;
        height: 36px !important;
        font-size: 1.2rem !important;
    }

    .modal-body {
        padding: 16px 14px !important;
        max-height: calc(92vh - 130px) !important;
    }

    .image-preview-box {
        height: 140px !important;
    }

    .form-grid {
        gap: 12px !important;
    }

    .form-grid .row {
        grid-template-columns: 1fr !important;
        gap: 12px !important;
    }

    .form-grid input,
    .form-grid select,
    .form-grid textarea {
        font-size: 16px !important; /* 避免 iOS 縮放 */
        padding: 11px 12px !important;
        border-radius: 10px !important;
    }

    .qty-control button {
        width: 44px !important;
        height: 44px !important;
        font-size: 1.2rem !important;
    }

    .qty-control input {
        height: 44px !important;
        font-size: 1rem !important;
    }

    .modal-footer {
        padding: 12px 14px !important;
        gap: 8px !important;
    }

    .modal-footer button {
        padding: 11px 16px !important;
        font-size: 0.9rem !important;
        min-height: 42px !important;
        border-radius: 10px !important;
    }

    .lightbox-content {
        max-width: 95vw !important;
        max-height: 80vh !important;
        padding: 8px !important;
    }
}

/* 超窄螢幕適配 (如 iPhone SE, 375px 及以下) */
@media (max-width: 400px) {
    .dropdown-group {
        flex-direction: column !important;
    }

    .header-actions .export-btn,
    .header-actions .add-btn {
        width: 100% !important;
        flex: 100% !important;
    }
}

</style>
