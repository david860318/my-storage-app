<script setup>
import { useRoute, useRouter } from 'vue-router';

const props = defineProps({
  profile: {
    type: Object,
    default: () => ({})
  },
  isOpen: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['logout', 'close']);

const router = useRouter();
const route = useRoute();

// 導航並保證收起側邊欄 (無論是否為當前頁面，點擊一定收起)
const handleNav = (path) => {
  emit('close');
  if (route.path !== path) {
    router.push(path);
  }
};

const handleClose = () => {
  emit('close');
};
</script>

<template>
  <aside class="side-nav" :class="{ 'is-open': isOpen }">
    <div class="side-header">
      <div class="logo" @click="handleClose">收納小幫手</div>
      <!-- 超大 44x44px 觸控熱區的關閉按鈕 -->
      <button class="mobile-close-btn" @click.stop="handleClose" aria-label="關閉選單">✕</button>
    </div>
    
    <nav class="links">
      <!-- 點擊必定觸發 handleNav 關閉側邊欄 -->
      <div 
        class="item" 
        :class="{ active: route.path === '/' }" 
        @click="handleNav('/')"
      >
        <span class="icon">📦</span> 庫存清單
      </div>

      <div 
        class="item" 
        :class="{ active: route.path === '/tags' }" 
        @click="handleNav('/tags')"
      >
        <span class="icon">🏷️</span> 標籤管理
      </div>

      <div 
        class="item" 
        :class="{ active: route.path === '/profile' }" 
        @click="handleNav('/profile')"
      >
        <span class="icon">👤</span> 個人帳戶
      </div>
    </nav>

    <button @click="$emit('logout'); handleClose()" class="out-btn">登出</button>
  </aside>
</template>

<style scoped>
.side-nav {
  width: 260px;
  height: 100vh;
  position: fixed;
  left: 0;
  top: 0;
  background: #111116;
  border-right: 1px solid #222;
  display: flex;
  flex-direction: column;
  padding: 24px 20px;
  z-index: 1000;
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}

.side-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 36px;
  min-height: 44px;
}

.logo {
  font-size: 1.25rem;
  font-weight: bold;
  color: var(--accent, #c084fc);
  letter-spacing: 1px;
  cursor: pointer;
}

/* 手機版關閉按鈕：加大熱區至 44x44px，極易點按 */
.mobile-close-btn {
  display: none;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  color: #ddd;
  font-size: 1.3rem;
  cursor: pointer;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  line-height: 1;
  transition: all 0.2s ease;
  -webkit-tap-highlight-color: transparent;
}

.mobile-close-btn:hover,
.mobile-close-btn:active {
  background: rgba(255, 95, 95, 0.25);
  border-color: #ff5f5f;
  color: #ff5f5f;
  transform: scale(0.92);
}

.links {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.item {
  color: #888;
  padding: 14px 16px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 500;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.item:hover {
  background: rgba(192, 132, 252, 0.08);
  color: #ddd;
}

.item.active {
  background: rgba(192, 132, 252, 0.15) !important;
  color: #c084fc !important;
  border-left: 3px solid #c084fc;
}

.out-btn {
  background: transparent;
  border: 1px solid #ff5f5f;
  color: #ff5f5f;
  padding: 12px 20px;
  cursor: pointer;
  border-radius: 10px;
  font-weight: bold;
  letter-spacing: 1px;
  transition: all 0.3s ease;
  box-shadow: 0 0 5px rgba(255, 95, 95, 0.2);
  min-height: 44px;
}

.out-btn:hover {
  background: rgba(255, 95, 95, 0.1);
  color: #fff;
  border-color: #ff8e8e;
  box-shadow: 0 0 15px rgba(255, 95, 95, 0.6);
  transform: translateY(-1px);
}

.out-btn:active {
  transform: scale(0.95);
}

/* RWD 手機版：強制抽屜滑動與收折 */
@media (max-width: 768px) {
  .mobile-close-btn {
    display: flex;
  }

  .side-nav {
    transform: translateX(-100%) !important;
    box-shadow: none !important;
  }

  .side-nav.is-open {
    transform: translateX(0) !important;
    box-shadow: 10px 0 35px rgba(0, 0, 0, 0.85) !important;
  }
}
</style>
