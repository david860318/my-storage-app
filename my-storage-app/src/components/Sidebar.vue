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

// 點擊項目時保證收合側邊欄並跳轉
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
      <div class="logo" @click="handleClose">
        <span class="logo-icon">✨</span> 收納小幫手
      </div>
      <!-- 手機版大尺寸 ✕ 收起按鈕 -->
      <!-- <button class="mobile-close-btn" @click.stop="handleClose" aria-label="收起選單">✕</button> -->
    </div>
    
    <nav class="links">
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

    <div class="side-footer">
      <button @click="$emit('logout'); handleClose()" class="out-btn">
        <span class="out-icon">🚪</span> 登出系統
      </button>
    </div>
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
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  padding: 24px 18px;
  z-index: 1000;
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 4px 0 20px rgba(0, 0, 0, 0.5);
}

.side-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  min-height: 44px;
}

.logo {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--accent, #c084fc);
  letter-spacing: 1px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  user-select: none;
}

.logo-icon {
  font-size: 1.2rem;
}

/* 手機版關閉按鈕：40x40px 舒適點擊尺寸 */
.mobile-close-btn {
  display: none;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: #aaa;
  font-size: 1.2rem;
  cursor: pointer;
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  line-height: 1;
  transition: all 0.2s ease;
  -webkit-tap-highlight-color: transparent;
}

.mobile-close-btn:hover,
.mobile-close-btn:active {
  background: rgba(255, 95, 95, 0.2);
  border-color: #ff5f5f;
  color: #ff5f5f;
  transform: scale(0.92);
}

.links {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.item {
  color: #999;
  padding: 13px 16px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 500;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.item:hover {
  background: rgba(192, 132, 252, 0.08);
  color: #fff;
}

.item.active {
  background: rgba(192, 132, 252, 0.15) !important;
  color: #c084fc !important;
  font-weight: 700;
  border-left: 3px solid #c084fc;
}

.side-footer {
  padding-top: 15px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.out-btn {
  width: 100%;
  background: rgba(255, 95, 95, 0.05);
  border: 1px solid rgba(255, 95, 95, 0.4);
  color: #ff5f5f;
  padding: 12px 18px;
  cursor: pointer;
  border-radius: 12px;
  font-weight: 600;
  font-size: 0.9rem;
  letter-spacing: 1px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.25s ease;
}

.out-btn:hover {
  background: rgba(255, 95, 95, 0.15);
  color: #fff;
  border-color: #ff8e8e;
  box-shadow: 0 0 15px rgba(255, 95, 95, 0.4);
}

.out-btn:active {
  transform: scale(0.96);
}

/* RWD 手機版：無遮罩平滑抽屜收折 */
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
    box-shadow: 8px 0 30px rgba(0, 0, 0, 0.9) !important;
  }
}
</style>