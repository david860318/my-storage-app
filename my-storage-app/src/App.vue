<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { supabase } from './supabase';
import Auth from './components/Auth.vue';
import Sidebar from './components/Sidebar.vue';
import { SpeedInsights } from '@vercel/speed-insights/vue';

const session = ref(null);
const isInitializing = ref(true);
const userProfile = ref({ username: '', avatar_url: '' });

// 手機版側邊欄開關狀態 (完全無需黑色遮罩)
const isSidebarOpen = ref(false);

const openSidebar = () => {
  isSidebarOpen.value = true;
};

const closeSidebar = () => {
  isSidebarOpen.value = false;
};

const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value;
};

// 點擊主內容區時若側邊欄開著自動收回 (無黑色遮罩，不遮擋視野)
const handleMainContentClick = () => {
  if (isSidebarOpen.value) {
    isSidebarOpen.value = false;
  }
};

// 換頁時自動關閉側邊欄
const route = useRoute();
watch(() => route.path, () => {
  isSidebarOpen.value = false;
});

onMounted(async () => {
  try {
    const { data } = await supabase.auth.getSession();
    session.value = data.session;
    if (session.value) await fetchProfile();
  } catch (e) {
    console.error("Init Error:", e);
  } finally {
    isInitializing.value = false;
  }

  supabase.auth.onAuthStateChange((_event, _session) => {
    session.value = _session;
    if (_session) fetchProfile();
  });
});

const fetchProfile = async () => {
  const { data } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', session.value.user.id)
    .single();
  if (data) userProfile.value = data;
};

const handleLogout = async () => {
  await supabase.auth.signOut();
  window.location.reload();
};
</script>

<template>
  <SpeedInsights />
  <div v-if="isInitializing" class="loading-screen">
    <p>SYSTEM LOADING...</p>
  </div>

  <Auth v-else-if="!session" />

  <div v-else class="app-container">
    <!-- 手機版懸浮按鈕：永遠在最上層 (z-index 1002)，開關狀態自動切換 (☰ / ✕) -->
    <button 
      class="mobile-menu-btn" 
      :class="{ 'is-open': isSidebarOpen }"
      @click.stop="toggleSidebar" 
      :aria-label="isSidebarOpen ? '收起選單' : '打開選單'"
    >
      <span v-if="!isSidebarOpen">☰</span>
      <span v-else>✕</span>
    </button>

    <!-- 側邊欄組件 (無黑色遮罩) -->
    <Sidebar 
      :is-open="isSidebarOpen" 
      :profile="userProfile" 
      @close="closeSidebar" 
      @logout="handleLogout" 
    />
    
    <!-- 主內容區域：點擊主畫面任意處自動收起側邊欄 -->
    <main class="main-viewport" @click="handleMainContentClick">
      <router-view />
    </main>
  </div>
</template>

<style>
:root {
  --sidebar-w: 260px;
  --accent: #c084fc;
}

* { 
  box-sizing: border-box; 
  margin: 0; 
  padding: 0; 
}

html, body { 
  background: #0a0a0c; 
  color: #fff; 
  font-family: system-ui, -apple-system, sans-serif;
  min-height: 100vh;
  overflow-x: hidden;
  max-width: 100vw;
  -webkit-text-size-adjust: 100%;
}

.app-container {
  display: flex;
  width: 100vw;
  min-height: 100vh;
  position: relative;
  overflow-x: hidden;
}

/* 主內容區域 (電腦版) */
.main-viewport {
  flex: 1;
  margin-left: var(--sidebar-w);
  padding: 40px;
  min-height: 100vh;
  background: #0a0a0c;
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
  transition: margin-left 0.3s ease;
  max-width: calc(100vw - var(--sidebar-w));
}

/* 手機版懸浮按鈕：z-index 1002，高於側邊欄，狀態切換 */
.mobile-menu-btn {
  display: none;
  position: fixed;
  top: 16px;
  left: 16px;
  z-index: 1002;
  background: rgba(20, 10, 35, 0.92);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(188, 19, 254, 0.5);
  color: #c084fc;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  font-size: 1.4rem;
  font-weight: bold;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.7);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

