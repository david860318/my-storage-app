<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '../supabase';

const categories = ref([]);
const newTag = ref('');
const loading = ref(false);

// 1. 初始化
onMounted(async () => {
  await fetchCategories();
});

const fetchCategories = async () => {
  try {
    // 獲取當前使用者資訊
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.error('未找到登入使用者');
      return;
    }

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id) // 關鍵修正：只篩選屬於目前使用者的標籤
      .order('created_at', { ascending: false });

    if (error) throw error;
    categories.value = data;
  } catch (error) {
    console.error('抓取標籤失敗:', error.message);
  }
};

// 2. 新增標籤
const addCategory = async () => {
  const tagName = newTag.value.trim();
  if (!tagName) return;

  // 檢查是否已存在於本地列表（防止使用者重複點擊）
  if (categories.value.some(c => c.name === tagName)) {
    alert('此標籤已存在');
    return;
  }

  try {
    loading.value = true;
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) throw new Error('請先登入');

    const { data, error } = await supabase
      .from('categories')
      .insert([{
        name: tagName,
        user_id: user.id
      }])
      .select();

    if (error) {
      // 針對資料庫唯一性約束的處理（防止與其他使用者的標籤衝突報錯，如果你的 DB 設了 Unique）
      if (error.code === '23505') throw new Error('標籤名稱重複');
      throw error;
    }

    if (data) {
      categories.value.unshift(data[0]);
      newTag.value = '';
    }
  } catch (error) {
    alert('新增失敗：' + error.message);
  } finally {
    loading.value = false;
  }
};

// 3. 刪除標籤 (刪除時 Supabase 會自動檢查 RLS，確保不能刪到別人的)
const deleteCategory = async (id) => {
  if (!confirm('確定要刪除此標籤嗎？')) return;

  try {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) throw error;

    categories.value = categories.value.filter(cat => cat.id !== id);
  } catch (error) {
    alert('刪除失敗：' + error.message);
  }
};
</script>

<template>
  <div class="page-container">
    <header class="page-header">
      <h1>🏷️ 標籤管理</h1>
      <span class="count-badge">{{ categories.length }} 項</span>
    </header>

    <div class="tag-add-box">
      <div class="input-wrapper">
        <span class="prefix">></span>
        <input v-model="newTag" placeholder="請輸入新增標籤名稱" @keyup.enter="addCategory" :disabled="loading" />
      </div>
      <button @click="addCategory" class="add-btn" :disabled="loading">
        <span class="plus">+</span> {{ loading ? '...' : '加入' }}
      </button>
    </div>

    <TransitionGroup name="list" tag="div" class="tag-list">
      <div v-for="cat in categories" :key="cat.id" class="tag-item">
        <div class="tag-info">
          <span class="hash">#</span>
          <span class="tag-name">{{ cat.name }}</span>
        </div>
        <button @click="deleteCategory(cat.id)" class="del-btn" title="刪除標籤">
          <span class="icon">刪除</span>
        </button>
      </div>
    </TransitionGroup>

    <div v-if="categories.length === 0" class="empty-state">
      目前暫無標籤，請手動新增
    </div>
  </div>
</template>

<style scoped>
/* 這裡維持你原本精美的 CSS 不變 */
.page-container {
  padding: 40px 5%;
  max-width: 900px;
  animation: fadeIn 0.4s ease-out;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 40px;
}

.count-badge {
  font-size: 0.7rem;
  background: rgba(192, 132, 252, 0.1);
  color: var(--accent);
  padding: 4px 10px;
  border-radius: 4px;
  letter-spacing: 1px;
  border: 1px solid var(--accent-glow);
}

.tag-add-box {
  display: flex;
  gap: 15px;
  margin-bottom: 40px;
  background: rgba(255, 255, 255, 0.02);
  padding: 20px;
  border-radius: 16px;
  border: 1px solid var(--border-color);
}

.input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  background: #000;
  border: 1px solid #333;
  border-radius: 10px;
  padding: 0 15px;
  transition: var(--transition);
}

.input-wrapper:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 15px var(--accent-glow);
}

.prefix {
  color: var(--accent);
  font-family: 'JetBrains Mono', monospace;
  margin-right: 10px;
  font-weight: bold;
}

.input-wrapper input {
  flex: 1;
  background: transparent;
  border: none;
  padding: 14px 0;
  color: #fff;
  font-family: 'JetBrains Mono', monospace;
  outline: none;
}

.add-btn {
  background: var(--accent);
  color: #000;
  border: none;
  padding: 0 30px;
  border-radius: 10px;
  font-weight: 900;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: var(--transition);
}

.add-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-2px);
  box-shadow: 0 5px 15px var(--accent-glow);
}

.tag-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 15px;
}

.tag-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 22px;
  background: var(--panel-bg);
  border-radius: 14px;
  border: 1px solid var(--border-color);
  transition: var(--transition);
}

.tag-item:hover {
  border-color: var(--accent);
  background: rgba(192, 132, 252, 0.03);
  transform: scale(1.02);
}

.tag-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hash {
  color: var(--accent);
  font-weight: bold;
}

.tag-name {
  color: #eee;
  font-weight: 500;
  letter-spacing: 0.5px;
}

.del-btn {
  background: transparent;
  color: #444;
  border: 1px solid #333;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 0.65rem;
  font-weight: 800;
  cursor: pointer;
  transition: var(--transition);
}

.del-btn:hover {
  color: #ff5f5f;
  border-color: #ff5f5f;
  background: rgba(255, 95, 95, 0.05);
}

.empty-state {
  text-align: center;
  padding: 60px;
  color: #444;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  border: 1px dashed #222;
  border-radius: 20px;
}

.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>