<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { supabase } from '../supabase';
import heic2any from 'heic2any';

// ==========================================
// 1. 狀態管理
// ==========================================
const items = ref([]);
const categories = ref(['未分類']); // 初始包含預設值
const isModalOpen = ref(false);
const isEditMode = ref(false);
const editingId = ref(null);
const file = ref(null);
const imagePreview = ref(null);
const isSaving = ref(false);

const searchQuery = ref('');
const selectedCategories = ref(['全部']);
const showOnlyFavorites = ref(false);
const newCategoryName = ref('');

const initialForm = {
    name: '',
    category_id: ['未分類'], // 修正為陣列
    description: '',
    is_favorite: false,
    location: '',
    price: 0,
    quantity: 1,
    purchase_date: new Date().toISOString().slice(0, 10),
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
});

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
// 3. 標籤管理 (複選與個人化)
// ==========================================
const isSelected = (cat) => {
    return Array.isArray(form.value.category_id) && form.value.category_id.includes(cat);
};

const toggleTag = (cat) => {
    // 強制初始化為陣列，防止從資料庫讀回字串後出錯
    if (!Array.isArray(form.value.category_id)) {
        form.value.category_id = [];
    }

    const index = form.value.category_id.indexOf(cat);

    if (index > -1) {
        // 已存在 -> 移除
        form.value.category_id.splice(index, 1);

        // 如果移除後變空了，自動補回「未分類」
        if (form.value.category_id.length === 0) {
            form.value.category_id = ['未分類'];
        }
    } else {
        // 不存在 -> 新增
        if (cat === '未分類') {
            // 點選「未分類」時，清空其他所有標籤
            form.value.category_id = ['未分類'];
        } else {
            // 點選「具體標籤」時，先移除「未分類」再加入新標籤
            form.value.category_id = form.value.category_id.filter(c => c !== '未分類');
            form.value.category_id.push(cat);
        }
    }
};

const addNewCategory = async () => {
    const name = newCategoryName.value.trim();

    // 1. 前端基本檢查：名稱不能為空
    if (!name) return;

    // 2. 前端檢查：是否已經存在於目前的列表（不分大小寫）
    const isDuplicate = categories.value.some(
        c => c.toLowerCase() === name.toLowerCase()
    );

    if (isDuplicate) {
        // 如果重複了，直接套用該標籤而不重複新增到資料庫
        if (!isSelected(name)) {
            toggleTag(name);
        }
        newCategoryName.value = '';
        return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
        // 3. 執行新增
        const { error } = await supabase
            .from('categories')
            .insert([{ name: name, user_id: user.id }]);

        if (!error) {
            categories.value.push(name);
            toggleTag(name);
            newCategoryName.value = '';
        } else if (error.code === '23505') {
            // 4. 萬一前端沒擋住，後端報錯 23505 時的處理
            console.warn('標籤已存在於資料庫中');
            if (!categories.value.includes(name)) {
                categories.value.push(name);
            }
            toggleTag(name);
            newCategoryName.value = '';
        } else {
            throw error;
        }
    } catch (err) {
        console.error('新增標籤出錯:', err);
        alert('新增標籤失敗');
    }
};

const removeCategory = async (targetCat) => {
    if (targetCat === '未分類') return;
    if (!confirm(`確定要刪除標籤「${targetCat}」嗎？`)) return;

    const { error } = await supabase
        .from('categories')
        .delete()
        .eq('name', targetCat);

    if (!error) {
        categories.value = categories.value.filter(c => c !== targetCat);
        if (isSelected(targetCat)) toggleTag(targetCat);
    }
};

// ==========================================
// 4. 圖片處理與 Modal 控制
// ==========================================
const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    isSaving.value = true;

    try {
        let blob = selectedFile;
        if (selectedFile.name.toLowerCase().endsWith('.heic')) {
            const converted = await heic2any({
                blob: selectedFile,
                toType: 'image/jpeg',
                quality: 0.8
            });
            blob = Array.isArray(converted) ? converted[0] : converted;
        }

        const resizedBlob = await resizeImage(blob, 1200);
        file.value = new File([resizedBlob], "upload.jpg", { type: 'image/jpeg' });

        if (imagePreview.value && !isEditMode.value) URL.revokeObjectURL(imagePreview.value);
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
    isEditMode.value = false;
    editingId.value = null;
    file.value = null;
    imagePreview.value = null;
    form.value = JSON.parse(JSON.stringify(initialForm));
    isModalOpen.value = true;
    document.body.style.overflow = 'hidden';
};