.mobile-menu-btn.is-open {
  background: rgba(45, 15, 30, 0.95);
  border-color: #ff5f5f;
  color: #ff5f5f;
  box-shadow: 0 4px 20px rgba(255, 95, 95, 0.4);
}

.mobile-menu-btn:active {
  transform: scale(0.92);
}

.loading-screen {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
  font-family: monospace;
  font-size: 1.2rem;
  letter-spacing: 2px;
}

/* ========================================================
   全站 RWD 響應式優化 (手機、平板與小螢幕適配)
   ======================================================== */
@media (max-width: 768px) {
  .mobile-menu-btn {
    display: flex;
  }

  .main-viewport {
    margin-left: 0 !important;
    padding: 76px 14px 40px 14px !important; /* 避開頂部懸浮按鈕 */
    max-width: 100vw !important;
  }

  /* 1. 庫存清單頁面 (Inventory.vue) RWD 優化 */
  .page-header {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 16px !important;
    margin-bottom: 20px !important;
  }

  .page-header .title-group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .page-header .title-group h1 {
    font-size: 1.5rem !important;
  }

  .page-header .count-badge,
  .page-header .total-badge {
    font-size: 0.75rem !important;
    padding: 4px 10px !important;
  }

  .page-header .add-btn {
    width: 100% !important;
    padding: 13px !important;
    justify-content: center !important;
    font-size: 0.95rem !important;
    text-align: center;
  }

  /* 搜尋與分類篩選 */
  .controls-card {
    padding: 14px !important;
    border-radius: 14px !important;
    margin-bottom: 20px !important;
    gap: 12px !important;
  }

  .search-box input {
    font-size: 16px !important; /* 防止 iOS Safari 自動縮放放大 */
    padding: 12px 14px !important;
  }

  .filter-categories {
    gap: 8px !important;
    margin-bottom: 10px !important;
  }

  .filter-btn {
    padding: 6px 12px !important;
    font-size: 0.8rem !important;
  }

  /* 物品卡片：手機版單欄大卡片，閱讀極舒適 */
  .grid-container {
    grid-template-columns: 1fr !important;
    gap: 14px !important;
  }

  /* 彈窗 (Modal) 手機適配 */
  .modal-overlay {
    padding: 10px !important;
    align-items: flex-end !important; /* 手機端底部呼出體驗更好 */
  }

  .modal {
    width: 100% !important;
    max-width: 100% !important;
    max-height: 88vh !important;
    border-radius: 20px 20px 0 0 !important;
    margin: 0 !important;
  }

  .modal-body {
    padding: 18px 16px !important;
  }

  /* 彈窗內的雙欄輸入框在手機自動變成單欄 */
  .row {
    grid-template-columns: 1fr !important;
    gap: 12px !important;
  }

  /* 2. 標籤管理頁面 (TagManager.vue) RWD 優化 */
  .tag-add-box {
    flex-direction: column !important;
    padding: 14px !important;
    gap: 10px !important;
  }

  .tag-add-box .add-btn {
    width: 100% !important;
    padding: 12px !important;
    justify-content: center;
  }

  .tag-list {
    grid-template-columns: 1fr !important;
    gap: 10px !important;
  }

  .tag-item {
    padding: 14px 16px !important;
  }

  /* 3. 個人帳戶頁面 (Profile.vue) RWD 優化 */
  .form-card {
    padding: 24px 16px !important; /* 避免桌機 50px 邊距擠壓手機 */
    border-radius: 16px !important;
  }

  .profile-visual {
    margin-bottom: 24px !important;
  }

  .avatar-circle {
    width: 80px !important;
    height: 80px !important;
  }

  .field {
    margin-bottom: 18px !important;
  }

  .field input, .main-select, .date-input {
    font-size: 16px !important; /* 避免 iOS 縮放 */
    padding: 12px 14px !important;
  }
}

/* 平板尺寸 (501px ~ 900px) 卡片雙欄排列 */
@media (min-width: 501px) and (max-width: 900px) {
  .grid-container {
    grid-template-columns: repeat(2, 1fr) !important;
    gap: 16px !important;
  }
}
</style>