const openEditModal = (item) => {
    isEditMode.value = true;
    editingId.value = item.id;

    let cats = [];
    if (item.category_id) {
        // 處理資料庫撈出來的資料，不管是字串還是意外的 JSON 格式
        if (typeof item.category_id === 'string') {
            // 先過濾掉可能的引號或中括號（防止髒資料干擾）
            const cleanStr = item.category_id.replace(/[\[\]\"]/g, '');
            cats = cleanStr.split(',').filter(c => c.trim() !== '');
        } else {
            cats = [String(item.category_id)];
        }
    }

    // 如果沒標籤，預設為未分類
    if (cats.length === 0) cats = ['未分類'];

    form.value = { ...item, category_id: cats };
    imagePreview.value = item.imageUrl;
    isModalOpen.value = true;
};

const closeModal = () => {
    isModalOpen.value = false;
    document.body.style.overflow = 'auto';
};

const handleKeydown = (e) => {
    if (e.key === 'Escape' && isModalOpen.value) closeModal();
};

// ==========================================
// 5. 儲存與刪除
// ==========================================
const handleSave = async () => {
    if (!form.value.name.trim()) return alert('請填寫物品名稱');

    isSaving.value = true;
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session.user.id;

        // --- 處理圖片 ---
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

        // --- 關鍵：格式化要存入資料庫的資料 ---
        const payload = {
            ...form.value,
            // 強制轉換：如果是陣列就 join，如果是奇怪的物件就轉字串
            category_id: Array.isArray(form.value.category_id)
                ? form.value.category_id.filter(c => typeof c === 'string').join(',')
                : String(form.value.category_id),

            user_id: userId,
            imageUrl: finalImageUrl,
            updated_at: new Date().toISOString()
        };

        let res;
        if (isEditMode.value) {
            res = await supabase.from('items').update(payload).eq('id', editingId.value);
        } else {
            res = await supabase.from('items').insert([payload]);
        }

        if (res.error) throw res.error;

        closeModal();
        await fetchItems(userId); // 重新整理列表
    } catch (error) {
        console.error('儲存完整錯誤資訊：', error);
        alert(`儲存失敗：${error.message || '請檢查網路或資料格式'}`);
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

// ==========================================
// 6. 搜尋與過濾
// ==========================================
const toggleFilterCategory = (cat) => {
    if (cat === '全部') {
        selectedCategories.value = ['全部'];
        return;
    }

    // 移除「全部」
    selectedCategories.value = selectedCategories.value.filter(c => c !== '全部');

    const index = selectedCategories.value.indexOf(cat);
    if (index > -1) {
        selectedCategories.value.splice(index, 1);
        // 如果全刪了，就自動跳回「全部」
        if (selectedCategories.value.length === 0) {
            selectedCategories.value = ['全部'];
        }
    } else {
        selectedCategories.value.push(cat);
    }
};

const filteredItems = computed(() => {
    const query = searchQuery.value.toLowerCase().trim();

    return items.value.filter(item => {
        // 1. 搜尋文字過濾
        const matchSearch = item.name.toLowerCase().includes(query) ||
            (item.description && item.description.toLowerCase().includes(query));

        // 2. 複選標籤過濾
        let matchCategory = false;
        if (selectedCategories.value.includes('全部')) {
            matchCategory = true;
        } else {
            // 將資料庫的字串 "標籤1,標籤2" 轉為陣列
            const itemCats = item.category_id ? item.category_id.split(',') : ['未分類'];
            // 檢查「選中的標籤陣列」裡的「每一個」標籤，是否都出現在「物品標籤陣列」裡
            matchCategory = selectedCategories.value.every(selectedCat =>
                itemCats.includes(selectedCat)
            );
        }

        // 3. 收藏過濾
        const matchFavorite = !showOnlyFavorites.value || item.is_favorite;

        return matchSearch && matchCategory && matchFavorite;
    });
});

// 計算過濾後物品的總金額
const totalAmount = computed(() => {
    return filteredItems.value.reduce((sum, item) => {
        return sum + (Number(item.price) * Number(item.quantity));
    }, 0);
});

const getQuantityClass = (qty) => {
    if (qty === 0) return 'out-of-stock'; // 缺貨
    if (qty <= 1) return 'low-stock';    // 庫存緊張
    return 'normal-stock';               // 正常
};
</script>

<template>
    <div class="inventory-page">
        <header class="page-header">
            <div class="title-group">
                <h1>📦庫存清單</h1>
                <span class="count-badge">{{ filteredItems.length }} 項</span>
                <span class="total-badge">總價值: NT$ {{ totalAmount.toLocaleString() }}</span>
            </div>
            <button class="add-btn" @click="openAddModal">+ 新增物品</button>
        </header>

        <section class="controls-card">
            <div class="search-box">
                <input v-model="searchQuery" placeholder="搜尋名稱或描述..." class="main-input" />
                <span class="search-icon">🔍</span> <!-- 移到 input 後面或使用 focus-within -->
            </div>
            <div class="filter-categories">
                <button v-for="cat in ['全部', ...categories]" :key="cat" class="filter-btn"
                    :class="{ active: selectedCategories.includes(cat) }" @click="toggleFilterCategory(cat)">
                    {{ cat }}
                </button>
            </div>
        </section>

        <main v-if="filteredItems.length > 0" class="grid-container">
            <div v-for="item in filteredItems" :key="item.id" class="card" @click="openEditModal(item)">
                <div class="img-box"
                    :style="{ backgroundImage: `url(${item.imageUrl || 'https://placehold.co/400x300/111/444?text=NO+IMAGE'})` }">
                    <div v-if="item.is_favorite" class="fav-tag">✦</div>
                </div>
                <div class="info">
                    <div class="info-top">
                        <div class="badge-group">
                            <span
                                v-for="cat in (typeof item.category_id === 'string' ? item.category_id.split(',') : ['未分類'])"
                                :key="cat" class="badge">
                                {{ cat.replace(/[\[\]\" ]/g, '') }} </span>
                        </div>
                        <span class="price-tag">NT$ {{ item.price.toLocaleString() }}</span>
                    </div>
                    <h3>{{ item.name }}</h3>
                    <div class="info-bottom">
                        <span :title="item.location">
                            <i class="icon">📍</i>
                            {{ item.location || '未標記' }}
                        </span>
                        <span :class="getQuantityClass(item.quantity)">
                            <i class="icon">📦</i>
                            x{{ item.quantity }}
                        </span>
                    </div>
                </div>
            </div>
        </main>

        <div v-else class="empty-state">
            <p>找不到相關物品</p>
        </div>

        <transition name="modal-fade">
            <div v-if="isModalOpen" class="overlay" @click.self="closeModal">
                <div class="modal">
                    <div class="modal-header">
                        <h2>{{ isEditMode ? '編輯物品' : '登錄新物品' }}</h2>
                        <button @click="closeModal" class="close-x">✕</button>
                    </div>

                    <div class="modal-body scrollable">
                        <div class="image-upload-wrapper">
                            <label class="image-preview-box">
                                <input type="file" @change="handleFileChange" accept="image/*,image/heic"
                                    class="hidden-input" />
                                <div v-if="imagePreview" class="preview-overlay">
                                    <img :src="imagePreview" class="img-content" />
                                    <div class="change-hint">點擊更換照片</div>
                                </div>
                                <div v-else class="upload-placeholder">
                                    <span>📸 點擊上傳照片</span>
                                </div>
                            </label>
                        </div>

                        <div class="form-grid">
                            <div class="field full-width">
                                <label>物品名稱 *</label>
                                <input v-model="form.name" placeholder="請輸入名稱" />
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
                                            @keyup.enter="addNewCategory" />
                                        <button type="button" @click="addNewCategory" class="btn-tag-add">建立</button>
                                    </div>
                                </div>
                            </div>

                            <div class="row">
                                <div class="field">
                                    <label>單價 (NT$)</label>
                                    <input type="number" v-model.number="form.price" class="no-spin" />
                                </div>
                                <div class="field">
                                    <label>庫存數量</label>
                                    <div class="qty-control">
                                        <button @click="form.quantity > 0 && form.quantity--">-</button>
                                        <input type="number" v-model.number="form.quantity" class="no-spin" />
                                        <button @click="form.quantity++">+</button>
                                    </div>
                                </div>
                            </div>

                            <div class="row">
                                <div class="field">
                                    <label>購買日期</label>
                                    <input type="date" v-model="form.purchase_date" class="date-input" />
                                </div>
                                <div class="field">
                                    <label>存放位置</label>
                                    <input v-model="form.location" placeholder="例如：防潮箱" />
                                </div>
                            </div>

                            <div class="field full-width">
                                <label>備註描述</label>
                                <textarea v-model="form.description" rows="3"></textarea>
                            </div>
                        </div>

                        <div class="fav-toggle-bar" :class="{ 'is-fav': form.is_favorite }"
                            @click="form.is_favorite = !form.is_favorite">
                            <span>{{ form.is_favorite ? '★ 已收藏' : '☆ 標記為收藏' }}</span>
                        </div>
                    </div>

                    <div class="modal-footer">
                        <button v-if="isEditMode" class="btn-delete" @click="handleDelete">刪除</button>
                        <div class="spacer"></div>
                        <button class="btn-cancel" @click="closeModal">取消</button>
                        <button class="btn-save" @click="handleSave" :disabled="isSaving">
                            {{ isSaving ? '處理中...' : '儲存' }}
                        </button>
                    </div>
                </div>
            </div>
        </transition>
    </div>
</template>

<style scoped>
/* 基礎樣式 */
.inventory-page {
    padding: 30px 20px;
    max-width: 1200px;
    margin: 0 auto;
    color: #e0e0e0;
}

.page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 25px;
}

.title-group h1 {
    font-size: 2rem;
    color: #fff;
    margin: 0;
}

.count-badge {
    background: #333;
    padding: 2px 10px;
    border-radius: 20px;
    font-size: 0.8rem;
    color: #c084fc;
}

.add-btn {
    /* 漸層背景：深紫到螢光紫 */
    background: linear-gradient(135deg, #a855f7 0%, #c084fc 100%);
    color: #fff;
    /* 改為白色增加對比度，或維持黑色但要加發光 */
    border: 1px solid rgba(255, 255, 255, 0.3);
    padding: 12px 28px;
    border-radius: 12px;
    font-weight: 800;
    cursor: pointer;

    /* 核心特效：外發光 */
    box-shadow: 0 0 15px rgba(192, 132, 252, 0.4);

    /* 字母間距增加科技感 */
    letter-spacing: 1.5px;
    text-transform: uppercase;

    /* 動畫過渡 */
    transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
    position: relative;
    overflow: hidden;
}

/* 懸停效果：亮度提升與擴散 */
.add-btn:hover {
    transform: translateY(-2px) scale(1.05);
    background: linear-gradient(135deg, #c084fc 0%, #d8b4fe 100%);
    box-shadow: 0 0 25px rgba(192, 132, 252, 0.7),
        0 0 5px rgba(255, 255, 255, 0.5);
    color: #000;
    /* 懸停時變回黑色，產生反差 */
}

/* 點擊回饋：按壓感 */
.add-btn:active {
    transform: translateY(1px) scale(0.98);
    box-shadow: 0 0 10px rgba(192, 132, 252, 0.5);
}

/* 進階：流光效果 (選配) */
.add-btn::after {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: linear-gradient(45deg, transparent, rgba(255, 255, 255, 0.3), transparent);
    transform: rotate(45deg);
    transition: 0.5s;
    pointer-events: none;
}

.add-btn:hover::after {
    left: 100%;
    top: 100%;
}

/* 搜尋區 */
.controls-card {
    background: #1a1a1c;
    padding: 20px;
    border-radius: 16px;
    border: 1px solid #333;
    margin-bottom: 30px;
    display: flex;
    flex-direction: column;
    gap: 15px;
}

.main-input {
    width: 100%;
    background: #000;
    border: 1px solid #333;
    padding: 12px;
    border-radius: 10px;
    color: #fff;
}

.filter-row {
    display: flex;
    gap: 10px;
}

.main-select {
    flex: 1;
    background: #000;
    color: #fff;
    border: 1px solid #333;
    padding: 10px;
    border-radius: 10px;
}

.fav-toggle {
    background: #222;
    border: 1px solid #333;
    color: #888;
    padding: 0 15px;
    border-radius: 10px;
    cursor: pointer;
}

.fav-toggle.active {
    border-color: #c084fc;
    color: #c084fc;
}

/* 網格與卡片 */
.grid-container {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 20px;
}

.card {
    background: #1a1a1c;
    border-radius: 16px;
    border: 1px solid #222;
    overflow: hidden;
    cursor: pointer;
    transition: 0.3s;
}

.card:hover {
    border-color: #c084fc;
    transform: translateY(-5px);
}

.img-box {
    height: 180px;
    background-size: cover;
    background-position: center;
    position: relative;
    background-color: #111;
}

.fav-tag {
    position: absolute;
    top: 10px;
    right: 10px;
    background: #c084fc;
    color: #000;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
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
    max-width: 60%;
}

.badge {
    font-size: 0.65rem;
    color: #c084fc;
    border: 1px solid #c084fc;
    padding: 1px 6px;
    border-radius: 4px;
}

.badge-more {
    font-size: 0.65rem;
    color: #888;
}

.price-tag {
    font-weight: bold;
    color: #fff;
}

/* Modal 樣式 */
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
    max-width: 520px;
    max-height: 90vh;
    border-radius: 20px;
    border: 1px solid #333;
    display: flex;
    flex-direction: column;
}

.modal-header {
    padding: 20px;
    border-bottom: 1px solid #222;
    display: flex;
    justify-content: space-between;
}

.modal-body {
    padding: 20px;
    overflow-y: auto;
    flex-grow: 1;
}

.modal-footer {
    padding: 20px;
    border-top: 1px solid #222;
    display: flex;
    gap: 10px;
}

/* 圖片預覽 */
.image-preview-box {
    width: 100%;
    height: 240px;
    background: #000;
    border: 2px dashed #333;
    border-radius: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    margin-bottom: 20px;
}

.img-content {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.hidden-input {
    display: none;
}

/* 標籤管理 UI */
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
    max-height: 120px;
    overflow-y: auto;
}

.editable-tag {
    background: #1a1a1c;
    border: 1px solid #333;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 0.8rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 5px;
}

.editable-tag.active {
    background: #c084fc;
    color: #000;
    border-color: #c084fc;
    font-weight: bold;
}

.del-tag {
    background: rgba(0, 0, 0, 0.1);
    border: none;
    font-size: 10px;
    cursor: pointer;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
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
    padding: 0 12px;
    border-radius: 6px;
    cursor: pointer;
}

/* 表單與輸入控制 */
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
}

input,
select,
textarea {
    background: #000;
    border: 1px solid #222;
    padding: 10px;
    border-radius: 8px;
    color: #fff;
    width: 100%;
}

.no-spin::-webkit-inner-spin-button,
.no-spin::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

.no-spin[type="number"] {
    -moz-appearance: textfield;
    -webkit-appearance: none;
    appearance: none;
}

.qty-control {
    display: flex;
    border: 1px solid #222;
    border-radius: 8px;
    overflow: hidden;
    height: 44px;
}

.qty-control button {
    width: 40px;
    background: #222;
    border: none;
    color: #c084fc;
    font-weight: bold;
    cursor: pointer;
}

.qty-control input {
    border: none;
    text-align: center;
}

.date-input {
    color-scheme: dark;
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
    background: rgba(192, 132, 252, 0.1);
    border-color: #c084fc;
    color: #c084fc;
}

.btn-save {
    background: #c084fc;
    color: #000;
    font-weight: bold;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
}

.btn-cancel {
    background: #222;
    color: #fff;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
}

.btn-delete {
    background: none;
    border: none;
    color: #ff5f5f;
    cursor: pointer;
}

.spacer {
    flex: 1;
}

/* 動畫 */
.modal-fade-enter-active,
.modal-fade-leave-active {
    transition: all 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
    opacity: 0;
    transform: scale(0.9);
}

.scrollable::-webkit-scrollbar {
    width: 6px;
}

.scrollable::-webkit-scrollbar-thumb {
    background: #333;
    border-radius: 10px;
}

.editable-tag {
    cursor: pointer;
    padding: 6px 12px;
    border: 1px solid #333;
    border-radius: 20px;
    transition: 0.2s;
}

.editable-tag.active {
    background: #c084fc;
    /* 選中時的紫色 */
    color: #000;
    border-color: #c084fc;
}

/* 右上角關閉按鈕 (X) */
.close-x {
    background: transparent;
    border: none;
    color: #888;
    font-size: 1.5rem;
    cursor: pointer;
    line-height: 1;
    padding: 5px;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
}

.close-x:hover {
    color: #fff;
    background-color: rgba(255, 255, 255, 0.1);
    transform: rotate(90deg);
    /* 增加一點點旋轉的動效感 */
}

.close-x:active {
    transform: scale(0.9);
}

/* 確保 Modal Header 有正確排版 */
.modal-header {
    padding: 20px;
    border-bottom: 1px solid #222;
    display: flex;
    justify-content: space-between;
    align-items: center;
    /* 確保標題與 X 對齊 */
}

.modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
    color: #fff;
}

.filter-btn {
    background: #1a1a1a;
    border: 1px solid #333;
    color: #888;
    padding: 6px 16px;
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.3s ease;
}

.filter-btn.active {
    background: #c084fc;
    /* 選中時的紫色 */
    color: #000;
    border-color: #c084fc;
    box-shadow: 0 0 10px rgba(192, 132, 252, 0.3);
}

.filter-categories {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 20px;
}

/* 底部資訊容器 */
.info-bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid #222;
    /* 增加一條細微的分隔線 */
    font-size: 0.85rem;
    color: #aaa;
}

/* 位置與數量的共通樣式 */
.info-bottom span {
    display: flex;
    align-items: center;
    gap: 4px;
}

/* 低庫存警告樣式 */
.low-stock {
    color: #ff5f5f;
    /* 警告紅 */
    font-weight: bold;
    background: rgba(255, 95, 95, 0.1);
    padding: 2px 8px;
    border-radius: 6px;
    animation: pulse 2s infinite;
    /* 增加一個微弱的呼吸燈效果 */
}

/* 呼吸燈動畫 */
@keyframes pulse {
    0% {
        opacity: 1;
    }

    50% {
        opacity: 0.7;
    }

    100% {
        opacity: 1;
    }
}

.info-bottom span:first-child {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    /* 超出長度變 ... */
    max-width: 150px;
    /* 限制寬度 */
}

.status-badges {
    display: flex;
    gap: 10px;
    margin-top: 5px;
}

.total-badge {
    background: rgba(255, 215, 0, 0.1);
    /* 淡淡的金黃色背景 */
    padding: 2px 10px;
    border-radius: 20px;
    font-size: 0.8rem;
    color: #ffd700;
    /* 金色文字 */
    border: 1px solid rgba(255, 215, 0, 0.3);
    font-family: 'JetBrains Mono', monospace;
    /* 如果你有這字體的話，數字會更整齊 */
    margin-left: 5px;
}

/* 讓 Header 稍微加高以容納兩行 */
.page-header {
    align-items: flex-start;
    /* 改為對齊頂部或中心 */
}

/* 容器卡片：深紫磨砂玻璃 */
.controls-card {
    background: rgba(20, 10, 35, 0.6);
    /* 深紫半透明 */
    backdrop-filter: blur(12px);
    border-radius: 20px;
    padding: 24px;
    border: 1px solid rgba(188, 19, 254, 0.3);
    /* 霓虹紫邊框 */
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5),
        inset 0 0 15px rgba(188, 19, 254, 0.1);
    margin-bottom: 25px;
}

/* 搜尋框容器 */
.search-box {
    position: relative;
    margin-bottom: 20px;
}

/* 搜尋圖示：帶有螢光感 */
.search-icon {
    position: absolute;
    left: 15px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.9rem;
    color: #bc13fe;
    text-shadow: 0 0 8px rgba(188, 19, 254, 0.8);
    pointer-events: none;
    z-index: 1;
}

/* 主要輸入框：霓虹邊框效果 */
.main-input {
    width: 100%;
    padding: 14px 14px 14px 50px;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(188, 19, 254, 0.4);
    border-radius: 12px;
    color: #e0d5ff;
    font-size: 1rem;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.main-input:focus {
    outline: none;
    background: rgba(30, 0, 60, 0.5);
    border-color: #00f2ff;
    /* 聚焦時變為青色霓虹 */
    box-shadow: 0 0 15px rgba(0, 242, 255, 0.3),
        inset 0 0 5px rgba(0, 242, 255, 0.2);
}

.main-input::placeholder {
    color: rgba(188, 19, 254, 0.5);
}

/* 標籤篩選區塊 */
.filter-categories {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
}

/* 篩選按鈕：紫色科技風格 */
.filter-btn {
    padding: 8px 20px;
    border-radius: 8px;
    border: 1px solid rgba(188, 19, 254, 0.5);
    background: rgba(188, 19, 254, 0.05);
    color: #bc13fe;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    letter-spacing: 1px;
    transition: all 0.3s ease;
    text-transform: uppercase;
}

.filter-btn:hover {
    background: rgba(188, 19, 254, 0.2);
    box-shadow: 0 0 12px rgba(188, 19, 254, 0.4);
    transform: translateY(-2px);
    color: #fff;
}

/* 激活 (選中) 狀態：全發光效果 */
.filter-btn.active {
    background: #bc13fe;
    color: #fff;
    border-color: #fff;
    box-shadow: 0 0 20px rgba(188, 19, 254, 0.8);
    text-shadow: 0 0 5px rgba(255, 255, 255, 0.5);
}
</style>
